<!-- WeddingWin – Account Management Page (refreshed Business Tools & Account icons) -->
<?php
$wwvdSessionUser = array();
if (user::isUserLogged($_COOKIE) && isset($_COOKIE['userid']) && is_string($_COOKIE['userid'])
    && ctype_digit($_COOKIE['userid']) && (int)$_COOKIE['userid'] > 0) {
    $wwvdSessionUser = getUser($_COOKIE['userid'], $w);
    if (!is_array($wwvdSessionUser) || !isset($wwvdSessionUser['user_id'])
        || (string)$wwvdSessionUser['user_id'] !== (string)$_COOKIE['userid']) $wwvdSessionUser = array();
}
$wwvdMemberId = is_array($wwvdSessionUser) && isset($wwvdSessionUser['user_id']) ? (string)$wwvdSessionUser['user_id'] : '';
$wwvdCsrf = '';
$wwvdMemberActive = is_array($wwvdSessionUser) && isset($wwvdSessionUser['active']) ? (string)$wwvdSessionUser['active'] : '';
$wwvdMemberTags = array();
if (ctype_digit($wwvdMemberId) && (int)$wwvdMemberId > 0) {
    $wwvdTagRows = mysql($w['database'], 'SELECT DISTINCT tag_id FROM rel_tags WHERE tag_type_id = 1 AND object_id = ' . (int)$wwvdMemberId);
    if ($wwvdTagRows) {
        while ($wwvdTagRow = mysql_fetch_assoc($wwvdTagRows)) {
            if ((int)$wwvdTagRow['tag_id'] > 0) $wwvdMemberTags[] = (int)$wwvdTagRow['tag_id'];
        }
    }
}

if ($wwvdMemberId !== '' && function_exists('hash_equals')) {
    if (function_exists('session_status')) {
        if (session_status() !== PHP_SESSION_ACTIVE) { @session_start(); }
    } elseif (session_id() === '') { @session_start(); }
    if (session_id() !== '') {
        if (!isset($_SESSION['ww_qr_vendor_website_csrf']) || !is_array($_SESSION['ww_qr_vendor_website_csrf'])
            || !isset($_SESSION['ww_qr_vendor_website_csrf']['member_id'], $_SESSION['ww_qr_vendor_website_csrf']['token'])
            || $_SESSION['ww_qr_vendor_website_csrf']['member_id'] !== $wwvdMemberId
            || !is_string($_SESSION['ww_qr_vendor_website_csrf']['token'])
            || !ctype_xdigit($_SESSION['ww_qr_vendor_website_csrf']['token'])
            || strlen($_SESSION['ww_qr_vendor_website_csrf']['token']) !== 64) {
            $wwvdRandom = '';
            if (function_exists('random_bytes')) {
                try { $wwvdRandom = bin2hex(random_bytes(32)); } catch (Exception $e) {}
            } elseif (function_exists('openssl_random_pseudo_bytes')) {
                $wwvdStrong = false; $wwvdBytes = openssl_random_pseudo_bytes(32, $wwvdStrong);
                if ($wwvdStrong && is_string($wwvdBytes) && strlen($wwvdBytes) === 32) $wwvdRandom = bin2hex($wwvdBytes);
            }
            $_SESSION['ww_qr_vendor_website_csrf'] = array('member_id' => $wwvdMemberId, 'token' => $wwvdRandom);
            unset($wwvdRandom, $wwvdStrong, $wwvdBytes);
        }
        $wwvdCsrf = (string)$_SESSION['ww_qr_vendor_website_csrf']['token'];
        if (strlen($wwvdCsrf) !== 64) $wwvdCsrf = '';
    }
}
if (!headers_sent()) { header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0'); }
?>
<div class="ww-account-wrapper">
  <header class="ww-header">
    <!-- Main header icon -->
    <svg class="ww-main-icon" viewBox="0 0 24 24" fill="none" stroke="#e69fa3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <circle cx="12" cy="8" r="4"/>
      <path d="M6 18c2-3 4-4 6-4s4 1 6 4"/>
    </svg>
    <h2>Account&nbsp;Management</h2>
    <p>Access and manage your WeddingWin account</p>
  </header>

  <nav class="ww-nav">
    <?php if (ctype_digit($wwvdMemberId) && (int)$wwvdMemberId > 0) { ?>
    <a href="https://www.weddingwin.ca/qr-bingo-vendor-draw"
       class="ww-btn ww-vendor-bingo-link" data-testid="vendor-dashboard-bingo-link"
       data-ww-vendor-bingo-launch hidden
       data-user-id="<?php echo htmlspecialchars($wwvdMemberId, ENT_QUOTES, 'UTF-8'); ?>"
       data-user-active="<?php echo htmlspecialchars($wwvdMemberActive, ENT_QUOTES, 'UTF-8'); ?>"
       data-member-tags="<?php echo htmlspecialchars(json_encode($wwvdMemberTags), ENT_QUOTES, 'UTF-8'); ?>"
       data-csrf="<?php echo htmlspecialchars($wwvdCsrf, ENT_QUOTES, 'UTF-8'); ?>">
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h2v2h-2zM19 15h2v6h-6v-2"/></svg>
      <span><strong>Vendor Bingo</strong><small>Set up your prize and manage your draw.</small></span>
      <span class="ww-vendor-bingo-arrow" aria-hidden="true">›</span>
    </a>
    <?php } unset($wwvdSessionUser, $wwvdMemberId, $wwvdCsrf, $wwvdMemberActive, $wwvdMemberTags, $wwvdTagRows, $wwvdTagRow); ?>
    <!-- Manage Profile -->
    <button type="button" class="ww-btn ww-collapser" aria-expanded="false" aria-controls="collapse-profile">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      <span>Manage Profile</span><span class="ww-arrow">▾</span>
    </button></span>
    </button>
    <div id="collapse-profile" class="ww-collapse">
      <a href="/account/contact" class="ww-sub">Contact Details</a>
      <a href="/account/profile" class="ww-sub">Profile Photo</a>
      <a href="/account/about" class="ww-sub">Main Description Page</a>
    </div>

    <!-- Business Tools -->
    <button type="button" class="ww-btn ww-collapser" aria-expanded="false" aria-controls="collapse-tools">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h18v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M16 13v-2"/><path d="M8 13v-2"/></svg>
      <span>Business Tools</span><span class="ww-arrow">▾</span>
    </button></span>
    </button>
    <div id="collapse-tools" class="ww-collapse">
      <a href="/account/leads" class="ww-sub">Manage Leads</a>
      <a href="/account/chat_messages" class="ww-sub">Chat Messages</a>
      <?php
/* WWREV_PUBLIC_NAV_V2 */
?>
<a href="/account/review-widget" class="ww-sub wwrev-dashboard-sub-link">Review Widget <span class="wwrev-dashboard-sub-link__badge">New</span></a>
<?php
/* /WWREV_PUBLIC_NAV_V2 */
?>
<a href="/account/reviews" class="ww-sub">Manage Reviews</a>
      <a href="/account/articles/view" class="ww-sub">Community Articles</a>
      <a href="/account/photo-albums/view" class="ww-sub">Photo Albums</a>
      <a href="/account/videos/view" class="ww-sub">Videos</a>
      <a href="/account/winning_badges" class="ww-sub">Vendor Awards</a>
    </div>

    <!-- Account -->
    <button type="button" class="ww-btn ww-collapser" aria-expanded="false" aria-controls="collapse-account">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      <span>Account</span><span class="ww-arrow">▾</span>
    </button></span>
    </button>
    <div id="collapse-account" class="ww-collapse">
      <a href="/account/changelisting" class="ww-sub">Manage Account</a>
      <a href="/account/password" class="ww-sub">Change Password</a>
      <a href="/about/contact" class="ww-sub">Contact Us</a>
      <a href="/logout" class="ww-sub">Logout</a>
    </div>
  </nav>
</div>

<style>
:root{
  --accent:#e69fa3;
  --accent-dark:#d67880;
  --radius:16px;
}
body{font-family:"Poppins",Arial,sans-serif;background:#fafafa;color:#333}
.ww-account-wrapper{max-width:700px;margin:0 auto;padding:3rem 1rem}

/* Header */
.ww-header{text-align:center;margin-bottom:2.5rem}
.ww-main-icon{width:64px;height:64px;margin-bottom:1rem;filter:drop-shadow(0 4px 8px rgba(0,0,0,.06))}
.ww-header h2{margin:0;font-size:2rem;font-weight:700;color:var(--accent)}
.ww-header p{margin:.3rem 0 0;color:#666}

/* Nav */
.ww-nav{display:flex;flex-direction:column;gap:1rem}
.ww-btn{display:flex;align-items:center;gap:.8rem;padding:1rem 1.4rem;border:none;border-radius:var(--radius);background:var(--accent);color:#fff;font-weight:600;cursor:pointer;transition:background .25s,transform .25s,box-shadow .25s;box-shadow:0 4px 12px rgba(230,159,163,.35)}
.ww-btn:hover{background:var(--accent-dark);transform:translateY(-3px);box-shadow:0 8px 18px rgba(230,159,163,.5)}
.ww-btn svg{stroke:#fff}
.ww-btn span{flex:1;text-align:left}

/* Collapser arrow */
.ww-collapser{position:relative;padding-right:2.2rem}

.ww-collapser[aria-expanded="true"]::after{transform:translateY(-50%) rotate(180deg)}

/* Collapse – smooth slide & fade */
.ww-collapse{max-height:0;overflow:hidden;opacity:0;transform:translateY(-6px);display:flex;flex-direction:column;gap:.6rem;padding-left:2.4rem;transition:max-height .45s ease,opacity .45s ease,transform .45s ease}
.ww-collapse.open{max-height:800px;opacity:1;transform:translateY(0)}

/* Sub links – elevated cards */
.ww-sub{display:flex;align-items:center;gap:.6rem;background:#fff;color:var(--accent-dark);border:1px solid rgba(0,0,0,.05);padding:.85rem 1.1rem;border-radius:var(--radius);font-weight:500;text-decoration:none;box-shadow:0 2px 6px rgba(0,0,0,.06);transition:background .25s,color .25s,transform .25s,box-shadow .25s}
.ww-sub::after{content:"›";margin-left:auto;font-size:.85rem;color:var(--accent-dark);transition:transform .25s}
.ww-sub:hover{background:#fff;color:var(--accent-dark);transform:translateX(4px);box-shadow:0 4px 12px rgba(0,0,0,.08)}
.ww-sub:hover::after{transform:translateX(2px)}
/* End sub links */ */
.ww-sub{display:block;background:#fff;color:var(--accent-dark);border:1px solid var(--accent);padding:.75rem 1rem;border-radius:var(--radius);font-weight:500;text-decoration:none;transition:background .25s,color .25s,transform .25s}
.ww-sub:hover{background:var(--accent);color:#fff;transform:translateX(3px)}
.wwrev-dashboard-sub-link{border-color:#1a73e8!important;color:#174ea6!important;box-shadow:0 3px 10px rgba(26,115,232,.14)!important}
.wwrev-dashboard-sub-link:hover{background:#e8f0fe!important;color:#174ea6!important}
.wwrev-dashboard-sub-link__badge{display:inline-flex!important;flex:0 0 auto!important;align-items:center;min-height:20px;margin-left:auto;padding:1px 7px;border-radius:999px;background:#1a73e8;color:#fff!important;font-size:10px;font-weight:800;letter-spacing:.05em;text-transform:uppercase}
.wwrev-dashboard-sub-link:focus-visible{outline:3px solid #1a73e8;outline-offset:3px}
</style>

<script>
// toggle dropdowns
 document.addEventListener('DOMContentLoaded',()=>{
   document.querySelectorAll('.ww-collapser').forEach(btn=>{
     btn.addEventListener('click',()=>{
       const t=document.getElementById(btn.getAttribute('aria-controls'));
       const isOpen=btn.getAttribute('aria-expanded')==='true';
       btn.setAttribute('aria-expanded',!isOpen);
       t.classList.toggle('open');
     });
   });
 });
</script>
