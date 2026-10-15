import {initializeApp} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js';
import {initializeAuth,browserLocalPersistence} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js';
import {getFirestore} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import {firebaseConfig} from './firebase.js?v=20261015-courier-config-2';

// Same Firebase users and rules, independent persisted courier session.
const courierApp=initializeApp(firebaseConfig,'ordera-courier');
export const auth=initializeAuth(courierApp,{persistence:browserLocalPersistence});
export const db=getFirestore(courierApp);
export {createUserWithEmailAndPassword,signInWithEmailAndPassword,signOut,onAuthStateChanged,doc,getDoc,collection,query,where,onSnapshot,updateDoc,serverTimestamp,runTransaction} from './firebase.js?v=20261015-courier-config-2';
