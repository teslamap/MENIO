/* MENIO Firebase Cloud Messaging service worker.
   Requires the Firebase Web Push certificate key from Firebase Console. */
importScripts("https://www.gstatic.com/firebasejs/12.4.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.4.0/firebase-messaging-compat.js");
firebase.initializeApp({
  apiKey: "AIzaSyDghOTPxpYXBGijyZMJTL3SxTazB881YMo",
  authDomain: "menio-8de8f.firebaseapp.com",
  projectId: "menio-8de8f",
  messagingSenderId: "429553713786",
  appId: "1:429553713786:web:bf1325a209c917bd4db1c3"
});
const messaging=firebase.messaging();
messaging.onBackgroundMessage(payload=>{
  const data=payload.data||{};
  const title=payload.notification?.title||data.title||"MENIO — შეკვეთა მზადაა!";
  const options={
    body:payload.notification?.body||data.body||"შენი შეკვეთა მზადაა ასაღებად.",
    icon:"/MENIO/v2/icon-192.png",
    badge:"/MENIO/v2/icon-192.png",
    tag:data.orderId?"menio-ready-"+data.orderId:"menio-order-ready",
    renotify:true,
    data:{url:data.url||"/MENIO/v2/menu.html"}
  };
  self.registration.showNotification(title,options);
});
self.addEventListener("notificationclick",event=>{
  event.notification.close();
  const url=new URL(event.notification.data?.url||"/MENIO/v2/menu.html",self.location.origin).href;
  event.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(windows=>{
    for(const client of windows){if("focus" in client)return client.focus();}
    return clients.openWindow(url);
  }));
});
