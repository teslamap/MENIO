import {
  auth,db,createUserWithEmailAndPassword,signInWithEmailAndPassword,signOut,onAuthStateChanged,
  doc,getDoc,getDocs,collection,query,where,orderBy,onSnapshot,runTransaction,serverTimestamp
} from "./firebase.js";
const $=id=>document.getElementById(id);
const msg=text=>{ if($("message")) $("message").textContent=text; };
const ka={ა:"a",ბ:"b",გ:"g",დ:"d",ე:"e",ვ:"v",ზ:"z",თ:"t",ი:"i",კ:"k",ლ:"l",მ:"m",ნ:"n",ო:"o",პ:"p",ჟ:"zh",რ:"r",ს:"s",ტ:"t",უ:"u",ფ:"p",ქ:"k",ღ:"gh",ყ:"q",შ:"sh",ჩ:"ch",ც:"ts",ძ:"dz",წ:"ts",ჭ:"ch",ხ:"kh",ჯ:"j",ჰ:"h"};
const slugify=value=>value.toLowerCase().split("").map(c=>ka[c]??c).join("").trim().replace(/[^a-z0-9-]/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"");
const friendlyError=error=>({
  "auth/email-already-in-use":"ეს ელფოსტა უკვე რეგისტრირებულია. შედი ქვემოთ; თუ რესტორნი არ შექმნილა, რეგისტრაციის დასრულებას შეძლებ.",
  "auth/invalid-credential":"ელფოსტა ან პაროლი არასწორია.",
  "auth/weak-password":"პაროლი უნდა შეიცავდეს მინიმუმ 8 სიმბოლოს.",
  "auth/too-many-requests":"ძალიან ბევრი მცდელობაა. სცადე მოგვიანებით.",
  "permission-denied":"Firestore-ის წესები საიტს არ ემთხვევა. Firebase Console-ში Firestore Database → Rules გახსენი და რეპოზიტორიაში არსებული firestore.rules გამოაქვეყნე, შემდეგ თავიდან შედი.",
  "unavailable":"კავშირი დროებით მიუწვდომელია. სცადე ხელახლა."
})[error.code] || error.message;
let authReady=Promise.resolve();
if($("registerForm")) {
  authReady=new Promise(resolve => {
    const stop=onAuthStateChanged(auth,user=>{
      stop();
      if(user && !user.isAnonymous) $("email").value=user.email || "";
      resolve();
    });
  });
  $("restaurantName").addEventListener("input",()=>{
    if(!$("restaurantSlug").dataset.edited) $("restaurantSlug").value=slugify($("restaurantName").value);
  });
  $("restaurantSlug").addEventListener("input",event=>{ event.target.dataset.edited="1"; });
  $("registerForm").addEventListener("submit",async event=>{
    event.preventDefault();
    const button=event.submitter || $("registerButton"); button.disabled=true;
    try {
      await authReady;
      const name=$("restaurantName").value.trim(),slug=slugify($("restaurantSlug").value),
        email=$("email").value.trim(),password=$("password").value,count=Number($("tableCount").value);
      if(!name || !/^[a-z0-9-]{3,40}$/.test(slug) || !Number.isInteger(count) || count<1 || count>200)
        throw Error("შეამოწმე სახელი, ბმული (3–40 ლათინური სიმბოლო) და მაგიდების რაოდენობა (1–200).");
      const restaurantRef=doc(db,"restaurants",slug),ownerRef=doc(db,"restaurantOwners",slug);
      if((await getDoc(restaurantRef)).exists()) throw Error("ეს მისამართი დაკავებულია. აირჩიე სხვა ბმული.");
      let user;
      if(auth.currentUser && !auth.currentUser.isAnonymous &&
        auth.currentUser.email?.toLowerCase()===email.toLowerCase()) {
        // Re-authenticate before resuming an incomplete restaurant registration.
        user=(await signInWithEmailAndPassword(auth,email,password)).user;
      } else {
        try {
          user=(await createUserWithEmailAndPassword(auth,email,password)).user;
        } catch(error) {
          if(error.code!=="auth/email-already-in-use") throw error;
          // If an earlier attempt created this account but not its restaurant,
          // sign into it with the submitted password and resume setup.
          user=(await signInWithEmailAndPassword(auth,email,password)).user;
        }
      }
      await runTransaction(db,async tx=>{
        const existing=await tx.get(restaurantRef);
        if(existing.exists()) throw Error("ეს მისამართი დაკავებულია. აირჩიე სხვა ბმული.");
        const owner=await tx.get(ownerRef);
        if(owner.exists()) throw Error("ეს მისამართი დაკავებულია. აირჩიე სხვა ბმული.");
        tx.set(restaurantRef,{name,slug,tableCount:count,nextTableNumber:count+1,active:true,createdAt:serverTimestamp()});
        tx.set(ownerRef,{ownerUid:user.uid,createdAt:serverTimestamp()});
        for(let number=1;number<=count;number++) tx.set(doc(db,"restaurants",slug,"tables",String(number)),
          {number,active:true,label:"მაგიდა "+number});
      });
      location.href="dashboard.html?restaurant="+encodeURIComponent(slug);
    } catch(error) { msg(friendlyError(error)); }
    finally { button.disabled=false; }
  });
}
if($("loginForm")) $("loginForm").addEventListener("submit",async event=>{
  event.preventDefault(); const button=event.submitter || $("loginButton"); button.disabled=true;
  try {
    await authReady;
    const credential=await signInWithEmailAndPassword(auth,$("loginEmail").value.trim(),$("loginPassword").value);
    const owners=await getDocs(query(collection(db,"restaurantOwners"),where("ownerUid","==",credential.user.uid)));
    if(owners.empty) {
      $("email").value=credential.user.email || "";
      // Do not copy the password into the registration form.
      $("password").value="";
      msg("ამ ელფოსტით ანგარიში არსებობს, მაგრამ მასთან დაკავშირებული რესტორანი ვერ მოიძებნა. თუ რეგისტრაცია ადრე შეწყდა, შეავსე რესტორნის მონაცემები და იგივე ელფოსტით გააგრძელე.");
      const dialog=$("registerDialog");
      if(dialog && !dialog.open) dialog.showModal();
      $("restaurantName").focus();
      return;
    }
    const returnTo=new URLSearchParams(location.search).get("returnTo");
    const requestedRestaurant=new URLSearchParams(location.search).get("restaurant");
    const merchantReturn=returnTo==="merchant";
    if(owners.size===1) {
      const ownerSlug=owners.docs[0].id;
      location.href=merchantReturn
        ? "merchant.html?restaurant="+encodeURIComponent(owners.docs.some(item=>item.id===requestedRestaurant)?requestedRestaurant:ownerSlug)
        : "dashboard.html?restaurant="+encodeURIComponent(ownerSlug);
    } else {
      const list=$("restaurantChoices"); list.replaceChildren();
      for(const owner of owners.docs) {
        const restaurant=await getDoc(doc(db,"restaurants",owner.id));
        const link=document.createElement("a"); link.className="btn secondary";
        link.href=(merchantReturn?"merchant.html":"dashboard.html")+"?restaurant="+encodeURIComponent(owner.id);
        link.textContent=restaurant.exists() ? restaurant.data().name : owner.id;
        list.append(link);
      }
      list.hidden=false; msg("აირჩიე რესტორანი.");
    }
  } catch(error) { msg(friendlyError(error)); }
  finally { button.disabled=false; }
});
export async function isPlatformAdmin(user=auth.currentUser) {
  if(!user || user.isAnonymous) return false;
  const admin=await getDoc(doc(db,"platformAdmins",user.uid));
  return admin.exists() && admin.data().role==="superadmin";
}
export async function requireOwner(slug) {
  if(!auth.currentUser || auth.currentUser.isAnonymous) throw Error("შესასვლელად გაიარე ავტორიზაცია.");
  if(!(await isPlatformAdmin())) {
    const owner=await getDoc(doc(db,"restaurantOwners",slug));
    if(!owner.exists() || owner.data().ownerUid!==auth.currentUser.uid) throw Error("ამ რესტორანზე წვდომა არ გაქვს.");
  }
  const restaurant=await getDoc(doc(db,"restaurants",slug));
  if(!restaurant.exists()) throw Error("რესტორანი ვერ მოიძებნა.");
  return restaurant.data();
}
export function listenOrders(slug,callback,error=console.error) {
  return onSnapshot(query(collection(db,"orders"),where("restaurantSlug","==",slug),orderBy("createdAt","desc")),
    snapshot=>callback(snapshot.docs.map(record=>({...record.data(),id:record.id}))),error);
}
export {auth,db,signOut,doc,getDoc,collection,serverTimestamp};

