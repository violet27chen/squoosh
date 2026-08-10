# Squoosh Transform — 自托管按需图片变换 API

[![Deploy to EdgeOne Makers](https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg)](https://console.cloud.tencent.com/edgeone/pages/new?repository-url=https%3A%2F%2Fgithub.com%2Fviolet27chen%2Fsquoosh&root-directory=.%2F&build-command=npm%20run%20build&install-command=npm%20install&output-directory=build&env=ALLOWED_URL_HOSTS&env-description=%E9%99%90%E5%88%B6%20%3Furl%3D%20%E8%BF%9C%E7%A8%8B%E6%8A%93%E5%8F%96%E7%9A%84%E5%85%81%E8%AE%B8%E5%9F%9F%E5%90%8D%E7%99%BD%E5%90%8D%E5%8D%95%EF%BC%9B%E7%95%99%E7%A9%BA%3D%E4%B8%8D%E9%99%90%E5%88%B6%EF%BC%88%E5%A4%9A%E4%B8%AA%E7%94%A8%E9%80%97%E5%8F%B7%E5%88%86%E9%9A%94%EF%BC%89)
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/violet27chen/squoosh)

> **Cloudflare 版本**：API 完全一致（同样的 `/image/<选项>/<路径>` 与 `?url=`），仅底层换成 Cloudflare 原生图片缩放。用上方 Cloudflare 按钮即可一键部署——按钮会以 **Pages** 模式部署（读取 `wrangler.toml` 的 `pages_build_output_dir = "build"` 作为输出目录、`[vars]` 作为 `ALLOWED_URL_HOSTS`）。输出目录由 `pages_build_output_dir` 配置（表单里不单独显示该字段，但部署时会正确应用）。详见 [README.cloudflare.md](./README.cloudflare.md)。

本仓库把图像变换能力做成一个 **类 Cloudflare Images 的按需图像变换 API**，运行在 **EdgeOne Makers 的 Node Functions** 或 **Cloudflare Pages Functions** 上。原 Squoosh 浏览器端压缩 UI（`src/`、`codecs/`）已移除，部署产物仅含图片变换函数与一个极简静态说明页（访问根域名即可看到 API 用法与示例）。

- 不锁定任何云厂商：图像源可以是本地图库或任意公网 URL，输出按 URL 参数实时生成并边缘缓存。
- 零服务器：跑在边缘函数免费额度内，个人使用基本零成本。

线上示例端点：`https://image.violet27chen.com`

📖 English README: [README.md](./README.md) ｜ Cloudflare 专版：[README.cloudflare.md](./README.cloudflare.md)

## API 速览

```
GET /image/<选项>/<路径>          # 路径相对于内置图库（默认 images/）
GET /image/<选项>?url=<公网图片>   # 抓取任意公网图片
```

示例：

```bash
# 缩放到宽 400、转 webp、质量 70
curl -s -o out.webp "https://image.violet27chen.com/image/width=400,quality=70,format=webp/sample.png"

# 抓任意公网图并变换
curl -s -o out.webp "https://image.violet27chen.com/image/width=800,quality=80,format=webp?url=https://cdn.example.com/photo.png"
```

完整参数、调用示例、安全与部署说明见下方章节。

# 贡献

Squoosh Transform 是一个开源项目，欢迎社区参与。要参与项目，请遵循[贡献指南](/CONTRIBUTING.md)。

---

# Squoosh Transform — 技术细节

本仓库把 [Squoosh](https://github.com/violet27chen/squoosh) 扩展成一个 **类 Cloudflare Images 的按需图像变换服务**，可部署到 **EdgeOne Makers** 或 **Cloudflare Pages Functions**。两者的**对外 API 完全一致**：

```
/image/<选项>/<路径>      转换站点静态目录 /images/<路径> 下的本地图片
/image/<选项>/?url=<远程> 转换公网图片（带 SSRF 防护 + 域名白名单）
```

唯一区别在底层引擎：Cloudflare Workers 运行时**无法运行 sharp 这类原生模块**，因此 Cloudflare 版改用 **Cloudflare 原生图片缩放**（`fetch` 的 `cf.image` 选项）。相同请求 → 相同输出图片，调用方式不变。

> 线上示例端点：`https://image.violet27chen.com`
> 原 Squoosh 浏览器端压缩 UI 源码（`src/`、`codecs/`）已移除。本仓库现在是纯按需图像变换 **API** + 一个极简静态说明页（根路径即是说明页）。

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

内置图库提供了上面示例用到的样例图：

- **EdgeOne**：位于 `cloud-functions/images/`（由 `edgeone.json` 的 `includeFiles` 打包进函数）。
- **Cloudflare**：位于仓库根 `images/`，由构建脚本复制到 `build/images/`，供函数同源回源 `/images/*`。

| 文件 | 说明 |
|---|---|
| `sample.png` | 示例图（PNG 源） |
| `sample.webp` | 示例图（WebP 源） |
| `chatgpt.webp` | 你本地的 ChatGPT 生成图 |

调用时用文件名即可：`/image/<选项>/sample.png`、`/image/<选项>/chatgpt.webp`。
要加自己的图：Cloudflare 丢进 `images/`、EdgeOne 丢进 `cloud-functions/images/`，重新部署即可。

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
- **`?url=` 域名白名单（环境变量 `ALLOWED_URL_HOSTS`）**：未设置=不限制；设置后只允许列表域名（逗号分隔，精确匹配忽略大小写），非白名单域名返回 `host not allowed by ALLOWED_URL_HOSTS` 错误。本地图库（`/image/<选项>/<路径>`）不受此白名单影响。在 EdgeOne 控制台环境变量配置，不进仓库。
- **源图大小**：`?url=` 抓取未做硬性上限，生产可按需加 `Content-Length` 校验。

## 9. 本地开发

无需任何云平台即可构建静态产物（图库 + 说明页）：

```bash
npm install
npm run build      # -> build/images/ 和 build/index.html
```

随后用任意静态服务器预览 `build/`，或部署到 Cloudflare Pages / EdgeOne Makers 后通过线上 URL 验证 API（推荐——变换跑在边缘）。根路径的说明页已自带 API 文档；API 本身即 `/image/<选项>/<路径>` 与 `/image/<选项>?url=`。

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

> Cloudflare Pages 部署见 [README.cloudflare.md](./README.cloudflare.md)。

## 11. 扩展阅读

- 核心变换逻辑：`cloud-functions/_lib/image-transform.js`
- 函数入口：`cloud-functions/image/[[path]].js`
- 更完整的技术细节、目录结构与部署排障记录见 [`README-TRANSFORM.md`](./README-TRANSFORM.md)
