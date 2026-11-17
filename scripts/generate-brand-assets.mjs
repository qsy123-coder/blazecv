// Generate favicon / app icon / social share image from one brand SVG.
// Run: node scripts/generate-brand-assets.mjs
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="118" fill="#0f172a"/>
  <rect x="56" y="56" width="400" height="400" rx="76" fill="none" stroke="#ffffff" stroke-opacity=".10" stroke-width="8"/>
  <text x="256" y="282" text-anchor="middle" dominant-baseline="middle" font-family="Arial, Helvetica, sans-serif" font-size="318" font-weight="800" fill="#ffffff">B</text>
  <circle cx="404" cy="108" r="26" fill="#4183ff"/>
</svg>`;

const OG_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0f172a"/>
      <stop offset="1" stop-color="#1e293b"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#4183ff"/>
      <stop offset="1" stop-color="#7c3aed"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="1050" cy="80" r="260" fill="#4183ff" fill-opacity=".10"/>
  <circle cx="1120" cy="560" r="200" fill="#7c3aed" fill-opacity=".12"/>
  <rect x="72" y="66" width="72" height="72" rx="18" fill="#ffffff"/>
  <text x="108" y="120" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="44" font-weight="800" fill="#0f172a">B</text>
  <text x="164" y="118" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="700" fill="#ffffff">BlazeCV</text>
  <text x="72" y="268" font-family="Arial, Helvetica, sans-serif" font-size="62" font-weight="800" fill="#ffffff">Write your value</text>
  <text x="72" y="340" font-family="Arial, Helvetica, sans-serif" font-size="62" font-weight="800" fill="#ffffff">on one page.</text>
  <text x="72" y="408" font-family="Arial, Helvetica, sans-serif" font-size="26" fill="#cbd5e1">4127 resume templates · live A4 preview · PDF / PNG / Word</text>
  <rect x="72" y="454" width="210" height="54" rx="10" fill="url(#accent)"/>
  <text x="177" y="489" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" fill="#ffffff">aetouban.cn</text>
  <g transform="translate(770 120) rotate(-7 170 220)">
    <rect x="0" y="0" width="250" height="360" rx="10" fill="#ffffff" opacity=".18"/>
  </g>
  <g transform="translate(810 90) rotate(5 170 220)">
    <rect x="0" y="0" width="250" height="360" rx="10" fill="#ffffff" opacity=".32"/>
  </g>
  <g transform="translate(850 110)">
    <rect x="0" y="0" width="250" height="360" rx="10" fill="#ffffff"/>
    <rect x="0" y="0" width="250" height="74" rx="10" fill="#4183ff"/>
    <rect x="26" y="100" width="120" height="12" rx="6" fill="#0f172a"/>
    <rect x="26" y="126" width="198" height="8" rx="4" fill="#cbd5e1"/>
    <rect x="26" y="146" width="180" height="8" rx="4" fill="#cbd5e1"/>
    <rect x="26" y="166" width="190" height="8" rx="4" fill="#cbd5e1"/>
    <rect x="26" y="198" width="90" height="12" rx="6" fill="#4183ff"/>
    <rect x="26" y="224" width="198" height="8" rx="4" fill="#cbd5e1"/>
    <rect x="26" y="244" width="170" height="8" rx="4" fill="#cbd5e1"/>
    <rect x="26" y="264" width="188" height="8" rx="4" fill="#cbd5e1"/>
    <rect x="26" y="296" width="90" height="12" rx="6" fill="#7c3aed"/>
    <rect x="26" y="322" width="198" height="8" rx="4" fill="#cbd5e1"/>
  </g>
</svg>`;

async function png(svg, width, height, out) {
  await sharp(Buffer.from(svg))
    .resize(width, height, { fit: "fill" })
    .png()
    .toFile(out);
}

await mkdir("src/app", { recursive: true });
await mkdir("public", { recursive: true });

await writeFile("src/app/icon.svg", ICON_SVG, "utf8");
await png(ICON_SVG, 180, 180, "src/app/apple-icon.png");
await png(ICON_SVG, 192, 192, "public/icon-192.png");
await png(ICON_SVG, 512, 512, "public/icon-512.png");

// ICO wrapper around a 32x32 PNG (valid for all modern browsers).
const png32 = await sharp(Buffer.from(ICON_SVG)).resize(32, 32, { fit: "fill" }).png().toBuffer();
const header = Buffer.alloc(22);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(1, 4); // count
header[6] = 32; // width
header[7] = 32; // height
header[8] = 0; // palette
header[9] = 0;
header.writeUInt16LE(1, 10); // planes
header.writeUInt16LE(32, 12); // bpp
header.writeUInt32LE(png32.length, 14);
header.writeUInt32LE(22, 18);
await writeFile("src/app/favicon.ico", Buffer.concat([header, png32]));

await png(OG_SVG, 1200, 630, "public/og.png");
console.log("brand assets generated");
