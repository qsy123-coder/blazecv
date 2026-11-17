const fs=require('fs');const cheerio=require('cheerio');const $=cheerio.load(fs.readFileSync('public/template-pages/0aa3e6062b83534f.html','utf8'));
console.log('options', $('.option').length);
$('.option').each((i,el)=>{console.log(i, $(el).attr('class'), $(el).find('.title').first().text(), $(el).text().replace(/\s+/g,' ').trim().slice(0,80));});
