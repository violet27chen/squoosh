// EdgeOne Makers - Cloud Functions (Node.js) 入口（类 Cloudflare Images 的按需图像变换）。
//
// 官方约定（https://cloud.tencent.com/document/product/1552/127419）：
//   - 函数放在 /cloud-functions 目录，路由按目录结构生成。
//   - 多级动态（catch-all）用 [[param]] 语法，参数通过 context.params 获取。
//   本文件 → 路由 /image/* ，[[path]] 捕获 /image/ 之后的所有路径段。
//
// 用法：
//   /image/width=400,quality=70,format=webp/sample.png
//   /image/width=400,format=avif?url=https://example.com/photo.jpg
//
// 该文件运行在 Node.js 运行时（v20.x），可使用 sharp 这类原生 npm 包。
// 必须返回 Web 标准 Response 对象。

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import transformLib from '../_lib/image-transform.js';

const { handleRequest } = transformLib;

// ESM 入口里 __dirname 不可用，用 import.meta.url 反解本文件所在目录。
const ENTRY_DIR = path.dirname(fileURLToPath(import.meta.url));

/**
 * 云端 images 目录解析。EdgeOne 把函数打成单 bundle，import.meta.url 指向 /var/user/index.mjs，
 * process.cwd() 与源码 cloud-functions/ 布局不再同步。
 * 用「递归向上找含 sample.* 的 images/ 目录」最稳：函数进程可访问的文件系统里，
 * includeFiles 复制的图片就在某个祖先目录的 images/ 下。
 */
function resolveImagesDir() {
  if (process.env.IMAGES_DIR) return path.resolve(process.env.IMAGES_DIR);

  const startDirs = [
    ENTRY_DIR,
    process.cwd(),
  ].filter(Boolean);

  // 也试试常见产物根
  const guessRoots = ['/var/user', '/tmp', '/'];
  for (const root of guessRoots) {
    if (fs.existsSync(root)) startDirs.push(root);
  }

  for (const start of startDirs) {
    let dir = path.resolve(start);
    // 向上找 6 层
    for (let i = 0; i < 6; i++) {
      const candidate = path.join(dir, 'images');
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
          const files = fs.readdirSync(candidate);
          if (files.some((f) => /^sample\./.test(f))) return candidate;
        }
      } catch (_) {}
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  // 找不到时返回最合理的回退（让错误信息更明确）
  return path.join(ENTRY_DIR, '..', 'images');
}

const IMAGES_DIR = resolveImagesDir();

export async function onRequestGet(context) {
  try {
    // [[path]] 捕获 /image/ 之后的所有路径段（可能是数组，需 join）。
    const raw = context?.params?.path;
    const remainder = Array.isArray(raw) ? raw.join('/') : String(raw || '');
    const url = new URL(context.request.url);

    // 临时诊断：?probe=1 列出文件系统，定位 includeFiles 复制进来的 images/ 实际位置。
    if (url.searchParams.get('probe') === '1') {
      const tree = [];
      const walk = (dir, depth) => {
        if (depth > 3) return;
        let entries;
        try {
          entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch (_) { return; }
        for (const ent of entries) {
          const full = path.join(dir, ent.name);
          tree.push('  '.repeat(depth) + (ent.isDirectory() ? '[D] ' : '[F] ') + ent.name);
          if (ent.isDirectory()) walk(full, depth + 1);
        }
      };
      const roots = [ENTRY_DIR, process.cwd(), '/var/user', '/var', '/tmp'];
      for (const r of roots) {
        tree.push('=== root: ' + r + ' (exists=' + fs.existsSync(r) + ') ===');
        walk(r, 0);
      }
      return new Response('ENTRY_DIR=' + ENTRY_DIR + '\nCWD=' + process.cwd() + '\nIMAGES_DIR=' + IMAGES_DIR + '\n\n' + tree.join('\n'), {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    const result = await handleRequest({
      pathname: '/image/' + remainder,
      searchParams: url.searchParams,
      acceptHeader: context.request.headers.get('accept'),
      imagesDir: IMAGES_DIR,
      origin: url.origin, // 如 https://image.violet27chen.com，用于云端同源静态兜底
    });

    return new Response(result.body, {
      status: result.status,
      headers: {
        'Content-Type': result.contentType,
        // 变换结果按内容寻址可长期缓存；边缘/CDN 会据此缓存。
        'Cache-Control': 'public, max-age=31536000, immutable',
        Vary: 'Accept',
      },
    });
  } catch (e) {
    return new Response('handler error: ' + (e && e.message), {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}
