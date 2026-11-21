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

module.exports = { recordOutcome };
