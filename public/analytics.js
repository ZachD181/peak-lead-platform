// Shared client entry for this multi-page website and application.
import { analytics } from 'https://esm.sh/@heycatch/sdk@0.8.5';

analytics.init({
  projectKey: 'hck_pk_Lrrv_N3nQUBn3Sw4UWXeBz0ovD7PppE_',
  install: { framework: 'web', agent: 'codex' },
  requestBatching: false,
  maskAllText: true,
  maskAllElementAttributes: true,
  beforeSend(event) {
    if (!event) return event;
    for (const [name, value] of Object.entries(event.properties)) {
      if (typeof value !== "string" || !/^https?:\/\//i.test(value)) continue;
      try {
        const url = new URL(value);
        for (const key of [...url.searchParams.keys()]) {
          if (/token|password|secret|key|code|email|phone/i.test(key)) url.searchParams.set(key, "[redacted]");
        }
        event.properties[name] = url.href;
      } catch { /* Non-URL properties pass through. */ }
    }
    return event;
  },
});

// Classic page scripts use this same initialized instance on sign-out.
window.peakAnalytics = analytics;
export { analytics };

// Reconnect an existing authenticated session after a full page load.
fetch("/api/me", { credentials: "same-origin" })
  .then(response => response.ok ? response.json() : null)
  .then(data => {
    if (data?.user?.id) analytics.setIdentity(data.user.id, { email: data.user.email, name: data.user.name });
  })
  .catch(() => {});
