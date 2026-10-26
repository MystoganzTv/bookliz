const {chromium}=require("playwright");const fs=require("fs");
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1024,height:1024}});
for(const n of ["mushroom","dragon","arcane","moonGarden"]){for(const suf of ["","_art"]){const s=fs.readFileSync(`${n}${suf}.svg`,"utf8");await p.setContent(`<html><body style="margin:0;background:transparent">${s}</body></html>`);await p.waitForTimeout(80);await p.screenshot({path:`${n}${suf}.png`,omitBackground:suf==="_art",clip:{x:0,y:0,width:1024,height:1024}});}}
await b.close()})()
