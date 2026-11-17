import { readdirSync, readFileSync } from "node:fs";

const dir = "public/template-pages";
const files = readdirSync(dir).filter((f) => f.endsWith(".html"));
const no = [];
const catalog = JSON.parse(readFileSync("public/template-catalog.json", "utf8"));
const byToken = new Map(catalog.templates.map((t) => [t.token, t]));
for (const f of files) {
  const token = f.replace(/\.html$/, "");
  const h = readFileSync(`${dir}/${f}`, "utf8");
  if (!/class="option[^"]*extras/.test(h)) {
    no.push({ token, name: byToken.get(token)?.name || "" });
    if (no.length >= 8) break;
  }
}
console.log(no.map((n) => `${n.token}\t${n.name}`).join("\n"));
