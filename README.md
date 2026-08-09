# [Squoosh]!

[Squoosh] is an image compression web app that provides lossless image quality with a significant reduction to file size.

# API & CLI

Squoosh has [an API](https://github.com/GoogleChromeLabs/squoosh/tree/dev/libsquoosh) and [a CLI](https://github.com/GoogleChromeLabs/squoosh/tree/dev/cli) to compress many images at once.

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

[squoosh]: https://squoosh.app

---

## Squoosh Transform — On-demand Image Transformation Service

This repository has been extended into a **self-hosted, Cloudflare-Images-style on-demand image transformation service**, running on **EdgeOne Makers Cloud Functions**. It is cloud-agnostic: image sources can be a local directory or any public URL, and output is generated in real time from URL parameters and cached at the edge.

> 📖 **Full API reference, parameters, and deployment guide (中文): [README.zh-CN.md](./README.zh-CN.md)**

Quick example:

```bash
curl -s -o out.webp "https://image.violet27chen.com/image/width=400,quality=70,format=webp/sample.png"
curl -s -o out.webp "https://image.violet27chen.com/image/format=webp/sample.png"
curl -s -o out.webp "https://image.violet27chen.com/image/width=800,quality=80,format=webp?url=https://cdn.example.com/photo.png"
```
