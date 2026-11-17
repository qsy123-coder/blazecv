// 分带测量两个 pane 的局部纵向位移：判断是全局错位、纵向缩放差，还是局部元素错位。
// usage: node scripts/diag-flag-bandshift.mjs <compare.png>
import sharp from "sharp";

sharp.cache(false);
const input = process.argv[2];
const meta = await sharp(input).metadata();
const headerH = 40, gap = 20;
const paneW = (meta.width - gap) / 2;
const paneH = meta.height - headerH;
const left = await sharp(input).extract({ left: 0, top: headerH, width: paneW, height: paneH }).greyscale().removeAlpha().raw().toBuffer({ resolveWithObject: true });
const right = await sharp(input).extract({ left: paneW + gap, top: headerH, width: paneW, height: paneH }).greyscale().removeAlpha().raw().toBuffer({ resolveWithObject: true });

const L = left.data, R = right.data, W = left.info.width, H = left.info.height;
const rowDark = (buf, y) => {
  let c = 0;
  for (let x = 0; x < W; x += 1) if (buf[y * W + x] < 200) c += 1;
  return c;
};
const bands = [];
const bandH = 100;
for (let y0 = 0; y0 + bandH <= H; y0 += bandH) {
  let best = { dy: 0, score: 0 };
  for (let dy = -40; dy <= 40; dy += 1) {
    let s = 0;
    for (let y = y0; y < y0 + bandH; y += 2) {
      const yr = y - dy;
      if (yr < 0 || yr >= H) continue;
      s += Math.min(rowDark(L, y), rowDark(R, yr));
    }
    if (s > best.score) best = { dy, score: s };
  }
  const base = rowDark(L, y0 + 20);
  bands.push({ y0, bestDy: best.dy, score: best.score, rowDark20: base });
}
console.log("band y0 -> best local dy (device px, + means right/export content is lower)");
for (const b of bands) console.log(`${String(b.y0).padStart(4)}  dy=${String(b.bestDy).padStart(3)}  dark@y0+20=${b.rowDark20}`);
