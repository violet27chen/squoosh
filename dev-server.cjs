'use strict';

/**
 * 本地开发服务器（纯 Node http，无额外依赖）。
 * 用于在部署到 EdgeOne 之前，在本机验证图像变换逻辑。
 * 运行：node dev-server.cjs  （可选 PORT=8080）
 */

const http = require('http');
const { URL } = require('url');
const path = require('path');
const lib = require('./lib/image-transform.js');

const IMAGES_DIR = process.env.IMAGES_DIR
  ? path.resolve(process.env.IMAGES_DIR)
  : path.join(__dirname, 'images');
const PORT = process.env.PORT || 3000;

http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const result = await lib.handleRequest({
        pathname: url.pathname,
        searchParams: url.searchParams,
        acceptHeader: req.headers['accept'],
        imagesDir: IMAGES_DIR,
      });
      res.statusCode = result.status;
      res.setHeader('Content-Type', result.contentType);
      if (result.status === 200) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.setHeader('Vary', 'Accept');
      }
      res.end(result.body);
    } catch (e) {
      res.statusCode = 500;
      res.end('Error: ' + e.message);
    }
  })
  .listen(PORT, () => {
    console.log('dev server on http://localhost:' + PORT);
    console.log('local images dir:', IMAGES_DIR);
    console.log('try: http://localhost:' + PORT + '/image/width=400,quality=70,format=webp/sample.png');
  });
