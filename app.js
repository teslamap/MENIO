import{auth,db,createUserWithEmailAndPassword,signInWithEmailAndPassword,signOut,doc,getDoc,getDocs,collection,query,where,orderBy,onSnapshot,runTransaction,serverTimestamp}from"./firebase.js";
const $=id=>document.getElementById(id);
const msg=t=>{if($("message"))$("message").textContent=t};
const ka={ა:"a",ბ:"b",გ:"g",დ:"d",ე:"e",ვ:"v",ზ:"z",თ:"t",ი:"i",კ:"k",ლ:"l",მ:"m",ნ:"n",ო:"o",პ:"p",ჟ:"zh",რ:"r",ს:"s",ტ:"t",უ:"u",ფ:"p",ქ:"k",ღ:"gh",ყ:"q",შ:"sh",ჩ:"ch",ც:"ts",ძ:"dz",წ:"ts",ჭ:"ch",ხ:"kh",ჯ:"j",ჰ:"h"};
const slugify=s=>s.toLowerCase().split("").map(c=>ka[c]??c).join("").trim().replace(/[^a-z0-9-]/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"");
if($("registerForm")){
  $("restaurantName").addEventListener("input",()=>{if(!$("restaurantSlug").dataset.edited)$("restaurantSlug").value=slugify($("restaurantName").value)});
  $("restaurantSlug").addEventListener("input",e=>{e.target.dataset.edited="1";e.target.value=slugify(e.target.value)});
  $("registerForm").addEventListener("submit",async e=>{
    e.preventDefault();
    const name=$("restaurantName").value.trim(),slug=slugify($("restaurantSlug").value),email=$("email").value.trim(),password=$("password").value,count=Number($("tableCount").value),btn=e.submitter;
    if(!/^[a-z0-9-]{3,40}$/.test(slug)||!Number.isInteger(count)||count<1||count>200)return msg("შეამოწმე უნიკალური ბმული (3–40 ლათინური სიმბოლო) და მაგიდების რაოდენობა (1–200).");
    btn.disabled=true;
    try{
      const credential=await createUserWithEmailAndPassword(auth,email,password),restaurantRef=doc(db,"restaurants",slug),ownerRef=doc(db,"restaurantOwners",slug);
      await runTransaction(db,async tx=>{
        const restaurantSnap=await tx.get(restaurantRef),ownerSnap=await tx.get(ownerRef);
        if(restaurantSnap.exists()||ownerSnap.exists())throw Error("ეს მისამართი უკვე დაკავებულია.");
        tx.set(restaurantRef,{name,slug,tableCount:count,active:true,createdAt:serverTimestamp()});
        tx.set(ownerRef,{ownerUid:credential.user.uid,createdAt:serverTimestamp()});
        for(let n=1;n<=count;n++)tx.set(doc(db,"restaurants",slug,"tables",String(n)),{number:n,active:true,label:"მაგიდა "+n});
        if($("seedMenu")?.checked){
          const sampleMenu=[
            {name:"აჭარული ხაჭაპური",description:"ტრადიციული აჭარული ხაჭაპური ყველითა და კვერცხით",price:18.5,category:"ცომეული"},
            {name:"იმერული ხაჭაპური",description:"იმერული ყველით გამომცხვარი ხაჭაპური",price:16,category:"ცომეული"},
            {name:"ხინკალი ქალაქური",description:"წვნიანი ხინკალი საქონლისა და ღორის ხორცით",price:1.8,category:"ქართული"},
            {name:"ცეზარის სალათი",description:"ქათამი, სალათის ფოთოლი, პარმეზანი და ცეზარის სოუსი",price:17,category:"სალათი"},
            {name:"ქათმის ბურგერი",description:"ქათმის ფილე, სალათის ფოთოლი, პომიდორი და სოუსი",price:19,category:"ბურგერი"},
            {name:"კარტოფილი ფრი",description:"ხრაშუნა კარტოფილი ფრი",price:7,category:"გარნირი"},
            {name:"ლიმონათი",description:"კლასიკური ქართული ლიმონათი 0.5 ლ",price:4.5,category:"სასმელი"},
            {name:"წყალი",description:"წყალი 0.5 ლ",price:2,category:"სასმელი"}
          ];
          for(const dish of sampleMenu)tx.set(doc(db,"restaurants",slug,"menu",slug+"-"+slugify(dish.name)),{...dish,active:true,createdAt:serverTimestamp(),demo:true});
        }
      });
      location.href="business.html?restaurant="+encodeURIComponent(slug);
    }catch(err){msg(err.message);btn.disabled=false}
  });
}
if($("loginForm"))$("loginForm").addEventListener("submit",async e=>{
  e.preventDefault();const btn=e.submitter;btn.disabled=true;
  try{
    await signInWithEmailAndPassword(auth,$("loginEmail").value.trim(),$("loginPassword").value);
    const owners=await getDocs(query(collection(db,"restaurantOwners"),where("ownerUid","==",auth.currentUser.uid)));
    if(owners.empty)throw Error("რესტორანი ვერ მოიძებნა");
    location.href="business.html?restaurant="+encodeURIComponent(owners.docs[0].id);
  }catch(err){msg("შესვლა ვერ მოხერხდა: "+err.message);btn.disabled=false}
});
export async function requireOwner(slug){
  if(!auth.currentUser)throw Error("შესასვლელად გაიარე ავტორიზაცია");
  const owner=await getDoc(doc(db,"restaurantOwners",slug));
  if(!owner.exists()||owner.data().ownerUid!==auth.currentUser.uid)throw Error("ამ რესტორანზე წვდომა არ გაქვს");
  const restaurant=await getDoc(doc(db,"restaurants",slug));
  if(!restaurant.exists())throw Error("რესტორანი ვერ მოიძებნა");
  return restaurant.data();
}
export function listenOrders(slug,cb,err=console.error){return onSnapshot(query(collection(db,"orders"),where("restaurantSlug","==",slug),orderBy("createdAt","desc")),s=>cb(s.docs.map(d=>({id:d.id,...d.data()}))),err)}
export{auth,db,signOut,doc,getDoc,collection,serverTimestamp};