import {mountCouriers} from './courier-admin.js';
import {courierStore} from './courier-store.js';
import {auth,db,signInWithEmailAndPassword,onAuthStateChanged,signOut,collection,getDocs,doc,getDoc,setDoc,serverTimestamp} from "./firebase.js";
import {isPlatformAdmin} from "./app.js";
const $=id=>document.getElementById(id);
let checking=false, courierPanel=null;
const say=text=>{$("adminMessage").textContent=text};
function showLogin(message=""){courierPanel?.clear();$("loginPanel").hidden=false;$("adminPanel").hidden=true;if(message)say(message)}
function card(restaurant){
 const article=document.createElement("article");article.className="restaurant-card";
 const icon=document.createElement("div");icon.className="restaurant-icon";
 if(typeof restaurant.restaurantLogo==="string" && restaurant.restaurantLogo){
  const logo=document.createElement("img");logo.className="restaurant-logo-image";logo.src=restaurant.restaurantLogo;logo.alt=(restaurant.name||"რესტორნის ლოგო")+" — ლოგო";logo.loading="lazy";icon.append(logo);
 }else{icon.textContent=(restaurant.name||"R").trim().slice(0,1).toUpperCase();}
 const name=document.createElement("h2");name.textContent=restaurant.name||restaurant.slug;
 const slug=document.createElement("div");slug.className="slug";slug.textContent="/"+restaurant.slug;
 const meta=document.createElement("div");meta.className="restaurant-meta";
 const state=document.createElement("span");state.textContent=restaurant.active===false?"შეჩერებულია":"აქტიური";meta.append(state);
 const tables=document.createElement("span");tables.textContent="მაგიდები: "+Number(restaurant.tableCount||0);meta.append(tables);
 const actions=document.createElement("div");actions.className="restaurant-actions";
 const manage=document.createElement("a");manage.className="btn";manage.href="dashboard.html?restaurant="+encodeURIComponent(restaurant.slug);manage.textContent="მართვა ↗";
 const cashier=document.createElement("a");cashier.className="btn secondary";cashier.href="merchant.html?restaurant="+encodeURIComponent(restaurant.slug);cashier.textContent="შეკვეთები ↗";
 actions.append(manage,cashier);article.append(icon,name,slug,meta,actions);return article;
}
async function loadRestaurants(){
 $("adminStatus").textContent="რესტორნები იტვირთება…";$("restaurantGrid").replaceChildren();
 try{
  const snapshot=await getDocs(collection(db,"restaurants"));
  const list=snapshot.docs.map(d=>({...d.data(),slug:d.id})).sort((a,b)=>(a.name||a.slug).localeCompare(b.name||b.slug,"ka"));
  $("restaurantCount").textContent=String(list.length);$("activeCount").textContent=String(list.filter(r=>r.active!==false).length);
  if(!list.length){$("adminStatus").textContent="რესტორნები ჯერ არ არის რეგისტრირებული.";return}
  $("adminStatus").textContent="რესტორნები ჩაიტვირთა. აირჩიე ბარათი და გახსენი შესაბამისი პანელი.";
  for(const restaurant of list)$("restaurantGrid").append(card(restaurant));
 }catch(error){$("adminStatus").textContent="რესტორნების ჩატვირთვა ვერ მოხერხდა: "+(error.message||"უცნობი შეცდომა")}
}
async function handleUser(user){
 if(checking)return;checking=true;
 try{
  if(!user||user.isAnonymous){showLogin();return}
  if(!(await isPlatformAdmin(user))){await signOut(auth);showLogin("ამ ანგარიშს პლატფორმის ადმინისტრატორის უფლება არ აქვს.");return}
  $("loginPanel").hidden=true;$("adminPanel").hidden=false;
  $("adminLogout").onclick=async()=>{await signOut(auth);showLogin("ანგარიშიდან გამოხვედი.")};
    const selectSection=which=>{
   const couriers=which==='couriers';
   $('restaurantsSection').hidden=couriers;$('couriersSection').hidden=!couriers;
   $('restaurantsTab').setAttribute('aria-pressed',String(!couriers));$('couriersTab').setAttribute('aria-pressed',String(couriers));
   document.querySelector('.admin-title').textContent=couriers?'კურიერები':'რესტორნები';
   document.querySelector('#adminPanel .admin-sub').textContent=couriers?'გადახედე კურიერების განაცხადებს და მართე მათი დამტკიცება.':'აირჩიე რესტორანი და გახსენი მისი მართვის ან შეკვეთების პანელი.';
   if(couriers){if(!courierPanel)courierPanel=mountCouriers($('couriersSection'),courierStore);else courierPanel.reload();}
  };
  $('restaurantsTab').onclick=()=>selectSection('restaurants');$('couriersTab').onclick=()=>selectSection('couriers');$('courierShortcut').onclick=()=>selectSection('couriers');
  selectSection('restaurants');await loadRestaurants();
 }catch(error){showLogin("ვერ მოხერხდა შემოწმება: "+(error.message||"შეცდომა"))}
 finally{checking=false}
}
$("adminLoginForm").addEventListener("submit",async event=>{
 event.preventDefault();const button=$("adminLoginButton");button.disabled=true;say("შესვლა…");
 try{await signInWithEmailAndPassword(auth,$("adminEmail").value.trim(),$("adminPassword").value)}catch(error){say(error.code==="auth/invalid-credential"?"ელფოსტა ან პაროლი არასწორია.":error.message||"შესვლა ვერ მოხერხდა.")}
 finally{button.disabled=false}
});
onAuthStateChanged(auth,handleUser);

const pricingDialog=$('pricingDialog');
$('pricingOpen').onclick=async()=>{
 $('pricingStatus').textContent='ტარიფები იტვირთება…';
 pricingDialog.showModal();
 try{const snap=await getDoc(doc(db,'platformSettings','deliveryPricing'));const data=snap.exists()?snap.data():{};$('priceToCustomer').value=Number.isFinite(data.restaurantToCustomerPerKm)?data.restaurantToCustomerPerKm:2;$('priceToRestaurant').value=Number.isFinite(data.courierToRestaurantPerKm)?data.courierToRestaurantPerKm:1;$('priceMinimum').value=Number.isFinite(data.minimumCourierPay)?data.minimumCourierPay:0;$('pricingStatus').textContent='';}
 catch(e){$('pricingStatus').textContent='ჩატვირთვის შეცდომა: '+e.message;}
};
$('pricingClose').onclick=()=>pricingDialog.close();
$('pricingForm').onsubmit=async e=>{
 e.preventDefault();const toCustomer=Number($('priceToCustomer').value),toRestaurant=Number($('priceToRestaurant').value),minimum=Number($('priceMinimum').value);
 if(![toCustomer,toRestaurant,minimum].every(v=>Number.isFinite(v)&&v>=0&&v<=1000)){$('pricingStatus').textContent='მიუთითე სწორი ტარიფები (0–1000 ₾).';return;}
 const button=$('pricingSave');button.disabled=true;$('pricingStatus').textContent='ინახება…';
 try{await setDoc(doc(db,'platformSettings','deliveryPricing'),{restaurantToCustomerPerKm:toCustomer,courierToRestaurantPerKm:toRestaurant,minimumCourierPay:minimum,updatedAt:serverTimestamp(),updatedBy:auth.currentUser.uid});$('pricingStatus').textContent='ტარიფები შენახულია ✓';}
 catch(error){$('pricingStatus').textContent='შენახვის შეცდომა: '+error.message;}
 finally{button.disabled=false;}
};
