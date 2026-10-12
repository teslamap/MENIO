import{initializeApp}from"https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import{getAuth,createUserWithEmailAndPassword,signInWithEmailAndPassword,signOut,onAuthStateChanged,signInAnonymously}from"https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import{getFirestore,doc,getDoc,getDocs,setDoc,addDoc,collection,query,where,orderBy,onSnapshot,updateDoc,serverTimestamp,runTransaction}from"https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

const firebaseConfig={
  apiKey:"AIzaSyDghOTPxpYXBGijyZMJTL3SxTazB881YMo",
  authDomain:"menio-8de8f.firebaseapp.com",
  projectId:"menio-8de8f",
  storageBucket:"menio-8de8f.firebasestorage.app",
  messagingSenderId:"429553713786",
  appId:"1:429553713786:web:bf1325a209c917bd4db1c3",
  measurementId:"G-GYH32VBGTV"
};

const app=initializeApp(firebaseConfig);
export const auth=getAuth(app);
export const db=getFirestore(app);
export{createUserWithEmailAndPassword,signInWithEmailAndPassword,signOut,onAuthStateChanged,signInAnonymously,doc,getDoc,getDocs,setDoc,addDoc,collection,query,where,orderBy,onSnapshot,updateDoc,serverTimestamp,runTransaction};
