import puppeteer from "puppeteer-core";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const CDP_URL = process.env.CDP_URL ?? "http://127.0.0.1:9223";
const APP_URL = process.env.APP_URL ?? "http://127.0.0.1:3000/editor";
const OUT_DIR =
  process.env.OUT_DIR ?? path.join(process.env.TEMP ?? ".", "blazecv-templates");

const TEMPLATES = [
  ["极简黑白", "minimal"],
  ["紧凑单色", "compact"],
  ["学术风", "academic"],
  ["商务蓝", "business"],
  ["技术岗", "tech"],
  ["校招清新", "campus"],
  ["时间轴经典", "timeline"],
  ["双栏时间轴", "timeline-dual"],
  ["翡翠横幅", "banner-emerald"],
  ["墨黑斜切", "banner-ink"],
  ["暗夜侧栏", "dark-slate"],
  ["左右分栏", "split-classic"],
  ["杂志衬线", "editorial-serif"],
  ["瑞士蓝", "editorial-blue"],
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

await mkdir(OUT_DIR, { recursive: true });

const browser = await puppeteer.connect({
  browserURL: CDP_URL,
  defaultViewport: { width: 1600, height: 1400 },
});
const page = await browser.newPage();
await page.goto(APP_URL, { waitUntil: "networkidle2", timeout: 30000 });
await page.waitForFunction(() => document.body.innerText.includes("张三"), { timeout: 20000 });

for (let index = 0; index < TEMPLATES.length; index += 1) {
  const [name, id] = TEMPLATES[index];

  await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find(
      (element) => (element.textContent ?? "").trim() === "模板",
    );
    if (!button) throw new Error("找不到模板按钮");
    button.click();
  });
  await page.waitForFunction(() => document.body.innerText.includes("选择模板"));

  await page.evaluate((templateName) => {
    const card = [...document.querySelectorAll("button")].find((element) =>
      (element.textContent ?? "").includes(templateName),
    );
    if (!card) throw new Error(`找不到模板：${templateName}`);
    card.click();
  }, name);

  await page.waitForFunction(
    (templateName) => document.body.innerText.includes(templateName),
    { timeout: 10000 },
    name,
  );
  await sleep(400);

  const pageFrame = await page.$(".app-shell .page-frame");
  if (!pageFrame) throw new Error("找不到预览页面");
  const file = path.join(
    OUT_DIR,
    `${String(index + 1).padStart(2, "0")}-${id}.png`,
  );
  await pageFrame.screenshot({ path: file });
  console.log(`shot ${id} -> ${file}`);
}

await page.close();
browser.disconnect();
console.log(OUT_DIR);
