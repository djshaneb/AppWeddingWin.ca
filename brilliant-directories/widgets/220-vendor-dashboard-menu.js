<script>
(function () {
  'use strict';
  const BRIDGE_URL = 'https://www.weddingwin.ca/qr-bingo-vendor-draw?ww_qrvd_bridge=1';
  const CONFIG_URL = 'https://pszcjoyabwvzsxxjtkhs.supabase.co/functions/v1/bd-qr-bingo-admin?action=public_config';

  async function revealVendorBingo(link) {
    if (link.dataset.wwVendorBingoReady === 'true') return;
    link.dataset.wwVendorBingoReady = 'true';
    link.hidden = true;
    const userId = String(link.dataset.userId || '').trim();
    const csrf = String(link.dataset.csrf || '').trim();
    // Do not keep another copy of the member credential in the dashboard DOM.
    link.removeAttribute('data-token');
    if (!/^[1-9][0-9]*$/.test(userId)) return;
    const controller = new AbortController();
    const timer = window.setTimeout(function () { controller.abort(); }, 15000);
    try {
      const configResponse = await fetch(CONFIG_URL, { signal: controller.signal });
      if (!configResponse.ok) return;
      const configBody = await configResponse.json();
      if (!configBody || configBody.ok !== true) return;
      const config = configBody && configBody.event_config;
      const tags = JSON.parse(link.dataset.memberTags || '[]');
      if (!config || !Number.isSafeInteger(config.vendor_tag_id) || config.vendor_tag_id <= 0 ||
          !Number.isSafeInteger(config.revision) || config.revision <= 0 ||
          !Array.isArray(tags) || !tags.includes(config.vendor_tag_id)) return;
      if (link.dataset.userActive === '2') {
        if (link.isConnected && link.dataset.userId === userId) link.hidden = false;
        return;
      }
      // Production visibility uses the same active-member/current-tag rule as
      // the server, without creating raffle settings on dashboard page views.
      // An inactive private QA vendor needs the existing isolated-fixture proof.
      if (!/^[0-9a-f]{64}$/.test(csrf)) return;
      const response = await fetch(BRIDGE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'vendor_dashboard_access',
          csrf: csrf
        }),
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal
      });
      if (!response.ok) return;
      const data = await response.json();
      const vendor = data && data.vendor;
      if (data.ok === true && (data.app_review_fixture === true || data.email_test_fixture === true) && vendor &&
          String(vendor.id) === userId && String(vendor.user_id) === userId &&
          link.isConnected && link.dataset.userId === userId) {
        link.hidden = false;
      }
    } catch (error) {
      // Fail closed; dashboard profile/account tools remain usable.
    } finally {
      window.clearTimeout(timer);
    }
  }

  function initialize() {
    document.querySelectorAll('[data-ww-vendor-bingo-launch]').forEach(revealVendorBingo);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
</script>
