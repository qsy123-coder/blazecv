import { spawn } from "node:child_process";

const ROOT = "F:/Projects/blazecv";
const jobs = [
  { cdp: "http://127.0.0.1:9227", start: 300, limit: 100, out: "F:/Projects/blazecv/tools/audit/par-a.json" },
  { cdp: "http://127.0.0.1:9226", start: 400, limit: 100, out: "F:/Projects/blazecv/tools/audit/par-b.json" },
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
            AUDIT_CONCURRENCY: "3",
            CDP_URL: j.cdp,
            RESULT_PATH: j.out,
          },
          stdio: "inherit",
        });
        child.on("exit", resolve);
      }),
  ),
);
console.log(`parallel 200 templates wall=${Math.round((Date.now() - t0) / 1000)}s`);
