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
 * 云端 images 目录解析。EdgeOne 把函数打成单 bundle（/var/user/index.mjs），
 * includeFiles 复制进来的文件实际落在 /var/user/included_files/<原路径> 下
 * （probe 实测确认：/var/user/included_files/cloud-functions/images/sample.png）。
 * resolveLocal 只读含 sample.* 的 images/ 目录，避免误命中系统目录（如 /var/images）。
 */
function findImagesDir() {
  if (process.env.IMAGES_DIR) return path.resolve(process.env.IMAGES_DIR);

  // 候选根：函数工作区与常见产物位置
  const roots = [ENTRY_DIR, process.cwd(), '/var/user', '/tmp'].filter((d) => d && fs.existsSync(d));

  // 直接探测已知 layout：included_files/cloud-functions/images
  const exact = [
    path.join('/var/user', 'included_files', 'cloud-functions', 'images'),
    path.join(process.cwd(), 'included_files', 'cloud-functions', 'images'),
    path.join(ENTRY_DIR, '..', 'included_files', 'cloud-functions', 'images'),
  ];

  for (const dir of exact) {
    if (hasSample(dir)) return dir;
  }

  // 兜底：从各根向下找 images/ 目录（最深 3 层）
  for (const root of roots) {
    const found = walkForImages(root, 3);
    if (found) return found;
  }

  // 找不到时返回最合理回退（让错误信息更明确）
  return path.join('/var/user', 'included_files', 'cloud-functions', 'images');
}

function hasSample(dir) {
  try {
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      return fs.readdirSync(dir).some((f) => /^sample\./.test(f));
    }
  } catch (_) {}
  return false;
}

function walkForImages(dir, depth) {
  if (depth < 0) return null;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return null;
  }
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const full = path.join(dir, ent.name);
    if (ent.name === 'images' && hasSample(full)) return full;
    const deeper = walkForImages(full, depth - 1);
    if (deeper) return deeper;
  }
  return null;
}

const IMAGES_DIR = findImagesDir();

export async function onRequestGet(context) {
  try {
    // [[path]] 捕获 /image/ 之后的所有路径段（可能是数组，需 join）。
    const raw = context?.params?.path;
    const remainder = Array.isArray(raw) ? raw.join('/') : String(raw || '');
    const url = new URL(context.request.url);

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
