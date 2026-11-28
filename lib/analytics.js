const { analytics } = require('@heycatch/sdk');

analytics.init({ projectKey: 'hck_pk_Lrrv_N3nQUBn3Sw4UWXeBz0ovD7PppE_' });

// Unit and HTTP test fixtures must never become customer analytics.
async function recordOutcome(event, user, properties = {}, request) {
  if (process.env.NODE_TEST_CONTEXT || !user?.id) return;
  try {
    await analytics.trackEvent(event, properties, {
      userId: user.id,
      ...(request ? { request } : {}),
      set: { email: user.email, name: user.name, ...(properties.plan ? { plan: properties.plan } : {}) },
      ...(user.createdAt ? { setOnce: { signup_date: user.createdAt } } : {}),
    });
  } catch {
    // Measurement must never change signup, login or billing outcomes.
    console.warn('HeyCatch outcome could not be recorded.');
  }
}

function attributionProperties(input) {
  const result = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return result;
  for (const key of ['utm_source','utm_medium','utm_campaign','utm_term','utm_content']) {
    if (typeof input[key] === 'string' && input[key]) result[key] = input[key].slice(0, 300);
  }
  for (const [key, field] of [['landingPage','landing_page'],['referrer','referrer']]) {
    try { const url = new URL(input[key]); if (['https:', 'http:'].includes(url.protocol)) result[field] = (url.origin + url.pathname).slice(0, 500); } catch {}
  }
  return result;
}

async function recordWebsiteSubmission(request, connection, eventId, input) {
  const crypto = require('node:crypto');
  const rawId = request.headers?.['x-heycatch-distinct-id'];
  const visitorId = typeof rawId === 'string' && /^[a-f0-9-]{32,64}$/i.test(rawId)
    ? rawId : 'website_visitor_' + crypto.createHash('sha256').update(connection.id + ':' + eventId).digest('hex');
  await recordOutcome('lead_form_submitted', { id: visitorId }, {
    form_id: connection.id,
    form_kind: 'website',
    is_test: input.isTest === true,
    ...attributionProperties({
      utm_source: input.utmSource, utm_medium: input.utmMedium, utm_campaign: input.utmCampaign,
      utm_term: input.utmTerm, utm_content: input.utmContent, landingPage: input.landingPage, referrer: input.referrer,
    }),
  }, request);
}

module.exports = { recordOutcome, recordWebsiteSubmission, attributionProperties };
