/**
 * 清空共享 Edge CDP 实例的磁盘/内存缓存。
 *
 * 共享 profile 会缓存 /template-pages/*.html 与 template-content JSON，
 * 数据清洗后若不清理，验收/导出仍可能读到旧内容。
 *
 * 运行：CDP_URL=http://127.0.0.1:9227 node scripts/purge-cdp-cache.mjs
 */
import puppeteer from "puppeteer-core";

const CDP_URL = process.env.CDP_URL ?? "http://127.0.0.1:9227";

const browser = await puppeteer.connect({ browserURL: CDP_URL, protocolTimeout: 60000 });
const page = await browser.newPage();
const session = await page.createCDPSession();
await session.send("Network.enable");
await session.send("Network.clearBrowserCache");
await session.send("Network.clearBrowserCookies").catch(() => undefined);
await page.close();
browser.disconnect();
console.log("cache purged");
