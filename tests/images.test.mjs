import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const code=fs.readFileSync(new URL("../image-utils.js",import.meta.url),"utf8").replace(/export /g,"");
const JPEG="data:image/jpeg;base64,/9j/2Q==";
function setup(encode=()=>JPEG){
  let closed=0,decoded=0,attempts=[];
  const canvas={width:0,height:0,getContext:()=>({fillRect(){},drawImage(){}}),
    toBlob:(callback,type,quality)=>{attempts.push({width:canvas.width,height:canvas.height,quality});setTimeout(()=>callback({data:encode(canvas,quality)}),0);}};
  class MockFileReader{readAsDataURL(blob){this.result=blob.data;this.onload?.();}}
  const ctx={URL,document:{createElement:()=>canvas},createImageBitmap:async()=>{
    decoded++;return {width:2400,height:1600,close(){closed++;}};
  },FileReader:MockFileReader};
  vm.createContext(ctx);vm.runInContext(code,ctx);
  return {ctx,stats:()=>({closed,decoded,attempts})};
}
test("image URLs allow bounded JPEG data and HTTPS; reject unsafe or oversized values",()=>{
  const {ctx}=setup();
  assert.equal(ctx.safeProductImage(JPEG),JPEG);
  assert.equal(ctx.safeProductImage("https://example.com/photo.jpg"),"https://example.com/photo.jpg");
  for(const value of ["javascript:alert(1)","http://example.com/a.jpg","data:image/svg+xml;base64,PHN2Zz4=",
    "data:image/jpeg;base64,invalid<>","data:image/jpeg;base64,"+"A".repeat(180000),null]){
    assert.equal(ctx.safeProductImage(value),"");
  }
});
test("photo conversion caps dimensions and closes the decoded bitmap",async()=>{
  const h=setup();const result=await h.ctx.encodeProductPhoto({type:"image/png",size:1024});
  assert.equal(result,JPEG);assert.equal(h.stats().attempts[0].width,720);
  assert.equal(h.stats().attempts[0].height,480);assert.equal(h.stats().closed,1);
});
test("detailed photos shrink until the Firestore image cap is met",async()=>{
  const h=setup(canvas=>canvas.width>460 ? "data:image/jpeg;base64,"+"A".repeat(180000):JPEG);
  assert.equal(await h.ctx.encodeProductPhoto({type:"image/webp",size:2048}),JPEG);
  assert.ok(h.stats().attempts.length>4);assert.equal(h.stats().attempts.at(-1).width,460);
  assert.equal(h.stats().closed,1);
});
test("unsupported and over-5-MB files never reach image decoding",async()=>{
  const h=setup();
  await assert.rejects(h.ctx.encodeProductPhoto({type:"image/svg+xml",size:10}));
  await assert.rejects(h.ctx.encodeProductPhoto({type:"image/jpeg",size:5*1024*1024+1}));
  assert.equal(h.stats().decoded,0);
});
test("uncompressible photos fail without saving and still release the bitmap",async()=>{
  const h=setup(()=>"data:image/jpeg;base64,"+"A".repeat(180000));
  await assert.rejects(h.ctx.encodeProductPhoto({type:"image/jpeg",size:1024}));
  assert.equal(h.stats().attempts.length,24);assert.equal(h.stats().closed,1);
});

