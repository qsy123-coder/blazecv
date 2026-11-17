import puppeteer from "puppeteer-core";
const browser = await puppeteer.connect({browserURL:"http://127.0.0.1:9275",defaultViewport:{width:1920,height:1080,deviceScaleFactor:1},protocolTimeout:120000});
const page = await browser.newPage();
await page.setCacheEnabled(false);
await page.goto("http://127.0.0.1:3000/",{waitUntil:"networkidle2",timeout:60000});
await new Promise(r=>setTimeout(r,1500));
const info = await page.evaluate(()=>{
  const card = [...document.querySelectorAll('div[class*="deg]"]')].find(el=>/rotate-\[-?[0-9]+deg\]/.test(el.className));
  const wrap = card?.parentElement;
  const grid = wrap?.parentElement;
  const d=(el)=>{if(!el)return null;const r=el.getBoundingClientRect();const cs=getComputedStyle(el);return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),display:cs.display,position:cs.position,gridCols:cs.gridTemplateColumns}};
  return {viewport:innerWidth, bodyMargin:getComputedStyle(document.body).margin, card:d(card), wrap:d(wrap), grid:d(grid), cards:[...wrap.children].map(d)};
});
console.log(JSON.stringify(info,null,2));
await page.screenshot({path:"F:/Projects/blazecv/tools/audit/compare/HOME-HERO-STABLE.png",fullPage:false});
await page.close(); await browser.disconnect();

