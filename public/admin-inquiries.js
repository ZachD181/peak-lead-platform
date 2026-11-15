(async()=>{
 const status=document.getElementById('inbox-status'),list=document.getElementById('inbox-leads');
 try{const r=await fetch('/api/admin/inquiries');if(r.status===401){location.replace('/login.html');return;}if(!r.ok)throw Error('Administrator access is required.');
 const {leads}=await r.json();status.textContent=leads.length?leads.length+' website inquiries':'No inquiries yet.';
 for(const lead of leads){const card=document.createElement('article');card.className='team-card';
 const name=document.createElement('h2');name.textContent=lead.name;card.append(name);
 for(const value of [lead.email,lead.phone,lead.notes,'Received '+new Date(lead.createdAt).toLocaleString()+' · '+lead.stage+' · Score '+lead.score]){if(value){const p=document.createElement('p');p.textContent=value;card.append(p);}}list.append(card);}
 }catch(e){status.textContent=e.message;}
})();
