# EdgeImg

[![Deploy to EdgeOne Makers](https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg)](https://console.cloud.tencent.com/edgeone/pages/new?repository-url=https%3A%2F%2Fgithub.com%2Fviolet27chen%2Fedgeimg&root-directory=.%2F&build-command=npm%20run%20build&install-command=npm%20install&output-directory=build&env=ALLOWED_URL_HOSTS&env-description=%E9%99%90%E5%88%B6%20%3Furl%3D%20%E8%BF%9C%E7%A8%8B%E6%8A%93%E5%8F%96%E7%9A%84%E5%85%81%E8%AE%B8%E5%9F%9F%E5%90%8D%E7%99%BD%E5%90%8D%E5%8D%95%EF%BC%9B%E7%95%99%E7%A9%BA%3D%E4%B8%8D%E9%99%90%E5%88%B6%EF%BC%88%E5%A4%9A%E4%B8%AA%E7%94%A8%E9%80%97%E5%8F%B7%E5%88%86%E9%9A%94%EF%BC%89)
> **Cloudflare variant**: identical API (same `/image/<opts>/<path>` and `?url=`), different engine (Cloudflare native image resizing). It deploys as a **Cloudflare Pages** project — **not** a standalone Worker: the `/image/*` route comes from the Pages Functions file `functions/image/[[path]].ts`, which only runs on Pages (a plain Worker won't pick up the `functions/` directory). **There is no one-click button** — Cloudflare deprecated the old Pages deploy button and now only offers a *Worker-only* button (it also force-forks the repo), which is incompatible with this Pages project. Deploy via `wrangler pages deploy` ([§10.2](#102-cloudflare-pages-native-image-resizing)) or connect the repo in Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git. Full details in [README.cloudflare.md](./README.cloudflare.md).

This repository turns image transformation into a **Cloudflare-Images-style on-demand image-transform API**, running on **EdgeOne Makers** or **Cloudflare Pages Functions**. The original in-browser compression UI (`src/`, `codecs/`) has been removed; the deployment artifact now contains only the transform functions and a minimal static landing page (open the root domain to see API usage and examples).

---

# EdgeImg — Self-hosted On-demand Image Transformation Service

> 📖 Chinese docs (API guide): [README.zh-CN.md](./README.zh-CN.md)

This repository is a **Cloudflare-Images-style on-demand image transformation service**, deployable to **EdgeOne Makers** or **Cloudflare Pages Functions**. It is cloud-agnostic: image sources can be a local directory or any public URL, and output is generated in real time from URL parameters and cached at the edge.

> Live example endpoint: `https://image.violet27chen.com`
> The original in-browser compression UI source (`src/`, `codecs/`) has been removed. This repo is now a pure on-demand image-transform **API** plus a minimal static landing page (the root URL documents the API).

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

The built-in library provides the sample sources used by the examples above.

- **EdgeOne**: lives in `cloud-functions/images/` (bundled into the function package via `edgeone.json` `includeFiles`).
- **Cloudflare**: lives in `images/` at repo root, copied to `build/images/` by the build script so the Function can fetch same-origin `/images/*` sources.

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

Build the static output (image library + landing page) without any cloud provider:

```sh
npm install
npm run build      # -> build/images/ and build/index.html
```

Then preview `build/` with any static server, or test the API by deploying to
Cloudflare Pages / EdgeOne Makers (recommended — the transform runs on the
edge). The landing page at the root URL documents the API; the API itself is
`/image/<options>/<path>` and `/image/<options>?url=`.

## 10. Deployment

### 10.1 EdgeOne Makers (sharp engine)

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

### 10.2 Cloudflare Pages (native image resizing)

This variant runs as a **Cloudflare Pages** project — **not** a standalone Worker. The `/image/*` routing comes from the Pages Functions file `functions/image/[[path]].ts`, which only executes on a Pages project. Do **not** deploy it as a plain Worker; a Worker won't pick up the `functions/` directory and the API will 404.

**Prerequisites:** `npm i -g wrangler` and `wrangler login`.

```bash
npm install
npm run build                # outputs build/ (landing page index.html + images/ library)
npx wrangler pages deploy build
```

> **No one-click button.** Cloudflare deprecated the old Pages deploy button; the only button it now offers provisions a *Worker* (and force-forks the repo), which is incompatible with this Pages Functions project. Deploy with the commands above, or in the Cloudflare Dashboard → **Workers & Pages → Create → Pages → Connect to Git**, point it at this repo, set build command `npm run build` and output directory `build`, then add the `ALLOWED_URL_HOSTS` variable (below).

After deploy, set the environment variable in **Cloudflare Dashboard → Pages project → Settings → Environment variables**:

| Variable | Value | Notes |
|---|---|---|
| `ALLOWED_URL_HOSTS` | e.g. `cdn.example.com,images.example.com` | Comma-separated hosts allowed for `?url=` remote fetch. **Leave empty = no restriction** (any public image). The built-in library (`/image/<opts>/<path>`) is unaffected by this whitelist. |

You can also commit it under `[vars]` in `wrangler.toml` (a host list, not a secret — but the dashboard is cleaner for changes).

> **Local image library**: `/image/<opts>/<path>` fetches same-origin `/images/<path>` static assets, so `images/` must exist at the site root after build (the build script copies `images/` → `build/images/`). The `/image/*` route and static `/images/*` are distinct paths and won't cause self-call loops.

Full behavioral differences vs EdgeOne (engine, `blur`/`rotate`/`dpr`/`sharpen` limits): see [README.cloudflare.md](./README.cloudflare.md).

## 11. Further Reading

- Core transform logic: `cloud-functions/_lib/image-transform.js`
- Function entry: `cloud-functions/image/[[path]].js`
- Full technical details, directory structure, and deployment troubleshooting: [`README-TRANSFORM.md`](./README-TRANSFORM.md)

---

## Contributing

EdgeImg is an open-source project. To contribute, follow the [contribute guide](/CONTRIBUTING.md).
