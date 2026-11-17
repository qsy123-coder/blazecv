import sharp from "sharp";
import path from "node:path";

const tokens = process.argv.slice(2);
for (const token of tokens) {
  const cover = await sharp(
    path.join("F:/Projects/blazecv/public/template-thumbs", `${token}.webp`),
  )
    .resize(720, 1019, { fit: "fill" })
    .toBuffer();
  const render = await sharp(
    path.join("F:/Projects/blazecv/tools/audit/flagged", `${token}.webp`),
  )
    .resize(720, 1019, { fit: "fill" })
    .toBuffer();
  await sharp({
    create: { width: 1440, height: 1019, channels: 3, background: "#ffffff" },
  })
    .composite([
      { input: cover, left: 0, top: 0 },
      { input: render, left: 720, top: 0 },
    ])
    .png()
    .toFile(`C:/Users/WINDOWS11/AppData/Local/Temp/audit-${token}.png`);
  console.log(token);
}
