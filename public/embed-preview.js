const previewStatus=document.getElementById('embed-preview-status'),frame=document.getElementById('website-preview-frame');
(async()=>{
  const id=new URLSearchParams(location.search).get('form');
  if(!/^[a-f0-9-]{36}$/i.test(id||''))throw Error('Open this preview from a configured Website campaign in Peak.');
  const response=await fetch('/api/website-forms/'+id),data=await response.json();
  if(!response.ok)throw Error(data.error||'This form is unavailable.');
  // The server supplies the canonical form address. Query parameters cannot point this preview at another site.
  const source=new URL(data.formUrl);
  if(source.protocol!=='https:'||source.pathname!=='/lead-form.html'||source.searchParams.get('form')!==id)throw Error('This form address is invalid.');
  frame.src=source.href;frame.hidden=false;previewStatus.textContent='Form ready. Test submissions are saved as leads in the connected campaign.';
})().catch(error=>{previewStatus.textContent=error.message;});
