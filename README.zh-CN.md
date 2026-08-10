# [Squoosh]!

[![Deploy to EdgeOne Makers](https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg)](https://console.cloud.tencent.com/edgeone/pages/new?repository-url=https%3A%2F%2Fgithub.com%2Fviolet27chen%2Fsquoosh&root-directory=.%2F&build-command=npm%20run%20build&install-command=npm%20install&output-directory=build&env=ALLOWED_URL_HOSTS&env-description=%E9%99%90%E5%88%B6%20%3Furl%3D%20%E8%BF%9C%E7%A8%8B%E6%8A%93%E5%8F%96%E7%9A%84%E5%85%81%E8%AE%B8%E5%9F%9F%E5%90%8D%E7%99%BD%E5%90%8D%E5%8D%95%EF%BC%9B%E7%95%99%E7%A9%BA%3D%E4%B8%8D%E9%99%90%E5%88%B6%EF%BC%88%E5%A4%9A%E4%B8%AA%E7%94%A8%E9%80%97%E5%8F%B7%E5%88%86%E9%9A%94%EF%BC%89)
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/violet27chen/squoosh)

> **Cloudflare 版本**：API 完全一致（同样的 `/image/<选项>/<路径>` 与 `?url=`），仅底层换成 Cloudflare 原生图片缩放。用上方 Cloudflare 按钮即可一键部署——按钮会以 **Pages** 模式部署（读取 `wrangler.toml` 的 `pages_build_output_dir = "build"` 作为输出目录、`[vars]` 作为 `ALLOWED_URL_HOSTS`）。输出目录由 `pages_build_output_dir` 配置（表单里不单独显示该字段，但部署时会正确应用）。详见 [README.cloudflare.md](./README.cloudflare.md)。

[Squoosh] 是一个图像压缩 Web 应用，在显著减小文件体积的同时保持无损的图像质量。

# API & CLI

Squoosh 提供 [API](https://github.com/violet27chen/squoosh/tree/dev/libsquoosh) 和 [CLI](https://github.com/violet27chen/squoosh/tree/dev/cli)，可一次性压缩多张图片。

# 隐私

Squoosh 不会把你的图片发送到服务器。所有图像压缩都在本地完成。

不过，Squoosh 使用 Google Analytics 收集以下数据：

- [基础访客数据](https://support.google.com/analytics/answer/6004245?ref_topic=2919631)。
- 压缩前后的图片体积数值。
- 若为 Squoosh CLI，Squoosh 安装的类型。
- 若为 Squoosh CLI，安装的时间和日期。

# 开发

为 Squoosh 做开发：

1. 克隆仓库
1. 安装 node 依赖，运行：
   ```sh
   npm install
   ```
1. 然后构建应用，运行：
   ```sh
   npm run build
   ```
1. 构建完成后，启动开发服务器，运行：
   ```sh
   npm run dev
   ```

# 贡献

Squoosh 是一个开源项目，欢迎社区参与。要参与项目，请遵循[贡献指南](/CONTRIBUTING.md)。

[squoosh]: https://image.violet27chen.com

---

# Squoosh Transform — 自托管按需图像变换服务

> 📖 English README: [README.md](./README.md)

本仓库把 [Squoosh](https://github.com/violet27chen/squoosh) 扩展成一个 **类 Cloudflare Images 的按需图像变换服务**，运行在 **EdgeOne Makers 的 Node Functions** 上。不锁定任何云厂商：源可来自本地目录或任意公网 URL，输出通过 URL 参数实时生成并边缘缓存。

> 线上示例端点：`https://image.violet27chen.com`
> Squoosh 原浏览器端压缩 UI 源码（`src/`、`codecs/`）完整保留，本服务是在其之上新增的「服务端 URL 即 API」能力。

## 1. 快速开始

任意图片，只要改 URL 就能实时变换：

```bash
# 把 sample.png 缩到宽 400、转 webp、质量 70
curl -s -o out.webp "https://image.violet27chen.com/image/width=400,quality=70,format=webp/sample.png"

# 只转格式不缩放（纯体积优化）
curl -s -o out.webp "https://image.violet27chen.com/image/format=webp/sample.png"

# 抓任意公网图并变换
curl -s -o out.webp "https://image.violet27chen.com/image/width=800,quality=80,format=webp?url=https://cdn.example.com/photo.png"
```

## 2. API 格式

### 两种调用方式

```
GET /image/<options>/<path>          # path 相对于内置图库（默认 images/）
GET /image/<options>?url=<公网图片>   # 抓取任意公网图片
```

- `<options>`：逗号分隔的变换参数，写在路径里。
- `<path>`：内置图库里的文件名（如 `sample.png`、`chatgpt.webp`）。
- `?url=`：公网图片完整 URL（需含 `http://` 或 `https://`）。

### 示例

```
/image/width=400,quality=70,format=webp/sample.png
/image/width=800,quality=90,sharpen=1,format=webp/chatgpt.webp
/image/fit=scale-down,width=1200?url=https://example.com/photo.jpg
/image/format=webp/sample.png                      # 只转格式、不缩放
/image/width=200,height=200,fit=cover,gravity=face?url=https://example.com/p.jpg
```

## 3. 参数表

| 参数 | 说明 | 默认 / 可选值 |
|---|---|---|
| `width` | 目标宽度（px） | 数字；缺省不缩放 |
| `height` | 目标高度（px） | 数字；缺省不缩放 |
| `fit` | 适配模式 | `scale-down`(默认,不放大) / `contain` / `cover` / `crop` / `pad` / `fill` / `outside` |
| `format` | 输出格式 | `auto`(按 `Accept` 协商 avif→webp→jpeg) / `webp` / `avif` / `jpeg` / `png` / `original` |
| `quality` | 有损质量 1–100 | webp/jpeg 默认 80，avif 默认 50 |
| `dpr` | 设备像素比，乘到 width/height | 数字，如 `2` |
| `background` | `pad` 模式填充背景色 | hex，如 `ffffff`（不带 `#`） |
| `gravity` | 裁剪对齐 | `center` / `north` / `south` / `east` / `west` 及四角 `northeast` 等 |
| `blur` | 模糊强度 1–2000（0=关） | 数字 |
| `sharpen` | 锐化开关 | 出现即为开（值任意，如 `sharpen=1`） |
| `rotate` | 旋转角度（默认按 EXIF 自动转正） | 数字，如 `90`、`180` |
| `metadata` | 保留元信息 | 默认剥离 EXIF/ICC；`keep` 保留 |

### 格式协商（`format=auto`，默认行为）

当 `format` 缺省或为 `auto` 时，服务按请求的 `Accept` 头自动选格式：

- `Accept` 含 `image/avif` → 输出 **avif**
- 否则含 `image/webp` → 输出 **webp**
- 否则 → 输出 **jpeg**

```bash
# 浏览器通常会发 Accept: image/avif,image/webp,*/* → 直接得到 avif
curl -H "Accept: image/avif,image/webp,*/*" "https://image.violet27chen.com/image/width=300,quality=60/sample.png"
```

## 4. 响应

- **成功**：`200 OK`，`Content-Type` 为输出图片 MIME（如 `image/webp`）。
- **缓存**：响应带 `Cache-Control: public, max-age=31536000, immutable` + `Vary: Accept`。相同 URL 在边缘/CDN 长期缓存，重复请求不重复计算。
- **错误**：`400`（参数错误）/ `500`（变换失败），`Content-Type: text/plain`，body 为可读错误信息。

### 错误示例

```
transform error: fetch failed: 404 | IMAGES_DIR=... | origin=... | tried=(none)
# 含义：?url= 指定的源图本身 404（源站没有这张图），不是服务故障
```

```
transform error: blocked host
# 含义：?url= 指向内网/回环地址，被 SSRF 防护拦截
```

## 5. 本地图库

内置图库存放在 `images/`（部署时通过 `edgeone.json` 的 `includeFiles` 复制进函数包）：

| 文件 | 说明 |
|---|---|
| `sample.png` | 示例图（PNG 源） |
| `sample.webp` | 示例图（WebP 源） |
| `chatgpt.webp` | 你本地的 ChatGPT 生成图 |

调用时用文件名即可：`/image/<opts>/sample.png`、`/image/<opts>/chatgpt.webp`。
要加自己的图：把文件丢进 `images/`（或 `cloud-functions/images/`），重新部署即可。

## 6. 调用方示例

### cURL

```bash
# 纯格式转换（体积优化，不缩放）
curl -s -o out.webp "https://image.violet27chen.com/image/format=webp/sample.png"

# 高质量 + 锐化 + 大尺寸
curl -s -o sharp.webp "https://image.violet27chen.com/image/width=800,quality=90,sharpen=1,format=webp/sample.png"

# 公网图 + 自适应格式（让服务端按 Accept 选 avif/webp）
curl -s -o out "https://image.violet27chen.com/image/width=600,quality=75?url=https://cdn.example.com/photo.png"
```

### JavaScript（fetch）

```js
const url = 'https://image.violet27chen.com/image/width=800,quality=80,format=webp?url='
  + encodeURIComponent('https://cdn.example.com/photo.png');
const res = await fetch(url);
const blob = await res.blob();           // 直接用：<img src={URL.createObjectURL(blob)}>
```

### HTML `<img>` 直链

```html
<img src="https://image.violet27chen.com/image/width=600,quality=75,format=webp/sample.png"
     alt="变换后的图" loading="lazy">
```

### Python

```python
import requests
r = requests.get("https://image.violet27chen.com/image/format=webp/sample.png")
open("out.webp", "wb").write(r.content)
```

## 7. 平台约束（EdgeOne Makers Cloud Functions）

| 项 | 限制 | 影响 |
|---|---|---|
| 代码包大小 | ≤ 128 MB（含依赖） | sharp 含预编译 libvips，约 30–50 MB，可装下 |
| 响应 body | ≤ 6 MB | 变换后图片不能过大；超大图先缩小或用 `quality` 压 |
| 最大执行时长 | 默认 30s（可配至 120s） | 一般图像变换远低于此 |
| Node 版本 | v20.x | sharp 0.33 兼容 |

## 8. 安全说明

- **路径穿越防护**：本地图库经 `path.resolve` + 前缀校验，禁止 `../` 逃逸图库目录。
- **SSRF 防护**：`?url=` 仅允许 `http`/`https`，并屏蔽 `localhost`、回环、私网网段（10/172.16–31/192.168）。生产环境建议补充 DNS 重绑定校验。
- **`?url=` 域名白名单（环境变量 `ALLOWED_URL_HOSTS`）**：未设置=不限制；设置后只允许列表域名（逗号分隔，精确匹配忽略大小写），非白名单域名返回 `host not allowed by ALLOWED_URL_HOSTS` 错误。本地图库（`/image/<opts>/<path>`）不受此白名单影响。在 EdgeOne 控制台环境变量配置，不进仓库。
- **源图大小**：`?url=` 抓取未做硬性上限，生产可按需加 `Content-Length` 校验。

## 9. 本地开发

无需 EdgeOne 即可验证逻辑：

```bash
npm install            # 安装 sharp（已写入 cloud-functions/package.json）
node dev-server.cjs   # 默认 http://localhost:3000
```

访问 `http://localhost:3000/image/width=400,quality=70,format=webp/sample.png`。
（本项目不提供线上演示页；本地开发用 curl 验证即可，无需打开网页。）

## 10. 部署

1. 把代码推到 Git 仓库（GitHub 等）。
2. 在 **EdgeOne Makers** 控制台创建项目并关联该仓库，生产分支选 `dev`；平台按 `cloud-functions/` 生成 `/image/*` 路由，并托管图库。
3. `edgeone.json` 已配好原生模块与外部文件：
   ```json
   {
     "cloudFunctions": {
       "nodejs": {
         "externalNodeModules": ["sharp", "@img/sharp-linux-x64"],
         "includeFiles": ["cloud-functions/images/**/*"],
         "maxDuration": 60
       }
     }
   }
   ```
4. 每次 `git push` 自动构建并发布。

## 11. 扩展阅读

- 核心变换逻辑：`cloud-functions/_lib/image-transform.js`
- 函数入口：`cloud-functions/image/[[path]].js`
- 更完整的技术细节、目录结构与部署排障记录见 [`README-TRANSFORM.md`](./README-TRANSFORM.md)
