window.peakSiteConfig=fetch('/api/site-config').then(r=>{if(!r.ok)throw Error();return r.json();}).catch(()=>({adConnectionsEnabled:false,contactFormId:null}));
window.peakSiteConfig.then(config=>{
  const frame=document.getElementById('peak-contact-frame');
  if(frame&&config.contactFormId){frame.src='/lead-form.html?form='+encodeURIComponent(config.contactFormId);frame.hidden=false;}
  if(!config.adConnectionsEnabled){
    document.querySelectorAll('.dashboard-connection-actions a[href*="platform=facebook"],.dashboard-connection-actions a[href*="platform=google"]').forEach(a=>a.remove());
    const actions=document.querySelector('.dashboard-connection-actions');
    if(actions){const note=document.createElement('p');note.textContent='Facebook/Instagram and Google Ads connections are coming soon.';actions.after(note);}
  }
});
