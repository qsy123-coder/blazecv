import puppeteer from "puppeteer-core";
const browser = await puppeteer.connect({browserURL:"http://127.0.0.1:9269",defaultViewport:{width:1920,height:1080,deviceScaleFactor:1},protocolTimeout:120000});
const page = await browser.newPage();
page.on("requestfailed", r=>console.log("REQFAIL", r.url(), r.failure()?.errorText));
page.on("console", m=>{ if(m.type()==="error") console.log("CONSOLE", m.text()); });
await page.goto("http://127.0.0.1:3000/",{waitUntil:"networkidle2",timeout:60000});
await new Promise(r=>setTimeout(r,1000));
const info = await page.evaluate(()=>({
  sheets: [...document.styleSheets].map(s=>s.href),
  links: [...document.querySelectorAll('link[rel="stylesheet"]')].map(l=>l.getAttribute("href")),
  styles: [...document.querySelectorAll("style")].length,
  bodyMargin: getComputedStyle(document.body).margin,
  tailwindBtn: (()=>{const el=document.querySelector('a[href="#templates"]'); return el?getComputedStyle(el).display:null})(),
}));
console.log(JSON.stringify(info,null,2));
await page.close(); await browser.disconnect();
