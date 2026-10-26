const {chromium}=require("playwright");const fs=require("fs");
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1200,height:520}});
for(const n of ["mushroom","dragon","arcane","moonGarden"]){const s=fs.readFileSync(`land_${n}.svg`,"utf8");await p.setContent(`<html><body style="margin:0;background:transparent">${s}</body></html>`);await p.screenshot({path:`land_${n}.png`,omitBackground:true,clip:{x:0,y:0,width:1200,height:520}});}
await b.close()})()
