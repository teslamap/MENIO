import {auth,db,collection,query,where,onSnapshot,onAuthStateChanged} from "./firebase.js";

const $=id=>document.getElementById(id);
let audioContext=null,soundEnabled=false,seenStatuses=new Map(),unsubscribe=null;
const button=$("orderSoundButton");
const status=$("orderSoundStatus");

function setStatus(text){if(status)status.textContent=text;}
function beep(){
  if(!soundEnabled||!audioContext)return;
  try{
    // Premium smartphone-style chime: warm, clear notes with a gentle bell-like shimmer.
    // Boosted envelope improves audibility, but the phone's media volume still applies.
    const now=audioContext.currentTime;
    const master=audioContext.createGain();
    master.gain.setValueAtTime(0.9,now);
    master.connect(audioContext.destination);
    const notes=[
      {at:0, freq:784, length:0.32, level:0.42},
      {at:0.16, freq:988, length:0.42, level:0.48},
      {at:0.36, freq:1175, length:0.55, level:0.42}
    ];
    for(const note of notes){
      const osc=audioContext.createOscillator();
      const env=audioContext.createGain();
      const shimmer=audioContext.createOscillator();
      const shimmerGain=audioContext.createGain();
      osc.type="sine";
      osc.frequency.setValueAtTime(note.freq,now+note.at);
      env.gain.setValueAtTime(0.0001,now+note.at);
      env.gain.exponentialRampToValueAtTime(note.level,now+note.at+0.018);
      env.gain.exponentialRampToValueAtTime(0.0001,now+note.at+note.length);
      osc.connect(env);env.connect(master);
      shimmer.type="sine";
      shimmer.frequency.setValueAtTime(note.freq*2.01,now+note.at);
      shimmerGain.gain.setValueAtTime(0.0001,now+note.at);
      shimmerGain.gain.exponentialRampToValueAtTime(0.075,now+note.at+0.015);
      shimmerGain.gain.exponentialRampToValueAtTime(0.0001,now+note.at+note.length*0.72);
      shimmer.connect(shimmerGain);shimmerGain.connect(master);
      osc.start(now+note.at);osc.stop(now+note.at+note.length+0.02);
      shimmer.start(now+note.at);shimmer.stop(now+note.at+note.length*0.75+0.02);
    }
    master.gain.setValueAtTime(0.9,now+1.05);
    master.gain.linearRampToValueAtTime(0.0001,now+1.18);
    setTimeout(()=>{try{master.disconnect();}catch{}},1500);
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

onAuthStateChanged(auth,user=>{
  // menu.js owns authentication and signs QR customers in anonymously.
  // Start listening only after that sign-in has completed.
  if(user)watchOrders(user);
});
window.addEventListener("pagehide",()=>unsubscribe?.());
