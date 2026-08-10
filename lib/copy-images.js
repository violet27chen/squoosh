/**
 * Copyright 2020 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
// Copy the local image library (images/) into the build output (build/images/)
// so the Cloudflare Pages Function can fetch same-origin /images/* sources
// when resizing local images via /image/<options>/<path>.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'images');
const dest = path.join(root, 'build', 'images');

if (!fs.existsSync(src)) {
  console.error('[copy-images] source directory not found:', src);
  process.exit(1);
}

fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.cpSync(src, dest, { recursive: true });

const count = fs.readdirSync(dest).length;
console.log('[copy-images] copied ' + count + ' item(s) from images/ -> build/images/');
