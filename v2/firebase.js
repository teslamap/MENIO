import{initializeApp}from"https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import{initializeAuth,browserLocalPersistence,createUserWithEmailAndPassword,signInWithEmailAndPassword,signOut,onAuthStateChanged,signInAnonymously}from"https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import{getFirestore,deleteDoc,writeBatch,doc,getDoc,getDocs,setDoc,addDoc,collection,query,where,orderBy,onSnapshot,updateDoc,serverTimestamp,runTransaction}from"https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

const firebaseConfig={
  apiKey:"AIzaSyDghOTPxpYXBGijyZMJTL3SxTazB881YMo",
  authDomain:"menio-8de8f.firebaseapp.com",
  projectId:"menio-8de8f",
  messagingSenderId:"429553713786",
  appId:"1:429553713786:web:bf1325a209c917bd4db1c3",
  measurementId:"G-GYH32VBGTV"
};

const app=initializeApp(firebaseConfig);
export const auth=initializeAuth(app,{persistence:browserLocalPersistence});
export const db=getFirestore(app);
export {deleteDoc,writeBatch};
export{createUserWithEmailAndPassword,signInWithEmailAndPassword,signOut,onAuthStateChanged,signInAnonymously,doc,getDoc,getDocs,setDoc,addDoc,collection,query,where,orderBy,onSnapshot,updateDoc,serverTimestamp,runTransaction};


