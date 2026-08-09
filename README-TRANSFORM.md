# Squoosh Transform — 自托管按需图像变换服务

把 [Squoosh](https://github.com/GoogleChromeLabs/squoosh) 项目改造成一个 **类 Cloudflare Images 的按需图像变换服务**，运行在 **EdgeOne Makers 的 Node Functions** 上。不锁定任何云厂商：源可来自本地目录或任意公网 URL，输出通过 URL 参数实时生成并边缘缓存。

> 原 Squoosh 的浏览器端压缩 UI 源码（`src/`、`codecs/`）完整保留，本服务是在其之上新增的「服务端 URL 即 API」能力。

## 架构

```
请求 /image/<options>/<path>  ─┐
请求 /image/<options>?url=…   ─┤→ Node Functions 入口 (node-functions/image/[[...path]].js)
                              │     ↓ 调用共享核心
                              │   lib/image-transform.js  (sharp/libvips)
                              │     ↓
                              └→ 变换结果 → Web 标准 Response + 边缘缓存
```

- **引擎**：[sharp](https://sharp.pixelplumbing.com/)（libvips）。选它是因为它覆盖了 Cloudflare Images 绝大部分能力（缩放 / fit / 格式转换 webp·avif·jpeg·png / 质量 / 模糊 / 旋转 / 元信息剥离）。
- **运行时**：EdgeOne Makers **Cloud Functions → Node Functions**（`node-functions/` 目录，Node.js v20.x，完整 npm 生态，因此原生模块 sharp 可用）。
- **为什么不是 Edge Functions（V8）**：V8 边缘函数禁止使用原生模块与 Node 内置，而 sharp 是原生模块，只能在 Node Functions 里跑。

## 目录结构

```
lib/image-transform.js        # 核心：选项解析 + sharp 变换 + 本地/URL 源 + SSRF 防护（CJS，可被本地与边缘共用）
node-functions/image/[[...path]].js   # EdgeOne Node Functions 入口（ESM，返回 Web 标准 Response）
node-functions/package.json   # 声明 sharp 依赖
dev-server.cjs                # 本地开发服务器（纯 Node，无需 EdgeOne 即可验证）
images/                       # 本地源图目录（默认 IMAGES_DIR，可用环境变量覆盖）
index.html                    # 演示页 + 参数表 + 实时 Playground（EdgeOne 静态托管）
README-TRANSFORM.md           # 本文
```

## API

### URL 格式

```
/image/<options>/<path>            # path 相对于 IMAGES_DIR（默认 images/）
/image/<options>?url=<公网图片>     # 抓取任意公网图片
```

选项用逗号分隔写在路径里，例如：

```
/image/width=800,quality=80,format=webp/sample.png
/image/fit=scale-down,width=1200?url=https://example.com/photo.jpg
```

### 参数

| 参数 | 说明 | 默认 / 可选值 |
|---|---|---|
| `width` / `height` | 目标尺寸（px） | 数字；缺省不缩放 |
| `fit` | 适配模式 | `scale-down`(默认,不放大) / `contain` / `cover` / `crop` / `pad` / `fill` / `outside` |
| `format` | 输出格式 | `auto`(按 `Accept` 协商 avif→webp→jpeg) / `webp` / `avif` / `jpeg` / `png` / `original` |
| `quality` | 有损质量 1-100 | webp/jpeg 默认 80，avif 默认 50 |
| `dpr` | 设备像素比，乘到 width/height | 数字，如 `2` |
| `background` | `pad` 模式填充色 | hex，如 `ffffff` |
| `gravity` | 裁剪对齐 | `center` / `north` / `south` / `east` / `west` 及四角 |
| `blur` | 模糊强度 1-2000（0=关） | 数字 |
| `sharpen` | 锐化开关 | 出现即为开 |
| `rotate` | 旋转角度（默认按 EXIF 自动转正） | 数字，如 `90` |
| `metadata` | 保留元信息 | 默认剥离；`keep` 保留 EXIF/ICC |

### 响应

- `Content-Type`：输出图片类型。
- `Cache-Control: public, max-age=31536000, immutable` + `Vary: Accept`：变换结果按内容长期缓存，边缘/CDN 据此缓存。

## 本地开发

无需 EdgeOne 即可验证逻辑（使用隔离的 sharp 或项目本地 `npm install` 后）：

```bash
npm install            # 安装 sharp（已写入 node-functions/package.json / 根 package.json）
node dev-server.cjs    # 默认 http://localhost:3000
```

然后访问：

```
http://localhost:3000/image/width=400,quality=70,format=webp/sample.png
```

打开仓库根 `index.html` 可直接用 Playground（把「API 基址」填成 `http://localhost:3000`）。

> 注意：dev-server.cjs 只处理 `/image/*`；静态 `index.html` 需另起一个静态服务器（如 `npx serve` 或 `python -m http.server`）才能本地预览 Playground 页面本身。

## 部署到 EdgeOne Makers

1. 把代码推到 Git 仓库（GitHub / GitLab 等）。
2. 在 **EdgeOne Makers** 控制台创建项目并关联该仓库；平台会按 `node-functions/` 目录生成函数路由，并把仓库根作为静态资源。
3. （可选）在 `edgeone.json` 里配置多地域部署：
   ```json
   { "mainlandRegions": ["ap-guangzhou"], "overseasRegions": ["ap-singapore"] }
   ```
4. 每次 `git push` 自动构建并发布。

构建时平台执行 `npm install`（读取 `node-functions/package.json` 中的 sharp 依赖），随后部署 `node-functions/image/[[...path]].js` 为 `/image/*` 路由，并静态托管 `index.html`、演示资源与 `images/`。

## 平台约束（来自 EdgeOne Makers Cloud Functions）

| 项 | 限制 | 影响 |
|---|---|---|
| 代码包大小 | ≤ 128 MB（含依赖） | sharp 含预编译 libvips，约 30–50 MB，可装下 |
| 响应 body | ≤ 6 MB | 变换后的图片不能过大；超大图请先缩小或用 `quality` 压 |
| 最大执行时长 | 120s（默认 30s） | 一般图像变换远低于此 |
| Node 版本 | v20.x | sharp 0.33 兼容 |

## 安全说明

- **路径穿越防护**：本地源图经 `path.resolve` + 前缀校验，禁止 `../` 逃逸 `IMAGES_DIR`。
- **SSRF 防护**：`?url=` 仅允许 http/https，并屏蔽 `localhost`、回环、私网网段（10/172.16-31/192.168）。生产环境建议进一步做 DNS 重绑定校验。
- **源图大小**：`?url=` 抓取未做硬性上限，部署前可按需加 `Content-Length` 校验。

## 扩展

- 新增输出格式：在 `lib/image-transform.js` 的 `transformImage` 的 `switch` 中加分支即可（`original` 表示沿用输入格式）。
- 换图片来源：可接入 S3/R2 等对象存储，只需在 `handleRequest` 里新增一种 `inputBuffer` 获取分支。
- 想跑在真正「边缘 V8」上：需把引擎换成纯 WASM 编解码（如 Squoosh 自带的 WASM 编解码器），并去掉 `fs`/原生依赖——这是另一条路线，可按需另做。
