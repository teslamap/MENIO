import{auth,db,doc,getDoc,collection,query,where,onSnapshot,updateDoc,serverTimestamp,onAuthStateChanged,signOut}from"./courier-firebase.js";
import{showToast}from"./ui.js?v=20261014-ui-1";
import {mountCourierMap,navigationUrl} from './courier-map.js?v=20261015-navigation-4';
const $=id=>document.getElementById(id);
const mapUI=mountCourierMap();
let profile=null,unsubscribe=null,latestSnapshot=null;
const restaurantRecords=new Map(),restaurantSubscriptions=new Map();
function clearRestaurants(){for(const stop of restaurantSubscriptions.values())stop();restaurantSubscriptions.clear();restaurantRecords.clear();latestSnapshot=null;}
function syncRestaurants(orders){if(!mapUI)return;const slugs=new Set(orders.map(o=>o.restaurantSlug).filter(s=>typeof s==='string'&&s.length>0&&!s.includes('/')));for(const [slug,stop]of restaurantSubscriptions)if(!slugs.has(slug)){stop();restaurantSubscriptions.delete(slug);restaurantRecords.delete(slug);}for(const slug of slugs){if(restaurantSubscriptions.has(slug))continue;restaurantSubscriptions.set(slug,()=>{});const stop=onSnapshot(doc(db,'restaurants',slug),snap=>{restaurantRecords.set(slug,snap.exists()?snap.data():null);if(latestSnapshot)render(latestSnapshot);},()=>{restaurantRecords.set(slug,null);});restaurantSubscriptions.set(slug,stop);}}
const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const money=value=>Number(value||0).toFixed(2)+" ₾";
function setStatus(text){$("status").textContent=text}
function render(snapshot){
 latestSnapshot=snapshot;
 const root=$("courierOrders");root.replaceChildren();
 const orders=snapshot.docs.map(d=>{const o={...d.data(),id:d.id},r=restaurantRecords.get(o.restaurantSlug);return {...o,restaurantName:r?.name||o.restaurantName,restaurantLocation:r?.restaurantLocation||null,restaurantAddress:r?.restaurantAddress||''};}).filter(o=>o.orderType==="delivery"&&(["waiting","assigned","picked_up"].includes(o.deliveryStatus)||o.courierUid===auth.currentUser?.uid)).sort((a,b)=>(b.createdAt?.toMillis?.()||0)-(a.createdAt?.toMillis?.()||0));
 syncRestaurants(orders);mapUI?.updateOrders(orders,auth.currentUser?.uid);
 if(!orders.length){const empty=document.createElement("div");empty.className="empty";empty.textContent="ამ ეტაპზე მისაღები მიტანის შეკვეთა არ არის. ახალი შეკვეთა აქ ავტომატურად გამოჩნდება.";root.append(empty);return}
 for(const o of orders){
  const card=document.createElement("article");card.className="courier-order";card.id='courier-order-'+o.id;
  const title=document.createElement("div");title.className="order-top";
  const h=document.createElement("h2");h.textContent=(o.restaurantName||o.restaurantSlug||"რესტორანი")+" · №"+String(o.id).slice(-6).toUpperCase();
  const tag=document.createElement("span");tag.className="courier-tag";tag.textContent=({waiting:"კურიერს ელოდება",assigned:"ჩემთანაა",picked_up:"მიტანის პროცესში",delivered:"ჩაბარებულია"})[o.deliveryStatus]||"მიტანა";
  title.append(h,tag);card.append(title);
  if(mapUI){const mapButton=document.createElement('button');mapButton.type='button';mapButton.className='order-map-button';mapButton.textContent='რუკაზე ნახვა ⌖';mapButton.onclick=()=>mapUI.focusOrder(o.id);card.append(mapButton);const pickup=o.restaurantLocation;if(pickup){const link=document.createElement('a');link.className='btn secondary order-map-button';link.href=navigationUrl({},[pickup.latitude,pickup.longitude]);link.target='_blank';link.rel='noopener noreferrer';link.textContent='რესტორანთან მისვლა ↗';card.append(link);}if(o.courierUid===auth.currentUser?.uid&&['assigned','picked_up'].includes(o.deliveryStatus)){const nav=document.createElement('button');nav.type='button';nav.className='order-map-button';nav.textContent='ნავიგაციის ჩართვა ↗';nav.onclick=()=>mapUI.startNavigation(o);card.append(nav);}const url=navigationUrl(o);if(url){const link=document.createElement('a');link.className='btn secondary order-map-button';link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='ნავიგაცია ↗';card.append(link);}}
  if(o.restaurantAddress){const pickupAddress=document.createElement("p");pickupAddress.textContent="აღების ადგილი: "+o.restaurantAddress;card.append(pickupAddress);}
  const address=document.createElement("p");address.innerHTML="<strong>მისამართი:</strong> "+esc(o.deliveryAddress||"მისამართი არ არის მითითებული");card.append(address);
  const phone=document.createElement("p");phone.innerHTML="<strong>ტელეფონი:</strong> "+(o.customerPhone?'<a href="tel:'+esc(o.customerPhone)+'">'+esc(o.customerPhone)+'</a>':"არ არის მითითებული");card.append(phone);
  const items=document.createElement("div");items.className="items";
  (o.items||[]).forEach(i=>{const line=document.createElement("p");line.textContent=(i.name||"პროდუქტი")+" × "+(i.quantity||1);items.append(line)});
  card.append(items);
  const total=document.createElement("div");total.className="money";total.textContent=money(o.total);card.append(total);
  if(o.note){const note=document.createElement("p");note.textContent="შენიშვნა: "+o.note;card.append(note)}
  const actions=document.createElement("div");actions.className="actions";
  if(o.deliveryStatus==="waiting"&&!o.courierUid){
   const b=document.createElement("button");b.textContent="ავიღო შეკვეთა";b.onclick=()=>change(o,{courierUid:auth.currentUser.uid,deliveryStatus:"assigned",courierAssignedAt:serverTimestamp()},b);actions.append(b)
  }else if(o.courierUid===auth.currentUser.uid&&o.deliveryStatus==="assigned"){
   const b=document.createElement("button");b.textContent="რესტორნიდან ავიღე";b.onclick=()=>change(o,{deliveryStatus:"picked_up",courierPickedUpAt:serverTimestamp()},b);actions.append(b)
  }else if(o.courierUid===auth.currentUser.uid&&o.deliveryStatus==="picked_up"){
   const b=document.createElement("button");b.textContent="მომხმარებელს ჩავაბარე";b.onclick=()=>change(o,{deliveryStatus:"delivered",deliveredAt:serverTimestamp()},b);actions.append(b)
  }else if(o.courierUid&&o.courierUid!==auth.currentUser.uid){
   const note=document.createElement("p");note.textContent="ეს შეკვეთა უკვე სხვა კურიერმა აიღო.";card.append(note)
  }
  if(actions.childElementCount)card.append(actions);
  root.append(card)
 }
}
async function change(order,data,button){
 button.disabled=true;const old=button.textContent;button.textContent="ინახება…";
 try{await updateDoc(doc(db,"orders",order.id),data);showToast("შეკვეთის სტატუსი განახლდა","success");if(data.deliveryStatus==="assigned")mapUI?.startNavigation?.({...order,...data});if(data.deliveryStatus==="picked_up")mapUI?.collapseSheet?.();}
 catch(e){showToast("ვერ განახლდა: "+e.message,"error")}
 finally{button.disabled=false;button.textContent=old}
}
$("logout").onclick=async()=>{unsubscribe?.();clearRestaurants();await signOut(auth);location.href="courier-login.html"};
onAuthStateChanged(auth,async user=>{
 unsubscribe?.();
 if(!user||user.isAnonymous){location.href="courier-login.html";return}
 try{
  const snap=await getDoc(doc(db,"courierProfiles",user.uid));
  if(!snap.exists()||snap.data().active!==true||snap.data().role!=="courier"){setStatus("კურიერის პროფილი ჯერ არ არის გააქტიურებული. დაუკავშირდი ORDERA-ს ადმინისტრატორს.");$("courierOrders").replaceChildren();mapUI?.updateOrders([]);return}
  profile=snap.data();setStatus("შესული ხარ როგორც "+(profile.name||"კურიერი")+" · სისტემა აქტიურია");
  const q=query(collection(db,"orders"),where("orderType","==","delivery"),where("deliveryStatus","in",["waiting","assigned","picked_up"]));
  unsubscribe=onSnapshot(q,render,error=>setStatus("შეკვეთების ჩატვირთვა ვერ მოხერხდა: "+error.message));
 }catch(e){setStatus("წვდომა ვერ დადასტურდა: "+e.message)}
});
window.addEventListener("pagehide",()=>{unsubscribe?.();clearRestaurants();});
