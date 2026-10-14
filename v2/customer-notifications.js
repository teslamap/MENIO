import {auth,db,collection,query,where,onSnapshot,onAuthStateChanged} from "./firebase.js";
import {getMessaging,getToken} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-messaging.js";
import {initializeApp,getApps} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";

// Paste the Web Push certificate key from Firebase Console > Project settings > Cloud Messaging.
const VAPID_PUBLIC_KEY = "";
let audioContext=null,soundEnabled=false,seenStatuses=new Map(),unsubscribe=null,repeatTimer=null,readyDialog=null,permissionPrompt=null,enableResolver=null,pushToken=null;
const $=id=>document.getElementById(id),status=$("orderSoundStatus");
function setStatus(text){if(status)status.textContent=text;}
function ensureDialog(){
 if(readyDialog)return readyDialog;
 readyDialog=document.createElement("dialog");
 readyDialog.style.cssText="border:0;border-radius:22px;padding:28px;max-width:360px;width:calc(100% - 40px);box-shadow:0 24px 80px #0005;text-align:center;font-family:inherit;color:#191919;background:#fff";
 readyDialog.innerHTML='<div style="font-size:42px;margin-bottom:8px">🔔</div><h2 style="margin:0 0 10px">შეკვეთა მზადაა!</h2><p id="menioReadyMessage" style="line-height:1.5;margin:0 0 22px">შენი შეკვეთა მზადაა ასაღებად.</p><button id="menioReadyAck" type="button" style="width:100%;border:0;border-radius:12px;padding:14px 18px;background:#f97316;color:white;font-weight:700;font-size:16px;cursor:pointer">გასაგებია ✓</button>';
 readyDialog.addEventListener("cancel",e=>e.preventDefault());
 readyDialog.addEventListener("click",e=>{if(e.target===readyDialog)e.preventDefault();});
 readyDialog.querySelector("#menioReadyAck").addEventListener("click",()=>{stopRepeating();readyDialog.close();setStatus("შეკვეთის მზადყოფნა დადასტურებულია ✓");});
 document.body.append(readyDialog);return readyDialog;
}
function resolveEnable(value){if(permissionPrompt?.open)permissionPrompt.close();if(enableResolver){const resolve=enableResolver;enableResolver=null;resolve(value);}}
function ensurePermissionPrompt(){
 if(permissionPrompt)return permissionPrompt;
 permissionPrompt=document.createElement("dialog");
 permissionPrompt.style.cssText="border:0;border-radius:22px;padding:26px;max-width:380px;width:calc(100% - 40px);box-shadow:0 24px 80px #0005;font-family:inherit;color:#191919;background:#fff";
 permissionPrompt.innerHTML='<div style="font-size:36px;text-align:center">🔔</div><h2 style="margin:8px 0 10px;text-align:center">ჩართე შეკვეთის ხმა</h2><p style="line-height:1.55">შეკვეთის გასაგზავნად ჩართე ხმოვანი შეტყობინება. როცა შეკვეთა მზად იქნება, ხმა განმეორდება მანამ, სანამ „გასაგებია“-ს არ დააჭერ.</p><button id="menioEnableSound" type="button" style="width:100%;border:0;border-radius:12px;padding:14px;background:#f97316;color:white;font-weight:700;font-size:16px;cursor:pointer">ხმის ჩართვა და გაგრძელება</button><button id="menioCancelSound" type="button" style="width:100%;border:1px solid #ddd;border-radius:12px;padding:12px;background:white;margin-top:8px;cursor:pointer">გაუქმება</button>';
 permissionPrompt.addEventListener("cancel",e=>{e.preventDefault();resolveEnable(false);});
 permissionPrompt.querySelector("#menioEnableSound").addEventListener("click",activateSound);
 permissionPrompt.querySelector("#menioCancelSound").addEventListener("click",()=>resolveEnable(false));
 document.body.append(permissionPrompt);return permissionPrompt;
}
async function activateSound(){
 try{
  const C=window.AudioContext||window.webkitAudioContext;
  if(!C){setStatus("ამ ბრაუზერში ხმა მიუწვდომელია.");resolveEnable(false);return;}
  audioContext ||= new C();if(audioContext.state==="suspended")await audioContext.resume();
  soundEnabled=audioContext.state==="running";if(!soundEnabled){resolveEnable(false);return;}
  playChime();
  if("Notification" in window&&Notification.permission==="default"){try{await Notification.requestPermission();}catch{}}
  setStatus("შეკვეთის ხმა ჩართულია ✓");resolveEnable(true);
 }catch(e){setStatus("ხმის ჩართვა ვერ მოხერხდა. სცადე ხელახლა.");resolveEnable(false);}
}
function ensureEnabled(){
 if(soundEnabled&&audioContext?.state==="running")return Promise.resolve(true);
 ensurePermissionPrompt();
 return new Promise(resolve=>{enableResolver=resolve;if(!permissionPrompt.open)permissionPrompt.showModal();});
}

async function setupPush(){
  if(!("Notification" in window)||Notification.permission!=="granted"||!("serviceWorker" in navigator)||!VAPID_PUBLIC_KEY)return null;
  try{
    const registration=await navigator.serviceWorker.register(new URL("../firebase-messaging-sw.js",import.meta.url),{scope:"../"});
    const app=getApps()[0]||initializeApp({apiKey:"AIzaSyDghOTPxpYXBGijyZMJTL3SxTazB881YMo",authDomain:"menio-8de8f.firebaseapp.com",projectId:"menio-8de8f",messagingSenderId:"429553713786",appId:"1:429553713786:web:bf1325a209c917bd4db1c3"});
    const messaging=getMessaging(app);
    pushToken=await getToken(messaging,{vapidKey:VAPID_PUBLIC_KEY,serviceWorkerRegistration:registration});
    return pushToken||null;
  }catch(error){console.warn("MENIO Push setup failed",error);return null;}
}
\nfunction playChime(){
 if(!soundEnabled||!audioContext||audioContext.state!=="running")return;
 try{
  const now=audioContext.currentTime,master=audioContext.createGain();master.gain.setValueAtTime(0.95,now);master.connect(audioContext.destination);
  const notes=[{at:0,freq:784,length:.32,level:.48},{at:.16,freq:988,length:.42,level:.52},{at:.36,freq:1175,length:.55,level:.48}];
  for(const n of notes){
   const osc=audioContext.createOscillator(),env=audioContext.createGain(),shimmer=audioContext.createOscillator(),sg=audioContext.createGain();
   osc.type="sine";osc.frequency.setValueAtTime(n.freq,now+n.at);env.gain.setValueAtTime(.0001,now+n.at);env.gain.exponentialRampToValueAtTime(n.level,now+n.at+.018);env.gain.exponentialRampToValueAtTime(.0001,now+n.at+n.length);osc.connect(env);env.connect(master);
   shimmer.type="sine";shimmer.frequency.setValueAtTime(n.freq*2.01,now+n.at);sg.gain.setValueAtTime(.0001,now+n.at);sg.gain.exponentialRampToValueAtTime(.085,now+n.at+.015);sg.gain.exponentialRampToValueAtTime(.0001,now+n.at+n.length*.72);shimmer.connect(sg);sg.connect(master);
   osc.start(now+n.at);osc.stop(now+n.at+n.length+.02);shimmer.start(now+n.at);shimmer.stop(now+n.at+n.length*.75+.02);
  }
  master.gain.setValueAtTime(.95,now+1.05);master.gain.linearRampToValueAtTime(.0001,now+1.18);window.setTimeout(()=>{try{master.disconnect();}catch{}},1500);
 }catch(e){console.warn("MENIO sound unavailable",e);}
}
function stopRepeating(){if(repeatTimer){clearInterval(repeatTimer);repeatTimer=null;}}
function notifyReady(order){
 const dialog=ensureDialog(),tableNo=order.tableNumber||"—";
 dialog.querySelector("#menioReadyMessage").textContent="მაგიდა №"+tableNo+" · შეკვეთა #"+String(order.id||"").slice(-6).toUpperCase()+" მზადაა ასაღებად.";
 if(!dialog.open)dialog.showModal();stopRepeating();playChime();repeatTimer=window.setInterval(playChime,1500);
 if("Notification" in window&&Notification.permission==="granted"){try{new Notification("MENIO — შეკვეთა მზადაა!",{body:"მაგიდა №"+tableNo+" — შეკვეთა მზადაა ასაღებად.",tag:"menio-ready-"+order.id,renotify:false});}catch(e){console.warn(e);}}
 setStatus("🔔 შეკვეთა მზადაა — დააჭირე „გასაგებია“-ს ხმის გასაჩერებლად.");
}
function watchOrders(user){
 unsubscribe?.();seenStatuses.clear();
 unsubscribe=onSnapshot(query(collection(db,"orders"),where("customerUid","==",user.uid)),snapshot=>{
  for(const change of snapshot.docChanges()){
   const order={...change.doc.data(),id:change.doc.id};
   if(change.type==="added"){seenStatuses.set(order.id,order.status);continue;}
   if(change.type==="modified"){const previous=seenStatuses.get(order.id);seenStatuses.set(order.id,order.status);if(previous!=="completed"&&order.status==="completed"&&soundEnabled)notifyReady(order);}
  }
 },error=>{console.warn("MENIO order notification listener",error);setStatus("შეკვეთების შეტყობინება ვერ ჩაიტვირთა.");});
}
onAuthStateChanged(auth,user=>{if(user)watchOrders(user);});
window.MENIOSound={ensureEnabled,isEnabled:()=>soundEnabled,getPushToken:()=>pushToken};
window.addEventListener("pagehide",()=>{stopRepeating();unsubscribe?.();});
