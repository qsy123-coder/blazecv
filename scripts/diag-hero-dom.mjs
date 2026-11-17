import puppeteer from "puppeteer-core";
const browser = await puppeteer.connect({browserURL:"http://127.0.0.1:9269",defaultViewport:{width:1920,height:1080,deviceScaleFactor:1},protocolTimeout:120000});
const page = await browser.newPage();
await page.goto("http://127.0.0.1:3000/",{waitUntil:"networkidle2",timeout:60000});
await new Promise(r=>setTimeout(r,1500));
const info = await page.evaluate(()=>{
  const deg = [...document.querySelectorAll('div[class*="deg]"]')].filter(el=>/rotate-\[-?[0-9]+deg\]/.test(el.className));
  const card = deg[0];
  const wrap = card?.parentElement;
  const grid = wrap?.parentElement;
  const desc = (el)=>{ if(!el) return null; const r=el.getBoundingClientRect(); const cs=getComputedStyle(el); return {tag:el.tagName, cls:typeof el.className==='string'?el.className.slice(0,140):'', x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.width), h:Math.round(r.height), display:cs.display, position:cs.position, gridCols:cs.gridTemplateColumns, flex:cs.flex}; };
  return {viewport:innerWidth, bodyW:document.body.getBoundingClientRect().width, degCount:deg.length, card:desc(card), wrap:desc(wrap), grid:desc(grid), gridParent:desc(grid?.parentElement), cards:deg.map(desc)};
});
console.log(JSON.stringify(info,null,2));
await page.close(); await browser.disconnect();
