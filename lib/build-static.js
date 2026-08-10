// Build the static output for Cloudflare Pages (and any static host):
//   - copy the local image library (images/) -> build/images/
//     (so /image/<opts>/<path> can fetch same-origin /images/* sources)
//   - copy public/index.html -> build/index.html (the minimal landing page)
// No front-end bundler (the removed front-end SPA / rollup / codecs) is involved — this
// project is now a pure on-demand image-transform API + a tiny HTML page.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const imgSrc = path.join(root, 'images');
const imgDest = path.join(root, 'build', 'images');
const pageSrc = path.join(root, 'public', 'index.html');
const pageDest = path.join(root, 'build', 'index.html');

function copyDir(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
  return fs.readdirSync(dest).length;
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

if (!fs.existsSync(imgSrc)) {
  console.error('[build-static] images/ not found:', imgSrc);
  process.exit(1);
}

const n = copyDir(imgSrc, imgDest);
console.log('[build-static] copied ' + n + ' item(s) images/ -> build/images/');

if (fs.existsSync(pageSrc)) {
  copyFile(pageSrc, pageDest);
  console.log('[build-static] copied public/index.html -> build/index.html');
} else {
  console.warn('[build-static] public/index.html not found, skipping landing page');
}
