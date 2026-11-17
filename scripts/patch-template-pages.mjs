import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const dir = process.argv[2] ?? "F:/Projects/blazecv/public/template-pages";
const files = (await readdir(dir)).filter((file) => file.endsWith(".html"));
const FIX = `<style data-blazecv-fix>
@font-face { font-family: "iconfont"; src: url("/wondercv-assets/iconfont.woff2") format("woff2"); font-display: swap; }
.cover { z-index: 0 !important; }
.cover-transparent { z-index: 1 !important; }
</style>`;
let patched = 0;
for (const file of files) {
  const full = path.join(dir, file);
  const html = await readFile(full, "utf8");
  if (html.includes("data-blazecv-fix")) continue;
  if (!html.includes("</head>")) continue;
  await writeFile(full, html.replace("</head>", `${FIX}</head>`), "utf8");
  patched += 1;
}
console.log(`patched ${patched}/${files.length}`);
