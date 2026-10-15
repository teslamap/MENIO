import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

class Element {
  constructor(){this.children=[];this.disabled=false;}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=children;}
  get childElementCount(){return this.children.length;}
}
async function setup({user={uid:'courier-a'},profile={role:'courier',active:true},failWrite=false}={}){
  const nodes=new Map(['status','courierOrders','logout'].map(id=>[id,new Element()]));
  const queries=[],writes=[],toasts=[];let listener;
  const context={
    auth:{currentUser:user},db:{},location:{href:''},
    document:{getElementById:id=>nodes.get(id),createElement:()=>new Element()},
    window:{addEventListener(){}},
    doc:(_db,...parts)=>parts.join('/'),getDoc:async()=>({exists:()=>!!profile,data:()=>profile}),
    collection:(_db,name)=>name,where:(...args)=>args,query:(...args)=>args,
    onSnapshot:(query,fn)=>{queries.push(query);listener=fn;return ()=>{};},
    onAuthStateChanged:(_auth,fn)=>{queueMicrotask(()=>fn(user));},
    updateDoc:async(path,data)=>{if(failWrite)throw Error('permission-denied');writes.push({path,data});},
    serverTimestamp:()=> 'SERVER_TIMESTAMP',signOut:async()=>{},
    showToast:(...args)=>toasts.push(args)
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(new URL('../courier.js',import.meta.url),'utf8').replace(/^import.*;\r?\n/gm,''),context);
  await new Promise(resolve=>setImmediate(resolve));
  return {context,nodes,queries,writes,toasts,publish:orders=>listener({docs:orders.map(o=>({id:o.id,data:()=>o}))})};
}
test('signed-out and anonymous couriers are redirected without subscribing',async()=>{
  for(const user of [null,{uid:'guest',isAnonymous:true}]){
    const h=await setup({user});assert.match(h.context.location.href,/returnTo=courier/);assert.equal(h.queries.length,0);
  }
});
test('missing, inactive, and non-courier profiles cannot subscribe',async()=>{
  for(const profile of [null,{role:'courier',active:false},{role:'owner',active:true}]){
    const h=await setup({profile});assert.equal(h.queries.length,0);assert.match(h.nodes.get('status').textContent,/არ არის გააქტიურებული/);
  }
});
test('active courier subscribes to the shared delivery queue',async()=>{
  const h=await setup();assert.deepEqual(JSON.parse(JSON.stringify(h.queries)),[
    ['orders',['orderType','==','delivery'],['deliveryStatus','in',['waiting','assigned','picked_up']]]
  ]);
});
test('claim, pickup, and delivery buttons write only the expected transition fields',async()=>{
  const h=await setup();
  for(const [state,owner,expected] of [
    ['waiting',null,{courierUid:'courier-a',deliveryStatus:'assigned',courierAssignedAt:'SERVER_TIMESTAMP'}],
    ['assigned','courier-a',{deliveryStatus:'picked_up',courierPickedUpAt:'SERVER_TIMESTAMP'}],
    ['picked_up','courier-a',{deliveryStatus:'delivered',deliveredAt:'SERVER_TIMESTAMP'}]
  ]){
    h.publish([{id:'order',orderType:'delivery',deliveryStatus:state,courierUid:owner,items:[],total:10}]);
    await h.nodes.get('courierOrders').children[0].children.at(-1).children[0].onclick();
    assert.deepEqual(JSON.parse(JSON.stringify(h.writes.at(-1))),{path:'orders/order',data:expected});
  }
});
test('another courier assignment has no action button',async()=>{
  const h=await setup();h.publish([{id:'order',orderType:'delivery',deliveryStatus:'assigned',courierUid:'courier-b',items:[]}]);
  const card=h.nodes.get('courierOrders').children[0];
  assert.match(card.children.at(-1).textContent,/სხვა კურიერმა/);assert.equal(h.writes.length,0);
});
test('denied claim reports the failure and re-enables the button',async()=>{
  const h=await setup({failWrite:true});h.publish([{id:'order',orderType:'delivery',deliveryStatus:'waiting',items:[]}]);
  const button=h.nodes.get('courierOrders').children[0].children.at(-1).children[0];
  await button.onclick();assert.equal(button.disabled,false);assert.equal(h.writes.length,0);assert.equal(h.toasts.at(-1)[1],'error');
});
