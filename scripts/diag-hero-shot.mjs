import puppeteer from "puppeteer-core";
const browser = await puppeteer.connect({browserURL:"http://127.0.0.1:9269",defaultViewport:{width:1920,height:1080,deviceScaleFactor:1},protocolTimeout:120000});
const page = await browser.newPage();
await page.goto("http://127.0.0.1:3000/",{waitUntil:"networkidle2",timeout:60000});
await new Promise(r=>setTimeout(r,1500));
const info = await page.evaluate(()=>{
  const wrap = document.querySelector("section .relative.hidden.h-\\[460px\\]");
  const cards = wrap ? [...wrap.children].map(el=>{const r=el.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),cls:el.className.slice(0,80)};}) : [];
  const wr = wrap?.getBoundingClientRect();
  return {wrap: wr?{x:Math.round(wr.x),y:Math.round(wr.y),w:Math.round(wr.width),h:Math.round(wr.height)}:null, cards};
});
console.log(JSON.stringify(info,null,2));
await page.screenshot({path:"F:/Projects/blazecv/tools/audit/compare/HOME-HERO-BEFORE.png",fullPage:false});
await page.close(); await browser.disconnect();
