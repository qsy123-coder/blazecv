// 从 template-base.css 提取 .main / .padding-N / .is-page-margin 的定义。
import { readFile } from "node:fs/promises";

const css = await readFile("public/wondercv-assets/template-base.css", "utf8");
const patterns = [
  /\.main(?![\w-])[^{]*\{[^}]*\}/g,
  /\.padding-\d+[^{]*\{[^}]*\}/g,
  /\.is-page-margin[^{]*\{[^}]*\}/g,
  /\.page-margin[^{]*\{[^}]*\}/g,
];
for (const re of patterns) {
  console.log("=== ", re);
  let n = 0;
  for (const m of css.matchAll(re)) {
    const text = m[0];
    if (/padding|margin/.test(text)) {
      console.log(text.slice(0, 400));
      n += 1;
      if (n > 30) break;
    }
  }
}
