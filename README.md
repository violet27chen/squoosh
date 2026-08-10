# [Squoosh]!

[![Deploy to EdgeOne Makers](https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg)](https://console.cloud.tencent.com/edgeone/pages/new?repository-url=https%3A%2F%2Fgithub.com%2Fviolet27chen%2Fsquoosh&root-directory=.%2F&build-command=npm%20run%20build&install-command=npm%20install&output-directory=build&env=ALLOWED_URL_HOSTS&env-description=%E9%99%90%E5%88%B6%20%3Furl%3D%20%E8%BF%9C%E7%A8%8B%E6%8A%93%E5%8F%96%E7%9A%84%E5%85%81%E8%AE%B8%E5%9F%9F%E5%90%8D%E7%99%BD%E5%90%8D%E5%8D%95%EF%BC%9B%E7%95%99%E7%A9%BA%3D%E4%B8%8D%E9%99%90%E5%88%B6%EF%BC%88%E5%A4%9A%E4%B8%AA%E7%94%A8%E9%80%97%E5%8F%B7%E5%88%86%E9%9A%94%EF%BC%89)
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/violet27chen/squoosh)

> **Cloudflare variant**: identical API (same `/image/<opts>/<path>` and `?url=`), different engine (Cloudflare native image resizing). Deploy with the Cloudflare button above — it deploys as a **Pages** project (the button reads `wrangler.toml`'s `pages_build_output_dir = "build"` for the output dir and `[vars]` for `ALLOWED_URL_HOSTS`). The output directory is configured via `pages_build_output_dir` (not shown as a separate form field, but correctly applied at deploy time). Full details in [README.cloudflare.md](./README.cloudflare.md).

[Squoosh] is an image compression web app that provides lossless image quality with a significant reduction to file size.

# API & CLI

Squoosh has [an API](https://github.com/violet27chen/squoosh/tree/dev/libsquoosh) and [a CLI](https://github.com/violet27chen/squoosh/tree/dev/cli) to compress many images at once.

# Privacy

Squoosh does not send your image to a server. All image compression processes locally.

However, Squoosh utilizes Google Analytics to collect the following:

- [Basic visitor data](https://support.google.com/analytics/answer/6004245?ref_topic=2919631).
- The before and after image size value.
- If Squoosh CLI, the type of Squoosh installation.
- If Squoosh CLI, the installation time and date.

# Developing

To develop for Squoosh:

1. Clone the repository
1. To install node packages, run:
   ```sh
   npm install
   ```
1. Then build the app by running:
   ```sh
   npm run build
   ```
1. After building, start the development server by running:
   ```sh
   npm run dev
   ```

# Contributing

Squoosh is an open-source project that appreciates all community involvement. To contribute to the project, follow the [contribute guide](/CONTRIBUTING.md).

[squoosh]: https://image.violet27chen.com

---

# Squoosh Transform — Self-hosted On-demand Image Transformation Service

> 📖 中文文档（API 调用指南）：[README.zh-CN.md](./README.zh-CN.md)

This repository extends [Squoosh](https://github.com/violet27chen/squoosh) into a **Cloudflare-Images-style on-demand image transformation service**, running on **EdgeOne Makers Cloud Functions**. It is cloud-agnostic: image sources can be a local directory or any public URL, and output is generated in real time from URL parameters and cached at the edge.

> Live example endpoint: `https://image.violet27chen.com`
> The original Squoosh in-browser compression UI source (`src/`, `codecs/`) is fully preserved. This service adds a server-side "URL-as-API" capability on top of it.

## 1. Quick Start

Any image can be transformed just by changing the URL:

```bash
# Resize sample.png to width 400, convert to webp, quality 70
curl -s -o out.webp "https://image.violet27chen.com/image/width=400,quality=70,format=webp/sample.png"

# Convert format only, no resize (pure size optimization)
curl -s -o out.webp "https://image.violet27chen.com/image/format=webp/sample.png"

# Fetch any public image and transform it
curl -s -o out.webp "https://image.violet27chen.com/image/width=800,quality=80,format=webp?url=https://cdn.example.com/photo.png"
```

## 2. API Format

### Two ways to call

```
GET /image/<options>/<path>          # path is relative to the built-in image library (default images/)
GET /image/<options>?url=<public image>   # fetch any public image
```

- `<options>`: comma-separated transform parameters, written in the path.
- `<path>`: filename in the built-in library (e.g. `sample.png`, `chatgpt.webp`).
- `?url=`: full URL of a public image (must include `http://` or `https://`).

### Examples

```
/image/width=400,quality=70,format=webp/sample.png
/image/width=800,quality=90,sharpen=1,format=webp/chatgpt.webp
/image/fit=scale-down,width=1200?url=https://example.com/photo.jpg
/image/format=webp/sample.png                      # convert format only, no resize
/image/width=200,height=200,fit=cover,gravity=face?url=https://example.com/p.jpg
```

## 3. Parameters

| Param | Description | Default / Options |
|---|---|---|
| `width` | Target width (px) | number; no resize if omitted |
| `height` | Target height (px) | number; no resize if omitted |
| `fit` | Fit mode | `scale-down`(default, no upscaling) / `contain` / `cover` / `crop` / `pad` / `fill` / `outside` |
| `format` | Output format | `auto`(negotiate avif→webp→jpeg by `Accept`) / `webp` / `avif` / `jpeg` / `png` / `original` |
| `quality` | Lossy quality 1–100 | webp/jpeg default 80, avif default 50 |
| `dpr` | Device pixel ratio, multiplied into width/height | number, e.g. `2` |
| `background` | `pad` mode background color | hex, e.g. `ffffff` (no `#`) |
| `gravity` | Crop alignment | `center` / `north` / `south` / `east` / `west` and four corners like `northeast` |
| `blur` | Blur strength 1–2000 (0=off) | number |
| `sharpen` | Sharpen switch | present = on (any value, e.g. `sharpen=1`) |
| `rotate` | Rotation angle (default: auto-orient by EXIF) | number, e.g. `90`, `180` |
| `metadata` | Keep metadata | stripped by default; `keep` retains EXIF/ICC |

### Format negotiation (`format=auto`, default)

When `format` is omitted or `auto`, the service picks the output format by the request `Accept` header:

- `Accept` contains `image/avif` → output **avif**
- else contains `image/webp` → output **webp**
- else → output **jpeg**

```bash
# Browsers usually send Accept: image/avif,image/webp,*/* → get avif directly
curl -H "Accept: image/avif,image/webp,*/*" "https://image.violet27chen.com/image/width=300,quality=60/sample.png"
```

## 4. Response

- **Success**: `200 OK`, `Content-Type` is the output image MIME (e.g. `image/webp`).
- **Caching**: response carries `Cache-Control: public, max-age=31536000, immutable` + `Vary: Accept`. Same URL is cached long-term at the edge/CDN; repeated requests are not recomputed.
- **Error**: `400` (bad params) / `500` (transform failed), `Content-Type: text/plain`, body is a readable error message.

### Error examples

```
transform error: fetch failed: 404 | IMAGES_DIR=... | origin=... | tried=(none)
# meaning: the ?url= source image itself returns 404 (source site has no such image), not a service fault
```

```
transform error: blocked host
# meaning: ?url= points to an internal/loopback address, blocked by SSRF protection
```

## 5. Built-in Image Library

The built-in library lives in `images/` (copied into the function package via `edgeone.json` `includeFiles`):

| File | Description |
|---|---|
| `sample.png` | Sample image (PNG source) |
| `sample.webp` | Sample image (WebP source) |
| `chatgpt.webp` | Your local ChatGPT-generated image |

Call by filename: `/image/<opts>/sample.png`, `/image/<opts>/chatgpt.webp`.
To add your own images: drop files into `images/` (or `cloud-functions/images/`) and redeploy.

## 6. Caller Examples

### cURL

```bash
# Pure format conversion (size optimization, no resize)
curl -s -o out.webp "https://image.violet27chen.com/image/format=webp/sample.png"

# High quality + sharpen + large size
curl -s -o sharp.webp "https://image.violet27chen.com/image/width=800,quality=90,sharpen=1,format=webp/sample.png"

# Public image + adaptive format (let server pick avif/webp by Accept)
curl -s -o out "https://image.violet27chen.com/image/width=600,quality=75?url=https://cdn.example.com/photo.png"
```

### JavaScript (fetch)

```js
const url = 'https://image.violet27chen.com/image/width=800,quality=80,format=webp?url='
  + encodeURIComponent('https://cdn.example.com/photo.png');
const res = await fetch(url);
const blob = await res.blob();           // use directly: <img src={URL.createObjectURL(blob)}>
```

### HTML `<img>` direct link

```html
<img src="https://image.violet27chen.com/image/width=600,quality=75,format=webp/sample.png"
     alt="transformed image" loading="lazy">
```

### Python

```python
import requests
r = requests.get("https://image.violet27chen.com/image/format=webp/sample.png")
open("out.webp", "wb").write(r.content)
```

## 7. Platform Limits (EdgeOne Makers Cloud Functions)

| Item | Limit | Impact |
|---|---|---|
| Package size | ≤ 128 MB (incl. deps) | sharp bundles prebuilt libvips, ~30–50 MB, fits |
| Response body | ≤ 6 MB | transformed image must not be too large; shrink first or lower `quality` |
| Max execution | default 30s (up to 120s) | typical transforms are far below this |
| Node version | v20.x | sharp 0.33 compatible |

## 8. Security

- **Path traversal protection**: local library resolved via `path.resolve` + prefix check, `../` escapes blocked.
- **SSRF protection**: `?url=` only allows `http`/`https`, and blocks `localhost`, loopback, and private ranges (10/172.16–31/192.168). Production should add DNS-rebinding checks.
- **`?url=` host whitelist (env `ALLOWED_URL_HOSTS`)**: if unset/empty = no restriction; if set, only listed hosts are allowed (comma-separated, exact match, case-insensitive), non-listed hosts get `host not allowed by ALLOWED_URL_HOSTS`. The built-in library (`/image/<opts>/<path>`) is NOT affected by this whitelist. Configure via EdgeOne console env vars, no code change, not in repo.
- **Source size**: `?url=` fetch has no hard cap; production may add `Content-Length` check.

## 9. Local Development

No EdgeOne needed to verify logic:

```bash
npm install            # install sharp (already in cloud-functions/package.json)
node dev-server.cjs   # default http://localhost:3000
```

Visit `http://localhost:3000/image/width=400,quality=70,format=webp/sample.png`.
(This project does not ship an online demo page; use curl locally to verify, no web page needed.)

## 10. Deployment

1. Push code to a Git repo (GitHub, etc.).
2. In **EdgeOne Makers** console, create a project and link the repo, set production branch to `dev`; the platform generates `/image/*` route from `cloud-functions/` and hosts the image library.
3. `edgeone.json` already configures native modules and external files:
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
4. Every `git push` auto-builds and publishes.

## 11. Further Reading

- Core transform logic: `cloud-functions/_lib/image-transform.js`
- Function entry: `cloud-functions/image/[[path]].js`
- Full technical details, directory structure, and deployment troubleshooting: [`README-TRANSFORM.md`](./README-TRANSFORM.md)
