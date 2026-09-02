<?php
/*
 * WeddingWin QR Bingo vendor draw dashboard.
 *
 * The website and native app both use bd-qr-bingo-vendor-sync. This widget
 * carries only the logged-in Brilliant Directories session into that API. A
 * vendor may download the accepted entrant data that each couple expressly
 * agreed to share for the named draw and that vendor's wedding-related marketing.
 */

$ww_qrvd_user_id = '';
$ww_qrvd_token = '';
if (isset($user_data) && is_array($user_data)) {
    $ww_qrvd_user_id = isset($user_data['user_id']) ? (string)$user_data['user_id'] : '';
    $ww_qrvd_token = isset($user_data['token']) ? (string)$user_data['token'] : '';
}
if ($ww_qrvd_user_id === '' && isset($_COOKIE['userid'])) {
    $ww_qrvd_user_id = (string)$_COOKIE['userid'];
}
if ($ww_qrvd_token === '' && isset($_COOKIE['token'])) {
    $ww_qrvd_token = (string)$_COOKIE['token'];
}
?>

<section
  class="ww-qrvd"
  data-ww-qrvd
  data-user-id="<?php echo htmlspecialchars($ww_qrvd_user_id, ENT_QUOTES, 'UTF-8'); ?>"
  data-token="<?php echo htmlspecialchars($ww_qrvd_token, ENT_QUOTES, 'UTF-8'); ?>">
  <header class="ww-qrvd-hero">
    <div>
      <p class="ww-qrvd-eyebrow">Wedding show tools</p>
      <h2>Set up your vendor prize draw</h2>
      <p>Follow four simple steps. Your progress is shared with the WeddingWin app, and you can return at any time.</p>
    </div>
    <span class="ww-qrvd-badge">Website + app synced</span>
  </header>

  <nav class="ww-qrvd-steps" aria-label="Vendor prize draw setup steps">
    <button type="button" class="is-active" data-wizard-step="1" aria-current="step" aria-controls="ww-qrvd-panel-prize">
      <span class="ww-qrvd-step-number">1</span>
      <span><strong>Prize</strong><small data-role="wizard-state-1">Add details</small></span>
    </button>
    <button type="button" data-wizard-step="2" aria-controls="ww-qrvd-panel-rules">
      <span class="ww-qrvd-step-number">2</span>
      <span><strong>Rules</strong><small data-role="wizard-state-2">Review and open</small></span>
    </button>
    <button type="button" data-wizard-step="3" aria-controls="ww-qrvd-panel-entries">
      <span class="ww-qrvd-step-number">3</span>
      <span><strong>Entries</strong><small data-role="wizard-state-3">Track participation</small></span>
    </button>
    <button type="button" data-wizard-step="4" aria-controls="ww-qrvd-panel-winner">
      <span class="ww-qrvd-step-number">4</span>
      <span><strong>Winner</strong><small data-role="wizard-state-4">Select and verify</small></span>
    </button>
  </nav>

  <div class="ww-qrvd-status" data-role="status" role="status" aria-live="polite">
    Loading your current vendor draw settings…
  </div>

  <div class="ww-qrvd-workspace is-hidden" data-role="workspace">
    <div class="ww-qrvd-notice is-hidden" data-role="app-review-fixture-notice">
      <strong>Isolated App Review fixture.</strong>
      Test data is separate from the production event, early selection is allowed, and outbound email is suppressed.
    </div>
    <div class="ww-qrvd-notice is-hidden" data-role="email-test-fixture-notice">
      <strong>Isolated prize-email QA fixture.</strong>
      This Sound Of Harmony test uses one allowlisted couple in a separate event. It cannot select a production entrant, cannot send a vendor copy, and does not award a real prize.
    </div>

    <div class="ww-qrvd-wizard">
      <section class="ww-qrvd-card ww-qrvd-panel" id="ww-qrvd-panel-prize" data-wizard-panel="1" aria-labelledby="ww-qrvd-settings-heading">
        <p class="ww-qrvd-step">Step 1 of 4</p>
        <h3 id="ww-qrvd-settings-heading" tabindex="-1">Describe your prize</h3>
        <p class="ww-qrvd-intro">Tell couples exactly what they could receive. Use plain language and include important restrictions.</p>

        <label class="ww-qrvd-field">
          <span>Prize or discount name and details</span>
          <textarea
            data-field="prize_description"
            rows="5"
            maxlength="1000"
            placeholder="Example: 50% off a photography package&#10;Maximum discount $500. New bookings only; include the package, expiry, and exclusions."></textarea>
          <small>The first line becomes the prize name. Percentage discounts are supported—state the service or package, maximum savings, expiry, booking requirements, and exclusions.</small>
        </label>

        <label class="ww-qrvd-field">
          <span>Prize value or maximum savings (CAD)</span>
          <input
            data-field="prize_approx_value_cad"
            type="number"
            inputmode="decimal"
            min="0.01"
            step="0.01"
            placeholder="250">
          <small>Required before entries can open. For a percentage discount, enter the largest dollar amount the winner can save.</small>
        </label>

        <label class="ww-qrvd-field">
          <span>How many winners?</span>
          <select data-field="max_winners">
            <option value="1">1 winner</option>
            <option value="2">2 winners</option>
            <option value="3">3 winners</option>
          </select>
          <small>Choose one, two, or three winners for this prize offer. Couples see this number before they enter.</small>
        </label>

        <label class="ww-qrvd-switch ww-qrvd-switch-compact">
          <input type="checkbox" data-field="exclude_previous_winners" checked>
          <span>
            <strong>Do not select the same couple twice for this draw</strong>
            <small>Recommended. This applies only to this vendor’s current prize offer. Previous winners remain visible and stay in the downloaded CSV.</small>
          </span>
        </label>

        <p class="ww-qrvd-lock is-hidden" data-role="material-lock">
          Prize settings are locked for this draw. See the Rules step for details.
        </p>

        <div class="ww-qrvd-actions">
          <button type="button" class="ww-qrvd-primary" data-wizard-next="2">Continue to rules</button>
        </div>
      </section>

      <section class="ww-qrvd-card ww-qrvd-panel" id="ww-qrvd-panel-rules" data-wizard-panel="2" aria-labelledby="ww-qrvd-rules-heading" hidden>
        <p class="ww-qrvd-step">Step 2 of 4</p>
        <h3 id="ww-qrvd-rules-heading" tabindex="-1">Review the rules and open entries</h3>
        <p class="ww-qrvd-intro">Read the current rules and vendor responsibilities, then choose whether this draw should accept entries.</p>

        <div class="ww-qrvd-rules-box">
          <h4>One confirmation</h4>
          <p class="ww-qrvd-rules-help">Review either document whenever you need it. Then check the box once to confirm you have read and accept both.</p>
          <div class="ww-qrvd-rules-heading">
            <a data-role="rules-link" data-action="rules" href="#" target="_blank" rel="noopener">View the current Official Rules</a>
          </div>
          <details class="ww-qrvd-responsibility" data-role="vendor-responsibility-details">
            <summary>
              <strong>View the vendor responsibilities</strong>
            </summary>
            <p data-role="vendor-responsibility-disclosure">Loading the exact vendor responsibility agreement…</p>
          </details>
          <details class="ww-qrvd-responsibility">
            <summary><strong>Why prize details lock after opening</strong></summary>
            <p>Once a promotion opens or receives an entry, its prize, winner count, and repeat-winner rule stay fixed so every entrant receives the offer they accepted. Close the current draw before creating a materially different prize under a new rules version.</p>
          </details>
          <details class="ww-qrvd-disclosures" aria-label="Current draw terms">
            <summary>View event dates, eligibility, odds, admission, and entry rules</summary>
            <div>
              <p><strong>Eligibility:</strong> <span data-role="eligibility">Loading…</span></p>
              <p><strong>Entries close:</strong> <span data-role="entry-close">Loading…</span></p>
              <p><strong>Scheduled draw:</strong> <span data-role="draw-at">Loading…</span></p>
              <p><strong>Odds:</strong> <span data-role="odds">Loading…</span></p>
              <p>Vendor draws are only for eligible couples attending the wedding show in person. Couples visit your booth, scan your QR code, then separately choose whether to enter. The QR entry replaces a paper ballot. No purchase from your business is required. General admission is free in advance while available; VIP and door admission may be paid, but paid admission never creates an extra entry or improves the odds.</p>
            </div>
          </details>
          <label class="ww-qrvd-check">
            <input type="checkbox" data-field="legal_terms_accepted" aria-describedby="ww-qrvd-acceptance-state">
            <span class="ww-qrvd-review-copy">
              <strong>I confirm I have read and accept the current Official Rules and vendor responsibilities, and I am authorized to do so for this vendor.</strong>
              <small>Checking this box records one dated acceptance for the current versions.</small>
              <small id="ww-qrvd-acceptance-state" data-role="acceptance-state">Not confirmed yet</small>
            </span>
          </label>
        </div>

        <label class="ww-qrvd-switch">
          <input type="checkbox" data-field="enabled">
          <span><strong>Accept prize entries</strong><small>Turn this on only when the prize details and rules above are correct.</small></span>
        </label>

        <div class="ww-qrvd-actions">
          <button type="button" class="ww-qrvd-secondary" data-wizard-back="1">Back</button>
          <button type="button" class="ww-qrvd-secondary is-hidden" data-action="reload">Reload current settings</button>
          <button type="button" class="ww-qrvd-primary" data-action="save">Save and continue</button>
        </div>
      </section>

      <section class="ww-qrvd-card ww-qrvd-panel" id="ww-qrvd-panel-entries" data-wizard-panel="3" aria-labelledby="ww-qrvd-entry-heading" hidden>
        <p class="ww-qrvd-step">Step 3 of 4</p>
        <h3 id="ww-qrvd-entry-heading" tabindex="-1">Track prize entries</h3>
        <p class="ww-qrvd-intro">Find and contact every couple who opted in, then review who should be included in random winner selection.</p>
        <div class="ww-qrvd-stats" aria-label="Entrant summary">
          <div class="ww-qrvd-stat">
            <strong data-role="entry-count">0</strong>
            <span data-role="entry-count-label">opted-in couples</span>
          </div>
          <div class="ww-qrvd-stat">
            <strong data-role="selection-pool-count">0</strong>
            <span>in winner selection</span>
          </div>
          <div class="ww-qrvd-stat">
            <strong data-role="excluded-count">0</strong>
            <span>not currently selectable</span>
          </div>
        </div>
        <p class="ww-qrvd-small">The third number includes manual removals, a potential winner awaiting review, preserved disqualifications, and previous winners excluded by the saved no-repeat rule.</p>

        <div class="ww-qrvd-contact-export">
          <div>
            <strong>Complete contact list</strong>
            <span>Download every opted-in couple, including anyone removed from winner selection.</span>
          </div>
          <button type="button" class="ww-qrvd-secondary ww-qrvd-report-button" data-action="participation-report">Download contacts (CSV)</button>
        </div>
        <p class="ww-qrvd-small">Every listed couple accepted this named vendor's draw and wedding-related marketing terms. Honour unsubscribe requests and protect the information under the Vendor Draw Rules.</p>

        <div class="ww-qrvd-entry-manager" aria-labelledby="ww-qrvd-manage-entries-heading">
          <div class="ww-qrvd-entry-manager-heading">
            <div>
              <h4 id="ww-qrvd-manage-entries-heading">Couple contacts</h4>
              <p>Contact details stay visible even when someone is not currently selectable.</p>
            </div>
            <button type="button" class="ww-qrvd-secondary" data-action="entries-reload">Refresh list</button>
          </div>
          <div class="ww-qrvd-contact-tools" aria-label="Find and filter couple contacts">
            <label class="ww-qrvd-contact-search">
              <span>Find a couple</span>
              <input type="search" data-role="entrant-search" placeholder="Search name, email or phone" autocomplete="off">
            </label>
            <label class="ww-qrvd-contact-filter">
              <span>Show</span>
              <select data-role="entrant-filter">
                <option value="all">All contacts</option>
                <option value="included">In winner selection</option>
                <option value="excluded">Not currently selectable</option>
              </select>
            </label>
          </div>
          <p class="ww-qrvd-visible-count" data-role="entrant-visible-count" aria-live="polite">Contacts will appear here.</p>
          <p class="ww-qrvd-lock is-hidden" data-role="entry-management-lock">Finish or disqualify the pending potential winner before changing this list.</p>
          <div class="ww-qrvd-entry-status" data-role="entry-status" role="status" aria-live="polite">Open this step to load opted-in couples.</div>
          <div class="ww-qrvd-entrant-list" data-role="entrants" aria-busy="false"></div>
        </div>
        <div class="ww-qrvd-actions ww-qrvd-actions-between">
          <button type="button" class="ww-qrvd-secondary" data-wizard-back="2">Back</button>
          <button type="button" class="ww-qrvd-primary" data-wizard-next="4">Continue to winner</button>
        </div>
      </section>

      <section class="ww-qrvd-card ww-qrvd-panel" id="ww-qrvd-panel-winner" data-wizard-panel="4" aria-labelledby="ww-qrvd-draw-heading" hidden>
        <p class="ww-qrvd-step">Step 4 of 4</p>
        <h3 id="ww-qrvd-draw-heading" tabindex="-1">Select, verify, then email each winner</h3>
        <p class="ww-qrvd-intro">These are separate actions. Selecting a potential winner never sends an email. After verification, use the Send winner email button on that winner’s card.</p>
        <div class="ww-qrvd-draw-status">
          <strong data-role="draw-status-label">Loading…</strong>
          <span data-role="draw-status"></span>
        </div>
        <button type="button" class="ww-qrvd-primary" data-action="draw" disabled>Select potential winner</button>
        <p class="ww-qrvd-small">This button only performs random selection. It cannot send winner email.</p>
        <div class="ww-qrvd-notice is-hidden" data-role="email-notice"></div>
        <section class="ww-qrvd-review is-hidden" data-role="review-panel" aria-labelledby="ww-qrvd-review-heading">
          <p class="ww-qrvd-step">Vendor review</p>
          <h4 id="ww-qrvd-review-heading">Confirm the selected couple</h4>
          <p><strong>Potential winner:</strong> <span data-role="review-winner">Selected entrant</span></p>
          <p><strong>Verification question:</strong> <span data-role="skill-question-prompt">Loading…</span></p>

          <label class="ww-qrvd-check">
            <input type="checkbox" data-field="review-eligibility-confirmed">
            <span>I verified this selected entrant’s age, residency, and promotion exclusions against the current official rules.</span>
          </label>
          <label class="ww-qrvd-check">
            <input type="checkbox" data-field="review-rules-release-confirmed">
            <span>On behalf of my business, I attest that my business obtained the selected entrant’s required declaration and release outside WeddingWin, confirmed the current rules apply, and will provide all required winner notices and fulfil the prize. Wedding Win only records this vendor attestation; it does not perform or certify these vendor checks.</span>
          </label>
          <label class="ww-qrvd-field">
            <span>Couple’s answer</span>
            <input data-field="review-skill-answer" type="text" inputmode="decimal" maxlength="80" autocomplete="off">
          </label>
          <label class="ww-qrvd-field">
            <span>Verification date (required to confirm)</span>
            <input data-field="review-verification-date" type="date" autocomplete="off">
          </label>
          <label class="ww-qrvd-field">
            <span>Declaration/release method (required to confirm)</span>
            <input data-field="review-verification-method" type="text" maxlength="300" autocomplete="off" placeholder="For example: signed electronic declaration">
          </label>
          <label class="ww-qrvd-field">
            <span>Evidence reference (required to confirm)</span>
            <input data-field="review-evidence-reference" type="text" maxlength="300" autocomplete="off" placeholder="Internal reference only; do not paste sensitive document contents">
          </label>
          <label class="ww-qrvd-field">
            <span>Disqualification reason</span>
            <input data-field="review-disqualification-reason" type="text" maxlength="500" placeholder="Required only when disqualifying this selection.">
          </label>
          <div class="ww-qrvd-actions ww-qrvd-review-actions">
            <button type="button" class="ww-qrvd-secondary" data-action="review-disqualify">Disqualify</button>
            <button type="button" class="ww-qrvd-primary" data-action="review-confirm">Confirm Potential Winner</button>
          </div>
          <p class="ww-qrvd-small">Confirm only after the vendor completes every required check and records the date, method, and reference. Wedding Win preserves the vendor’s attestation but does not perform or certify the vendor’s eligibility, release, or prize-fulfilment work. Disqualification preserves the audit record and permits a replacement selection, subject to the draw limit.</p>
        </section>
        <h4 class="ww-qrvd-history-heading">Winner records and email</h4>
        <div class="ww-qrvd-history" data-role="draws" aria-live="polite">
          <p>No potential winner has been selected.</p>
        </div>
        <div class="ww-qrvd-actions ww-qrvd-actions-between">
          <button type="button" class="ww-qrvd-secondary" data-wizard-back="3">Back</button>
        </div>
      </section>
    </div>
  </div>
</section>
