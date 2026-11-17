// 分析 flagged 对比图（左侧=编辑页、右侧=导出）里的残差分布：
//   node scripts/diag-flag-diff.mjs tools/audit/export-batch/flagged/xxx-p1.png
// 输出：分块均值（16x16 网格）、逐行/逐列最高残差、diff 热图 PNG。
import sharp from "sharp";
import path from "node:path";

const input = process.argv[2];
if (!input) {
  console.error("usage: node scripts/diag-flag-diff.mjs <compare.png>");
  process.exit(1);
}

sharp.cache(false);
const meta = await sharp(input).metadata();
const headerH = 40;
const gap = 20;
const paneW = (meta.width - gap) / 2;
const paneH = meta.height - headerH;

// 两个 pane 都从 top=40 开始，左 pane 宽 paneW，右 pane 从 paneW+gap 开始。
const left = await sharp(input)
  .extract({ left: 0, top: headerH, width: paneW, height: paneH })
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const right = await sharp(input)
  .extract({ left: paneW + gap, top: headerH, width: paneW, height: paneH })
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const W = left.info.width;
const H = left.info.height;
const ch = left.info.channels;
const a = left.data;
const b = right.data;

const rowSum = new Float64Array(H);
const colSum = new Float64Array(W);
const grid = 16;
const cellSum = new Float64Array(grid * grid);
const cellN = new Float64Array(grid * grid);
let total = 0;
let changed = 0;
let n = 0;
for (let y = 0; y < H; y += 1) {
  for (let x = 0; x < W; x += 1) {
    const i = (y * W + x) * ch;
    const d =
      Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    rowSum[y] += d;
    colSum[x] += d;
    const gx = Math.min(grid - 1, Math.floor((x / W) * grid));
    const gy = Math.min(grid - 1, Math.floor((y / H) * grid));
    cellSum[gy * grid + gx] += d;
    cellN[gy * grid + gx] += 1;
    total += d;
    if (d > 30) changed += 1;
    n += 1;
  }
}
const mean = Math.round((total / (n * 3)) * 100) / 100;
console.log(`pane ${W}x${H} mean=${mean} changedPct=${Math.round((changed / n) * 1000) / 10}%`);

const topRows = [...rowSum]
  .map((v, i) => [i, Math.round((v / (W * 3)) * 10) / 10])
  .sort((p, q) => q[1] - p[1])
  .slice(0, 12);
const topCols = [...colSum]
  .map((v, i) => [i, Math.round((v / (H * 3)) * 10) / 10])
  .sort((p, q) => q[1] - p[1])
  .slice(0, 12);
console.log("worst rows (y, meanDiff):", JSON.stringify(topRows));
console.log("worst cols (x, meanDiff):", JSON.stringify(topCols));

console.log("grid means (16x16, rows=top→bottom):");
for (let gy = 0; gy < grid; gy += 1) {
  const row = [];
  for (let gx = 0; gx < grid; gx += 1) {
    row.push((cellSum[gy * grid + gx] / (cellN[gy * grid + gx] * 3)).toFixed(1).padStart(5));
  }
  console.log(row.join(""));
}

// diff 热图：白底，残差越大越红
const heat = Buffer.allocUnsafe(W * H * 3);
for (let y = 0; y < H; y += 1) {
  for (let x = 0; x < W; x += 1) {
    const i = (y * W + x) * ch;
    const d = Math.min(
      255,
      Math.round(
        (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) * 1.2,
      ),
    );
    const o = (y * W + x) * 3;
    heat[o] = 255;
    heat[o + 1] = 255 - d;
    heat[o + 2] = 255 - d;
  }
}
const out = path.join(path.dirname(input), `${path.basename(input, ".png")}-diff.png`);
await sharp(heat, { raw: { width: W, height: H, channels: 3 } }).png().toFile(out);
console.log("heatmap:", out);
