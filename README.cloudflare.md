# Cloudflare 版本（Pages Functions）

本项目同时提供 **EdgeOne Makers** 与 **Cloudflare Pages** 两套部署形态。两者的**对外 API 完全一致**：

```
/image/<options>/<path>      转换站点静态目录 /images/<path> 下的本地图片
/image/<options>/?url=<远程> 转换公网图片（带 SSRF 防护 + 域名白名单）
```

唯一区别在底层引擎：Cloudflare Workers 运行时**无法运行 sharp 这类原生模块**，因此本版改用 **Cloudflare 原生图片缩放**（`fetch` 的 `cf.image` 选项）。相同请求 → 相同输出图片，调用方式不变。

> 如果你要的是 EdgeOne Makers 版（sharp 引擎），见主 README；两份 README 的「一键部署」按钮也是 EdgeOne 版。

## 1. 目录结构（本版新增）

```
functions/image/[[path]].ts   # Pages Functions 入口，处理 /image/*
wrangler.toml                 # Cloudflare Pages 配置（构建输出 build/，env 变量）
```
EdgeOne 版的 `cloud-functions/` 与 `edgeone.json` 保留不动，两套互不影响。

## 2. API 用法（与 EdgeOne 版逐字一致）

```bash
# 本地图库：宽 400、质量 70、转 webp
curl 'https://<你的域名>/image/width=400,quality=70,format=webp/images/sample.png'

# 自动协商格式（浏览器支持 avif 就给 avif，否则 webp/jpeg）
curl -H 'Accept: image/avif,image/webp,*/*' \
  'https://<你的域名>/image/width=800,quality=80/sample.png'

# 公网图片 + 域名白名单
curl 'https://<你的域名>/image/width=600,format=webp?url=https://cdn.example.com/photo.jpg'
```

支持选项：`width` `height` `quality` `format`(auto/webp/avif/jpeg/png/original)
`fit`(cover/contain/scale-down/inside/crop/pad/fill/outside) `gravity` `rotate`(90/180/270)
`blur` `sharpen` `dpr`(≤2) `background` `metadata`(keep)。

## 3. 部署

前置：已安装 `wrangler`（`npm i -g wrangler` 并 `wrangler login`）。

```bash
npm install
npm run build          # 产物输出到 build/（Squoosh 前端 + 静态资源）
npx wrangler pages deploy build
```

部署后在 **Cloudflare 控制台 → Pages 项目 → Settings → Environment variables** 里设置
`ALLOWED_URL_HOSTS`（留空=不限制；填值则只允许这些域名，逗号分隔）。
也可直接写在 `wrangler.toml` 的 `[vars]` 里提交。

> **本地图库**：`/image/<opts>/<path>` 会回源到站点自身的 `/images/<path>` 静态资源，
> 请确保 `images/` 目录在构建后存在于站点根（例如构建脚本把 `images/` 复制到 `build/images/`）。
> 路由 `/image/*` 与静态 `/images/*` 不同，不会产生自调用死循环。

## 4. 与 EdgeOne 版的行为差异（仅底层，API 不变）

| 选项 | EdgeOne（sharp） | Cloudflare（cf.image） | 说明 |
|---|---|---|---|
| `blur` | 1–2000，越大越糊 | 0–250，250=最大糊 | 已做线性映射保持「值越大越糊」直觉，但观感不完全等价 |
| `rotate` | 任意角度 + EXIF 自动 | 仅 90/180/270（原图 EXIF 方向仍生效） | 非 90/180/270 的角度会被忽略 |
| `dpr` | 无上限 | 上限 2 | 超出部分被钳到 2 |
| `sharpen` | 无参开关 | 固定温和值(3) | 仅开关语义，无强度调节 |
| `fit=fill` | 拉伸填满 | 映射为 `squeeze`（精确填满、可变形） | 语义一致 |
| `fit=outside` | 放大裁剪 | 映射为 `cover` | 语义近似 |
| 引擎 | sharp / libvips | Cloudflare 图片缩放 | 输出基本一致 |

## 5. 安全

与 EdgeOne 版一致：

- **路径穿越防护**：本地图库走 `/images/` 同源回源，不直接读文件系统。
- **SSRF 防护**：`?url=` 仅允许 http/https，拦截 localhost、回环、私网段（10/172.16–31/192.168）。
- **域名白名单**：`?url=` 受 `ALLOWED_URL_HOSTS` 约束；本地图库不受影响。
- **Cloudflare 控制台**可再叠加 WAF / 速率限制，进一步防滥用。
