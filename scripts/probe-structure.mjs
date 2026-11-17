import { readFile } from "node:fs/promises";

const tokens = process.argv.slice(2);
for (const t of tokens) {
  const h = await readFile(`F:/Projects/blazecv/public/template-pages/${t}.html`, "utf8");
  const opts = (h.match(/class="[^"]*\boption\b[^"]*"/g) || []).length;
  const items = (h.match(/section-item-container/g) || []).length;
  const mainMatch = h.match(/class="(main[^"]*)"/);
  const classes = (h.match(/option[^"]*\b(personal_summary|works|edus|project_experience|orgs|honor|extras|custom)\b/g) || []).length;
  console.log(t, "options=" + opts, "items=" + items, "knownOptions=" + classes);
  console.log("   mainClass:", (mainMatch?.[1] || "").slice(0, 140));
}
