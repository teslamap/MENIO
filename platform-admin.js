import {auth,db,signInWithEmailAndPassword,onAuthStateChanged,signOut,collection,getDocs} from "./firebase.js";
import {isPlatformAdmin} from "./app.js";
const $=id=>document.getElementById(id);
let checking=false;
const say=text=>{$("adminMessage").textContent=text};
function showLogin(message=""){$("loginPanel").hidden=false;$("adminPanel").hidden=true;if(message)say(message)}
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
  await loadRestaurants();
 }catch(error){showLogin("ვერ მოხერხდა შემოწმება: "+(error.message||"შეცდომა"))}
 finally{checking=false}
}
$("adminLoginForm").addEventListener("submit",async event=>{
 event.preventDefault();const button=$("adminLoginButton");button.disabled=true;say("შესვლა…");
 try{await signInWithEmailAndPassword(auth,$("adminEmail").value.trim(),$("adminPassword").value)}catch(error){say(error.code==="auth/invalid-credential"?"ელფოსტა ან პაროლი არასწორია.":error.message||"შესვლა ვერ მოხერხდა.")}
 finally{button.disabled=false}
});
onAuthStateChanged(auth,handleUser);
