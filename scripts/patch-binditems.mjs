import { readFileSync, writeFileSync } from "node:fs";

const p = "F:/Projects/blazecv/src/lib/exact-template.ts";
let s = readFileSync(p, "utf8");
s = s.split('bindItems(option, section, "experience");').join('bindItems(option, section, "experience", !!doc.orderEdited);');
s = s.split('bindItems(option, section, "education");').join('bindItems(option, section, "education", !!doc.orderEdited);');
s = s.split('bindItems(option, section, "text");').join('bindItems(option, section, "text", !!doc.orderEdited);');
writeFileSync(p, s, "utf8");
console.log("updated", (s.match(/doc\.orderEdited/g) || []).length);
