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
import transformLib from '../_lib/image-transform.js';

const { handleRequest } = transformLib;

// 云端：示例图已打进 cloud-functions/images/，用 __dirname 解析即可直接读盘（不依赖出站 fetch）。
// 本地开发可设 IMAGES_DIR 指向真实目录；生产源图也可放这里或走 ?url=。
const IMAGES_DIR = process.env.IMAGES_DIR
  ? path.resolve(process.env.IMAGES_DIR)
  : path.join(__dirname, '..', 'images');

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
