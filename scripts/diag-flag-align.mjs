// 对 flagged 对比图的两个 pane 重新做全范围对齐搜索，判断 batch 报告的 (dx,dy) 是否只是真实偏移的一半。
// usage: node scripts/diag-flag-align.mjs <compare.png> [maxShift]
import sharp from "sharp";

sharp.cache(false);
const input = process.argv[2];
const maxShift = Number(process.argv[3] ?? 40);
if (!input) {
  console.error("usage: node scripts/diag-flag-align.mjs <compare.png> [maxShift]");
  process.exit(1);
}
const meta = await sharp(input).metadata();
const headerH = 40;
const gap = 20;
const paneW = (meta.width - gap) / 2;
const paneH = meta.height - headerH;

const left = await sharp(input).extract({ left: 0, top: headerH, width: paneW, height: paneH }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const right = await sharp(input).extract({ left: paneW + gap, top: headerH, width: paneW, height: paneH }).removeAlpha().raw().toBuffer({ resolveWithObject: true });

async function mask(buf, info, factor) {
  const { data, info: i } = await sharp(buf, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .grayscale().removeAlpha()
    .resize({ width: Math.round(info.width / factor), height: Math.round(info.height / factor), fit: "fill" })
    .raw().toBuffer({ resolveWithObject: true });
  return { data, w: i.width, h: i.height };
}
function score(A, B, dx, dy) {
  let inter = 0, ca = 0, cb = 0, n = 0;
  for (let y = 0; y < A.h; y += 1) {
    const by = y - dy;
    if (by < 0 || by >= B.h) continue;
    for (let x = 0; x < A.w; x += 1) {
      const bx = x - dx;
      if (bx < 0 || bx >= B.w) continue;
      const av = A.data[y * A.w + x] < 230 ? 1 : 0;
      const bv = B.data[by * B.w + bx] < 230 ? 1 : 0;
      if (av && bv) inter += 1;
      ca += av; cb += bv; n += 1;
    }
  }
  if (!n || !ca || !cb) return -1;
  return inter / Math.sqrt(ca * cb);
}
const A4 = await mask(left.data, left.info, 4);
const B4 = await mask(right.data, right.info, 4);
let best = { dx: 0, dy: 0, s: -1 };
for (let dy = -Math.round(maxShift / 4); dy <= Math.round(maxShift / 4); dy += 1)
  for (let dx = -Math.round(maxShift / 4); dx <= Math.round(maxShift / 4); dx += 1) {
    const s = score(A4, B4, dx, dy);
    if (s > best.s) best = { dx, dy, s };
  }
const A2 = await mask(left.data, left.info, 2);
const B2 = await mask(right.data, right.info, 2);
let fine = { dx: best.dx * 4, dy: best.dy * 4, s: -1 };
for (let dy = best.dy * 4 - 6; dy <= best.dy * 4 + 6; dy += 1)
  for (let dx = best.dx * 4 - 6; dx <= best.dx * 4 + 6; dx += 1) {
    const s = score(A2, B2, Math.round(dx / 2), Math.round(dy / 2));
    if (s > fine.s) fine = { dx, dy, s };
  }
console.log(JSON.stringify({ pane: [paneW, paneH], residualDevicePx: { dx: fine.dx, dy: fine.dy }, residualCss: { dx: fine.dx / 2, dy: fine.dy / 2 }, maskScore: fine.s }));
