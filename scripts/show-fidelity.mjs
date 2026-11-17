import { readFile } from "node:fs/promises";

const file = process.env.FILE ?? "tools/audit/fidelity/fidelity-results.json";
const d = JSON.parse(await readFile(file, "utf8"));
let flags = 0;
for (const x of d) {
  if (x.error) {
    flags += 1;
    console.log(`ERR  ${x.layout} ${x.name} :: ${x.error}`);
  } else {
    const m = x.metrics;
    const isFlag = m.mean > 6 || m.changedPct > 8 || m.maxCellPct > 25;
    if (isFlag) flags += 1;
    console.log(
      `${isFlag ? "FLAG" : "ok  "} mean=${m.mean} chg=${m.changedPct} cell=${m.maxCellPct} ${x.layout} ${x.name}`,
    );
  }
}
console.log(`\n${flags}/${d.length} flagged`);
