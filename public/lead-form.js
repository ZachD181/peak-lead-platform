const form = document.getElementById('website-lead-form');
const status = document.getElementById('form-status');
let id = new URLSearchParams(location.search).get('form');
const requestId = crypto.randomUUID();

async function initialize() {
  if (!id) {
    const response = await fetch('/api/site-config');
    const config = await response.json();
    if (!response.ok || !config.contactFormId) throw Error('Peak’s contact form is unavailable. Please email support@peakleadplatform.com.');
    id = config.contactFormId;
  }
  // An explicitly invalid customer form never falls back to a different business.
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw Error('This form link is incomplete. Please contact the business directly.');
  const response = await fetch('/api/website-forms/' + id);
  const data = await response.json();
  if (!response.ok) throw Error(data.error || 'This form is unavailable.');
  document.getElementById('business-name').textContent = 'Contact ' + data.business;
  document.getElementById('business-privacy').href = data.privacyUrl;
  form.hidden = false;
  status.textContent = '';
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const button = form.querySelector('button');
  if (button.disabled) return;
  button.disabled = true;
  status.textContent = 'Sending your inquiry…';
  try {
    const params = new URLSearchParams(location.search);
    const attribution = window.peakAttribution?.read() || {};
    const payload = {
      eventId: requestId,
      ...Object.fromEntries(new FormData(form)),
      referrer: attribution.referrer || document.referrer,
      landingPage: attribution.landingPage || location.origin + location.pathname,
      isTest: params.get('qa') === '1',
    };
    for (const [query, key] of [['utm_source','utmSource'],['utm_medium','utmMedium'],['utm_campaign','utmCampaign'],['utm_term','utmTerm'],['utm_content','utmContent'],['gclid','gclid']]) {
      const value = attribution[query] || params.get(query);
      if (value) payload[key] = value;
    }
    const response = await fetch('/api/website-forms/' + id, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok || result.success !== true) throw Error(result.error || 'Could not send your inquiry. Please try again.');
    form.reset();
    form.hidden = true;
    status.textContent = 'Thank you. Your inquiry has been sent to the business.';
    document.getElementById('form-return').hidden = false;
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
initialize().catch(error => { status.textContent = error.message; document.getElementById('form-return').hidden = false; });
