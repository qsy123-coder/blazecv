import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

const ROOT = "F:/Projects/blazecv";
const OUT = "F:/Projects/blazecv/tools/audit";
const catalog = JSON.parse(
  await readFile(`${ROOT}/public/template-catalog.json`, "utf8"),
);
const total = catalog.templates.length;
const half = Math.ceil(total / 2);
const CONC = Number(process.env.PAR_CONC ?? 4);

const jobs = [
  { cdp: "http://127.0.0.1:9227", start: 0, limit: half, out: `${OUT}/full-a.json` },
  { cdp: "http://127.0.0.1:9226", start: half, limit: total - half, out: `${OUT}/full-b.json` },
];

const t0 = Date.now();
await Promise.all(
  jobs.map(
    (j) =>
      new Promise((resolve) => {
        const child = spawn(process.execPath, ["scripts/audit-fidelity.mjs"], {
          cwd: ROOT,
          env: {
            ...process.env,
            AUDIT_START: String(j.start),
            AUDIT_LIMIT: String(j.limit),
            AUDIT_CONCURRENCY: String(CONC),
            CDP_URL: j.cdp,
            RESULT_PATH: j.out,
          },
          stdio: "inherit",
        });
        child.on("exit", resolve);
      }),
  ),
);

// Merge + summarize.
const all = [];
for (const j of jobs) {
  try {
    all.push(...JSON.parse(await readFile(j.out, "utf8")));
  } catch {}
}
const flagged = all.filter(
  (x) =>
    x.metrics &&
    (x.metrics.mean > 6 ||
      x.metrics.changedPct > 8 ||
      x.metrics.maxCellPct > 25 ||
      (x.metrics.heightDelta ?? 0) > 40),
);
const errors = all.filter((x) => x.error);
await writeFile(
  `${OUT}/full-summary.json`,
  JSON.stringify(
    {
      total: all.length,
      flagged: flagged.length,
      errors: errors.length,
      flaggedList: flagged.map((x) => ({ token: x.token, name: x.name, metrics: x.metrics })),
      errorList: errors.map((x) => ({ token: x.token, name: x.name, error: x.error })),
    },
    null,
    1,
  ),
  "utf8",
);
console.log(
  `FULL DONE wall=${Math.round((Date.now() - t0) / 1000)}s templates=${all.length} flagged=${flagged.length} errors=${errors.length}`,
);
