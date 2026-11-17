import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";

// Drive the fidelity audit in memory-bounded batches. Each batch writes its own
// result file so a crash/OOM does not lose earlier work and the run can resume.
const ROOT = "F:/Projects/blazecv";
const OUT = path.join(ROOT, "tools", "audit", "fidelity-batches");
const BATCH = Number(process.env.BATCH_SIZE ?? 250);
const START_FROM = Number(process.env.BATCH_START ?? 0);
const CDP = process.env.CDP_URL ?? "http://127.0.0.1:9227";

await mkdir(OUT, { recursive: true });
const catalog = JSON.parse(
  await readFile(path.join(ROOT, "public", "template-catalog.json"), "utf8"),
);
const total = catalog.templates.length;

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function runBatch(start, limit) {
  const resultPath = path.join(OUT, `batch-${start}.json`);
  if (await exists(resultPath)) {
    console.log(`skip batch ${start} (already done)`);
    return true;
  }
  console.log(`batch ${start}/${total} (limit ${limit})…`);
  const code = await new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ["scripts/audit-fidelity.mjs"],
      {
        cwd: ROOT,
        env: {
          ...process.env,
          AUDIT_START: String(start),
          AUDIT_LIMIT: String(limit),
          AUDIT_CONCURRENCY: process.env.AUDIT_CONCURRENCY ?? "2",
          CDP_URL: CDP,
          RESULT_PATH: resultPath,
        },
        stdio: "inherit",
      },
    );
    child.on("exit", (c) => resolve(c ?? 0));
  });
  return code === 0;
}

for (let start = START_FROM; start < total; start += BATCH) {
  const limit = Math.min(BATCH, total - start);
  // eslint-disable-next-line no-await-in-loop
  await runBatch(start, limit);
}

// Aggregate.
const files = (await readdirSafe(OUT)).filter((f) => f.startsWith("batch-"));
const all = [];
for (const f of files) {
  try {
    const arr = JSON.parse(await readFile(path.join(OUT, f), "utf8"));
    all.push(...arr);
  } catch {
    /* ignore partial */
  }
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
  path.join(OUT, "summary.json"),
  JSON.stringify(
    {
      total: all.length,
      flagged: flagged.length,
      errors: errors.length,
      flaggedList: flagged.map((x) => ({
        token: x.token,
        name: x.name,
        metrics: x.metrics,
      })),
      errorList: errors.map((x) => ({
        token: x.token,
        name: x.name,
        error: x.error,
      })),
    },
    null,
    1,
  ),
  "utf8",
);
console.log(
  `done. templates=${all.length} flagged=${flagged.length} errors=${errors.length}`,
);

async function readdirSafe(dir) {
  try {
    return await (await import("node:fs/promises")).readdir(dir);
  } catch {
    return [];
  }
}
