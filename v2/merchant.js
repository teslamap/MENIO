import{auth,db,doc,updateDoc,onAuthStateChanged,signOut}from"./firebase.js";
import{requireOwner,listenOrders}from"./app.js";
const slug=new URLSearchParams(location.search).get("restaurant"),$=id=>document.getElementById(id);
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
 const items=o.items||[];
 if(items.length){items.forEach(i=>{const row=make("div","order-item"),name=make("span","",(i.name||"პროდუქტი")+" × "+(i.quantity??1)),price=make("b","",(Number(i.price||0)*Number(i.quantity||1)).toFixed(2)+" ₾");row.append(name,price);c.append(row)})}
 else c.append(make("p","muted","შეკვეთის პროდუქტები არ არის მითითებული"));
 const total=make("div","order-total"),totalLabel=make("span","","ჯამი"),totalValue=make("strong","",Number(o.total||0).toFixed(2)+" ₾");total.append(totalLabel,totalValue);c.append(total);
 c.append(make("p","order-note",o.note?"შენიშვნა: "+o.note:"შენიშვნა არ არის"));
 c.append(make("div","order-meta","გადახდა: "+(o.paymentStatus==="paid"?"გადახდილია":"მოლოდინში")));
 const actions=make("div","order-actions");
 if(o.status==="new"||o.status==="accepted"){
  const b=make("button","","მომზადების დაწყება");b.onclick=()=>change(o.id,{status:"preparing"},b);actions.append(b);
 }else if(o.status==="preparing"){
  const b=make("button","","მზადაა");b.onclick=()=>change(o.id,{status:"completed"},b);actions.append(b);
 }
 if(o.paymentStatus!=="paid"){
  const b=make("button","secondary","გადახდილია");b.onclick=()=>change(o.id,{paymentStatus:"paid"},b);actions.append(b);
 }
 if(actions.childElementCount)c.append(actions);
 return c;
}
function render(orders){
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
 const ready=orders.filter(o=>o.status==="completed").length;
 $("status").textContent="აქტიური: "+active+" · მზადაა: "+ready+" · სულ: "+orders.length;
}
async function change(id,data,b){
 b.disabled=true;
 const previous=b.textContent;b.textContent="ინახება…";
 try{await updateDoc(doc(db,"orders",id),data)}
 catch(e){alert("შეკვეთის განახლება ვერ მოხერხდა: "+e.message)}
 finally{b.disabled=false;b.textContent=previous}
}
onAuthStateChanged(auth,async user=>{
 if(!user||user.isAnonymous||!slug){location.href="register.html#login";return}
 try{
  await requireOwner(slug);
  $("logout").onclick=async()=>{await signOut(auth);location.href="register.html#login"};
  listenOrders(slug,render,e=>{$("status").textContent="შეკვეთების ჩატვირთვის შეცდომა";const error=make("p","board-error",e.message);$("orders").replaceChildren(error)});
 }catch(e){$("status").textContent="წვდომის შეცდომა: "+e.message}
});