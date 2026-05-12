const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex,nofollow" />
<title>Signing you in...</title>
<style>
  body { background:#0b0b0c; color:#e5e5e7; font-family:-apple-system,Segoe UI,sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; }
  .card { text-align:center; padding:32px; max-width:480px; }
  .spinner { width:32px; height:32px; border:3px solid #2a2a2e; border-top-color:#d4af37; border-radius:50%; margin:0 auto 16px; animation:spin 1s linear infinite; }
  @keyframes spin { to { transform:rotate(360deg); } }
  .err { color:#ff6b6b; font-family:monospace; font-size:12px; word-break:break-all; margin-top:16px; text-align:left; }
</style>
</head>
<body>
<div class="card">
  <div class="spinner"></div>
  <div id="msg">Signing you in...</div>
  <div class="err" id="err"></div>
</div>
<script>
(function () {
  var msg = document.getElementById('msg');
  var errEl = document.getElementById('err');
  function showErr(e) { try { errEl.textContent = 'debug: ' + (e && e.message ? e.message : e); } catch (x) {} }

  setTimeout(function () { window.location.replace('https://www.weddingwin.ca/'); }, 5000);

  try {
    var hash = (window.location.hash || '').replace(/^#/, '');
    var search = (window.location.search || '').replace(/^\\?/, '');
    var combined = hash;
    if (search) combined = combined ? combined + '&' + search : search;

    var inApp = /WeddingWinApp/.test(navigator.userAgent || '');
    showErr('inApp=' + inApp + ' hashLen=' + hash.length + ' searchLen=' + search.length);

    if (inApp) {
      var deepLink = 'weddingwin://auth-callback#' + combined;
      msg.textContent = 'Returning to the app...';
      try {
        if (window.WeddingWinApp && typeof window.WeddingWinApp.completeAuth === 'function') {
          window.WeddingWinApp.completeAuth(deepLink);
          return;
        }
      } catch (e) { showErr(e); }
      window.location.href = deepLink;
      return;
    }

    msg.textContent = 'Done! Redirecting...';
    setTimeout(function () {
      var dest = combined ? 'https://www.weddingwin.ca/#' + combined : 'https://www.weddingwin.ca/';
      window.location.replace(dest);
    }, 300);
  } catch (e) {
    showErr(e);
    setTimeout(function () { window.location.replace('https://www.weddingwin.ca/'); }, 1500);
  }
})();
</script>
</body>
</html>`;

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const headers = new Headers();
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Client-Info, Apikey");
  headers.set("X-Content-Type-Options", "nosniff");

  try {
    return new Response(html, { status: 200, headers });
  } catch (e) {
    return new Response("error: " + (e instanceof Error ? e.message : String(e)), {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }
});
