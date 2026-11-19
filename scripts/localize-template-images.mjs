/**
 * 把模板页里的外链装饰图（顶部花纹 banner / 校徽）改为本地自托管。
 *
 * 原外链在 logo.wondercv.com 与 photo.wondercv.com，属于模板抓取时的第三方 CDN。
 * 自托管后：模板预览与导出不依赖外部域名，也不会在 HTML 源码里残留品牌域名。
 *
 * 图片已下载到 public/wondercv-assets/template-images/img-N.{png,jpg}，
 * 字节与原图一致，因此缩略图无需重新生成。
 *
 * 幂等，可重复执行。
 * 运行：node scripts/localize-template-images.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["public/template-content", "public/template-pages"];
const LOCAL = "/wondercv-assets/template-images";

const MAP = [
  ["https://logo.wondercv.com/banners/108Q5FkaKiD2kuI.png", `${LOCAL}/img-1.png`],
  ["https://logo.wondercv.com/banners/9h7K594eFuRIDIL.png", `${LOCAL}/img-2.png`],
  ["https://logo.wondercv.com/banners/ac4rjZzKZ7p1pUq.png", `${LOCAL}/img-3.png`],
  ["https://logo.wondercv.com/banners/EVeU5kPnRDR5P6m.png", `${LOCAL}/img-4.png`],
  ["https://logo.wondercv.com/banners/hoquu7d0QKdLYrC.png", `${LOCAL}/img-5.png`],
  ["https://logo.wondercv.com/banners/M2o55aU2Io7XVGs.png", `${LOCAL}/img-6.png`],
  ["https://logo.wondercv.com/banners/m8EC8koXUGbKSMa.png", `${LOCAL}/img-7.png`],
  ["https://logo.wondercv.com/banners/pfiKdscjwCzEad0.png", `${LOCAL}/img-8.png`],
  ["https://logo.wondercv.com/banners/UES7OiZZuUuVCQ6.png", `${LOCAL}/img-9.png`],
  [
    "https://photo.wondercv.com/uploads/cv/logo/1912788/9f85cdda-8dc9-465e-bb23-382f601c0122",
    `${LOCAL}/img-10.jpg`,
  ],
  [
    "https://photo.wondercv.com/uploads/cv/logo/2064717/4d526f8f-b33e-4419-83b2-37e8c3f00da5",
    `${LOCAL}/img-11.jpg`,
  ],
  [
    "https://photo.wondercv.com/uploads/cv/logo/2136964/96b3bc52-96db-4d2f-926c-1acf9b649a96",
    `${LOCAL}/img-12.jpg`,
  ],
  [
    "https://photo.wondercv.com/uploads/cv/logo/2435872/03f4aac5-bd19-42c3-b501-26617015b56e",
    `${LOCAL}/img-13.jpg`,
  ],
];

const counts = new Map();
let files = 0;
let changed = 0;

for (const dir of ROOTS) {
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json") && !file.endsWith(".html")) continue;
    const path = join(dir, file);
    const before = readFileSync(path, "utf8");
    let text = before;
    for (const [from, to] of MAP) {
      if (!text.includes(from)) continue;
      const n = text.split(from).length - 1;
      text = text.split(from).join(to);
      counts.set(from, (counts.get(from) ?? 0) + n);
    }
    if (text !== before) {
      writeFileSync(path, text, "utf8");
      changed += 1;
    }
    files += 1;
  }
}

console.log(`files=${files} changed=${changed}`);
for (const [k, v] of counts) console.log(`  ${k.split("/").pop()} -> ${v}`);
