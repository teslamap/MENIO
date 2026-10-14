import {auth,db,collection,query,where,onSnapshot,onAuthStateChanged,signInAnonymously} from "./firebase.js";

const $=id=>document.getElementById(id);
let audioContext=null,soundEnabled=false,seenStatuses=new Map(),unsubscribe=null;
const button=$("orderSoundButton");
const status=$("orderSoundStatus");

function setStatus(text){if(status)status.textContent=text;}
function beep(){
  if(!soundEnabled||!audioContext)return;
  try{
    const now=audioContext.currentTime;
    [0,0.24,0.48].forEach((offset,index)=>{
      const oscillator=audioContext.createOscillator();
      const gain=audioContext.createGain();
      oscillator.type="sine";
      oscillator.frequency.value=index===1?1046:880;
      gain.gain.setValueAtTime(0.0001,now+offset);
      gain.gain.exponentialRampToValueAtTime(0.22,now+offset+0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001,now+offset+0.19);
      oscillator.connect(gain);gain.connect(audioContext.destination);
      oscillator.start(now+offset);oscillator.stop(now+offset+0.2);
    });
  }catch(e){console.warn("MENIO sound unavailable",e);}
}
async function enableSound(){
  try{
    const AudioContextClass=window.AudioContext||window.webkitAudioContext;
    if(!AudioContextClass){setStatus("ამ ბრაუზერში ხმა მიუწვდომელია.");return;}
    audioContext ||= new AudioContextClass();
    if(audioContext.state==="suspended")await audioContext.resume();
    soundEnabled=true;
    beep();
    setStatus("ხმა ჩართულია ✓");
    if("Notification" in window){
      if(Notification.permission==="default"){
        try{await Notification.requestPermission();}catch{}
      }
      if(Notification.permission==="granted")setStatus("ხმა და შეტყობინებები ჩართულია ✓");
      else setStatus("ხმა ჩართულია ✓ · შეტყობინებებისთვის ბრაუზერში ნებართვა ჩართე");
    }
    button?.classList.add("sound-enabled");
    button?.setAttribute("aria-pressed","true");
  }catch(e){setStatus("ხმის ჩართვა ვერ მოხერხდა. შეეხე ხელახლა.");}
}
button?.addEventListener("click",enableSound);

function notifyReady(order){
  beep();
  if("Notification" in window&&Notification.permission==="granted"){
    try{
      const notification=new Notification("MENIO — შეკვეთა მზადაა!",{
        body:"მაგიდა №"+(order.tableNumber||"—")+" · შეკვეთა #"+String(order.id||"").slice(-6).toUpperCase()+" მზადაა ასაღებად.",
        tag:"menio-ready-"+order.id,
        renotify:false
      });
      notification.onclick=()=>{window.focus();notification.close();};
    }catch(e){console.warn("MENIO notification unavailable",e);}
  }
  setStatus("🔔 შენი შეკვეთა მზადაა!");
}

function watchOrders(user){
  unsubscribe?.();seenStatuses.clear();
  const q=query(collection(db,"orders"),where("customerUid","==",user.uid));
  unsubscribe=onSnapshot(q,snapshot=>{
    for(const change of snapshot.docChanges()){
      const order={...change.doc.data(),id:change.doc.id};
      if(change.type==="added"){seenStatuses.set(order.id,order.status);continue;}
      if(change.type==="modified"){
        const previous=seenStatuses.get(order.id);
        seenStatuses.set(order.id,order.status);
        if(previous!=="completed"&&order.status==="completed")notifyReady(order);
      }
    }
  },error=>{console.warn("MENIO order notification listener",error);setStatus("შეკვეთების შეტყობინება ვერ ჩაიტვირთა.");});
}

onAuthStateChanged(auth,async user=>{
  if(!user){
    try{await signInAnonymously(auth);}catch(e){console.warn("MENIO anonymous sign-in failed",e);setStatus("შეტყობინებების ჩასართავად განაახლე გვერდი.");}
    return;
  }
  if(!user.isAnonymous){watchOrders(user);return;}
  watchOrders(user);
});
window.addEventListener("pagehide",()=>unsubscribe?.());
