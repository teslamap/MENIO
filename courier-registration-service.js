import {auth,db,createUserWithEmailAndPassword,signInWithEmailAndPassword,doc,runTransaction,serverTimestamp} from './courier-firebase.js';

// Firebase Auth owns credentials; Firestore receives application data only.
export async function submitCourierApplication(details, password) {
  await auth.authStateReady();
  const email=details.email.trim().toLowerCase();
  let user;
  try {
    user=(await createUserWithEmailAndPassword(auth,email,password)).user;
  } catch(error) {
    if(error.code!=='auth/email-already-in-use')throw error;
    // Also resumes an account whose application failed to save on an earlier attempt.
    user=(await signInWithEmailAndPassword(auth,email,password)).user;
  }
  const application={uid:user.uid,name:details.name.trim(),email:user.email,
    phone:details.phone,city:details.city.trim(),vehicle:details.vehicle,plate:details.plate.trim(),
    status:'pending',createdAt:serverTimestamp()};
  return runTransaction(db,async transaction=>{
    const ref=doc(db,'courierApplications',user.uid),existing=await transaction.get(ref);
    if(existing.exists())return existing.data().status;
    transaction.set(ref,application);
    return 'pending';
  });
}
