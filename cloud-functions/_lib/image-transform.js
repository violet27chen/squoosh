'use strict';

/**
 * 自托管的按需图像变换核心（类 Cloudflare Images）。
 * 引擎：sharp（libvips）。设计为纯 Node 模块，既能被本地 dev 服务器直接 require，
 * 也能被 EdgeOne Makers 的 Cloud Functions 入口（ESM）以默认导入方式复用。
 *
 * 云运行时加固（针对 EdgeOne 这类 Serverless 原生模块易挂死的问题）：
 *  1) ensureSharp()：冷启动做一次 8x8 烟测，原生二进制缺失/不兼容会立刻抛清晰错误。
 *  2) withTimeout()：给「sharp 初始化」和「图像变换」都套硬超时，挂死时秒级返回 500
 *     而不是沉默卡满 30s 触发网关超时。
 *  3) 云端本地图兜底：函数文件系统里没有 images/，若 resolveLocal 失败且给了 origin，
 *     则改抓站点自己的同源静态资源（/images/<path>），规避「函数读不到静态文件」。
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const WITH_TIMEOUT_MS = Number(process.env.TRANSFORM_TIMEOUT_MS || 25000);

// fit 别名：把 Cloudflare 风格的 fit 值映射到 sharp 的 fit。
// scale-down = 只在缩小时生效、绝不放大；pad = contain + 背景色填充。
const FIT_ALIASES = {
  cover: 'cover',
  crop: 'cover',
  contain: 'contain',
  'scale-down': 'inside',
  inside: 'inside',
  fill: 'fill',
  pad: 'contain',
  outside: 'outside',
};

// 裁剪对齐（gravity）。人脸/智能检测在边缘环境没有现成支持，这里只做方位对齐。
const GRAVITY = {
  center: 'centre',
  centre: 'centre',
  north: 'north',
  northeast: 'north-east',
  'north-east': 'north-east',
  east: 'east',
  southeast: 'south-east',
  'south-east': 'south-east',
  south: 'south',
  southwest: 'south-west',
  'south-west': 'south-west',
  west: 'west',
  northwest: 'north-west',
  'north-west': 'north-west',
};

function hexToRgb(hex) {
  hex = String(hex || '').replace('#', '');
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  const n = parseInt(hex, 16);
  if (Number.isNaN(n)) return { r: 255, g: 255, b: 255, alpha: 1 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, alpha: 1 };
}

/**
 * 解析 URL 里的逗号分隔选项，如 "width=800,quality=80,format=webp"。
 */
function parseOptions(str) {
  const o = {};
  if (!str) return o;
  for (const part of String(str).split(',')) {
    if (!part) continue;
    const i = part.indexOf('=');
    if (i === -1) {
      o[part.trim()] = true;
    } else {
      const k = part.slice(0, i).trim();
      const v = part.slice(i + 1).trim();
      if (k) o[k] = v;
    }
  }
  return o;
}

// 根据 Accept 头自动协商格式（浏览器原生支持时优先 avif > webp > jpeg）。
function negotiateFormat(accept) {
  const a = (accept || '').toLowerCase();
  if (a.includes('image/avif')) return 'avif';
  if (a.includes('image/webp')) return 'webp';
  return 'jpeg';
}

const isNum = (v) => v !== undefined && v !== '' && !Number.isNaN(Number(v));

/**
 * 把原始图片 buffer 按选项变换，返回 { data: Buffer, contentType }。
 * @param {Buffer} inputBuffer 原始图片
 * @param {object} opts 解析后的选项
 * @param {string} acceptHeader 请求的 Accept 头（用于 auto 格式协商）
 */
async function transformImage(inputBuffer, opts, acceptHeader) {
  let img = sharp(inputBuffer, { animated: false, limitInputPixels: false });

  // 默认按 EXIF 方向自动转正；传了 rotate 则使用显式角度。
  if (isNum(opts.rotate)) {
    img = img.rotate(parseInt(opts.rotate, 10));
  } else {
    img = img.rotate();
  }

  // dpr：把目标宽高乘以设备像素比。
  let w = isNum(opts.width) ? parseInt(opts.width, 10) : undefined;
  let h = isNum(opts.height) ? parseInt(opts.height, 10) : undefined;
  if (opts.dpr) {
    const d = parseFloat(opts.dpr);
    if (d > 0) {
      if (w) w = Math.round(w * d);
      if (h) h = Math.round(h * d);
    }
  }

  if (w || h) {
    const fit = FIT_ALIASES[String(opts.fit || '').toLowerCase()] || (opts.fit ? opts.fit : 'inside');
    const resizeOpts = { fit };
    if (String(opts.fit || '').toLowerCase() === 'scale-down') resizeOpts.withoutEnlargement = true;
    if ((opts.fit === 'pad' || opts.fit === 'contain') && opts.background) {
      resizeOpts.background = hexToRgb(opts.background);
    }
    if (opts.gravity) {
      const g = GRAVITY[String(opts.gravity).toLowerCase()];
      if (g) resizeOpts.position = g;
    }
    img = img.resize(w, h, resizeOpts);
  }

  // 模糊：Cloudflare 的 blur 取值 1-2000，这里换算到 sharp 的 sigma(0.3-1000)。
  if (isNum(opts.blur)) {
    const s = Math.max(0.3, Math.min(1000, parseFloat(opts.blur) / 2));
    img = img.blur(s);
  }
  if (opts.sharpen) img = img.sharpen();

  let format = String(opts.format || 'auto').toLowerCase();
  let contentType;
  if (format === 'auto') format = negotiateFormat(acceptHeader);

  const q = isNum(opts.quality) ? parseInt(opts.quality, 10) : undefined;

  switch (format) {
    case 'webp':
      img = img.webp({ quality: q || 80 });
      contentType = 'image/webp';
      break;
    case 'avif':
      img = img.avif({ quality: q || 50, effort: 4 });
      contentType = 'image/avif';
      break;
    case 'jpeg':
    case 'jpg':
      img = img.jpeg({ quality: q || 80, mozjpeg: true });
      contentType = 'image/jpeg';
      break;
    case 'png':
      img = img.png({ quality: q });
      contentType = 'image/png';
      break;
    case 'original':
      // 不指定输出格式时，sharp 会保留输入格式。
      contentType = undefined;
      break;
    default:
      try {
        img = img.toFormat(format, q ? { quality: q } : {});
        contentType = 'image/' + format;
      } catch (e) {
        img = img.webp({ quality: 80 });
        contentType = 'image/webp';
      }
  }

  // 默认不调用 withMetadata，sharp 即剥离 EXIF/ICC 等元信息（隐私 + 体积）。
  // metadata=keep 时调用 withMetadata() 以保留输入元信息。
  if (opts.metadata === 'keep') {
    img = img.withMetadata();
  }

  const data = await img.toBuffer();
  if (!contentType) {
    const meta = await sharp(data).metadata();
    contentType = 'image/' + (meta.format || 'png');
  }
  return { data, contentType };
}

/**
 * 从本地 images 目录读取源图，做路径穿越防护。
 */
function resolveLocal(relPath, imagesDir) {
  const base = path.resolve(imagesDir);
  const full = path.resolve(base, String(relPath).replace(/^(\.\.(\/|\\|$))+/, ''));
  if (full !== base && !full.startsWith(base + path.sep)) {
    throw new Error('invalid path');
  }
  if (!fs.existsSync(full)) throw new Error('not found');
  return fs.readFileSync(full);
}

// 基础 SSRF 防护：禁止访问内网/回环地址。
const BLOCKED_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::]', '']);
function isBlockedHost(host) {
  host = String(host || '').toLowerCase();
  if (BLOCKED_HOSTS.has(host)) return true;
  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  return false;
}

/**
 * 抓取公网图片作为源（带协议与 SSRF 检查）。用于 ?url=。
 */
async function fetchRemote(url) {
  let u;
  try {
    u = new URL(url);
  } catch (e) {
    throw new Error('bad url');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('only http(s) allowed');
  if (isBlockedHost(u.hostname)) throw new Error('blocked host');
  const res = await fetchWithTimeout(u.toString(), FETCH_TIMEOUT_MS);
  if (!res.ok) throw new Error('fetch failed: ' + res.status);
  const ct = res.headers.get('content-type') || '';
  if (!ct.startsWith('image/')) throw new Error('not an image');
  return Buffer.from(await res.arrayBuffer());
}

/**
 * 同源静态资源兜底：云端函数文件系统里没有 images/，
 * 于是改抓站点自己的公开静态资源（/images/<path>）。
 * 仅允许同源，规避 SSRF / DNS 重绑定。
 */
async function fetchSameOrigin(pathOrUrl, origin) {
  let u;
  try {
    u = new URL(pathOrUrl, origin);
  } catch (e) {
    throw new Error('bad same-origin url');
  }
  if (u.origin !== origin) throw new Error('same-origin only');
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('only http(s) allowed');
  const res = await fetchWithTimeout(u.toString(), FETCH_TIMEOUT_MS);
  if (!res.ok) throw new Error('fetch failed: ' + res.status);
  const ct = res.headers.get('content-type') || '';
  if (!ct.startsWith('image/')) throw new Error('not an image');
  return Buffer.from(await res.arrayBuffer());
}

/**
 * 给 promise 套一个硬超时。原生模块在 Serverless 运行时可能挂死（不抛错只卡住），
 * 用它能把「无限挂起」变成「秒级清晰错误」，避免沉默打满网关 30s。
 */
function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      reject(new Error(label + ' 超时（' + ms + 'ms）——疑似原生模块在运行时挂死/不兼容'));
    }, ms);
    Promise.resolve(promise).then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

// 出站抓取也套超时：EdgeOne 函数出网偶发挂死，套上后秒级返回清晰 500 而非沉默 30s 网关超时。
const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || 12000);

function fetchWithTimeout(url, ms) {
  return withTimeout(fetch(url), ms, 'fetch ' + String(url).slice(0, 80));
}

// sharp 冷启动烟测：确认原生二进制能正常初始化。只跑一次，失败信息清晰可用于排障。
let _sharpReady = null;
async function ensureSharp() {
  if (!_sharpReady) {
    _sharpReady = (async () => {
      const buf = await withTimeout(
        sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 255, g: 255, b: 255 } } })
          .png()
          .toBuffer(),
        WITH_TIMEOUT_MS,
        'sharp 初始化'
      );
      if (!buf || !Buffer.isBuffer(buf)) throw new Error('empty buffer');
      return true;
    })().catch((e) => {
      _sharpReady = null; // 允许下次请求重试
      throw new Error('sharp 初始化失败（原生二进制可能缺失或不兼容运行时）: ' + e.message);
    });
  }
  return _sharpReady;
}

/**
 * 统一的请求处理：解析 /image/<options>/<path> 与 ?url=，返回框架无关的结果对象。
 * 供 dev 服务器（CJS）和 EdgeOne Cloud Functions 入口（ESM）共用。
 * @param {object} args
 * @param {string} args.pathname 形如 /image/<options>/<path>
 * @param {URLSearchParams} args.searchParams
 * @param {string} args.acceptHeader
 * @param {string} args.imagesDir 本地 images 目录（dev 用；云端通常读不到，会走同源兜底）
 * @param {string} [args.origin] 站点源站（如 https://image.violet27chen.com），用于云端同源静态兜底
 */
async function handleRequest({ pathname, searchParams, acceptHeader, imagesDir, origin }) {
  const m = String(pathname).match(/^\/image\/(.*)$/);
  if (!m) {
    return { status: 400, contentType: 'text/plain', body: Buffer.from('bad path') };
  }
  const remainder = m[1];
  const slash = remainder.indexOf('/');
  let optsStr;
  let relPath = null;
  if (slash === -1) {
    optsStr = remainder;
  } else {
    optsStr = remainder.slice(0, slash);
    relPath = remainder.slice(slash + 1);
  }

  const opts = parseOptions(optsStr);
  const getParam = (k) => (searchParams && typeof searchParams.get === 'function' ? searchParams.get(k) : searchParams ? searchParams[k] : null);
  const srcUrl = getParam('url');

  try {
    // 先确认 sharp 可用（云端原生模块挂死会被这里捕获并清晰报错）。
    await ensureSharp();

    let inputBuffer;
    if (relPath) {
      try {
        inputBuffer = resolveLocal(relPath, imagesDir);
      } catch (e) {
        // 云端：函数文件系统里没有 images/，改抓站点同源静态资源。
        if (origin) {
          inputBuffer = await fetchSameOrigin('/images/' + String(relPath).replace(/^\/+/, ''), origin);
        } else {
          throw e;
        }
      }
    } else if (srcUrl) {
      inputBuffer = await fetchRemote(srcUrl);
    } else {
      return { status: 400, contentType: 'text/plain', body: Buffer.from('missing source: use /image/<opts>/<path> or ?url=') };
    }

    const { data, contentType } = await withTimeout(
      transformImage(inputBuffer, opts, acceptHeader),
      WITH_TIMEOUT_MS,
      '图像变换'
    );
    return { status: 200, contentType, body: data };
  } catch (e) {
    return { status: 500, contentType: 'text/plain', body: Buffer.from('transform error: ' + e.message) };
  }
}

module.exports = {
  parseOptions,
  transformImage,
  resolveLocal,
  fetchRemote,
  fetchSameOrigin,
  isBlockedHost,
  ensureSharp,
  withTimeout,
  handleRequest,
  FIT_ALIASES,
  GRAVITY,
};
