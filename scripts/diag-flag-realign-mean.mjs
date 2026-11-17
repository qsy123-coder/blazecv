// 在已对齐的对比图 pane 上，再搜索 ±3 设备像素的整数残差，报告残差最小处的 mean/changedPct。
// 用于判断 batch 报告的 mean>6 是否只是像素栅格对齐的量化误差。
// usage: node scripts/diag-flag-realign-mean.mjs <compare.png>
import sharp from "sharp";

sharp.cache(false);
const input = process.argv[2];
const meta = await sharp(input).metadata();
const headerH = 40, gap = 20;
const paneW = (meta.width - gap) / 2;
const paneH = meta.height - headerH;
const L = await sharp(input).extract({ left: 0, top: headerH, width: paneW, height: paneH }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const R = await sharp(input).extract({ left: paneW + gap, top: headerH, width: paneW, height: paneH }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const a = L.data, b = R.data, W = L.info.width, H = L.info.height, ch = L.info.channels;

function measure(dx, dy) {
  const x0 = Math.max(0, dx), x1 = Math.min(W, W + dx);
  const y0 = Math.max(0, dy), y1 = Math.min(H, H + dy);
  let sum = 0, changed = 0, n = 0;
  for (let y = y0; y < y1; y += 1)
    for (let x = x0; x < x1; x += 1) {
      const ai = (y * W + x) * ch;
      const bi = ((y - dy) * W + (x - dx)) * ch;
      const d0 = Math.abs(a[ai] - b[bi]), d1 = Math.abs(a[ai + 1] - b[bi + 1]), d2 = Math.abs(a[ai + 2] - b[bi + 2]);
      sum += d0 + d1 + d2;
      if (d0 + d1 + d2 > 30) changed += 1;
      n += 1;
    }
  return { mean: Math.round((sum / (n * ch)) * 100) / 100, changedPct: Math.round((changed / n) * 1000) / 10, n };
}
let best = { dx: 0, dy: 0, mean: 1e9, changedPct: 0 };
for (let dy = -3; dy <= 3; dy += 1)
  for (let dx = -3; dx <= 3; dx += 1) {
    const m = measure(dx, dy);
    if (m.mean < best.mean) best = { dx, dy, mean: m.mean, changedPct: m.changedPct };
  }
console.log(JSON.stringify({ input, base: measure(0, 0), bestResidualShiftDevice: { dx: best.dx, dy: best.dy }, best }));
