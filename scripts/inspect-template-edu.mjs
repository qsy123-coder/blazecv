// 检查模板页里教育模块的槽位结构：education option 里有没有 .menu-content（圆点容器）。
import { readFile } from "node:fs/promises";

const tokens = process.argv.slice(2);
for (const token of tokens) {
  const html = await readFile(`public/template-pages/${token}.html`, "utf8");
  const start = html.indexOf('id="edus"');
  if (start < 0) {
    console.log(`== ${token}: no #edus`);
    continue;
  }
  // 取固定窗口；教育条目通常紧跟在 option 后面，窗口足够覆盖 1–3 个条目。
  const block = html.slice(start, start + 12000);
  const menu = (block.match(/menu-content/g) ?? []).length;
  const menuWrapper = (block.match(/menu-content-wrapper/g) ?? []).length;
  const ul = (block.match(/<ul/g) ?? []).length;
  const li = (block.match(/<li/g) ?? []).length;
  const sections = (block.match(/section-item-container/g) ?? []).length;
  const at = block.search(/menu-content/);
  console.log(
    `== ${token}: block=${block.length} menu-content=${menu} wrapper=${menuWrapper} ul=${ul} li=${li} items=${sections}`,
  );
  if (at >= 0) console.log("   ", block.slice(Math.max(0, at - 200), at + 300).replace(/\s+/g, " "));
}
