/**
 * Cloudflare Pages Functions 版按需图像变换。
 *
 * 对外 API 与 EdgeOne Makers 版【完全一致】：
 *   /image/<options>/<path>      本地图库（站点静态目录 /images/<path>）
 *   /image/<options>/?url=<远程> 公网图片（带 SSRF 防护 + 域名白名单）
 * options 形如 width=800,quality=80,format=webp,fit=cover 等，逗号分隔。
 *
 * 唯一区别：底层引擎。sharp 无法在 Workers 运行时运行，这里改用 Cloudflare
 * 原生图片缩放（fetch 的 cf.image 选项），所以相同请求得到相同的输出图片。
 */

// fit 别名：把本项目的 Cloudflare 风格 fit 映射到 Cloudflare 原生取值。
// 注意 sharp 的 inside（绝不放大）对应 Cloudflare 的 scale-down。
const FIT_MAP: Record<string, string> = {
  cover: 'cover',
  crop: 'crop',
  contain: 'contain',
  inside: 'scale-down',
  'scale-down': 'scale-down',
  fill: 'squeeze', // Cloudflare 的 squeeze = 精确填满、可拉伸变形
  pad: 'pad',
  outside: 'cover', // sharp outside 允许放大裁剪，Cloudflare 取 cover
};

// 裁剪对齐：Cloudflare 只接受单边（top/right/...）或 XxY 小数坐标。
const GRAVITY_MAP: Record<string, string> = {
  center: '0.5x0.5',
  north: 'top',
  south: 'bottom',
  east: 'right',
  west: 'left',
  northeast: '1x0',
  northwest: '0x0',
  southeast: '1x1',
  southwest: '0x1',
};

function isNum(v: unknown): boolean {
  return v !== undefined && v !== '' && !Number.isNaN(Number(v));
}

// 解析 URL 里的逗号分隔选项，如 "width=800,quality=80,format=webp"。
function parseOptions(str: string): Record<string, string> {
  const o: Record<string, string> = {};
  if (!str) return o;
  for (const part of String(str).split(',')) {
    if (!part) continue;
    const i = part.indexOf('=');
    if (i === -1) {
      o[part.trim()] = 'true';
    } else {
      const k = part.slice(0, i).trim();
      const v = part.slice(i + 1).trim();
      if (k) o[k] = v;
    }
  }
  return o;
}

// 根据 Accept 头自动协商格式（浏览器原生支持时优先 avif > webp > jpeg）。
function negotiateFormat(accept: string): 'avif' | 'webp' | 'jpeg' {
  const a = (accept || '').toLowerCase();
  if (a.includes('image/avif')) return 'avif';
  if (a.includes('image/webp')) return 'webp';
  return 'jpeg';
}

// 基础 SSRF 防护：禁止访问内网/回环地址。
const BLOCKED_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::]', '']);
function isBlockedHost(host: string): boolean {
  host = String(host || '').toLowerCase();
  if (BLOCKED_HOSTS.has(host)) return true;
  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  return false;
}

export async function onRequest(context: {
  request: Request;
  env: Record<string, string>;
}): Promise<Response> {
  const { request, env } = context;
  const url = new URL(request.url);

  const m = url.pathname.match(/^\/image\/(.*)$/);
  if (!m) return new Response('bad path', { status: 400 });

  const remainder = m[1];
  const slash = remainder.indexOf('/');
  let optsStr: string;
  let relPath: string | null = null;
  if (slash === -1) {
    optsStr = remainder;
  } else {
    optsStr = remainder.slice(0, slash);
    relPath = remainder.slice(slash + 1);
  }

  const opts = parseOptions(optsStr);
  const srcUrl = url.searchParams.get('url');
  const accept = request.headers.get('Accept') || '';

  // ---- 把本项目选项翻译成 Cloudflare cf.image 选项 ----
  const img: Record<string, unknown> = {};

  const w = isNum(opts.width) ? parseInt(opts.width, 10) : undefined;
  const h = isNum(opts.height) ? parseInt(opts.height, 10) : undefined;

  // dpr：Cloudflare 上限 2，且由它自己乘到宽高上，所以这里【不要】预先乘 w/h。
  if (opts.dpr) {
    const d = parseFloat(opts.dpr);
    if (d > 0) img.dpr = Math.max(1, Math.min(2, d));
  }

  if (w || h) {
    if (w) img.width = w;
    if (h) img.height = h;
    const fit = FIT_MAP[String(opts.fit || '').toLowerCase()];
    if (fit) img.fit = fit;
    if (opts.gravity) {
      const g = GRAVITY_MAP[String(opts.gravity).toLowerCase()];
      if (g) img.gravity = g;
    }
  }

  // 格式：auto 走内容协商；original 不指定格式（保留原图）。
  let format = String(opts.format || 'auto').toLowerCase();
  if (format === 'auto') format = negotiateFormat(accept);
  if (format === 'jpg') format = 'jpeg';
  if (format !== 'original') img.format = format;

  // 质量：未指定时按格式给默认值（与 EdgeOne 版一致）。
  const q = isNum(opts.quality) ? parseInt(opts.quality, 10) : undefined;
  img.quality = q || (format === 'avif' ? 50 : 80);

  // 旋转：Cloudflare 仅支持 90/180/270（无 EXIF 自动；原图 EXIF 方向仍会被应用）。
  if (isNum(opts.rotate)) {
    const r = parseInt(opts.rotate, 10);
    if (r === 90 || r === 180 || r === 270) img.rotate = r;
  }

  // 模糊：Cloudflare 取值 0-250（250=最大），与 sharp（1-2000，越大越糊）方向相反、
  // 量级不同。这里线性映射保持「值越大越糊」的直觉，具体观感与 EdgeOne 版略有差异。
  if (isNum(opts.blur)) {
    const b = Math.max(0, Math.min(250, Math.round((parseFloat(opts.blur) / 2000) * 250)));
    if (b > 0) img.blur = b;
  }

  // 锐化：Cloudflare 0-10，固定给一个温和值（原 sharp 版是无参开关）。
  if (opts.sharpen) img.sharpen = 3;

  // 背景色（pad/contain/fill 时用）：Cloudflare 接受十六进制（不带 #）。
  if (opts.background && (opts.fit === 'pad' || opts.fit === 'contain' || opts.fit === 'fill')) {
    img.background = String(opts.background).replace(/^#/, '');
  }

  // 元信息：keep 保留，默认剥离（none）。
  img.metadata = opts.metadata === 'keep' ? 'keep' : 'none';

  // ---- 解析源图地址 ----
  let sourceUrl: string;
  try {
    if (relPath) {
      // 本地图库：站点静态目录 /images/<path>。与 /image/* 路由不同，不会自调用死循环。
      sourceUrl = new URL('/images/' + String(relPath).replace(/^\/+/, ''), url.origin).toString();
    } else if (srcUrl) {
      const u = new URL(srcUrl);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('only http(s) allowed');
      if (isBlockedHost(u.hostname)) throw new Error('blocked host');
      // ?url= 域名白名单（环境变量 ALLOWED_URL_HOSTS，逗号分隔；为空=不限制）。
      const raw = (env.ALLOWED_URL_HOSTS as string) || '';
      if (raw.trim()) {
        const allowed = new Set(
          raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
        );
        if (!allowed.has(u.hostname.toLowerCase())) {
          throw new Error('host not allowed by ALLOWED_URL_HOSTS: ' + u.hostname);
        }
      }
      sourceUrl = u.toString();
    } else {
      return new Response('missing source: use /image/<opts>/<path> or ?url=', { status: 400 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response('transform error: ' + msg, { status: 500 });
  }

  // ---- 交由 Cloudflare 原生图片缩放处理 ----
  const options = {
    cf: { image: img },
    redirect: 'follow',
  } as unknown as RequestInit;

  try {
    const res = await fetch(sourceUrl, options);
    if (!res.ok) {
      return new Response(
        'transform error: fetch failed ' + res.status + ' | source=' + sourceUrl,
        { status: 500 }
      );
    }
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response('transform error: ' + msg + ' | source=' + sourceUrl, { status: 500 });
  }
}
