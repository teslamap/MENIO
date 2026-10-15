import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../courier-registration-service.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/,'const {auth,db,createUserWithEmailAndPassword,signInWithEmailAndPassword,doc,runTransaction,serverTimestamp}=globalThis.__courierTestDependencies;\n');
const details={name:' Test Courier ',email:' COURIER@example.com ',phone:'+995555123456',city:' თბილისი ',vehicle:'bicycle',plate:''};
let sequence=0;
async function setup({existing=null,createError=null,signInError=null,saveError=null}={}){
 const calls={created:[],signedIn:[],saved:[]};
 globalThis.__courierTestDependencies={auth:{authStateReady:async()=>{}},db:{},serverTimestamp:()=>'<server-time>',doc:(_db,collection,uid)=>({collection,uid}),
 async createUserWithEmailAndPassword(auth,email,password){calls.created.push({email,password});if(createError)throw createError;return {user:{uid:'new-user',email}};},
 async signInWithEmailAndPassword(auth,email,password){calls.signedIn.push({email,password});if(signInError)throw signInError;return {user:{uid:'existing-user',email}};},
 async runTransaction(db,fn){if(saveError)throw saveError;return fn({get:async()=>({exists:()=>!!existing,data:()=>existing}),set:(ref,data)=>calls.saved.push({ref,data})});}};
 const module=await import('data:text/javascript;base64,'+Buffer.from(source+'\n//'+sequence++).toString('base64'));
 return {...module,calls};
}
test('registration creates pending UID-keyed application without password',async()=>{const s=await setup();assert.equal(await s.submitCourierApplication(details,'secret123'),'pending');const {ref,data}=s.calls.saved[0];assert.equal(ref.collection,'courierApplications');assert.equal(ref.uid,'new-user');assert.equal(data.uid,'new-user');assert.equal(data.email,'courier@example.com');assert.equal(data.name,'Test Courier');assert.equal(data.createdAt,'<server-time>');assert.equal('password' in data,false);assert.equal('active' in data,false);assert.equal('role' in data,false);});
test('existing account resumes after failed application save',async()=>{const s=await setup({createError:{code:'auth/email-already-in-use'}});await s.submitCourierApplication(details,'secret123');assert.equal(s.calls.signedIn.length,1);assert.equal(s.calls.saved[0].ref.uid,'existing-user');});
test('existing reviewed application is returned without overwrite',async()=>{for(const status of ['pending','approved','rejected']){const s=await setup({existing:{status},createError:{code:'auth/email-already-in-use'}});assert.equal(await s.submitCourierApplication(details,'secret123'),status);assert.equal(s.calls.saved.length,0);}});
test('wrong existing password cannot submit application',async()=>{const error={code:'auth/invalid-credential'},s=await setup({createError:{code:'auth/email-already-in-use'},signInError:error});await assert.rejects(s.submitCourierApplication(details,'bad'),e=>e===error);assert.equal(s.calls.saved.length,0);});
test('network errors do not fall back to an unrelated signed-in account',async()=>{const error={code:'auth/network-request-failed'},s=await setup({createError:error});await assert.rejects(s.submitCourierApplication(details,'secret123'),e=>e===error);assert.equal(s.calls.signedIn.length,0);assert.equal(s.calls.saved.length,0);});
test('Firestore save failure remains visible for retry',async()=>{const error={code:'permission-denied'},s=await setup({saveError:error});await assert.rejects(s.submitCourierApplication(details,'secret123'),e=>e===error);assert.equal(s.calls.created.length,1);assert.equal(s.calls.saved.length,0);});
