const invitationToken=new URLSearchParams(location.hash.slice(1)).get('token');
history.replaceState(null,'','/accept-invite.html');
const inviteStatus=document.getElementById('invite-status'),inviteForm=document.getElementById('accept-team');
if(!invitationToken){inviteForm.hidden=true;inviteStatus.textContent='Open the private invitation link from your account owner.';}
inviteForm.addEventListener('submit',async event=>{
  event.preventDefault();if(inviteForm.elements.password.value!==inviteForm.elements.confirm.value){inviteStatus.textContent='The passwords must match.';return;}
  const button=inviteForm.querySelector('button');button.disabled=true;inviteStatus.textContent='Joining your team…';
  try{
    const response=await fetch('/api/team/accept-invite',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:invitationToken,password:inviteForm.elements.password.value})});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'Unable to accept invitation.');
    inviteForm.reset();inviteForm.hidden=true;inviteStatus.textContent='Your account is ready. Use Sign in to Peak below.';
  }catch(error){inviteStatus.textContent=error.message;}finally{button.disabled=false;}
});
