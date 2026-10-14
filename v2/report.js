import{auth,onAuthStateChanged,signOut}from"./firebase.js";
import{requireOwner,listenOrders}from"./app.js";
const slug=new URLSearchParams(location.search).get("restaurant"),$=id=>document.getElementById(id);
const periods={day:{label:"დღეს",start:()=>{const d=new Date();d.setHours(0,0,0,0);return d}},week:{label:"ამ კვირაში",start:()=>{const d=new Date();d.setHours(0,0,0,0);const weekday=(d.getDay()+6)%7;d.setDate(d.getDate()-weekday);return d}},month:{label:"ამ თვეში",start:()=>{const d=new Date();d.setHours(0,0,0,0);d.setDate(1);return d}}};
let period="day",allOrders=[];
const money=n=>Number(n||0).toLocaleString("ka-GE",{minimumFractionDigits:2,maximumFractionDigits:2})+" ₾";
const dateOf=value=>{if(!value)return null;if(typeof value.toDate==="function")return value.toDate();if(typeof value.seconds==="number")return new Date(value.seconds*1000);const d=new Date(value);return Number.isNaN(d.getTime())?null:d};
const make=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e};
function addInsight(label,value){const row=make("div","insight"),left=make("span","",label),right=make("strong","",value);row.append(left,right);$("insights").append(row)}
function getPeriodOrders(){const start=periods[period].start(),end=new Date();return allOrders.filter(o=>{const d=dateOf(o.createdAt);return d&&d>=start&&d<=end})}
function render(){
 const filtered=getPeriodOrders(),valid=filtered.filter(o=>o.status!=="cancelled"),cancelled=filtered.filter(o=>o.status==="cancelled");
 const gross=valid.reduce((sum,o)=>sum+Number(o.total||0),0);
 const paid=valid.filter(o=>o.paymentStatus==="paid").reduce((sum,o)=>sum+Number(o.total||0),0);
 const due=valid.filter(o=>o.paymentStatus!=="paid").reduce((sum,o)=>sum+Number(o.total||0),0);
 const average=valid.length?gross/valid.length:0;
 $("paidRevenue").textContent=money(paid);$("grossSales").textContent=money(gross);$("outstanding").textContent=money(due);$("orderCount").textContent=String(valid.length);
 $("orderCountNote").textContent=cancelled.length+" გაუქმებული შეკვეთა";
 $("periodLabel").textContent="პერიოდი: "+periods[period].label+" · "+periods[period].start().toLocaleDateString("ka-GE")+" — "+new Date().toLocaleDateString("ka-GE");
 const productMap=new Map();
 for(const o of valid)for(const item of (o.items||[])){const name=String(item.name||"უცნობი პროდუქტი"),qty=Number(item.quantity||1),amount=Number(item.price||0)*qty,prev=productMap.get(name)||{name,qty:0,revenue:0};prev.qty+=qty;prev.revenue+=amount;productMap.set(name,prev)}
 const top=[...productMap.values()].sort((a,b)=>b.qty-a.qty).slice(0,5);
 $("summaryText").replaceChildren();
 const p1=make("p","", "არჩეულ პერიოდში დაფიქსირდა "+valid.length+" მოქმედი შეკვეთა"+(cancelled.length?" და "+cancelled.length+" გაუქმებული შეკვეთა":"")+".");
 const p2=make("p","", "გადახდილი თანხაა "+money(paid)+", ხოლო გაყიდვების საერთო ღირებულება — "+money(gross)+".");
 const p3=make("p","", "გადასახდელი ნაშთი: "+money(due)+". შეკვეთის საშუალო ღირებულება: "+money(average)+".");
 $("summaryText").append(p1,p2,p3);
 if(top.length){const p=make("p","");p.append(document.createTextNode("ყველაზე მოთხოვნადი პროდუქტია "));const strong=make("strong","",top[0].name);p.append(strong,document.createTextNode(" — "+top[0].qty+" ერთეული."));$("summaryText").append(p)}
 else $("summaryText").append(make("p","","ამ პერიოდში გაყიდული პროდუქტების მონაცემები არ არის."));
 $("insights").replaceChildren();
 addInsight("ყველა შეკვეთა",String(filtered.length));
 addInsight("საშუალო შეკვეთა",money(average));
 addInsight("გაუქმებული შეკვეთები",String(cancelled.length));
 addInsight("გადახდის მაჩვენებელი",gross>0?Math.round(paid/gross*100)+"%":"—");
 addInsight("მომზადებული შეკვეთები",String(valid.filter(o=>o.status==="completed").length));
 const table=$("topProducts");table.replaceChildren();
 if(!top.length){table.append(make("div","report-empty","ამ პერიოდში პროდუქტის გაყიდვები არ არის."))}
 else{
  const t=make("table","report-table"),thead=make("thead"),hr=make("tr");
  ["პროდუქტი","რაოდენობა","თანხა"].forEach(label=>hr.append(make("th","",label)));thead.append(hr);t.append(thead);
  const body=make("tbody");for(const item of top){const tr=make("tr");tr.append(make("td","",item.name),make("td","",String(item.qty)),make("td","",money(item.revenue)));body.append(tr)}t.append(body);table.append(t)
 }
}
document.querySelectorAll("[data-period]").forEach(button=>button.addEventListener("click",()=>{period=button.dataset.period;document.querySelectorAll("[data-period]").forEach(b=>b.setAttribute("aria-pressed",String(b===button)));render()}));
$("exportCsv").addEventListener("click",()=>{
 const orders=getPeriodOrders().sort((a,b)=>(dateOf(a.createdAt)?.getTime()||0)-(dateOf(b.createdAt)?.getTime()||0));
 const quote=v=>'"'+String(v??"").replace(/"/g,'""')+'"';
 const rows=[["თარიღი","სტატუსი","მაგიდა","პროდუქტები","ჯამი ₾","გადახდა","არქივში"]];
 for(const o of orders){const d=dateOf(o.createdAt);rows.push([d?d.toLocaleString("ka-GE"):"",o.status,o.tableNumber,(o.items||[]).map(i=>String(i.name)+" x"+String(i.quantity)).join("; "),Number(o.total||0).toFixed(2),o.paymentStatus==="paid"?"გადახდილია":"გადასახდელი",o.archived?"კი":"არა"])}
 const csv="\uFEFF"+rows.map(row=>row.map(quote).join(",")).join("\r\n");
 const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"})),a=document.createElement("a");a.href=url;a.download="menio-report-"+period+"-"+new Date().toISOString().slice(0,10)+".csv";document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url)
});
onAuthStateChanged(auth,async user=>{
 if(!user||user.isAnonymous||!slug){location.href="register.html#login";return}
 try{await requireOwner(slug);$("logout").onclick=async()=>{await signOut(auth);location.href="register.html#login"};listenOrders(slug,orders=>{allOrders=orders;$("reportStatus").textContent="მონაცემები განახლებულია ავტომატურად · "+orders.length+" შეკვეთა ისტორიაში";render()},e=>{$("reportStatus").textContent="ანგარიშის ჩატვირთვა ვერ მოხერხდა";const error=make("p","report-error",e.message);$("summaryText").replaceChildren(error)})}
 catch(e){$("reportStatus").textContent="წვდომის შეცდომა: "+e.message}
});