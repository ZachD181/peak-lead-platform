const teamStatus=document.getElementById('team-status'),teamList=document.getElementById('team-list');
let teamUsers=[];
async function teamRequest(path='',method='GET',body){
  const response=await fetch('/api/team'+path,{method,headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
  let data;try{data=await response.json();}catch{throw new Error('Team management is temporarily unavailable. Please try again.');}
  if(response.status===401){location.assign('/login.html');throw new Error('Please sign in.');}
  if(response.status===402){location.assign('/billing.html');throw new Error('An active subscription or trial is required.');}
  if(!response.ok)throw new Error(data.error||'Unable to update team.');return data;
}
function element(tag,text,className){const el=document.createElement(tag);if(text)el.textContent=text;if(className)el.className=className;return el;}
function showInvitation(data){
  document.getElementById('team-share').hidden=false;
  document.getElementById('team-share-recipient').textContent='Invitation for '+data.user.name+' ('+data.user.email+'). This link lets them access your company’s leads; share it only with them.';
  document.getElementById('team-invite-url').value=data.inviteUrl;
  document.getElementById('team-share').scrollIntoView({behavior:'smooth',block:'center'});
}
function renderTeam(){
  teamList.replaceChildren();
  for(const user of teamUsers){
    const row=element('article',null,'team-member');
    const details=element('div');details.append(element('h3',user.name),element('p',user.email),element('p',user.role==='owner'?'Account owner':user.status==='invited'?'Invitation pending':user.status==='disabled'?'Deactivated':'Active team member'));
    row.append(details);
    if(user.role!=='owner'){
      const actions=element('div',null,'team-member-actions');
      const form=element('form');const label=element('label','Name');const input=element('input');input.value=user.name;input.maxLength=100;input.required=true;label.append(input);const save=element('button','Save name','secondary-button');save.type='submit';form.append(label,save);
      form.addEventListener('submit',async event=>{event.preventDefault();save.disabled=true;try{await teamRequest('/'+user.id,'PATCH',{name:input.value.trim()});await loadTeam();teamStatus.textContent='Name updated. Refresh the dashboard to see the new name.';}catch(error){teamStatus.textContent=error.message;}finally{save.disabled=false;}});
      actions.append(form);
      if(user.status==='invited'){
        const invite=element('button','New invitation link','secondary-button');invite.type='button';invite.addEventListener('click',async()=>{invite.disabled=true;try{showInvitation(await teamRequest('/'+user.id+'/invite','POST',{}));teamStatus.textContent='New invitation created. The previous link no longer works.';}catch(error){teamStatus.textContent=error.message;}finally{invite.disabled=false;}});actions.append(invite);
      }
      const toggle=element('button',user.status==='disabled'?'Restore access':'Deactivate','secondary-button');toggle.type='button';toggle.addEventListener('click',async()=>{
        const disabling=user.status!=='disabled';
        if(!confirm((disabling?'Deactivate ':'Restore access for ')+user.name+'?'+(disabling?' Their leads and history will be kept.':'')))return;
        toggle.disabled=true;
        try{await teamRequest('/'+user.id,'PATCH',{status:disabling?'disabled':'active'});await loadTeam();document.getElementById('team-share').hidden=true;teamStatus.textContent=disabling?'Member deactivated. Existing leads have been kept.':'Member access restored.';}
        catch(error){teamStatus.textContent=error.message;}finally{toggle.disabled=false;}
      });actions.append(toggle);row.append(actions);
    }
    teamList.append(row);
  }
}
async function loadTeam(){const data=await teamRequest();teamUsers=data.users;renderTeam();document.getElementById('team-invite-card').hidden=false;document.getElementById('team-list-card').hidden=false;teamStatus.textContent='Only your account owner can manage this team.';}
document.getElementById('team-add').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.target,button=form.querySelector('button');button.disabled=true;teamStatus.textContent='Creating invitation…';
  try{const data=await teamRequest('','POST',{name:form.elements.name.value.trim(),email:form.elements.email.value.trim()});form.reset();await loadTeam();showInvitation(data);teamStatus.textContent='Invitation ready. The member will appear in Assigned to after accepting it.';}
  catch(error){teamStatus.textContent=error.message;}finally{button.disabled=false;}
});
document.getElementById('team-copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(document.getElementById('team-invite-url').value);teamStatus.textContent='Invitation link copied.';}catch{teamStatus.textContent='Select the invitation link and copy it manually.';}});
loadTeam().catch(error=>{teamStatus.textContent=error.message;});
