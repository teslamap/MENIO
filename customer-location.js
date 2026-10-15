export function validDeliveryPoint(point){return point&&typeof point.latitude==='number'&&Number.isFinite(point.latitude)&&Math.abs(point.latitude)<=90&&typeof point.longitude==='number'&&Number.isFinite(point.longitude)&&Math.abs(point.longitude)<=180&&typeof point.accuracy==='number'&&Number.isFinite(point.accuracy)&&point.accuracy>=0&&point.accuracy<=100000;}
export function mountDeliveryLocation(){
 const $=id=>document.getElementById(id);if(!$('shareDeliveryLocation'))return null;
 let point=null,pending=null,requestId=0,capturedAt=0;
 const say=text=>{$('deliveryLocationStatus').textContent=text;};
 function clear(){requestId++;point=null;pending=null;$('withoutDeliveryLocation').checked=false;$('shareDeliveryLocation').disabled=false;say('გაგზავნისას მოგთხოვთ მდებარეობის გაზიარებას. კოორდინატები ამ შეკვეთას შეინახება კურიერისთვის.');}
 function request(){if(pending)return pending;point=null;$('withoutDeliveryLocation').checked=false;
 if(!navigator.geolocation){say('მდებარეობის დადგენა ამ მოწყობილობაზე მიუწვდომელია. შეგიძლია მონიშნო მისამართით გაგზავნა.');return Promise.resolve(null);}
 const id=++requestId;$('shareDeliveryLocation').disabled=true;say('მდებარეობას ვადგენ… ბრაუზერის მოთხოვნაზე აირჩიე დაშვება.');
 pending=new Promise(resolve=>{navigator.geolocation.getCurrentPosition(position=>{if(id!==requestId){resolve(null);return;}const p={latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy:position.coords.accuracy};point=validDeliveryPoint(p)?p:null;capturedAt=Date.now();say(point?'მდებარეობა მიღებულია · სიზუსტე დაახლოებით '+Math.round(point.accuracy)+' მ. '+(point.accuracy>200?'GPS-ის სიზუსტე დაბალია; გადაამოწმე მისამართი ან სცადე ხელახლა.':'გადაამოწმე, რომ მითითებული მისამართი სწორედ აქ არის.'):'მდებარეობა არასწორია. სცადე ხელახლა.');resolve(point);},error=>{if(id===requestId)say(error.code===1?'მდებარეობაზე უარი თქვი. ხელახლა სცადე ბრაუზერის ნებართვით, ან მონიშნე „მხოლოდ მისამართით გაგზავნა“.':'მდებარეობა ვერ განისაზღვრა. სცადე ხელახლა ან აირჩიე მხოლოდ მისამართით გაგზავნა.');resolve(null);},{enableHighAccuracy:true,timeout:15000,maximumAge:0});}).finally(()=>{if(id===requestId){pending=null;$('shareDeliveryLocation').disabled=false;}});
 return pending;
 }
 $('shareDeliveryLocation').onclick=()=>request();$('withoutDeliveryLocation').onchange=()=>{if($('withoutDeliveryLocation').checked){requestId++;point=null;pending=null;$('shareDeliveryLocation').disabled=false;say('შეკვეთა გაიგზავნება ტექსტური მისამართით. კურიერს GPS პინი არ ექნება.');}};
 clear();return {async ensure(){if($('withoutDeliveryLocation').checked)return {proceed:true,location:null};const location=(point&&Date.now()-capturedAt<60000)?point:await request();return {proceed:!!location,location};},clear};
}
