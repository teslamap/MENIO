import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
const root=path.resolve(import.meta.dirname,"..");
class Element {
  constructor(){Object.assign(this,{value:"",checked:false,hidden:false,disabled:false,open:false,children:[],dataset:{},files:[],listeners:{}});}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;}
  add(node){this.children.push(node);}
  setAttribute(){}
  removeAttribute(){}
  addEventListener(event,fn){this.listeners[event]=fn;}
  reset(){}
  focus(){}
  showModal(){this.open=true;}
  close(){this.open=false;}
  scrollIntoView(){}
}
function setup(js,html,records={},user={uid:"owner",email:"owner@example.com",isAnonymous:false}){
  const nodes=new Map([...fs.readFileSync(path.join(root,html),"utf8").matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Element()]));
  if(nodes.has("productFilter"))nodes.get("productFilter").value="all";
  const database=new Map(Object.entries(records)),listeners=[],updates=[];let sequence=0,created=0,signIns=0,duplicateEmail=false,getDocsError=null;
  const snap=key=>({exists:()=>database.has(key),data:()=>database.get(key)});
  const auth={currentUser:user},location={search:"?restaurant=test&table=1",href:"https://menio.example/dashboard.html",replace(url){this.href=url;}};
  const api={
    auth,db:{},location,URL,URLSearchParams,console,queueMicrotask,crypto:{randomUUID:()=>"image"},
    document:{getElementById:id=>nodes.get(id)||null,createElement:()=>new Element()},
    window:{addEventListener(){}},Option:class extends Element{constructor(text,value){super();this.value=value;this.textContent=text;}},
    navigator:{clipboard:{writeText:async()=>{}}},confirm:()=>true,prompt:()=>{},
    collection:(db,...parts)=>({path:parts.join("/")}),
    doc:(base,...parts)=>{const key=base?.path?base.path+"/"+(parts[0]||"generated-"+(++sequence)):parts.join("/");return {path:key,id:key.split("/").at(-1)};},
    getDoc:async ref=>snap(ref.path),getDocs:async()=>{if(getDocsError)throw getDocsError;return {empty:true,docs:[]};},
    where:()=>({}),query:ref=>ref,orderBy:()=>({}),
    onAuthStateChanged:(auth,fn)=>{queueMicrotask(()=>fn(auth.currentUser));return ()=>{};},
    onSnapshot:(ref,fn)=>{listeners.push({ref,fn});return ()=>{};},
    requireOwner:async()=>({name:"Test",tableCount:1}),
    serverTimestamp:()=>"timestamp",
    setDoc:async(ref,data)=>database.set(ref.path,data),
    updateDoc:async(ref,data)=>{assert.ok(database.has(ref.path));updates.push({path:ref.path,progressLabel:nodes.get("bulkPhotoProgressLabel")?.textContent});database.set(ref.path,{...database.get(ref.path),...data});},
    deleteDoc:async ref=>database.delete(ref.path),
    runTransaction:async(db,fn)=>{const pending=[];await fn({
      get:async ref=>snap(ref.path),set:(ref,data)=>pending.push([ref.path,data,false]),
      update:(ref,data)=>pending.push([ref.path,data,true])
    });pending.forEach(([key,data,merge])=>database.set(key,merge?{...database.get(key),...data}:data));},
    writeBatch:()=>{const writes=[];return {set:(ref,data)=>writes.push([ref.path,data]),commit:async()=>writes.forEach(([key,data])=>database.set(key,data))};},
    signOut:async()=>{},
    signInWithEmailAndPassword:async(auth,email)=>{signIns++;auth.currentUser={uid:"owner",email,isAnonymous:false};return {user:auth.currentUser};},
    createUserWithEmailAndPassword:async(auth,email)=>{created++;if(duplicateEmail){const error=Error("email already in use");error.code="auth/email-already-in-use";throw error;}auth.currentUser={uid:"owner",email,isAnonymous:false};return {user:auth.currentUser};},
    signInAnonymously:async auth=>{auth.currentUser={uid:"guest",isAnonymous:true};},
    addDoc:async()=>{}, safeImage:value=>value || "",safeProductImage:value=>value || "",encodeProductPhoto:async()=>"data:image/jpeg;base64,/9j/2Q=="
  };
  vm.createContext(api);
  vm.runInContext(fs.readFileSync(path.join(root,js),"utf8")
    .replace(/import\s*\{[\s\S]*?\}\s*from\s*["'][^"']+["'];?/g,"")
    .replace(/export\s*\{[^}]*\};?/g,"").replace(/export\s+(?=async function|function)/g,""),api,{filename:js});
  return {nodes,database,location,updates,counts:()=>({created,signIns}),setDuplicateEmail:value=>{duplicateEmail=value;},setGetDocsError:error=>{getDocsError=error;},
    settle:()=>new Promise(resolve=>setImmediate(resolve)),
    publish:prefix=>listeners.filter(l=>l.ref.path===prefix).forEach(l=>{
      const docs=[...database].filter(([key])=>key.startsWith(prefix+"/")&&!key.slice(prefix.length+1).includes("/"))
        .map(([key,data])=>({id:key.split("/").at(-1),data:()=>data}));
      l.fn({docs,empty:!docs.length,forEach:fn=>docs.forEach(fn)});
    }),
    parseMenuImport:api.parseMenuImport,
    submit:async(id,auth=false)=>{const fn=auth?nodes.get(id).listeners.submit:nodes.get(id).onsubmit;
      await fn({preventDefault(){},submitter:new Element()});}
  };
}
test("product and category CRUD, visibility, and blocking deletion of used categories",async()=>{
  const h=setup("dashboard.js","dashboard.html");await h.settle();
  h.nodes.get("categoryName").value="სასმელი";await h.submit("categoryForm");h.publish("restaurants/test/categories");
  const categoryKey=[...h.database.keys()][0],categoryId=categoryKey.split("/").at(-1);
  h.nodes.get("dishName").value="წყალი";h.nodes.get("dishPrice").value="2.50";h.nodes.get("dishCategory").value=categoryId;
  h.nodes.get("dishActive").checked=true;await h.submit("dishForm");
  const key=[...h.database.keys()].find(k=>k.includes("/menu/"));
  assert.equal(h.database.get(key).price,2.5);assert.equal(h.database.get(key).categoryId,categoryId);
  h.publish("restaurants/test/menu");
  let actions=h.nodes.get("dishes").children[0].children.at(-1);
  await actions.children[0].onclick();h.nodes.get("dishPrice").value="3.25";await h.submit("dishForm");
  assert.equal(h.database.get(key).price,3.25);h.publish("restaurants/test/menu");
  actions=h.nodes.get("dishes").children[0].children.at(-1);await actions.children[1].onclick();
  assert.equal(h.database.get(key).active,false);h.publish("restaurants/test/menu");
  await h.nodes.get("categoryList").children[0].children[1].children[1].onclick();
  assert.ok(h.database.has(categoryKey));
  await h.nodes.get("dishes").children[0].children.at(-1).children[2].onclick();
  assert.equal(h.database.has(key),false);
  h.publish("restaurants/test/menu");
  await h.nodes.get("categoryList").children[0].children[1].children[1].onclick();
  assert.equal(h.database.has(categoryKey),false);
});
test("deleted table numbers are never reused and order history survives",async()=>{
  const h=setup("dashboard.js","dashboard.html",{
    "restaurants/test":{tableCount:1,nextTableNumber:2},
    "restaurants/test/tables/1":{number:1,active:true,label:"One"},
    "orders/old":{tableNumber:1}
  });await h.settle();h.publish("restaurants/test/tables");
  await h.nodes.get("tableList").children[0].children.at(-1).children.at(-1).onclick();
  assert.equal(h.database.get("restaurants/test/tables/1").active,false);
  assert.equal(h.database.get("restaurants/test").tableCount,0);assert.ok(h.database.has("orders/old"));
  h.publish("restaurants/test/tables");await h.submit("tableForm");
  assert.equal(h.database.get("restaurants/test/tables/2").active,true);
  assert.equal(h.database.get("restaurants/test").nextTableNumber,3);
});
test("tables sidebar opens and closes the QR list dialog",async()=>{
  const h=setup("dashboard.js","dashboard.html");await h.settle();
  let prevented=false;
  h.nodes.get("tablesNavLink").onclick({preventDefault(){prevented=true;}});
  assert.equal(prevented,true);assert.equal(h.nodes.get("tableDialog").open,true);
  h.nodes.get("closeTableDialog").onclick();assert.equal(h.nodes.get("tableDialog").open,false);
});
test("appearance sidebar opens and closes the restaurant theme dialog",async()=>{
  const h=setup("dashboard.js","dashboard.html");await h.settle();
  let prevented=false;
  h.nodes.get("appearanceNavLink").onclick({preventDefault(){prevented=true;}});
  assert.equal(prevented,true);assert.equal(h.nodes.get("appearanceDialog").open,true);
  h.nodes.get("closeAppearanceDialog").onclick();assert.equal(h.nodes.get("appearanceDialog").open,false);
});
test("menu text import extracts categories, prices, and optional descriptions",async()=>{
  const h=setup("dashboard.js","dashboard.html");
  const source=["Welcome to დელიკატე","მენიუ","ბურგერი","ქათმის ხორცი","გამაგრილებელი სასმელი","ბურგერი",
    "კლასიკური ბურგერი","საქონლის ხორცი, სოუსი","27 GEL","დამატება","გამაგრილებელი სასმელი",
    "წყალი","2 GEL","დამატება"].join("\n");
  assert.deepEqual(JSON.parse(JSON.stringify(h.parseMenuImport(source))),[
    {name:"კლასიკური ბურგერი",description:"საქონლის ხორცი, სოუსი",price:27,category:"ბურგერი"},
    {name:"წყალი",description:"",price:2,category:"გამაგრილებელი სასმელი"}
  ]);
});
test("menu text import adds products without photos and avoids duplicate dishes",async()=>{
  const h=setup("dashboard.js","dashboard.html",{"restaurants/test":{tableCount:1}});await h.settle();
  h.publish("restaurants/test/categories");h.publish("restaurants/test/menu");
  const source=["ბურგერი","წყალი","2 GEL","დამატება","გამაგრილებელი სასმელი","ლიმონათი","5 GEL","დამატება"].join("\n");
  await h.nodes.get("menuImportFile").onchange({target:{files:[{text:async()=>source}]}});
  await h.nodes.get("importMenuSubmit").onclick();
  let added=[...h.database].filter(([key])=>key.includes("/menu/"));
  assert.equal(added.length,2);assert.ok(added.every(([,data])=>data.imageUrl===""&&data.imagePath===""));
  h.publish("restaurants/test/categories");h.publish("restaurants/test/menu");
  await h.nodes.get("menuImportFile").onchange({target:{files:[{text:async()=>source}]}});
  await h.nodes.get("importMenuSubmit").onclick();
  added=[...h.database].filter(([key])=>key.includes("/menu/"));
  assert.equal(added.length,2);
  assert.match(h.nodes.get("businessMessage").textContent,/გამოტოვებულია 2 არსებული კერძი/);
});
test("anonymous users are redirected away from management",async()=>{
  const h=setup("dashboard.js","dashboard.html",{}, {uid:"guest",isAnonymous:true});
  await h.settle();assert.equal(h.location.href,"register.html#login");
});
function fields(h){for(const [id,value] of Object.entries({
  restaurantName:"Test",restaurantSlug:"test",email:"owner@example.com",password:"password123",tableCount:"2"
}))h.nodes.get(id).value=value;}
test("taken slug does not leave a newly created auth account",async()=>{
  const h=setup("app.js","register.html",{"restaurants/test":{slug:"test"}},null);
  await h.settle();fields(h);await h.submit("registerForm",true);
  assert.equal(h.counts().created,0);assert.equal(h.database.size,1);
});
test("existing account resumes incomplete restaurant signup",async()=>{
  const h=setup("app.js","register.html");await h.settle();fields(h);await h.submit("registerForm",true);
  assert.equal(h.counts().created,0);assert.equal(h.counts().signIns,1);
  assert.equal(h.database.get("restaurants/test").nextTableNumber,3);
  assert.equal(h.database.get("restaurants/test/tables/2").active,true);
  assert.equal(h.location.href,"dashboard.html?restaurant=test");
});
test("existing email with the correct password signs in and finishes restaurant signup",async()=>{
  const h=setup("app.js","register.html",{},null);await h.settle();fields(h);h.setDuplicateEmail(true);
  await h.submit("registerForm",true);
  assert.equal(h.counts().created,1);assert.equal(h.counts().signIns,1);
  assert.equal(h.database.get("restaurants/test").slug,"test");
  assert.equal(h.location.href,"dashboard.html?restaurant=test");
  assert.equal(h.nodes.get("message").textContent,undefined);
});
test("login explains how to resolve obsolete Firestore read rules",async()=>{
  const h=setup("app.js","register.html",{},null);await h.settle();
  h.nodes.get("loginEmail").value="owner@example.com";h.nodes.get("loginPassword").value="password123";
  h.setGetDocsError(Object.assign(Error("Missing or insufficient permissions."),{code:"permission-denied"}));
  await h.submit("loginForm",true);
  assert.match(h.nodes.get("message").textContent,/Firestore Database → Rules/);
  assert.match(h.nodes.get("message").textContent,/firestore.rules/);
});
test("guest cart updates changed prices and removes unavailable products",async()=>{
  const h=setup("menu.js","menu.html",{
    "restaurants/test":{name:"Test",active:true},"restaurants/test/tables/1":{number:1,active:true},
    "restaurants/test/menu/water":{name:"წყალი",price:2,active:true,categoryId:"drinks"},
    "restaurants/test/categories/drinks":{name:"სასმელი"}
  },null);await h.settle();h.publish("restaurants/test/categories");h.publish("restaurants/test/menu");
  h.nodes.get("menu").children[0].children[1].children[0].children.at(-1).children[1].onclick();
  assert.equal(h.nodes.get("total").textContent,"2.00 ₾");
  h.database.get("restaurants/test/menu/water").price=3;h.publish("restaurants/test/menu");
  assert.equal(h.nodes.get("total").textContent,"3.00 ₾");
  h.database.get("restaurants/test/menu/water").active=false;h.publish("restaurants/test/menu");
  assert.equal(h.nodes.get("total").textContent,"0.00 ₾");assert.equal(h.nodes.get("sendOrder").disabled,true);
});

test("product photos save, replace and remove atomically in the product document",async()=>{
  const h=setup("dashboard.js","dashboard.html");await h.settle();
  h.nodes.get("dishName").value="Photo dish";h.nodes.get("dishPrice").value="12";
  h.nodes.get("dishActive").checked=true;h.nodes.get("dishImage").files=[{type:"image/jpeg",size:1000}];
  await h.submit("dishForm");
  const key=[...h.database.keys()].find(k=>k.includes("/menu/"));
  assert.equal(h.database.get(key).imageUrl,"data:image/jpeg;base64,/9j/2Q==");
  h.publish("restaurants/test/menu");
  let actions=h.nodes.get("dishes").children[0].children.at(-1);
  await actions.children[0].onclick();
  h.nodes.get("dishImage").files=[];h.nodes.get("removeImage").checked=true;
  await h.submit("dishForm");
  assert.equal(h.database.get(key).imageUrl,"");
});
test("guest menu displays Firestore photo data without Firebase Storage",async()=>{
  const photo="data:image/jpeg;base64,/9j/2Q==";
  const h=setup("menu.js","menu.html",{
    "restaurants/test":{name:"Test",active:true},"restaurants/test/tables/1":{number:1,active:true},
    "restaurants/test/menu/photo":{name:"Photo dish",price:12,active:true,imageUrl:photo}
  },null);await h.settle();h.publish("restaurants/test/menu");
  assert.equal(h.nodes.get("menu").children[0].children[1].children[0].children[0].src,photo);
});

test("guest menu groups dishes under sorted category headings",async()=>{
  const h=setup("menu.js","menu.html",{
    "restaurants/test":{name:"Test",active:true},"restaurants/test/tables/1":{number:1,active:true},
    "restaurants/test/menu/water":{name:"წყალი",price:2,active:true,categoryId:"drinks"},
    "restaurants/test/menu/tea":{name:"ჩაი",price:4,active:true,categoryId:"drinks"},
    "restaurants/test/menu/soup":{name:"წვნიანი",price:8,active:true,categoryId:"soups"},
    "restaurants/test/categories/drinks":{name:"სასმელი"},
    "restaurants/test/categories/soups":{name:"წვნიანი კერძები"}
  },null);await h.settle();h.publish("restaurants/test/categories");h.publish("restaurants/test/menu");
  const sections=h.nodes.get("menu").children;
  assert.equal(sections.length,2);
  assert.equal(sections[0].children[0].textContent,"სასმელი");
  assert.equal(sections[0].children[1].children.length,2);
  assert.equal(sections[1].children[0].textContent,"წვნიანი კერძები");
  assert.equal(sections[1].children[1].children.length,1);
});

test("single product photo upload shows progress through Firestore save",async()=>{
  const h=setup("dashboard.js","dashboard.html",{"restaurants/test":{tableCount:1}});await h.settle();
  h.nodes.get("dishName").value="კერძი";h.nodes.get("dishPrice").value="12";
  h.nodes.get("dishImage").files=[{name:"dish.jpg",type:"image/jpeg",size:1024}];
  await h.submit("dishForm");
  assert.equal(h.nodes.get("dishPhotoProgressWrap").hidden,false);
  assert.equal(h.nodes.get("dishPhotoProgress").value,100);
  assert.equal(h.nodes.get("dishPhotoProgressLabel").textContent,"ფოტო აიტვირთა.");
  assert.match([...h.database.values()].find(item=>item.name==="კერძი").imageUrl,/^data:image\/jpeg/);
});

test("bulk photo upload advances through preparation and save",async()=>{
  const h=setup("dashboard.js","dashboard.html",{
    "restaurants/test":{tableCount:2},
    "restaurants/test/menu/a":{name:"ა კერძი",price:10},
    "restaurants/test/menu/b":{name:"ბ კერძი",price:11}
  });await h.settle();h.publish("restaurants/test/menu");
  h.nodes.get("bulkPhotoFiles").files=[
    {name:"one.jpg",type:"image/jpeg",size:1024},
    {name:"two.jpg",type:"image/jpeg",size:1024}
  ];
  h.nodes.get("bulkPhotoFiles").onchange();
  await h.nodes.get("saveBulkPhotos").onclick();
  assert.equal(h.nodes.get("bulkPhotoProgressWrap").hidden,false);
  assert.equal(h.nodes.get("bulkPhotoProgress").value,100);
  assert.equal(h.nodes.get("bulkPhotoProgressLabel").textContent,"შენახულია 2 / 2 ფოტო");
  assert.match(h.updates[0].progressLabel,/ვამზადებ ფოტოს 1 \/ 2/);
  assert.match(h.updates[1].progressLabel,/ვამზადებ ფოტოს 2 \/ 2/);
  assert.ok(["a","b"].every(id=>/^data:image\/jpeg/.test(h.database.get(`restaurants/test/menu/${id}`).imageUrl)));
});

test("bulk photo upload allows explicit mapping when folder and product counts differ",async()=>{
  const h=setup("dashboard.js","dashboard.html",{
    "restaurants/test":{tableCount:2},
    "restaurants/test/menu/a":{name:"ა კერძი",price:10},
    "restaurants/test/menu/b":{name:"ბ კერძი",price:11}
  });await h.settle();h.publish("restaurants/test/menu");
  h.nodes.get("bulkPhotoFiles").files=[{name:"one.jpg",type:"image/jpeg",size:1024}];
  h.nodes.get("bulkPhotoFiles").onchange();
  assert.equal(h.nodes.get("saveBulkPhotos").disabled,true);
  assert.match(h.nodes.get("bulkPhotoHint").textContent,/ფოტოებია 1, პროდუქტია 2/);
  const mapping=h.nodes.get("bulkPhotoPreview").children[0].children[1];
  mapping.value="b";mapping.onchange();
  assert.equal(h.nodes.get("saveBulkPhotos").disabled,false);
  await h.nodes.get("saveBulkPhotos").onclick();
  assert.equal(h.database.get("restaurants/test/menu/a").imageUrl,undefined);
  assert.match(h.database.get("restaurants/test/menu/b").imageUrl,/^data:image\/jpeg/);
});

test("bulk photo save explains why it cannot start without a prepared folder",async()=>{
  const h=setup("dashboard.js","dashboard.html",{"restaurants/test":{tableCount:1}});await h.settle();
  await h.nodes.get("saveBulkPhotos").onclick();
  assert.equal(h.nodes.get("businessMessage").textContent,
    "ფოტოები დასამუშავებლად მზად არ არის. ხელახლა აირჩიე საქაღალდე და გადაამოწმე რაოდენობა.");
});

test("guest menu shows a fallback when a saved product photo cannot load",async()=>{
  const h=setup("menu.js","menu.html",{
    "restaurants/test":{name:"Test",active:true},"restaurants/test/tables/1":{number:1,active:true},
    "restaurants/test/menu/photo":{name:"Photo dish",price:12,active:true,imageUrl:"data:image/jpeg;base64,/9j/2Q=="}
  },null);await h.settle();h.publish("restaurants/test/menu");
  const card=h.nodes.get("menu").children[0].children[1].children[0],image=card.children[0],fallback=card.children[1];
  image.onerror();
  assert.equal(image.hidden,true);assert.equal(fallback.hidden,false);
  assert.equal(fallback.textContent,"ფოტოს ჩატვირთვა ვერ მოხერხდა");
});


