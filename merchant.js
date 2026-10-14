import{auth,db,doc,updateDoc,onAuthStateChanged,signOut}from"./firebase.js";
import{requireOwner,listenOrders}from"./app.js";
import{confirmDialog,showToast}from"./ui.js?v=20261014-ui-1";
const slug=new URLSearchParams(location.search).get("restaurant"),$=id=>document.getElementById(id);
let soundEnabled=false,audioContext=null,alertTimer=null,lastOrderIds=null;
const alertedOrders=new Set();
function beep(){
 if(!soundEnabled)return;
 try{
  if(window.MenioNative&&typeof window.MenioNative.playOrderAlert==="function"){window.MenioNative.playOrderAlert();return}
  audioContext=audioContext||new (window.AudioContext||window.webkitAudioContext)();
  if(audioContext.state==="suspended")audioContext.resume();
  const now=audioContext.currentTime;
  [0,0.22,0.44].forEach((offset,index)=>{
   const osc=audioContext.createOscillator(),gain=audioContext.createGain();
   osc.type="sine";osc.frequency.value=index===1?1046:880;
   gain.gain.setValueAtTime(0.0001,now+offset);
   gain.gain.exponentialRampToValueAtTime(0.24,now+offset+0.025);
   gain.gain.exponentialRampToValueAtTime(0.0001,now+offset+0.18);
   osc.connect(gain);gain.connect(audioContext.destination);
   osc.start(now+offset);osc.stop(now+offset+0.2);
  });
 }catch(e){console.warn("MENIO sound unavailable",e)}
}
function stopAlert(){if(alertTimer){clearInterval(alertTimer);alertTimer=null}}
function updateSoundButton(){
 const b=$("soundToggle");if(!b)return;
 b.textContent=soundEnabled?"🔊 ხმა ჩართულია":"🔇 ხმის ჩართვა";
 b.classList.toggle("sound-on",soundEnabled);
 b.setAttribute("aria-pressed",String(soundEnabled));
}
$("soundToggle")?.addEventListener("click",async()=>{
 try{
  if(window.MenioNative&&typeof window.MenioNative.playOrderAlert==="function"){
   soundEnabled=true;updateSoundButton();beep();
   if(alertedOrders.size){stopAlert();alertTimer=setInterval(beep,2400)}
   showToast("შეკვეთის ხმოვანი სიგნალი ჩართულია","success");return;
  }
  audioContext=audioContext||new (window.AudioContext||window.webkitAudioContext)();
  await audioContext.resume();soundEnabled=true;updateSoundButton();beep();
  if(alertedOrders.size){stopAlert();alertTimer=setInterval(beep,2400)}
  showToast("შეკვეთის ხმოვანი სიგნალი ჩართულია","success");
 }catch(e){showToast("ხმის ჩართვა ვერ მოხერხდა — შეამოწმე მოწყობილობის ხმა","error")}
});
function monitorNewOrders(orders){
 const incoming=orders.filter(o=>!o.archived&&["new","accepted"].includes(o.status));
 const currentIds=new Set(incoming.map(o=>String(o.id)));
 if(lastOrderIds!==null){
  const fresh=incoming.filter(o=>!lastOrderIds.has(String(o.id)));
  if(fresh.length){
   fresh.forEach(o=>alertedOrders.add(String(o.id)));
   if(soundEnabled){beep();stopAlert();alertTimer=setInterval(beep,2400)}
   showToast(fresh.length===1?"ახალი შეკვეთა შემოვიდა!":"ახალი შეკვეთები შემოვიდა: "+fresh.length,"success");
  }
 }
 lastOrderIds=currentIds;
 for(const id of [...alertedOrders])if(!currentIds.has(id))alertedOrders.delete(id);
 if(!alertedOrders.size)stopAlert();
}
const laneConfig=[
 {key:"incoming",statuses:["new","accepted"],title:"შემოსული",empty:"ახალი შეკვეთები აქ გამოჩნდება"},
 {key:"preparing",statuses:["preparing"],title:"მზადდება",empty:"მომზადებაში შეკვეთა არ არის"},
 {key:"ready",statuses:["completed"],title:"მზადაა",empty:"მზად შეკვეთები აქ გამოჩნდება"}
];
function make(tag,className,text){const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el}
function makeOrderCard(o){
 const c=make("article","order-card");
 const head=make("div","order-head"),title=make("h2","", "მაგიდა №"+(o.tableNumber??"—"));
 const statusText=({new:"ახალი შეკვეთა",accepted:"მიღებულია",preparing:"მზადდება",completed:"მზადაა",cancelled:"გაუქმებულია"})[o.status]||o.status||"უცნობი";
 const st=make("span","status status-"+o.status,statusText);head.append(title,st);c.append(head);
 const stamp=o.createdAt?.toDate?.();
 const orderMeta=make("div","order-meta");
 const shortId=make("span","","№ "+String(o.id||"").slice(-6).toUpperCase());
 const timeLabel=make("span","",stamp?stamp.toLocaleTimeString("ka-GE",{hour:"2-digit",minute:"2-digit"}):"ახლახან");
 orderMeta.append(shortId,timeLabel);c.append(orderMeta);
 const items=o.items||[];
 if(items.length){items.forEach(i=>{const row=make("div","order-item"),name=make("span","",(i.name||"პროდუქტი")+" × "+(i.quantity??1)),price=make("b","",(Number(i.price||0)*Number(i.quantity||1)).toFixed(2)+" ₾");row.append(name,price);c.append(row)})}
 else c.append(make("p","muted","შეკვეთის პროდუქტები არ არის მითითებული"));
 const total=make("div","order-total"),totalLabel=make("span","","ჯამი"),totalValue=make("strong","",Number(o.total||0).toFixed(2)+" ₾");total.append(totalLabel,totalValue);c.append(total);
 c.append(make("p","order-note",o.note?"შენიშვნა: "+o.note:"შენიშვნა არ არის"));
 const paymentMeta=make("div","order-meta","გადახდა: "+(o.paymentStatus==="paid"?"გადახდილია":"მოლოდინში"));c.append(paymentMeta);
 const actions=make("div","order-actions");
 if(o.status==="new"||o.status==="accepted"){
  const b=make("button","","მომზადების დაწყება");b.onclick=()=>change(o.id,{status:"preparing"},b);actions.append(b);
 }else if(o.status==="preparing"){
  const b=make("button","","მზადაა");b.onclick=()=>change(o.id,{status:"completed"},b);actions.append(b);
 }
 if(o.paymentStatus!=="paid"){
  const b=make("button","secondary","გადახდილია");b.onclick=()=>change(o.id,{paymentStatus:"paid"},b);actions.append(b);
 }
 if(o.status==="completed" && o.paymentStatus==="paid"){
  const b=make("button","secondary","✓ დაფიდან მოცილება");
  b.title="გადახდილი შეკვეთა ანგარიშგებაში დარჩება, მხოლოდ ამ დაფიდან დაიმალება";
  b.onclick=async()=>{if(await confirmDialog("მოვაშოროთ ეს გადახდილი შეკვეთა „მზადაა“ სვეტიდან? ანგარიშგებაში შეკვეთა შენარჩუნდება.",{title:"შეკვეთის დამალვა",confirmText:"დამალვა"}))change(o.id,{archived:true},b)};
  actions.append(b);
 }
 if(actions.childElementCount)c.append(actions);
 return c;
}
function render(orders){
 monitorNewOrders(orders);
 const lanes=Object.fromEntries(laneConfig.map(l=>[l.key,$("orders").querySelector(".lane-"+l.key)]));
 for(const lane of laneConfig){
  const root=lanes[lane.key],cards=root.querySelector(".lane-cards"),count=root.querySelector(".lane-count");
  cards.replaceChildren();
  const list=orders.filter(o=>!o.archived && lane.statuses.includes(o.status));
  count.textContent=String(list.length);
  if(!list.length)cards.append(make("div","board-empty",lane.empty));
  else list.forEach(o=>cards.append(makeOrderCard(o)));
 }
 const active=orders.filter(o=>!["completed","cancelled"].includes(o.status)).length;
 const ready=orders.filter(o=>o.status==="completed"&&!o.archived).length;
 $("status").textContent="აქტიური: "+active+" · მზადაა: "+ready+" · სულ: "+orders.length;
}
async function change(id,data,b){
 b.disabled=true;
 const previous=b.textContent;b.textContent="ინახება…";
 try{
  await updateDoc(doc(db,"orders",id),data);
  if(data.status==="completed"){
   b.textContent="Push იგზავნება…";
   try{
    const user=auth.currentUser;
    if(!user)throw new Error("მომხმარებელი ავტორიზებული არ არის");
    const idToken=await user.getIdToken();
    const response=await fetch("https://menio-push.suloanani1.workers.dev/",{
     method:"POST",
     headers:{"Content-Type":"application/json"},
     body:JSON.stringify({idToken,orderId:id})
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(result.error||("HTTP "+response.status));
    showToast("შეკვეთა მზადაა — Push შეტყობინება გაიგზავნა","success");
   }catch(pushError){
    console.error("MENIO Push error:",pushError);
    showToast("შეკვეთა მზადაა, მაგრამ Push ვერ გაიგზავნა: "+(pushError.message||"შეცდომა"),"error");
   }
  }
 }catch(e){showToast("შეკვეთის განახლება ვერ მოხერხდა: "+e.message,"error")}
 finally{b.disabled=false;b.textContent=previous}
}
onAuthStateChanged(auth,async user=>{
 if(!user||user.isAnonymous||!slug){location.href="register.html?returnTo=merchant&restaurant="+encodeURIComponent(slug||"")+"#login";return}
 try{
  await requireOwner(slug);
  $("logout").onclick=async()=>{await signOut(auth);location.href="register.html#login"};
  updateSoundButton();
  listenOrders(slug,render,e=>{$("status").textContent="შეკვეთების ჩატვირთვის შეცდომა";const error=make("p","board-error",e.message);$("orders").replaceChildren(error)});
 }catch(e){$("status").textContent="წვდომის შეცდომა: "+e.message}
});