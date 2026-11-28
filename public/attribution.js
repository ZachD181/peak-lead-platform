(function () {
  const storageKey = 'peak-attribution-v1';
  const fields = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid'];
  function safePage(value) {
    try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? (url.origin + url.pathname).slice(0, 500) : ''; }
    catch { return ''; }
  }
  function capture() {
    const params = new URLSearchParams(location.search);
    let stored = null;
    try { stored = JSON.parse(sessionStorage.getItem(storageKey)); } catch {}
    const current = { landingPage: safePage(location.href), referrer: safePage(document.referrer) };
    for (const field of fields) if (params.get(field)) current[field] = params.get(field).slice(0, field === 'gclid' ? 500 : 300);
    const data = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : current;
    try { sessionStorage.setItem(storageKey, JSON.stringify(data)); } catch {}
    return data;
  }
  // Runs before the deferred analytics module can clean attribution parameters.
  const initial = capture();
  window.peakAttribution = {
    read() {
      try {
        if (window.parent !== window && window.parent.location.origin === location.origin && window.parent.peakAttribution) {
          return window.parent.peakAttribution.read();
        }
      } catch {}
      return { ...initial };
    },
  };
})();
