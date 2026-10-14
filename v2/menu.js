import {auth,db,doc,getDoc,collection,addDoc,onSnapshot,serverTimestamp,signInAnonymously,onAuthStateChanged,query,where} from "./firebase.js";
import { safeProductImage } from "./image-utils.js";
const params=new URLSearchParams(location.search),slug=params.get("restaurant"),table=Number(params.get("table"));
const $=id=>document.getElementById(id),cart=new Map(),categories=new Map(),unsubscribers=[];
let restaurant, dishes=[], selectedCategory="all", sending=false, ready=false, ordersUnsubscribe=null;
let detailId=null;
$("cartSummary").onclick=()=>$("orderBox").showModal();
$("cartClose").onclick=()=>$("orderBox").close();
$("orderBox").addEventListener("click",event=>{if(event.target===$("orderBox"))$("orderBox").close();});
function addDish(dish){
  if(sending || !ready)return;
  const old=cart.get(dish.id);
  cart.set(dish.id,{dishId:dish.id,name:dish.name,price:Number(dish.price),quantity:(old?.quantity || 0)+1});
  drawCart();
}
function openProduct(dish){
  detailId=dish.id;
  $("productName").textContent=dish.name;
  $("productCategory").textContent=groupName(dish);
  $("productDescription").textContent=dish.description || "ამ პროდუქტს დამატებითი აღწერა ჯერ არ აქვს.";
  $("productPrice").textContent=money(dish.price);
  const photo=safeProductImage(dish.imageUrl);
  $("productPhoto").hidden=!photo;
  $("productPhoto").src=photo || "";
  $("productPhoto").alt=dish.name;
  $("productPhoto").onerror=()=>$("productPhoto").hidden=true;
  $("productAdd").disabled=sending || !ready;
  $("productAdd").textContent="შეკვეთაში დამატება +";
  if(!$("productDialog").open)$("productDialog").showModal();
}
$("productClose").onclick=()=>$("productDialog").close();
$("productDialog").addEventListener("click",event=>{if(event.target===$("productDialog"))$("productDialog").close();});
$("productDialog").addEventListener("close",()=>{detailId=null;});
$("productAdd").onclick=()=>{
  const dish=dishes.find(d=>d.id===detailId);
  if(dish && !sending && ready){addDish(dish);$("productAdd").textContent="დამატებულია ✓ · კიდევ დამატება +";}
};
const DEFAULT_THEME_COLOR="#f97316";
function applyMenuTheme(color){
  const hex=color.slice(1), red=parseInt(hex.slice(0,2),16), green=parseInt(hex.slice(2,4),16), blue=parseInt(hex.slice(4,6),16);
  const linear=value=>{value/=255;return value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4;};
  const luminance=.2126*linear(red)+.7152*linear(green)+.0722*linear(blue);
  document.documentElement?.style?.setProperty?.("--menu-background-color",color);
  document.documentElement?.style?.setProperty?.("--menu-foreground-color",luminance>.42?"#171920":"#f5f5f7");
}
const money=n=>Number(n).toFixed(2)+" ₾";
const say=text=>{ $("message").textContent=text;$("menuStatus").textContent=text; };
const el=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
function groupId(dish){return dish.categoryId ? "id:"+dish.categoryId : dish.category ? "legacy:"+dish.category : "none";}
function groupName(dish){return categories.get(dish.categoryId)?.name || dish.category || "სხვა";}
function renderTabs(){
  const groups=new Map(dishes.map(dish=>[groupId(dish),groupName(dish)]));
  if(selectedCategory!=="all" && !groups.has(selectedCategory)) selectedCategory="all";
  $("categoryTabs").replaceChildren();
  for(const [id,name] of new Map([["all","ყველა"],...groups])){
    const button=el("button",name,"secondary small-button");
    button.setAttribute("aria-pressed",String(id===selectedCategory));
    button.onclick=()=>{selectedCategory=id;renderTabs();render();};
    $("categoryTabs").append(button);
  }
}
function render(){
  $("menu").replaceChildren();
  const visible=dishes.filter(dish=>selectedCategory==="all" || groupId(dish)===selectedCategory);
  if(!visible.length){$("menu").textContent="მენიუ ჯერ არ არის დამატებული";return;}
  const groups=new Map();
  for(const dish of visible){
    const id=groupId(dish);
    if(!groups.has(id))groups.set(id,{name:groupName(dish),dishes:[]});
    groups.get(id).dishes.push(dish);
  }
  for(const group of [...groups.values()].sort((a,b)=>a.name.localeCompare(b.name,"ka"))){
    const section=el("section",undefined,"menu-category");
    section.append(el("h2",group.name,"menu-category-title"));
    const grid=el("div",undefined,"grid menu-category-grid");
    for(const dish of group.dishes.sort((a,b)=>a.name.localeCompare(b.name,"ka"))){
      const card=el("article",undefined,"dish-card");
      const photo = safeProductImage(dish.imageUrl);
      if(photo){
        const image=el("img",undefined,"dish-photo");image.src=photo;image.alt=dish.name;image.loading="lazy";
        image.onerror=()=>image.hidden=true;card.append(image);
      }
      const title=el("h3"),details=el("button",dish.name,"dish-details");
      details.setAttribute("aria-haspopup","dialog");details.setAttribute("aria-label",dish.name+" — დეტალურად ნახვა");
      details.onclick=()=>openProduct(dish);title.append(details);
      card.onclick=event=>{if(!event.target.closest?.("button"))openProduct(dish);};
      card.append(title,el("p",dish.description || "აღწერის სანახავად გახსენი პროდუქტი"));
      const row=el("div",undefined,"row"),button=el("button","დამატება +");
      button.disabled=sending;
      button.onclick=()=>{
        addDish(dish);
      };
      row.append(el("b",money(dish.price)),button);card.append(row);grid.append(card);
    }
    section.append(grid);$("menu").append(section);
  }
}
function drawCart(){
  $("cart").replaceChildren();let total=0,count=0;
  for(const item of cart.values()){
    total+=item.price*item.quantity;count+=item.quantity;
    const row=el("div",undefined,"cart-row"),button=el("button","−","secondary small-button");
    button.disabled=sending;button.setAttribute("aria-label",item.name+" — რაოდენობის შემცირება");
    button.onclick=()=>{item.quantity--;if(item.quantity<=0)cart.delete(item.dishId);drawCart();};
    row.append(el("span",item.name+" × "+item.quantity),el("b",money(item.price*item.quantity)),button);
    $("cart").append(row);
  }
  if(!cart.size)$("cart").textContent="ჯერ კერძები არ აგირჩევია";
  $("total").textContent=money(total);$("cartItemCount").textContent=count;$("cartSummaryTotal").textContent=money(total);$("sendOrder").disabled=!ready || sending || !cart.size;
}
function reconcileCart(){
  if(detailId){
    const current=dishes.find(d=>d.id===detailId);
    if(current)openProduct(current);else $("productDialog").close();
  }
  let changed=false;
  for(const [id,item] of cart){
    const dish=dishes.find(d=>d.id===id);
    if(!dish){cart.delete(id);changed=true;}
    else if(item.price!==Number(dish.price) || item.name!==dish.name){
      item.price=Number(dish.price);item.name=dish.name;changed=true;
    }
  }
  if(changed)say("მენიუ განახლდა. გადაამოწმე კალათა გაგზავნამდე.");
  drawCart();
}
const authReady=new Promise(resolve=>{const stop=onAuthStateChanged(auth,()=>{stop();resolve();});});
const orderStatuses={new:"მიღებულია",accepted:"მიღებულია",preparing:"მზადდება",completed:"მზადაა",cancelled:"გაუქმებულია"};
function renderCustomerOrders(snapshot){
  const root=$("myOrdersList");root.replaceChildren();
  const orders=snapshot.docs.map(d=>({...d.data(),id:d.id})).filter(o=>o.restaurantSlug===slug).sort((a,b)=>(b.createdAt?.toMillis?.()||0)-(a.createdAt?.toMillis?.()||0));
  if(!orders.length){root.append(el("div","ჯერ შეკვეთა არ გაგიფორმებია.","orders-empty"));return;}
  for(const order of orders){
    const card=el("article",undefined,"customer-order-card");
    const head=el("div",undefined,"customer-order-head");
    head.append(el("strong","შეკვეთა № "+order.id.slice(-6).toUpperCase()),el("span",orderStatuses[order.status]||order.status||"სტატუსი უცნობია","customer-order-status status-"+(order.status||"new")));
    card.append(head);
    card.append(el("p",(order.items||[]).map(i=>(i.name||"პროდუქტი")+" × "+(i.quantity||1)).join(" · "),"customer-order-items"));
    const meta=el("div",undefined,"customer-order-meta");
    meta.append(el("span","მაგიდა №"+(order.tableNumber||table)),el("strong",money(order.total||0)));
    card.append(meta);
    if(order.note)card.append(el("p","შენიშვნა: "+order.note,"customer-order-note"));
    if(order.status==="completed")card.append(el("p","შენი შეკვეთა მზადაა! შეგიძლია აიღო.","customer-order-ready"));
    if(order.status==="cancelled")card.append(el("p","ეს შეკვეთა გაუქმებულია.","customer-order-note"));
    root.append(card);
  }
}
function listenCustomerOrders(){
  if(!auth.currentUser)return;
  ordersUnsubscribe?.();
  const q=query(collection(db,"orders"),where("customerUid","==",auth.currentUser.uid));
  ordersUnsubscribe=onSnapshot(q,renderCustomerOrders,error=>{
    $("myOrdersList").replaceChildren(el("p","შეკვეთების ჩატვირთვა ვერ მოხერხდა. განაახლე გვერდი და სცადე ხელახლა.","orders-error"));
  });
}
$("myOrdersButton").onclick=()=>{if(!$("myOrdersDialog").open)$("myOrdersDialog").showModal();};
$("myOrdersClose").onclick=()=>$("myOrdersDialog").close();
$("myOrdersDialog").addEventListener("click",event=>{if(event.target===$("myOrdersDialog"))$("myOrdersDialog").close();});
async function init(){
  if(!slug || !Number.isSafeInteger(table) || table<1)throw Error("QR ბმული არასწორია");
  await authReady;
  if(!auth.currentUser)await signInAnonymously(auth);
  listenCustomerOrders();
  const [rs,ts]=await Promise.all([getDoc(doc(db,"restaurants",slug)),getDoc(doc(db,"restaurants",slug,"tables",String(table)))]);
  if(!rs.exists() || !rs.data().active || !ts.exists() || !ts.data().active)throw Error("რესტორანი ან მაგიდა მიუწვდომელია");
  restaurant=rs.data();$("restaurantName").textContent=restaurant.name;
  const themeColor=typeof restaurant.themeColor==="string" && /^#[0-9a-f]{6}$/i.test(restaurant.themeColor) ? restaurant.themeColor : DEFAULT_THEME_COLOR;
  applyMenuTheme(themeColor);
  $("tableInfo").textContent="მაგიდა №"+table+(ts.data().label && ts.data().label!=="მაგიდა "+table ? " · "+ts.data().label : "");
  unsubscribers.push(onSnapshot(collection(db,"restaurants",slug,"categories"),snapshot=>{
    categories.clear();snapshot.forEach(d=>categories.set(d.id,d.data()));renderTabs();render();
  },error=>say("კატეგორიების ჩატვირთვა ვერ მოხერხდა: "+error.message)));
  unsubscribers.push(onSnapshot(collection(db,"restaurants",slug,"menu"),snapshot=>{
    dishes=snapshot.docs.map(d=>({...d.data(),id:d.id})).filter(d=>d.active!==false && Number.isFinite(Number(d.price)) && Number(d.price)>0);
    ready=true;renderTabs();render();reconcileCart();
  },error=>{ready=false;drawCart();say(error.message);}));
  $("sendOrder").onclick=send;
}
async function send(){
  if(sending || !ready || !cart.size)return;
  // Sound and Push are optional: they must never block placing an order.
  sending=true;render();drawCart();
  try{
    await authReady;
    if(!auth.currentUser)await signInAnonymously(auth);
    const items=[...cart.values()].map(item=>({...item})),total=Math.round(items.reduce((sum,item)=>sum+item.price*item.quantity,0)*100)/100;
    await addDoc(collection(db,"orders"),{
      restaurantSlug:slug,restaurantName:restaurant.name,customerUid:auth.currentUser.uid,tableNumber:table,tableId:String(table),items,
      note:$("note").value.trim(),total,status:"new",paymentStatus:"unpaid",...(await window.MENIOSound?.getPushToken?.()?{customerPushToken:await window.MENIOSound.getPushToken()}:{}),createdAt:serverTimestamp()
    });
    cart.clear();$("note").value="";say("შეკვეთა გაიგზავნა!");
  }catch(error){say("შეკვეთა ვერ გაიგზავნა: "+error.message);}
  finally{sending=false;render();drawCart();}
}
window.addEventListener("pagehide",()=>{unsubscribers.forEach(stop=>stop());ordersUnsubscribe?.();});
init().catch(error=>{ready=false;drawCart();say(error.message);$("restaurantName").textContent="მენიუ მიუწვდომელია";});

