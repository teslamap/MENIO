import {auth,db,signInWithEmailAndPassword,doc,getDoc} from './courier-firebase.js';
const $=id=>document.getElementById(id);
$('courierLoginForm').addEventListener('submit',async event=>{
 event.preventDefault();const button=$('courierLoginButton');if(button.disabled)return;button.disabled=true;$('courierLoginMessage').textContent='შესვლა…';
 try{
  await auth.authStateReady();
  const {user}=await signInWithEmailAndPassword(auth,$('courierEmail').value.trim(),$('courierPassword').value);
  $('courierPassword').value='';
  const profile=await getDoc(doc(db,'courierProfiles',user.uid));
  if(profile.exists()&&profile.data().role==='courier'&&profile.data().active===true){location.href='courier.html';return;}
  const application=await getDoc(doc(db,'courierApplications',user.uid));
  const status=application.exists()?application.data().status:null;
  $('courierLoginMessage').textContent=profile.exists()?'კურიერის პროფილი შეჩერებულია. დაუკავშირდი ORDERA-ს ადმინისტრატორს.':status==='pending'?'შესვლა წარმატებულია. შენი განაცხადი განხილვის მოლოდინშია. დამტკიცების შემდეგ აქედან კურიერის პანელში შეხვალ.':status==='rejected'?'შენი განაცხადი უარყოფილია. მიზეზი: '+(application.data().rejectionReason||'დამატებითი ინფორმაციისთვის დაუკავშირდი ადმინისტრატორს.'):status==='approved'?'განაცხადი დამტკიცებულია, მაგრამ აქტიური კურიერის პროფილი ვერ მოიძებნა. დაუკავშირდი ადმინისტრატორს.':'ამ ანგარიშზე კურიერის განაცხადი არ მოიძებნა. შეავსე კურიერად რეგისტრაციის ფორმა ქვემოთ მოცემული ბმულით.';
 }catch(error){$('courierLoginMessage').textContent=({'auth/invalid-credential':'ელფოსტა ან პაროლი არასწორია.','auth/too-many-requests':'ძალიან ბევრი მცდელობაა. სცადე მოგვიანებით.','auth/network-request-failed':'კავშირი ვერ დამყარდა. სცადე ხელახლა.','permission-denied':'კურიერის მონაცემებზე წვდომა ვერ დადასტურდა. დაუკავშირდი ადმინისტრატორს.'})[error.code]||'შესვლა ვერ მოხერხდა. სცადე ხელახლა.';}
 finally{button.disabled=false;}
});
