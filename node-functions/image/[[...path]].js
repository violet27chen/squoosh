// EdgeOne Makers - Node Functions 入口（类 Cloudflare Images 的按需图像变换）。
// 路由：/image/<options>/<path>  或  /image/<options>?url=<公网图片>
// 例：/image/width=800,quality=80,format=webp/sample.png
//     /image/width=400,format=avif?url=https://example.com/photo.jpg
//
// 该文件由 EdgeOne 构建时按目录结构生成路由，属于 Node.js 运行时（v20.x），
// 因此可以使用 sharp 这类原生 npm 包。请务必返回 Web 标准 Response 对象。

import path from 'node:path';
import transformLib from '../../lib/image-transform.js';

const { handleRequest } = transformLib;

const IMAGES_DIR = process.env.IMAGES_DIR
  ? path.resolve(process.env.IMAGES_DIR)
  : path.join(process.cwd(), 'images');

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const result = await handleRequest({
    pathname: url.pathname,
    searchParams: url.searchParams,
    acceptHeader: context.request.headers.get('accept'),
    imagesDir: IMAGES_DIR,
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
}
