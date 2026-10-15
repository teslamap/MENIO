export function mountCouriers(root, store) {
 const labels={pending:'განხილვის მოლოდინში',approved:'დამტკიცებული',rejected:'უარყოფილი'};
 const vehicles={bicycle:'ველოსიპედი',ebike:'ელექტროველოსიპედი',scooter:'მოპედი / მოტოციკლი',car:'ავტომობილი',walking:'ფეხით'};
 let items=[], selected=null, busy=false, filter='pending', search='';
 root.innerHTML=`<div class="courier-heading"><div><h2>კურიერები</h2><p>რეგისტრაციის განაცხადები და მათი განხილვა</p></div><button type="button" id="courierRefresh">განახლება ↻</button></div><div id="courierCounts" class="courier-counts"></div><div class="courier-tools"><label>სტატუსი<select id="courierFilter"><option value="pending">მოლოდინში</option><option value="approved">დამტკიცებული</option><option value="rejected">უარყოფილი</option><option value="all">ყველა</option></select></label><label>მოძებნე<input id="courierSearch" type="search" placeholder="სახელი, ტელეფონი ან ქალაქი"></label></div><p id="courierStatus" role="status" aria-live="polite"></p><div class="courier-layout"><div id="courierList"></div><section id="courierDetail" class="courier-detail" aria-label="განაცხადის დეტალები"></section></div>`;
 const $=id=>root.querySelector('#'+id);
 const text=(tag,value,cls)=>{const e=document.createElement(tag);e.textContent=value;if(cls)e.className=cls;return e;};
 function render(){
  $('courierCounts').replaceChildren(...Object.entries(labels).map(([key,label])=>text('span',`${label}: ${items.filter(a=>a.status===key).length}`)));
  const visible=items.filter(a=>(filter==='all'||a.status===filter)&&[a.name,a.email,a.phone,a.city].join(' ').toLocaleLowerCase().includes(search));
  $('courierList').replaceChildren();
  if(!visible.length)$('courierList').append(text('p','ამ ფილტრით განაცხადები არ მოიძებნა.'));
  for(const a of visible){const b=text('button','', 'courier-row');b.type='button';b.setAttribute('aria-pressed',String(selected===a.id));b.append(text('strong',a.name),text('span',`${a.city} · ${vehicles[a.vehicle]||a.vehicle}`),text('small',labels[a.status]||a.status));b.onclick=()=>{selected=a.id;render();};$('courierList').append(b);}
  const detail=$('courierDetail');detail.replaceChildren();const a=items.find(a=>a.id===selected);
  if(!a){detail.append(text('p','დეტალების სანახავად აირჩიე განაცხადი.'));return;}
  detail.append(text('h3',a.name),text('span',labels[a.status]||a.status,'courier-badge'));
  const dl=document.createElement('dl');
  for(const [label,value]of [['ელფოსტა',a.email],['ტელეფონი',a.phone],['ქალაქი',a.city],['ტრანსპორტი',vehicles[a.vehicle]||a.vehicle],['სახელმწიფო ნომერი',a.plate||'—'],['განაცხადის თარიღი',a.createdAt?new Date(a.createdAt).toLocaleString('ka-GE'):'—'],['განხილვის თარიღი',a.reviewedAt?new Date(a.reviewedAt).toLocaleString('ka-GE'):'—']]){const row=document.createElement('div');row.append(text('dt',label),text('dd',value||'—'));dl.append(row);}detail.append(dl);
  if(a.rejectionReason)detail.append(text('p','უარყოფის მიზეზი: '+a.rejectionReason));
  if(a.status!=='pending')return;
  const label=text('label','უარყოფის მიზეზი (სავალდებულოა უარყოფისას)'),reason=document.createElement('textarea');reason.maxLength=500;reason.rows=3;label.append(reason);detail.append(label);
  const actions=text('div','','courier-actions');for(const [status,title]of [['approved','დამტკიცება'],['rejected','უარყოფა']]){const b=text('button',title);b.type='button';b.disabled=busy;if(status==='rejected')b.className='secondary';b.onclick=async()=>{if(busy)return;const value=reason.value.trim();if(status==='rejected'&&!value){$('courierStatus').textContent='მიუთითე უარყოფის მიზეზი.';reason.focus();return;}busy=true;actions.querySelectorAll('button').forEach(b=>b.disabled=true);$('courierStatus').textContent='ინახება…';try{await store.decide(a.id,status,value);await load();$('courierStatus').textContent=store.demo?'საცდელი სტატუსი განახლდა. რეალური წვდომა არ შეცვლილა.':'განაცხადის სტატუსი განახლდა.';}catch(e){$('courierStatus').textContent='ცვლილება ვერ შეინახა: '+e.message;}finally{busy=false;render();}};actions.append(b);}detail.append(actions);
 }
 async function load(){try{$('courierStatus').textContent='განაცხადები იტვირთება…';items=await store.list();if(!items.some(a=>a.id===selected))selected=items.find(a=>a.status==='pending')?.id||items[0]?.id||null;render();$('courierStatus').textContent=store.demo?'საცდელი რეჟიმი · რეალური ანგარიშები არ იცვლება.':`${items.length} განაცხადი`;}catch(e){items=[];selected=null;render();$('courierStatus').textContent='განაცხადები ვერ ჩაიტვირთა: '+e.message;}}
 $('courierFilter').onchange=e=>{filter=e.target.value;render();};$('courierSearch').oninput=e=>{search=e.target.value.trim().toLocaleLowerCase();render();};$('courierRefresh').onclick=load;
 load();return {reload:load,clear(){items=[];selected=null;render();}};
}
