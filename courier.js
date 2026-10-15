import{auth,db,doc,getDoc,collection,query,where,onSnapshot,updateDoc,serverTimestamp,onAuthStateChanged,signOut,setDoc,runTransaction}from"./courier-firebase.js";
import{showToast}from"./ui.js?v=20261014-ui-1";
import {mountCourierMap,navigationUrl} from './courier-map.js?v=20261015-navigation-4';
const $=id=>document.getElementById(id);
const mapUI=mountCourierMap();

const drawer=$('courierDrawer'),backdrop=$('drawerBackdrop'),detail=$('drawerDetail');
let financeUnsubscribe=null,deliveredOrders=[];
function moneyKa(n){return (Number(n)||0).toLocaleString('ka-GE',{minimumFractionDigits:2,maximumFractionDigits:2})+' ₾';}
function localDay(date){return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');}
function earnings(){const today=localDay(new Date());const done=deliveredOrders.filter(o=>o.deliveryStatus==='delivered'&&o.courierUid===auth.currentUser?.uid&&Number.isFinite(Number(o.courierPay)));const daily=done.filter(o=>o.deliveredAt?.toDate&&localDay(o.deliveredAt.toDate())===today);return {done,daily,todayTotal:daily.reduce((n,o)=>n+Number(o.courierPay),0),allTotal:done.reduce((n,o)=>n+Number(o.courierPay),0)};}
function updateEarnings(){const e=earnings();$('todayEarnings').textContent=moneyKa(e.todayTotal);if(!detail.hidden&&detail.dataset.panel==='finance')openDetail('finance');}
function openMenu(){drawer.classList.add('open');drawer.inert=false;drawer.setAttribute('aria-hidden','false');backdrop.hidden=false;$('menuOpen').setAttribute('aria-expanded','true');$('menuClose').focus();}
function closeMenu(){detail.hidden=true;drawer.classList.remove('open');drawer.inert=true;drawer.setAttribute('aria-hidden','true');backdrop.hidden=true;$('menuOpen').setAttribute('aria-expanded','false');$('menuOpen').focus();}
$('menuOpen').onclick=openMenu;$('menuClose').onclick=closeMenu;backdrop.onclick=closeMenu;$('detailClose').onclick=closeMenu;
$('detailBack').onclick=()=>{detail.hidden=true;$('menuClose').focus();};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!backdrop.hidden)closeMenu();});
function line(label,value){const div=document.createElement('div');div.className='finance-stat';const name=document.createElement('small');name.textContent=label;const amount=document.createElement('strong');amount.textContent=value;div.append(name,amount);return div;}
function openDetail(panel){
 detail.dataset.panel=panel;detail.hidden=false;const root=$('detailContent');root.replaceChildren();
 $('detailTitle').textContent=({profile:'პროფილი',finance:'ფინანსები',settings:'პარამეტრები'})[panel]||'მენიუ';
 if(panel==='profile'){root.append(line('სახელი',profile?.name||'—'),line('ტელეფონი',profile?.phone||'—'),line('ელფოსტა',profile?.email||auth.currentUser?.email||'—'),line('ტრანსპორტი',profile?.vehicle||'—'),line('ქალაქი',profile?.city||'—'));}
 if(panel==='settings'){const p=document.createElement('p');p.className='detail-note';p.textContent='ხაზზე შესვლა და გასვლა ხდება რუკაზე განთავსებული სლაიდერით. ლოკაციის ნებართვა შეგიძლია მართო ტელეფონის ბრაუზერის ან აპის პარამეტრებში.';root.append(p);}
 if(panel==='finance'){
  const e=earnings(),hero=document.createElement('div');hero.className='finance-hero';const caption=document.createElement('small');caption.textContent='სულ ნამუშევარი · ჩაბარებული შეკვეთები';const amount=document.createElement('strong');amount.textContent=moneyKa(e.allTotal);hero.append(caption,amount);root.append(hero);
  root.append(line('დღეს',moneyKa(e.todayTotal)),line('ჩაბარებული შეკვეთები',String(e.done.length)));
  const history=document.createElement('section');history.className='finance-history';const title=document.createElement('h3');title.textContent='ნამუშევრების ისტორია';history.append(title);
  if(!e.done.length){const empty=document.createElement('p');empty.className='detail-note';empty.textContent='ჩაბარებული შეკვეთები ჯერ არ არის. თანხა გამოჩნდება შეკვეთის დასრულების შემდეგ.';history.append(empty);}
  else for(const o of [...e.done].sort((a,b)=>(b.deliveredAt?.toMillis?.()||0)-(a.deliveredAt?.toMillis?.()||0)).slice(0,40)){const item=document.createElement('div');item.className='finance-item';const label=document.createElement('span');const when=o.deliveredAt?.toDate?.();label.textContent=(o.restaurantName||o.restaurantSlug||'შეკვეთა')+' · '+(when?when.toLocaleDateString('ka-GE'):'თარიღი უცნობია');const value=document.createElement('strong');value.textContent=moneyKa(o.courierPay);item.append(label,value);history.append(item);}
  root.append(history);
 }
}
document.querySelectorAll('[data-panel]').forEach(button=>button.onclick=()=>openDetail(button.dataset.panel));
function startFinance(uid){financeUnsubscribe?.();financeUnsubscribe=onSnapshot(query(collection(db,'orders'),where('courierUid','==',uid)),snap=>{deliveredOrders=snap.docs.map(d=>({...d.data(),id:d.id}));updateEarnings();},error=>{console.warn('Courier finance:',error);const p=document.createElement('p');p.className='detail-note';p.textContent='ფინანსების ჩატვირთვა ვერ მოხერხდა: '+error.message;if(!detail.hidden&&detail.dataset.panel==='finance')$('detailContent').append(p);});}

let profile=null,unsubscribe=null,latestSnapshot=null,shiftUnsub=null,online=false,pricing={restaurantToCustomerPerKm:2,courierToRestaurantPerKm:1,minimumCourierPay:0},position=null;
const quoteCache=new Map();
const coords=v=>v&&Number.isFinite(v.latitude)&&Number.isFinite(v.longitude)?[v.latitude,v.longitude]:null;
const round=v=>Math.round((v+Number.EPSILON)*100)/100;
async function roadMeters(a,b){
 const url='https://router.project-osrm.org/route/v1/driving/'+a[1]+','+a[0]+';'+b[1]+','+b[0]+'?overview=false';
 const response=await fetch(url);if(!response.ok)throw Error('გზის სერვისი მიუწვდომელია');
 const result=await response.json();if(result.code!=='Ok'||!Number.isFinite(result.routes?.[0]?.distance))throw Error('გზა ვერ მოიძებნა');
 return Math.round(result.routes[0].distance);
}
async function quote(order){
 const pickup=coords(order.restaurantLocation),drop=coords(order.deliveryLocation);
 if(!pickup||!drop||!position)return null;
 const a=await roadMeters([position.latitude,position.longitude],pickup);
 const b=await roadMeters(pickup,drop);
 const calculatedPay=round((a*pricing.courierToRestaurantPerKm+b*pricing.restaurantToCustomerPerKm)/1000);const minimumCourierPay=Number(pricing.minimumCourierPay)||0;
 return {minimumCourierPay,calculatedPay,courierToRestaurantMeters:a,restaurantToCustomerMeters:b,courierToRestaurantPerKm:pricing.courierToRestaurantPerKm,restaurantToCustomerPerKm:pricing.restaurantToCustomerPerKm,courierPay:Math.max(calculatedPay,minimumCourierPay)};
}
async function refreshQuote(order){
 const target=document.getElementById('earning-'+order.id);
 if(!target||!online)return;
 try{const q=await quote(order);if(!q){target.textContent='ანაზღაურება ვერ ითვლება — საჭიროა GPS და ორივე მისამართის კოორდინატები';return;}
 quoteCache.set(order.id,q);if(!document.getElementById('earning-'+order.id))return;
 target.replaceChildren();const strong=document.createElement('strong');strong.textContent=q.courierPay.toFixed(2)+' ₾';
 const small=document.createElement('small');small.textContent='შენ → რესტორანი: '+q.courierToRestaurantMeters+' მ / '+round(q.courierToRestaurantMeters*q.courierToRestaurantPerKm/1000).toFixed(2)+' ₾ · რესტორანი → კლიენტი: '+q.restaurantToCustomerMeters+' მ / '+round(q.restaurantToCustomerMeters*q.restaurantToCustomerPerKm/1000).toFixed(2)+' ₾';
 target.append(strong,small);if(q.courierPay>q.calculatedPay){const minimumNote=document.createElement('small');minimumNote.textContent='✓ მინიმალური ანაზღაურება: '+q.minimumCourierPay.toFixed(2)+' ₾';target.append(minimumNote);}const b=document.getElementById('claim-'+order.id);if(b)b.disabled=false;
 }catch(e){target.textContent='საფასური ვერ დაითვალა: '+e.message;}
}
function renderShift(){
 $('shiftTitle').textContent=online?'● ხაზზე ხარ':'○ ხაზგარეშე';
 $('shiftHint').textContent=online?'შეკვეთებს იღებ':'შეკვეთების მიღება შეჩერებულია';
 $('shiftSlider').classList.toggle('online',online);$('shiftSlider').setAttribute('aria-valuenow',online?'1':'0');
 $('shiftInstruction').textContent=online?'გასრიალე ხაზიდან გასასვლელად':'გასრიალე ხაზზე შესასვლელად';
 $('drawerShift').textContent=online?'● ხაზზე ხარ':'○ ხაზგარეშე';$('drawerShift').classList.toggle('online',online);
}
async function toggleShift(){
 if(!auth.currentUser||!profile)return;
 const next=!online;
 if(next){try{position=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(p=>resolve({latitude:p.coords.latitude,longitude:p.coords.longitude}),reject,{enableHighAccuracy:true,timeout:15000,maximumAge:15000}));}catch(e){showToast('ხაზზე შესასვლელად ჩართე GPS: '+e.message,'error');return;}}
 try{await setDoc(doc(db,'courierShifts',auth.currentUser.uid),{online:next,updatedAt:serverTimestamp(),location:next?position:null});online=next;renderShift();if(latestSnapshot)render(latestSnapshot);}
 catch(e){showToast('სტატუსი ვერ შეიცვალა: '+e.message,'error');}
}
let slideStart=null;const slider=$('shiftSlider');
slider.addEventListener('pointerdown',e=>{slideStart={x:e.clientX,id:e.pointerId};slider.setPointerCapture?.(e.pointerId);});
slider.addEventListener('pointerup',e=>{if(!slideStart||slideStart.id!==e.pointerId)return;const delta=e.clientX-slideStart.x;slideStart=null;if((!online&&delta>75)||(online&&delta< -75))toggleShift();});
slider.addEventListener('pointercancel',()=>slideStart=null);
slider.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '||e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();toggleShift();}});

const restaurantRecords=new Map(),restaurantSubscriptions=new Map();
function clearRestaurants(){for(const stop of restaurantSubscriptions.values())stop();restaurantSubscriptions.clear();restaurantRecords.clear();latestSnapshot=null;}
function syncRestaurants(orders){if(!mapUI)return;const slugs=new Set(orders.map(o=>o.restaurantSlug).filter(s=>typeof s==='string'&&s.length>0&&!s.includes('/')));for(const [slug,stop]of restaurantSubscriptions)if(!slugs.has(slug)){stop();restaurantSubscriptions.delete(slug);restaurantRecords.delete(slug);}for(const slug of slugs){if(restaurantSubscriptions.has(slug))continue;restaurantSubscriptions.set(slug,()=>{});const stop=onSnapshot(doc(db,'restaurants',slug),snap=>{restaurantRecords.set(slug,snap.exists()?snap.data():null);if(latestSnapshot)render(latestSnapshot);},()=>{restaurantRecords.set(slug,null);});restaurantSubscriptions.set(slug,stop);}}
const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const money=value=>Number(value||0).toFixed(2)+" ₾";
function setStatus(text){$("status").textContent=text}
function render(snapshot){
 latestSnapshot=snapshot;
 const root=$("courierOrders");root.replaceChildren();quoteCache.clear();
 const orders=snapshot.docs.map(d=>{const o={...d.data(),id:d.id},r=restaurantRecords.get(o.restaurantSlug);return {...o,restaurantName:r?.name||o.restaurantName,restaurantLocation:r?.restaurantLocation||null,restaurantAddress:r?.restaurantAddress||''};}).filter(o=>o.orderType==="delivery"&&(["waiting","assigned","picked_up"].includes(o.deliveryStatus)||o.courierUid===auth.currentUser?.uid)).sort((a,b)=>(b.createdAt?.toMillis?.()||0)-(a.createdAt?.toMillis?.()||0));
 syncRestaurants(orders);mapUI?.updateOrders(online?orders:orders.filter(o=>o.courierUid===auth.currentUser?.uid),auth.currentUser?.uid);
 if(!online){const note=document.createElement('p');note.className='empty';note.textContent='ხაზგარეშე ხარ. ახალი შეკვეთების მისაღებად გასრიალე ზემოთ მოცემული სლაიდერი.';root.append(note);}
 if(!orders.length){const empty=document.createElement("div");empty.className="empty";empty.textContent="ამ ეტაპზე მისაღები მიტანის შეკვეთა არ არის. ახალი შეკვეთა აქ ავტომატურად გამოჩნდება.";root.append(empty);return}
 for(const o of orders){if(!online&&o.courierUid!==auth.currentUser?.uid)continue;
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
  if(o.deliveryStatus==='waiting'&&!o.courierUid){const earning=document.createElement('div');earning.className='courier-earning pending';earning.id='earning-'+o.id;earning.textContent='საგზაო მანძილი და ანაზღაურება ითვლება…';card.append(earning);queueMicrotask(()=>refreshQuote(o));}
  else if(o.courierPay!=null){const earning=document.createElement('div');earning.className='courier-earning';const label=document.createElement('strong');label.textContent=Number(o.courierPay).toFixed(2)+' ₾';earning.append(label);card.append(earning);}
  const actions=document.createElement("div");actions.className="actions";
  if(o.deliveryStatus==="waiting"&&!o.courierUid){
   const b=document.createElement("button");b.id='claim-'+o.id;b.textContent="ავიღო შეკვეთა";b.disabled=true;b.onclick=()=>claim(o,b);actions.append(b)
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
async function claim(order,button){
 if(!online||!quoteCache.has(order.id)){showToast('ჯერ ჩართე ხაზი და დაელოდე ანაზღაურების გამოთვლას','error');return;}
 button.disabled=true;
 try{const q=quoteCache.get(order.id);await runTransaction(db,async tx=>{
 const shift=await tx.get(doc(db,'courierShifts',auth.currentUser.uid));const ref=doc(db,'orders',order.id),snap=await tx.get(ref);
 if(!shift.exists()||shift.data().online!==true||!snap.exists()||snap.data().deliveryStatus!=='waiting'||snap.data().courierUid)throw Error('შეკვეთა უკვე აღებულია ან ხაზგარეშე ხარ');
 tx.update(ref,{courierUid:auth.currentUser.uid,deliveryStatus:'assigned',courierAssignedAt:serverTimestamp(),...q});
 });showToast('შეკვეთა მიღებულია · '+q.courierPay.toFixed(2)+' ₾','success');mapUI?.startNavigation?.({...order,deliveryStatus:'assigned',courierUid:auth.currentUser.uid});
 }catch(e){showToast('შეკვეთა ვერ აიღე: '+e.message,'error');button.disabled=false;}
}
async function change(order,data,button){
 button.disabled=true;const old=button.textContent;button.textContent="ინახება…";
 try{await updateDoc(doc(db,"orders",order.id),data);showToast("შეკვეთის სტატუსი განახლდა","success");if(data.deliveryStatus==="assigned")mapUI?.startNavigation?.({...order,...data});if(data.deliveryStatus==="picked_up")mapUI?.collapseSheet?.();}
 catch(e){showToast("ვერ განახლდა: "+e.message,"error")}
 finally{button.disabled=false;button.textContent=old}
}
$("logout").onclick=async()=>{unsubscribe?.();shiftUnsub?.();clearRestaurants();if(auth.currentUser)await setDoc(doc(db,'courierShifts',auth.currentUser.uid),{online:false,updatedAt:serverTimestamp(),location:null}).catch(()=>{});await signOut(auth);location.href="courier-login.html"};
onAuthStateChanged(auth,async user=>{
 unsubscribe?.();
 if(!user||user.isAnonymous){location.href="courier-login.html";return}
 try{
  const snap=await getDoc(doc(db,"courierProfiles",user.uid));
  if(!snap.exists()||snap.data().active!==true||snap.data().role!=="courier"){setStatus("კურიერის პროფილი ჯერ არ არის გააქტიურებული. დაუკავშირდი ORDERA-ს ადმინისტრატორს.");$("courierOrders").replaceChildren();mapUI?.updateOrders([]);return}
  profile=snap.data();$('drawerName').textContent=profile.name||'კურიერი';$('drawerPhone').textContent=profile.phone||user.email||'ORDERA Delivery';startFinance(user.uid);shiftUnsub?.();shiftUnsub=onSnapshot(doc(db,'courierShifts',user.uid),s=>{online=s.exists()&&s.data().online===true;if(online&&s.data()?.location)position=s.data().location;renderShift();if(latestSnapshot)render(latestSnapshot);});onSnapshot(doc(db,'platformSettings','deliveryPricing'),s=>{if(s.exists())pricing={...pricing,...s.data()};if(latestSnapshot)render(latestSnapshot);});setStatus("შესული ხარ როგორც "+(profile.name||"კურიერი")+" · სისტემა აქტიურია");
  const q=query(collection(db,"orders"),where("orderType","==","delivery"),where("deliveryStatus","in",["waiting","assigned","picked_up"]));
  unsubscribe=onSnapshot(q,render,error=>setStatus("შეკვეთების ჩატვირთვა ვერ მოხერხდა: "+error.message));
 }catch(e){setStatus("წვდომა ვერ დადასტურდა: "+e.message)}
});
window.addEventListener("pagehide",()=>{financeUnsubscribe?.();unsubscribe?.();shiftUnsub?.();clearRestaurants();});
