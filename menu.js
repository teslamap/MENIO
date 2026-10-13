import {auth,db,doc,getDoc,collection,addDoc,onSnapshot,serverTimestamp,signInAnonymously,onAuthStateChanged} from "./firebase.js";
import { safeProductImage } from "./image-utils.js";
const params=new URLSearchParams(location.search),slug=params.get("restaurant"),table=Number(params.get("table"));
const $=id=>document.getElementById(id),cart=new Map(),categories=new Map(),unsubscribers=[];
let restaurant, dishes=[], selectedCategory="all", sending=false, ready=false;
const DEFAULT_THEME_COLOR="#f97316";
function applyMenuTheme(color){
  const hex=color.slice(1), red=parseInt(hex.slice(0,2),16), green=parseInt(hex.slice(2,4),16), blue=parseInt(hex.slice(4,6),16);
  const linear=value=>{value/=255;return value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4;};
  const luminance=.2126*linear(red)+.7152*linear(green)+.0722*linear(blue);
  document.documentElement?.style?.setProperty?.("--accent-color",color);
  document.documentElement?.style?.setProperty?.("--menu-background-color",color);
  document.documentElement?.style?.setProperty?.("--menu-foreground-color",luminance>.42?"#171920":"#f5f5f7");
}
const money=n=>Number(n).toFixed(2)+" ₾";
const say=text=>{ $("message").textContent=text; };
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
  for(const dish of visible){
    const card=el("article",undefined,"dish-card");
    const photo = safeProductImage(dish.imageUrl);
    if(photo){
      const image=el("img",undefined,"dish-photo");image.src=photo;image.alt=dish.name;image.loading="lazy";
      image.onerror=()=>image.hidden=true;card.append(image);
    }
    card.append(el("span",groupName(dish),"muted"),el("h3",dish.name),el("p",dish.description || ""));
    const row=el("div",undefined,"row"),button=el("button","დამატება +");
    button.disabled=sending;
    button.onclick=()=>{
      const old=cart.get(dish.id);
      cart.set(dish.id,{dishId:dish.id,name:dish.name,price:Number(dish.price),quantity:(old?.quantity || 0)+1});
      drawCart();
    };
    row.append(el("b",money(dish.price)),button);card.append(row);$("menu").append(card);
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
async function init(){
  if(!slug || !Number.isSafeInteger(table) || table<1)throw Error("QR ბმული არასწორია");
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
  sending=true;render();drawCart();
  try{
    await authReady;
    if(!auth.currentUser)await signInAnonymously(auth);
    const items=[...cart.values()].map(item=>({...item})),total=Math.round(items.reduce((sum,item)=>sum+item.price*item.quantity,0)*100)/100;
    await addDoc(collection(db,"orders"),{
      restaurantSlug:slug,restaurantName:restaurant.name,tableNumber:table,tableId:String(table),items,
      note:$("note").value.trim(),total,status:"new",paymentStatus:"unpaid",createdAt:serverTimestamp()
    });
    cart.clear();$("note").value="";say("შეკვეთა გაიგზავნა!");
  }catch(error){say("შეკვეთა ვერ გაიგზავნა: "+error.message);}
  finally{sending=false;render();drawCart();}
}
window.addEventListener("pagehide",()=>unsubscribers.forEach(stop=>stop()));
init().catch(error=>{ready=false;drawCart();say(error.message);$("restaurantName").textContent="მენიუ მიუწვდომელია";});

