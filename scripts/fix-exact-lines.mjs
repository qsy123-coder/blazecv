import { readFileSync, writeFileSync } from "node:fs";

const path = "F:/Projects/blazecv/src/lib/exact-template.ts";
const lines = readFileSync(path, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/);

const fixes = {
  30: "const MONTH = /^(\\d{4})[.\\-/年]?(\\d{1,2})?/;",
  36: "  return match[1] + (match[2] ? `年${match[2].padStart(2, \"0\")}月` : \"年\");",
  56: "    .flatMap((line) => line.split(/(?<=。)\\s*/))",
  107: "      ?.textContent?.replace(/[:：]\\s*$/, \"\")",
  111: "      电话: basics.phone,",
  112: "      手机: basics.phone,",
  113: "      邮箱: basics.email,",
  114: "      邮件: basics.email,",
  115: "      城市: basics.city,",
  116: "      现居: basics.city,",
  117: "      所在地: basics.city,",
  118: "      所在城市: basics.city,",
  119: "      现居地: basics.city,",
  120: "      居住地: basics.city,",
  121: "      所在地点: basics.city,",
  122: "      求职意向: basics.jobTitle,",
  123: "      意向: basics.jobTitle,",
  124: "      岗位: basics.jobTitle,",
  125: "      求职: basics.jobTitle,",
  142: "      const text = [link.label, link.url].filter(Boolean).join(\"：\").trim();",
  340: "        if (target) target.textContent = bullets.join(\"；\");",
  380: "              [item.name, item.detail ? `（${item.detail}）` : \"\"].join(\"\"),",
  383: "            .join(\"，\")",
  387: "            .join(\"，\"),",
  391: "      title: section.title || (section.type === \"skills\" ? \"技能\" : \"其他\"),",
  419: "      (node.querySelector(\".extras-icon-title\")?.textContent ?? \"\").replace(/[:：]/g, \"\").trim();",
  431: "      if (title) title.textContent = `${row.title}：`;",
  441: "      if (title) title.textContent = `${row.title}：`;",
  457: "        .replace(/[:：]/g, \"\")",
  467: "        labelSpan.textContent = `${row.title}：`;",
  470: "        node.textContent = `${row.title}： ${row.value}`;",
  495: "  content.textContent = rows.map((row) => `${row.title}：${row.value}`).join(\"  \");",
  846: "        target.textContent = section.items.map((item) => item.text).join(\"；\");",
};

for (const [num, text] of Object.entries(fixes)) {
  lines[Number(num) - 1] = text;
}

writeFileSync(path, lines.join("\n"), "utf8");

const check = readFileSync(path, "utf8");
for (const needle of ["技能", "其他", "电话", "所在城市", "求职意向", "年", "月", "：", "；", "，", "。", "（", "）"]) {
  if (!check.includes(needle)) console.log("MISSING", needle);
}
console.log("fixed lines", Object.keys(fixes).length, "has 技能:", check.includes("技能"), "has 电话:", check.includes("电话"));
