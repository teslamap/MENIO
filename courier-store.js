import {auth,db,collection,getDocs,doc,runTransaction,serverTimestamp} from './firebase.js';
export const courierStore={
 async list(){const snapshot=await getDocs(collection(db,'courierApplications'));return snapshot.docs.map(d=>({...d.data(),id:d.id,createdAt:d.data().createdAt?.toMillis?.()||null,reviewedAt:d.data().reviewedAt?.toMillis?.()||null})).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));},
 async decide(id,status,reason){
  if(!auth.currentUser||!['approved','rejected'].includes(status))throw new Error('არასწორი მოთხოვნა.');
  if(status==='rejected'&&(!reason.trim()||reason.length>500))throw new Error('მიუთითე უარყოფის მიზეზი.');
  await runTransaction(db,async tx=>{
   const ref=doc(db,'courierApplications',id),snap=await tx.get(ref);
   if(!snap.exists()||snap.data().status!=='pending')throw new Error('განაცხადი უკვე განხილულია. განაახლე სია.');
   const a=snap.data();
   if(status==='approved'){
    if(!a.uid||a.uid!==id)throw new Error('განაცხადს არ აქვს დადასტურებული ანგარიშის იდენტიფიკატორი.');
    const profileRef=doc(db,'courierProfiles',a.uid),profile=await tx.get(profileRef);
    if(profile.exists())throw new Error('კურიერის პროფილი უკვე არსებობს.');
    tx.set(profileRef,{name:a.name,phone:a.phone,email:a.email,city:a.city,vehicle:a.vehicle,plate:a.plate||'',role:'courier',active:true,createdAt:serverTimestamp(),approvedBy:auth.currentUser.uid});
   }
   tx.update(ref,{status,rejectionReason:status==='rejected'?reason.trim():'',reviewedAt:serverTimestamp(),reviewedBy:auth.currentUser.uid});
  });
 }
};
