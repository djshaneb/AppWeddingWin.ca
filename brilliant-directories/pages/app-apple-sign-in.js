<script>
(function () {
  'use strict';
  // A page can be restored from browser history or its widget run twice.
  // Neither is permission to replay an app's sign-in attempt.
  if (window.__wwAppAppleGatewayStarted) return;
  window.__wwAppAppleGatewayStarted = true;
  var status = document.getElementById('ww-app-apple-status');
  var error = document.getElementById('ww-app-apple-error');
  function fail() {
    if (status) status.hidden = true;
    if (error) error.hidden = false;
  }
  try {
    var current = new URL(window.location.href);
    if (current.origin !== 'https://www.weddingwin.ca' ||
        current.pathname !== '/app-apple-sign-in' ||
        current.username || current.password || current.port) throw new Error('invalid');
    var fragment = current.hash.slice(1);
    // Clean even rejected app intent from this history entry. If cleanup is
    // unavailable, do not navigate and risk replaying an uncleared fragment.
    window.history.replaceState(null, '', '/app-apple-sign-in');
    if (current.href.split('#')[0].indexOf('?') !== -1 ||
        !fragment || fragment.length > 4096 || /%(?![0-9A-Fa-f]{2})/.test(fragment)) throw new Error('invalid');
    var params = new URLSearchParams(fragment);
    var consentKeys = ['accepted_terms', 'accepted_privacy', 'accepted_at', 'terms_version', 'privacy_version'];
    var allowed = new Set(['return_to', 'code_challenge', 'signup_role'].concat(consentKeys));
    params.forEach(function (_, key) {
      if (!allowed.has(key) || params.getAll(key).length !== 1) throw new Error('invalid');
    });
    if (params.get('return_to') !== 'weddingwin://bd-apple-return' ||
        !/^[A-Za-z0-9_-]{43}$/.test(params.get('code_challenge') || '')) throw new Error('invalid');
    if (params.has('signup_role')) {
      if (params.get('signup_role') !== 'couple' && params.get('signup_role') !== 'vendor') throw new Error('invalid');
      if (params.get('accepted_terms') !== '1' || params.get('accepted_privacy') !== '1') throw new Error('invalid');
      var acceptedAt = params.get('accepted_at') || '';
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(acceptedAt) ||
          !Number.isFinite(Date.parse(acceptedAt)) || new Date(acceptedAt).toISOString() !== acceptedAt) throw new Error('invalid');
      ['terms_version', 'privacy_version'].forEach(function (key) {
        var version = params.get(key) || '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(version) ||
            !Number.isFinite(Date.parse(version + 'T00:00:00.000Z')) ||
            new Date(version + 'T00:00:00.000Z').toISOString().slice(0, 10) !== version) throw new Error('invalid');
      });
    } else if (consentKeys.some(function (key) { return params.has(key); })) {
      throw new Error('invalid');
    }
    // This is a browser navigation, not a fetch. The backend remains responsible
    // for current policies, consent freshness, signed state, binding and PKCE.
    var destination = new URL('https://pszcjoyabwvzsxxjtkhs.supabase.co/functions/v1/apple-native-oauth-start');
    destination.search = params.toString();
    window.location.replace(destination.toString());
  } catch (_) {
    // Never reflect query/hash/error details or offer an automatic retry.
    fail();
  }
})();
</script>
