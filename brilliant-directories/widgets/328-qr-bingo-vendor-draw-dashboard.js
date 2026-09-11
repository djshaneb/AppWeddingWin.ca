<script>
(function () {
  'use strict';

  const BRIDGE_URL = 'https://www.weddingwin.ca/qr-bingo-vendor-draw?ww_qrvd_bridge=1';

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function prizeDetailsLocked(data) {
    // An older response cannot prove that a winner email is not in flight.
    return data && typeof data.prize_details_locked === 'boolean'
      ? data.prize_details_locked
      : Boolean(data && data.material_terms_locked);
  }

  function firstLine(value) {
    return text(value).replaceAll(String.fromCharCode(13), '').split(String.fromCharCode(10))[0].trim();
  }

  function formatPrizeDraftDescription(title, description) {
    const cleanTitle = text(title);
    const cleanDescription = text(description);
    if (!cleanTitle || cleanDescription.includes('\n') || !cleanDescription.startsWith(cleanTitle)) return cleanDescription;
    const remainder = cleanDescription.slice(cleanTitle.length);
    return /^\s+\S/.test(remainder) ? `${cleanTitle}\n${remainder.trimStart()}` : cleanDescription;
  }

  function samePrizeWording(left, right) {
    return text(left).replace(/\s+/g, ' ') === text(right).replace(/\s+/g, ' ');
  }

  function formatDate(value) {
    if (!value) return 'See the current official rules';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return text(value);
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Toronto',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(date);
  }

  function trustedWeddingWinUrl(value) {
    try {
      const url = new URL(text(value));
      const host = url.hostname.toLowerCase().replace(/^www[.]/, '');
      if (url.protocol !== 'https:' || host !== 'weddingwin.ca') return '';
      if ((url.port && url.port !== '443') || url.username || url.password) return '';
      return url.toString();
    } catch {
      return '';
    }
  }

  function savedDrawReadiness(data) {
    const settings = data && data.settings ? data.settings : {};
    const drawName = data && (data.app_review_fixture || data.email_test_fixture) ? 'Your test draw' : 'Your draw';
    if (!text(settings.updated_at) || typeof settings.enabled !== 'boolean') {
      return { label: 'Draw status not confirmed', summary: 'Refresh required', message: 'Reload your draw to check its saved entry status.', kind: 'waiting', open: false };
    }
    if (!settings.enabled) {
      return { label: `${drawName} is off`, summary: 'Draw off', message: 'Couples can scan your booth, but cannot enter your draw. Turn it on and select Save and continue when you are ready.', kind: 'waiting', open: false };
    }
    const setupReady = data.entry_setup_ready === true && data.rules_current === true &&
      settings.legal_terms_accepted === true && settings.vendor_responsibility_acknowledged === true;
    if (setupReady && data.entry_open === true && data.entry_status === 'open') {
      const count = Math.max(0, Math.floor(number(data.entry_count != null ? data.entry_count : data.entrant_count)));
      return {
        label: `${drawName} is on`, summary: 'Entries open', kind: 'success', open: true,
        message: `${count === 0 ? 'Ready and waiting for couples to scan' : 'Couples can scan'} your booth QR code and choose Yes to enter. Entrants will appear here after they confirm.`,
      };
    }
    if (setupReady && data.entry_open === false && data.entry_status === 'scheduled') {
      const opensAt = text(data.entry_opens_at);
      return {
        label: `${drawName} is on — entries scheduled`, summary: 'Entries scheduled', kind: 'waiting', open: false,
        message: opensAt && Number.isFinite(Date.parse(opensAt))
          ? `Your setup is saved. Entries open ${formatDate(opensAt)}. Couples can enter after scanning during the entry window.`
          : 'Your setup is saved. Entries have not opened yet. Check the current Official Rules for the entry schedule.',
      };
    }
    if (data.entry_open === false && data.entry_status === 'closed') {
      return { label: `${drawName} is on — entries closed`, summary: 'Entries closed', message: 'The entry window has closed. New couples cannot enter. Your existing entrants remain below.', kind: 'waiting', open: false };
    }
    if (data.entry_open === false && data.entry_status === 'paused') {
      return { label: `${drawName} is on — entries paused`, summary: 'Entries paused', message: 'Your setup is saved, but entries are paused by the organizer. Couples cannot enter until entries resume.', kind: 'waiting', open: false };
    }
    if (data.entry_status === 'incomplete' || data.rules_current === false || !settings.legal_terms_accepted || !settings.vendor_responsibility_acknowledged) {
      return { label: 'Draw setup needs attention', summary: 'Review setup', message: 'Review the current rules and prize details, then save again before couples can enter.', kind: 'waiting', open: false };
    }
    return { label: `${drawName} is on — entry availability unconfirmed`, summary: 'Check entry status', message: 'Your on/off setting is saved. Reload to check when couples can enter; the entry window has not been confirmed.', kind: 'waiting', open: false };
  }

  function makeElement(tag, className, content) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (content != null) element.textContent = String(content);
    return element;
  }

  async function request(root, action, extra) {
    const userId = text(root.dataset.userId);
    const csrf = text(root.dataset.csrf);
    if (!userId || !/^[0-9a-f]{64}$/.test(csrf)) {
      const error = new Error('Sign in again before opening vendor draw tools.');
      error.status = 401;
      throw error;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(function () {
      controller.abort();
    }, 15000);

    try {
      const response = await fetch(BRIDGE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify(Object.assign({}, extra || {}, { action: action, csrf: csrf })),
        signal: controller.signal,
      });

      const responseText = await response.text();
      let data = {};
      if (responseText) {
        try {
          data = JSON.parse(responseText);
        } catch {
          const invalidResponse = new Error('Vendor draw tools returned an unreadable response.');
          invalidResponse.status = response.status;
          throw invalidResponse;
        }
      }

      if (!response.ok || data.ok === false) {
        const requestError = new Error(text(data.detail || data.error) || 'Vendor draw tools are unavailable.');
        requestError.status = response.status;
        requestError.data = data;
        throw requestError;
      }
      return data;
    } catch (error) {
      if (error && error.name === 'AbortError') {
        const timeoutError = new Error('Vendor draw tools timed out. Try again.');
        timeoutError.status = 408;
        throw timeoutError;
      }
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function initialize(root) {
    if (root.dataset.wwQrvdReady === 'true') return;
    root.dataset.wwQrvdReady = 'true';

    const find = function (selector) { return root.querySelector(selector); };
    const status = find('[data-role="status"]');
    const workspace = find('[data-role="workspace"]');
    const wizardButtons = Array.from(root.querySelectorAll('[data-wizard-step]'));
    const wizardPanels = Array.from(root.querySelectorAll('[data-wizard-panel]'));
    const wizardState1 = find('[data-role="wizard-state-1"]');
    const wizardState2 = find('[data-role="wizard-state-2"]');
    const wizardState3 = find('[data-role="wizard-state-3"]');
    const wizardState4 = find('[data-role="wizard-state-4"]');
    const appReviewFixtureNotice = find('[data-role="app-review-fixture-notice"]');
    const emailTestFixtureNotice = find('[data-role="email-test-fixture-notice"]');
    const enabled = find('[data-field="enabled"]');
    const description = find('[data-field="prize_description"]');
    const prizeValue = find('[data-field="prize_approx_value_cad"]');
    const legalAccepted = find('[data-field="legal_terms_accepted"]');
    const vendorResponsibilityDisclosure = find('[data-role="vendor-responsibility-disclosure"]');
    const vendorResponsibilityDetails = find('[data-role="vendor-responsibility-details"]');
    const rulesLink = find('[data-role="rules-link"]');
    const acceptanceState = find('[data-role="acceptance-state"]');
    const eligibility = find('[data-role="eligibility"]');
    const entryClose = find('[data-role="entry-close"]');
    const drawAt = find('[data-role="draw-at"]');
    const odds = find('[data-role="odds"]');
    const saveButton = find('[data-action="save"]');
    const reloadButton = find('[data-action="reload"]');
    const materialLock = find('[data-role="material-lock"]');
    const entryCount = find('[data-role="entry-count"]');
    const entryCountLabel = find('[data-role="entry-count-label"]');
    const drawReadiness = find('[data-role="draw-readiness"]');
    const drawReadinessLabel = find('[data-role="draw-readiness-label"]');
    const drawReadinessMessage = find('[data-role="draw-readiness-message"]');
    const selectionPoolCount = find('[data-role="selection-pool-count"]');
    const excludedCount = find('[data-role="excluded-count"]');
    const participationReportButton = find('[data-action="participation-report"]');
    const entriesReloadButton = find('[data-action="entries-reload"]');
    const entryManagementLock = find('[data-role="entry-management-lock"]');
    const entryStatus = find('[data-role="entry-status"]');
    const entrants = find('[data-role="entrants"]');
    const entrantSearch = find('[data-role="entrant-search"]');
    const entrantFilter = find('[data-role="entrant-filter"]');
    const entrantVisibleCount = find('[data-role="entrant-visible-count"]');
    const drawStatusLabel = find('[data-role="draw-status-label"]');
    const drawStatus = find('[data-role="draw-status"]');
    const drawButton = find('[data-action="draw"]');
    const emailNotice = find('[data-role="email-notice"]');
    const draws = find('[data-role="draws"]');

    const state = {
      data: null,
      busy: false,
      conflict: false,
      rulesViewedVersion: '',
      responsibilityViewedVersion: '',
      entries: [],
      entriesLoaded: false,
      entriesBusy: false,
      entrantQuery: '',
      entrantFilter: 'all',
      suppressedTestedDrawIds: new Set(),
      currentStep: 1,
      wizardTouched: false,
      initialStepSelected: false,
    };

    function setStatus(message, kind) {
      status.textContent = message;
      status.classList.toggle('is-error', kind === 'error');
      status.classList.toggle('is-success', kind === 'success');
    }

    function showWizardStep(step, options) {
      const requested = Math.max(1, Math.min(4, Math.floor(number(step)) || 1));
      const settings = options || {};
      state.currentStep = requested;
      if (settings.userInitiated !== false) state.wizardTouched = true;

      wizardPanels.forEach(function (panel) {
        panel.hidden = number(panel.dataset.wizardPanel) !== requested;
      });
      wizardButtons.forEach(function (button) {
        const active = number(button.dataset.wizardStep) === requested;
        button.classList.toggle('is-active', active);
        if (active) button.setAttribute('aria-current', 'step');
        else button.removeAttribute('aria-current');
      });

      if (settings.focus) {
        const activePanel = wizardPanels.find(function (panel) {
          return number(panel.dataset.wizardPanel) === requested;
        });
        const heading = activePanel && activePanel.querySelector('h3');
        if (heading) heading.focus();
      }
      if (requested === 3 && state.data && !state.entriesLoaded && !state.entriesBusy) {
        void loadEntrants();
      }
    }

    function recommendedWizardStep(data) {
      const settings = data && data.settings ? data.settings : {};
      const hasPrize = Boolean(text(settings.prize_description) && number(settings.prize_approx_value_cad) > 0);
      const rulesCurrent = Boolean(
        settings.legal_terms_accepted &&
        settings.vendor_responsibility_acknowledged &&
        data.rules_current !== false
      );
      const active = Array.isArray(data && data.draws)
        ? data.draws.some(function (draw) {
            return draw && (draw.selection_status === 'potential' || draw.selection_status === 'verified');
          })
        : false;
      if (active || data.can_send_verified_winner_notice || data.verified_potential_winner_notice_pending) return 4;
      if (!hasPrize) return 1;
      if (!settings.enabled || !rulesCurrent) return 2;
      return 3;
    }

    function updateWizardSummary() {
      const data = state.data || {};
      const settings = data.settings || {};
      const rulesVersion = text(data.rules_version);
      const prizeReady = Boolean(
        text(description.value) &&
        number(prizeValue.value) > 0
      );
      const acceptanceReady = Boolean(
        legalAccepted.checked &&
        text(data.vendor_responsibility_disclosure) &&
        rulesVersion &&
        state.rulesViewedVersion === rulesVersion &&
        state.responsibilityViewedVersion === rulesVersion
      );
      const readiness = savedDrawReadiness(data);
      const entriesOpen = readiness.open;
      const toggleUnsaved = typeof settings.enabled === 'boolean' && enabled.checked !== settings.enabled;
      const count = Math.max(0, Math.floor(number(data.entry_count != null ? data.entry_count : data.entrant_count)));

      wizardState1.textContent = prizeReady ? 'Prize ready' : 'Add details';
      wizardState2.textContent = settings.enabled && !enabled.checked
        ? 'Ready to close'
        : toggleUnsaved && acceptanceReady && enabled.checked
          ? 'Ready to save'
          : readiness.summary;
      wizardState3.textContent = `${count} ${count === 1 ? 'entry' : 'entries'}`;
      wizardState4.textContent = text(drawStatusLabel.textContent) || 'Choose a winner';

      wizardButtons.forEach(function (button) {
        const step = number(button.dataset.wizardStep);
        const complete = (step === 1 && prizeReady) ||
          (step === 2 && entriesOpen) ||
          (step === 4 && activeDraws().some(function (draw) { return draw.selection_status === 'verified'; }));
        button.classList.toggle('is-complete', complete);
      });

      saveButton.textContent = 'Save and continue';
      drawReadinessLabel.textContent = readiness.label;
      drawReadinessMessage.textContent = readiness.message + (toggleUnsaved
        ? ' Your on/off change is not saved yet. Select Save and continue to apply it.' : '');
      drawReadiness.classList.toggle('is-success', readiness.kind === 'success');
      drawReadiness.classList.toggle('is-waiting', readiness.kind !== 'success');
      const enabledHelp = enabled.closest('.ww-qrvd-switch').querySelector('small');
      if (enabledHelp) {
        enabledHelp.textContent = enabled.checked
          ? toggleUnsaved
            ? 'Select Save and continue to turn your draw on. Couples can enter while the scanner is open.'
            : entriesOpen
            ? 'Couples can now choose to enter your draw.'
            : readiness.message
          : toggleUnsaved
            ? 'Select Save and continue to turn your draw off. Your saved setting is still on.'
            : 'Off: couples can scan your booth, but cannot enter your draw.';
      }
    }

    function currentDraftSignature() {
      return JSON.stringify([
        enabled.checked, description.value, prizeValue.value, legalAccepted.checked,
        state.rulesViewedVersion, state.responsibilityViewedVersion,
      ]);
    }


    function setBusy(value) {
      state.busy = Boolean(value);
      saveButton.disabled = state.busy || state.conflict;
      reloadButton.disabled = state.busy;
      participationReportButton.disabled = state.busy;
      entriesReloadButton.disabled = state.busy || state.entriesBusy;
      renderDrawControls();
      renderEntrants();
      renderDrawHistory();
    }

    function activeDraws() {
      const source = state.data && Array.isArray(state.data.draws) ? state.data.draws : [];
      return source.filter(function (draw) {
        return draw && (draw.selection_status === 'potential' || draw.selection_status === 'verified');
      });
    }

    function verifiedDraws() {
      return activeDraws().filter(function (draw) {
        return draw.selection_status === 'verified';
      });
    }

    function configuredWinnerCount() {
      return 1;
    }

    function updateRulesReviewProgress() {
      const data = state.data || {};
      const version = text(data.rules_version);
      const disclosureAvailable = Boolean(text(data.vendor_responsibility_disclosure));
      const settings = data.settings || {};
      const rulesUrlAvailable = Boolean(trustedWeddingWinUrl(data.terms_url || settings.official_rules_url));
      const rulesReviewed = Boolean(version && state.rulesViewedVersion === version);
      const responsibilityReviewed = Boolean(version && state.responsibilityViewedVersion === version);
      const combinedAccepted = Boolean(
        rulesUrlAvailable && disclosureAvailable && legalAccepted.checked && rulesReviewed && responsibilityReviewed
      );

      legalAccepted.closest('.ww-qrvd-check').classList.toggle('is-complete', combinedAccepted);
      const acceptanceSaved = Boolean(
        settings.legal_terms_accepted && settings.vendor_responsibility_acknowledged &&
        data.rules_current !== false
      );
      acceptanceState.textContent = !rulesUrlAvailable || !disclosureAvailable
        ? 'Rules unavailable — please reload'
        : combinedAccepted
          ? acceptanceSaved ? 'Agreed' : 'Ready to save'
          : 'Not agreed yet';
    }

    function renderDrawControls() {
      const data = state.data || {};
      const active = activeDraws();
      const potential = active.find(function (draw) { return draw.selection_status === 'potential'; });
      const verified = verifiedDraws();
      const maximum = configuredWinnerCount();
      const remaining = Math.max(0, maximum - verified.length - (potential ? 1 : 0));
      const poolCount = Math.max(0, Math.floor(number(
        data.eligible_entry_count != null
          ? data.eligible_entry_count
          : data.selection_pool_count
      )));
      const hasPool = poolCount > 0 || (
        poolCount === 0 &&
        number(data.entry_count || data.entrant_count) > 0 &&
        data.eligible_entry_count == null &&
        data.selection_pool_count == null
      );
      const canSelect = Boolean(hasPool && data.can_draw && !potential && remaining > 0 && !data.draw_limit_reached);

      emailNotice.classList.add('is-hidden');
      emailNotice.textContent = '';
      drawButton.hidden = Boolean(potential);

      if (potential) {
        drawStatusLabel.textContent = 'Your selected couple';
        drawStatus.textContent = 'Send their winner email or choose a different couple below.';
        drawButton.textContent = 'Couple selected';
        drawButton.disabled = true;
      } else if (canSelect) {
        drawStatusLabel.textContent = 'Ready to choose';
        drawStatus.textContent = 'Choose one couple at random.';
        drawButton.textContent = 'Select potential winner';
        drawButton.disabled = state.busy;
      } else if (remaining <= 0 || data.draw_limit_reached) {
        drawStatusLabel.textContent = 'Winner chosen';
        drawStatus.textContent = 'Your winner has been chosen. Check their email status below.';
        drawButton.textContent = 'Winner selected';
        drawButton.disabled = true;
      } else if (data.settings && !data.settings.enabled) {
        drawStatusLabel.textContent = 'Entries are off';
        drawStatus.textContent = 'Open your draw in Step 2 to get started.';
        drawButton.textContent = 'Choose a winner';
        drawButton.disabled = true;
      } else if (!hasPool) {
        drawStatusLabel.textContent = 'No couples ready';
        drawStatus.textContent = 'Check your couples list in Step 3 before choosing a winner.';
        drawButton.textContent = 'Choose a winner';
        drawButton.disabled = true;
      } else {
        drawStatusLabel.textContent = 'Not time to draw yet';
        drawStatus.textContent = `You can choose a winner after ${formatDate(data.draw_opens_at)}.`;
        drawButton.textContent = 'Choose a winner';
        drawButton.disabled = true;
      }
    }

    function renderDrawHistory() {
      draws.replaceChildren();
      const source = state.data && Array.isArray(state.data.draws) ? state.data.draws : [];
      if (!source.length) {
        draws.appendChild(makeElement('p', '', 'No winner chosen yet.'));
        return;
      }

      source.forEach(function (draw, index) {
        const card = makeElement('article', 'ww-qrvd-selection');
        const statusValue = text(draw.selection_status || 'legacy').toLowerCase();
        const statusCopy = statusValue === 'potential'
          ? 'Selected couple'
          : statusValue === 'verified'
            ? 'Winner confirmed'
            : statusValue === 'replaced'
              ? 'Another couple selected'
              : statusValue === 'disqualified'
                ? 'Disqualified selection'
                : 'Previous selection';
        const heading = makeElement('strong', '', `Selection ${number(draw.draw_number) || ''}: ${statusCopy}`);
        heading.id = `ww-qrvd-selection-${text(draw.id) || number(draw.draw_number) || index + 1}`;
        card.setAttribute('aria-labelledby', heading.id);
        card.appendChild(heading);

        const contactFields = [
          ['Name', draw.winner_name],
          ['Email', draw.winner_email],
          ['Phone', draw.winner_phone],
          ['Wedding date', draw.winner_wedding_date],
        ];
        const availableContactFields = contactFields.filter(function (field) {
          return Boolean(text(field[1]));
        });
        if (availableContactFields.length) {
          availableContactFields.forEach(function (field) {
            card.appendChild(makeElement('span', '', `${field[0]}: ${text(field[1])}`));
          });
          card.appendChild(makeElement('span', '', 'Their contact details stay in your contacts and download.'));
        } else {
          card.appendChild(makeElement('span', '', 'No contact details were recorded for this selection.'));
        }

        if (statusValue === 'potential') {
          const replaceButton = makeElement('button', 'ww-qrvd-secondary', 'Choose a different winner');
          replaceButton.type = 'button';
          replaceButton.dataset.action = 'replace-winner';
          replaceButton.dataset.drawId = text(draw.id);
          replaceButton.disabled = state.busy || !text(draw.id);
          card.appendChild(replaceButton);
        }
        if (draw.email_error && statusValue === 'verified') {
          card.appendChild(makeElement('span', '', `Notice status: ${text(draw.email_error)}`));
        }
        if (statusValue === 'verified' || statusValue === 'potential') {
          const needsConfirmation = statusValue === 'potential';
          const noticeSentAt = text(draw.couple_email_sent_at || draw.winner_email_sent_at || draw.notice_sent_at);
          const noticeComplete = draw.notice_complete === true || Boolean(noticeSentAt);
          const noticeOutstanding = draw.notice_pending === true && !noticeComplete;
          const canTestSuppressedNotice = Boolean(
            needsConfirmation
              ? draw.can_confirm_and_test_suppressed_notice === true
              : draw.can_test_suppressed_notice === true ||
                (state.data && state.data.can_test_suppressed_notice === true)
          );
          const suppressedTestComplete = canTestSuppressedNotice && state.suppressedTestedDrawIds.has(text(draw.id));
          const noticeStatus = makeElement(
            'span',
            noticeComplete || suppressedTestComplete ? 'ww-qrvd-email-status is-sent' : 'ww-qrvd-email-status',
            noticeSentAt
              ? `Winner email sent ${formatDate(noticeSentAt)}`
              : noticeComplete
                ? 'Winner email delivery is complete.'
                : suppressedTestComplete
                  ? 'Test Send completed. Email remained suppressed and was not delivered.'
                  : noticeOutstanding
                    ? 'Winner email has not been sent.'
                    : needsConfirmation ? 'No email has been sent.' : 'Winner email is not ready to send.'
          );
          card.appendChild(noticeStatus);

          const sendButton = makeElement(
            'button',
            'ww-qrvd-primary ww-qrvd-send-notice',
            noticeComplete
              ? 'Winner email sent'
              : suppressedTestComplete
                ? 'Test Send complete (email suppressed)'
                : canTestSuppressedNotice
                  ? 'Test Send (email suppressed)'
                  : draw.email_error
                    ? 'Retry winner email'
                    : 'Send winner email'
          );
          sendButton.type = 'button';
          sendButton.dataset.action = 'send-notice';
          sendButton.dataset.drawId = text(draw.id);
          sendButton.setAttribute(
            'aria-label',
            `${noticeComplete ? 'Winner email sent to' : suppressedTestComplete ? 'Suppressed email test completed for' : canTestSuppressedNotice ? 'Test suppressed winner email for' : 'Send winner email to'} ${text(draw.winner_name) || 'this verified winner'}`
          );
          const outboundUnavailable = state.data && (
            state.data.outbound_email_suppressed || state.data.outbound_email_enabled === false
          );
          sendButton.disabled = Boolean(
            state.busy ||
            noticeComplete ||
            suppressedTestComplete ||
            (outboundUnavailable && !canTestSuppressedNotice) ||
            (needsConfirmation
              ? draw.can_confirm_and_send_notice !== true && !canTestSuppressedNotice
              : draw.can_send_notice === false && !canTestSuppressedNotice) ||
            !text(draw.id) || !text(draw.winner_email)
          );
          if (outboundUnavailable && !canTestSuppressedNotice) {
            sendButton.textContent = state.data.outbound_email_suppressed
              ? 'Email suppressed in review fixture'
              : 'Winner email unavailable';
          }
          card.appendChild(sendButton);
        }
        draws.appendChild(card);
      });
    }


    function entryValue(entry, keys) {
      for (const key of keys) {
        const value = text(entry && entry[key]);
        if (value) return value;
      }
      return '';
    }

    function pendingPotentialWinner() {
      return activeDraws().find(function (draw) {
        return draw.selection_status === 'potential';
      });
    }

    function entrantSelectionDetails(entry) {
      const included = entry.included !== false;
      const poolStatus = entryValue(entry, ['pool_status']);
      const previousWinner = poolStatus === 'previous_winner' || entry.previous_winner === true || entry.has_won === true;
      const alreadySelected = poolStatus === 'already_selected';
      const disqualified = poolStatus === 'disqualified';
      const replaced = poolStatus === 'replaced' || entryValue(entry, ['selection_status']) === 'replaced';
      const reacceptanceRequired = poolStatus === 'reacceptance_required';
      const inPersonScanRequired = poolStatus === 'in_person_scan_required';
      const inSelectionPool = !replaced && (poolStatus
        ? poolStatus === 'included'
        : included && !previousWinner);
      const selectionProtected = disqualified || alreadySelected || replaced || reacceptanceRequired || inPersonScanRequired || (previousWinner && included);
      const statusLabel = inSelectionPool
        ? 'In the draw'
        : alreadySelected
          ? 'Already selected'
          : replaced
            ? 'Another couple selected'
            : disqualified
              ? 'Not eligible'
              : reacceptanceRequired
                ? 'Needs to scan and agree again'
                : inPersonScanRequired
                  ? 'Needs a show scan'
                  : previousWinner && included
                    ? 'Previous winner'
                    : 'Out of the draw';
      const managementLabel = selectionProtected
        ? 'View details'
        : included
          ? 'Manage entry'
          : 'Add back or view details';

      return {
        included: included,
        poolStatus: poolStatus,
        previousWinner: previousWinner,
        alreadySelected: alreadySelected,
        disqualified: disqualified,
        replaced: replaced,
        inSelectionPool: inSelectionPool,
        selectionProtected: selectionProtected,
        statusLabel: statusLabel,
        managementLabel: managementLabel,
      };
    }

    function entrantInitials(value) {
      const parts = text(value).split(/\s+/).filter(Boolean);
      if (!parts.length) return 'WW';
      const first = Array.from(parts[0])[0] || '';
      const last = parts.length > 1 ? Array.from(parts[parts.length - 1])[0] || '' : '';
      return `${first}${last}`.toUpperCase();
    }

    function formatWeddingDate(value) {
      const raw = text(value);
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
      if (!match) return raw;
      const date = new Date(Date.UTC(number(match[1]), number(match[2]) - 1, number(match[3]), 12));
      if (Number.isNaN(date.getTime())) return raw;
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'UTC',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(date);
    }

    function appendContactItem(container, label, value, kind) {
      const item = makeElement('div', 'ww-qrvd-contact-item');
      item.appendChild(makeElement('span', 'ww-qrvd-contact-label', label));
      const cleanValue = text(value);
      let valueElement = makeElement('span', 'ww-qrvd-contact-value', cleanValue || 'Not provided');

      if (cleanValue && kind === 'email' && /^[^@\s?&#]+@[^@\s?&#]+\.[^@\s?&#]+$/.test(cleanValue)) {
        valueElement = makeElement('a', 'ww-qrvd-contact-value', cleanValue);
        valueElement.href = `mailto:${cleanValue}`;
        valueElement.setAttribute('aria-label', `Email ${cleanValue}`);
      } else if (cleanValue && kind === 'phone') {
        const dialValue = cleanValue.replace(/[^0-9+]/g, '');
        if (dialValue.replace(/[^0-9]/g, '').length >= 7) {
          valueElement = makeElement('a', 'ww-qrvd-contact-value', cleanValue);
          valueElement.href = `tel:${dialValue}`;
          valueElement.setAttribute('aria-label', `Call ${cleanValue}`);
        }
      }

      item.appendChild(valueElement);
      container.appendChild(item);
    }

    function renderEntrants() {
      if (!entrants) return;
      entrants.setAttribute('aria-busy', state.entriesBusy ? 'true' : 'false');
      entrants.replaceChildren();
      const pending = Boolean((state.data && state.data.selection_in_progress) || pendingPotentialWinner());
      entryManagementLock.classList.toggle('is-hidden', !pending);
      entriesReloadButton.disabled = state.busy || state.entriesBusy;

      if (state.entriesBusy) {
        entrantVisibleCount.textContent = 'Loading contacts…';
        entrants.appendChild(makeElement('p', 'ww-qrvd-empty', 'Loading your couples…'));
        return;
      }
      if (!state.entriesLoaded) {
        entrantVisibleCount.textContent = 'Contacts load when this step opens.';
        entrants.appendChild(makeElement('p', 'ww-qrvd-empty', 'Choose Refresh list to load your couples.'));
        return;
      }
      if (!state.entries.length) {
        entrantVisibleCount.textContent = '0 contacts';
        entrants.appendChild(makeElement('p', 'ww-qrvd-empty', 'No couples have entered your draw yet.'));
        return;
      }

      const query = text(state.entrantQuery).toLowerCase();
      const filteredEntries = state.entries.map(function (entry, index) {
        return { entry: entry, index: index, selection: entrantSelectionDetails(entry) };
      }).filter(function (record) {
        const fields = [
          entryValue(record.entry, ['name', 'couple_name']),
          entryValue(record.entry, ['email', 'couple_email']),
          entryValue(record.entry, ['phone', 'couple_phone']),
          entryValue(record.entry, ['wedding_date', 'couple_wedding_date']),
          entryValue(record.entry, ['wedding_venue', 'couple_wedding_venue']),
        ].join(' ').toLowerCase();
        const matchesQuery = !query || fields.includes(query);
        const matchesFilter = state.entrantFilter === 'all'
          || (state.entrantFilter === 'included' && record.selection.inSelectionPool)
          || (state.entrantFilter === 'excluded' && !record.selection.inSelectionPool);
        return matchesQuery && matchesFilter;
      });

      entrantVisibleCount.textContent = filteredEntries.length === state.entries.length
        ? `${state.entries.length} ${state.entries.length === 1 ? 'contact' : 'contacts'}`
        : `Showing ${filteredEntries.length} of ${state.entries.length} contacts`;

      if (!filteredEntries.length) {
        const empty = makeElement('div', 'ww-qrvd-empty-contact');
        empty.appendChild(makeElement('strong', '', 'No matching couples'));
        empty.appendChild(makeElement('span', '', 'Try another search or choose a different filter.'));
        entrants.appendChild(empty);
        return;
      }

      filteredEntries.forEach(function (record) {
        const entry = record.entry;
        const index = record.index;
        const selection = record.selection;
        const participantReference = entryValue(entry, ['participant_reference', 'reference']);
        const card = makeElement('article', 'ww-qrvd-entrant');
        const header = makeElement('div', 'ww-qrvd-entrant-heading');
        const entrantName = entryValue(entry, ['name', 'couple_name']) || `Opted-in couple ${index + 1}`;
        const identity = makeElement('div', 'ww-qrvd-entrant-identity');
        const avatar = makeElement('span', 'ww-qrvd-entrant-avatar', entrantInitials(entrantName));
        avatar.setAttribute('aria-hidden', 'true');
        identity.appendChild(avatar);
        const nameBlock = makeElement('div', 'ww-qrvd-entrant-name');
        const entrantHeading = makeElement('strong', '', entrantName);
        entrantHeading.id = `ww-qrvd-entrant-name-${index}`;
        nameBlock.appendChild(entrantHeading);
        nameBlock.appendChild(makeElement('span', '', `Entry ${index + 1}`));
        identity.appendChild(nameBlock);
        card.setAttribute('aria-labelledby', entrantHeading.id);
        header.appendChild(identity);
        header.appendChild(makeElement(
          'span',
          selection.inSelectionPool ? 'ww-qrvd-entry-pill is-included' : 'ww-qrvd-entry-pill is-excluded',
          selection.statusLabel
        ));
        card.appendChild(header);

        const contactGrid = makeElement('div', 'ww-qrvd-contact-grid');
        appendContactItem(contactGrid, 'Email', entryValue(entry, ['email', 'couple_email']), 'email');
        appendContactItem(contactGrid, 'Phone', entryValue(entry, ['phone', 'couple_phone']), 'phone');
        appendContactItem(contactGrid, 'Wedding date', formatWeddingDate(entryValue(entry, ['wedding_date', 'couple_wedding_date'])), 'date');
        appendContactItem(contactGrid, 'Wedding venue', entryValue(entry, ['wedding_venue', 'couple_wedding_venue']), 'venue');
        card.appendChild(contactGrid);

        const adminDetails = makeElement('details', 'ww-qrvd-entry-admin');
        adminDetails.appendChild(makeElement('summary', '', selection.managementLabel));
        const adminBody = makeElement('div', 'ww-qrvd-entry-admin-body');
        if (!selection.included) {
          const reason = entryValue(entry, ['exclusion_reason', 'reason']);
          if (reason) adminBody.appendChild(makeElement('p', 'ww-qrvd-entry-reason', `Reason: ${reason}`));
        }
        const statusHelp = selection.replaced
          ? 'Another couple was chosen. Their contact details stay here and in your download.'
          : selection.poolStatus === 'reacceptance_required'
            ? 'They need to scan your booth and agree to the current rules before entering again.'
            : selection.poolStatus === 'in_person_scan_required'
              ? 'They need to scan your booth at the wedding show before they can be chosen.'
              : selection.alreadySelected
                ? 'They have been chosen. Complete their checks in the Winner step.'
                : selection.disqualified
                  ? 'They cannot be added back to this draw.'
                  : selection.previousWinner && selection.included
                    ? 'They have already won and cannot be chosen again.'
                    : '';
        if (statusHelp) adminBody.appendChild(makeElement('p', 'ww-qrvd-entry-reason', statusHelp));

        const controls = makeElement('div', 'ww-qrvd-entry-controls');
        const rowCanUpdate = entry.can_update !== false && state.data && state.data.can_update_entries !== false;
        if (selection.included && !selection.selectionProtected) {
          const reasonId = `ww-qrvd-exclusion-reason-${index}`;
          const reasonLabel = makeElement('label', 'ww-qrvd-entry-reason-field');
          reasonLabel.setAttribute('for', reasonId);
          reasonLabel.appendChild(makeElement('span', '', 'Reason to remove'));
          const reasonSelect = document.createElement('select');
          reasonSelect.id = reasonId;
          reasonSelect.dataset.role = 'exclude-reason';
          [
            ['', 'Choose a reason'],
            ['Duplicate entry', 'Duplicate entry'],
            ['Does not meet the published rules', 'Does not meet the published rules'],
            ['Other documented reason', 'Other documented reason'],
          ].forEach(function (optionValue) {
            const option = document.createElement('option');
            option.value = optionValue[0];
            option.textContent = optionValue[1];
            reasonSelect.appendChild(option);
          });
          reasonSelect.disabled = pending || !rowCanUpdate || state.busy || state.entriesBusy;
          reasonLabel.appendChild(reasonSelect);
          controls.appendChild(reasonLabel);
        }

        if (!selection.selectionProtected) {
          const actionButton = makeElement(
            'button',
            selection.included ? 'ww-qrvd-secondary' : 'ww-qrvd-primary',
            selection.included ? 'Remove from draw' : 'Add back to draw'
          );
          actionButton.type = 'button';
          actionButton.dataset.action = 'entry-update';
          actionButton.dataset.participantReference = participantReference;
          actionButton.dataset.included = selection.included ? 'false' : 'true';
          actionButton.setAttribute(
            'aria-label',
            `${selection.included ? 'Remove' : 'Add'} ${entrantName} ${selection.included ? 'from' : 'back to'} the draw`
          );
          actionButton.disabled = pending || !rowCanUpdate || state.busy || state.entriesBusy || !participantReference;
          controls.appendChild(actionButton);
        }
        adminBody.appendChild(controls);
        adminBody.appendChild(makeElement('p', 'ww-qrvd-entry-csv-note', 'Their contact details stay in your download, even if removed from the draw.'));
        adminDetails.appendChild(adminBody);
        card.appendChild(adminDetails);
        entrants.appendChild(card);
      });
    }

    function applyEntrantData(data) {
      const current = state.data || {};
      const currentVendor = current.vendor || {};
      const responseVendor = data && data.vendor ? data.vendor : {};
      if (
        (data.event_key && text(data.event_key) !== text(current.event_key)) ||
        (responseVendor.id && text(responseVendor.id) !== text(currentVendor.id))
      ) {
        throw new Error('The entrant list did not match this signed-in vendor and event.');
      }
      if (!data || !Array.isArray(data.entries)) {
        throw new Error('The entrant list returned an unreadable response.');
      }
      state.entries = data.entries;
      state.entriesLoaded = true;
      const entrantTotal = Math.max(0, Math.floor(number(data.entrant_count != null ? data.entrant_count : data.entry_count)));
      const poolTotal = Math.max(0, Math.floor(number(
        data.eligible_entry_count != null ? data.eligible_entry_count : data.selection_pool_count
      )));
      const includedTotal = Math.max(0, Math.floor(number(
        data.included_entry_count != null ? data.included_entry_count : poolTotal
      )));
      const excludedTotal = Math.max(0, Math.floor(number(
        data.excluded_entry_count != null ? data.excluded_entry_count : data.excluded_count
      )));
      state.data = Object.assign({}, current, {
        vendor: data.vendor || current.vendor,
        entry_count: entrantTotal,
        entrant_count: entrantTotal,
        eligible_entry_count: poolTotal,
        included_entry_count: includedTotal,
        excluded_entry_count: excludedTotal,
        selection_pool_count: poolTotal,
        excluded_count: excludedTotal,
        can_update_entries: data.can_update_entries !== false,
        selection_in_progress: data.selection_in_progress === true,
      });
      entryCount.textContent = String(entrantTotal);
      entryCountLabel.textContent = entrantTotal === 1 ? 'opted-in couple' : 'opted-in couples';
      selectionPoolCount.textContent = String(poolTotal);
      excludedCount.textContent = String(Math.max(0, entrantTotal - poolTotal));
      renderEntrants();
      renderDrawControls();
      updateWizardSummary();
    }

    async function loadEntrants() {
      if (state.entriesBusy || !state.data) return;
      state.entriesBusy = true;
      entryStatus.classList.remove('is-error', 'is-success');
      entryStatus.textContent = 'Loading your couples…';
      renderEntrants();
      try {
        const data = await request(root, 'vendor_raffle_entries_get', { client_platform: 'website' });
        applyEntrantData(data);
        // The contact count and list already show the result; reserve this
        // status area for loading and actionable errors.
        entryStatus.textContent = '';
        entryStatus.classList.add('is-success');
      } catch (error) {
        entryStatus.textContent = error.message || 'Could not load your couples. Please try again.';
        entryStatus.classList.add('is-error');
      } finally {
        state.entriesBusy = false;
        renderEntrants();
      }
    }

    async function updateEntrant(participantReference, included, reason) {
      if (state.entriesBusy || state.busy || pendingPotentialWinner()) return;
      if (!participantReference) {
        entryStatus.textContent = 'This entry could not be updated. Please refresh the list.';
        entryStatus.classList.add('is-error');
        return;
      }
      if (!included && !reason) {
        entryStatus.textContent = 'Choose a documented reason before excluding this entrant.';
        entryStatus.classList.add('is-error');
        return;
      }
      const verb = included ? 'restore' : 'remove';
      if (!window.confirm(`${included ? 'Restore' : 'Remove'} this couple ${included ? 'to' : 'from'} random winner selection? They will remain in the CSV.`)) return;

      state.entriesBusy = true;
      entryStatus.classList.remove('is-error', 'is-success');
      entryStatus.textContent = `${included ? 'Restoring' : 'Removing'} this entrant…`;
      renderEntrants();
      try {
        const data = await request(root, 'vendor_raffle_entry_update', {
          participant_reference: participantReference,
          included: Boolean(included),
          exclusion_reason: included ? '' : reason,
          client_platform: 'website',
        });
        applyEntrantData(data);
        entryStatus.textContent = included
          ? 'Entrant restored to random winner selection. They remain in the CSV.'
          : 'Entrant removed from random winner selection. They remain in the CSV.';
        entryStatus.classList.add('is-success');
      } catch (error) {
        entryStatus.textContent = error.message || `Could not ${verb} this entrant.`;
        entryStatus.classList.add('is-error');
      } finally {
        state.entriesBusy = false;
        renderEntrants();
        entryStatus.setAttribute('tabindex', '-1');
        entryStatus.focus();
      }
    }

    function renderDashboard(data, options) {
      const hydrateForm = !options || options.hydrateForm !== false;
      const firstRender = !state.data;
      if (!data.vendor && state.data && state.data.vendor) {
        data = Object.assign({}, data, { vendor: state.data.vendor });
      }
      const previousEventKey = text(state.data && state.data.event_key);
      const previousVendorId = text(state.data && state.data.vendor && state.data.vendor.id);
      state.data = data;
      if (
        (previousEventKey && previousEventKey !== text(data.event_key)) ||
        (previousVendorId && previousVendorId !== text(data.vendor && data.vendor.id))
      ) {
        state.entries = [];
        state.entriesLoaded = false;
      }
      workspace.classList.remove('is-hidden');
      appReviewFixtureNotice.classList.toggle('is-hidden', !data.app_review_fixture);
      emailTestFixtureNotice.classList.toggle('is-hidden', !data.email_test_fixture);

      const settings = data.settings || {};
      const currentRulesVersion = text(data.rules_version);
      const currentRulesAccepted = Boolean(
        settings.legal_terms_accepted &&
        settings.vendor_responsibility_acknowledged &&
        data.rules_current !== false
      );
      const exactResponsibilityDisclosure = text(data.vendor_responsibility_disclosure);
      const rulesUrl = trustedWeddingWinUrl(data.terms_url || settings.official_rules_url);
      vendorResponsibilityDisclosure.textContent = exactResponsibilityDisclosure ||
        'The current vendor responsibility agreement could not be verified. Reload before accepting or opening entries.';
      legalAccepted.disabled = !exactResponsibilityDisclosure || !rulesUrl;
      vendorResponsibilityDetails.classList.toggle('is-unavailable', !exactResponsibilityDisclosure);
      if (hydrateForm) {
        enabled.checked = Boolean(settings.enabled);
        const draftFormatting = options && options.draftFormatting;
        description.value = draftFormatting && samePrizeWording(draftFormatting.description, settings.prize_description)
          ? draftFormatting.description
          : formatPrizeDraftDescription(settings.prize_title, settings.prize_description);
        prizeValue.value = draftFormatting && text(draftFormatting.prizeValue) &&
          Number.isFinite(Number(draftFormatting.prizeValue)) &&
          Number(draftFormatting.prizeValue) === Number(settings.prize_approx_value_cad)
            ? draftFormatting.prizeValue
            : number(settings.prize_approx_value_cad) > 0 ? String(settings.prize_approx_value_cad) : '';
        legalAccepted.checked = currentRulesAccepted;
        state.rulesViewedVersion = currentRulesAccepted ? currentRulesVersion : '';
        state.responsibilityViewedVersion = currentRulesAccepted ? currentRulesVersion : '';
        vendorResponsibilityDetails.open = false;
      }

      if (rulesUrl) {
        rulesLink.href = rulesUrl;
        rulesLink.removeAttribute('aria-disabled');
      } else {
        rulesLink.href = '#';
        rulesLink.setAttribute('aria-disabled', 'true');
      }
      updateRulesReviewProgress();


      eligibility.textContent = text(data.eligibility_region || settings.eligibility_region) || 'See the current official rules';
      entryClose.textContent = formatDate(data.entry_closes_at || settings.entry_closes_at);
      drawAt.textContent = formatDate(data.draw_at || settings.draw_at);
      odds.textContent = text(data.odds_basis || settings.odds_basis) || 'Odds depend on the number of eligible entries received.';

      const locked = prizeDetailsLocked(data);
      description.disabled = locked;
      prizeValue.disabled = locked;
      materialLock.textContent = data.prize_details_lock_reason === 'sending'
        ? 'The winner email is being sent. Prize details are temporarily locked.'
        : data.prize_details_lock_reason === 'unconfirmed'
          ? 'Email delivery is being checked. Prize details are temporarily locked.'
          : data.prize_details_lock_reason === 'sent'
            ? 'Prize details are locked because the winner email has been sent.'
            : 'Prize details are currently locked. Refresh to check their status.';
      materialLock.classList.toggle('is-hidden', !locked);

      const count = Math.max(0, Math.floor(number(data.entrant_count != null ? data.entrant_count : data.entry_count)));
      const poolCount = Math.max(0, Math.floor(number(
        data.eligible_entry_count != null
          ? data.eligible_entry_count
          : data.selection_pool_count != null
            ? data.selection_pool_count
            : count
      )));
      entryCount.textContent = String(count);
      entryCountLabel.textContent = count === 1 ? 'opted-in couple' : 'opted-in couples';
      selectionPoolCount.textContent = String(poolCount);
      excludedCount.textContent = String(Math.max(0, count - poolCount));
      reloadButton.classList.toggle('is-hidden', !state.conflict);
      saveButton.disabled = state.busy || state.conflict;
      renderDrawControls();
      renderDrawHistory();
      renderEntrants();
      updateWizardSummary();
      if (firstRender && !state.initialStepSelected) {
        state.initialStepSelected = true;
        showWizardStep(recommendedWizardStep(data), { userInitiated: false, focus: false });
      }
      if (state.currentStep === 3 && !state.entriesLoaded && !state.entriesBusy) {
        void loadEntrants();
      }
    }

    async function load() {
      setBusy(true);
      state.conflict = false;
      reloadButton.classList.add('is-hidden');
      setStatus('Loading your draw…');
      try {
        const data = await request(root, 'vendor_raffle_get');
        if (!data.vendor) throw new Error('This account is not on the QR Bingo vendor list.');
        renderDashboard(data);
        setStatus('Your draw is ready to edit. Changes are saved when you choose Save and continue.', 'success');
      } catch (error) {
        workspace.classList.add('is-hidden');
        setStatus(error.message || 'Vendor draw tools are unavailable.', 'error');
      } finally {
        setBusy(false);
      }
    }

    function validateDraft() {
      if (!enabled.checked) return null;
      if (!text(description.value)) return { message: 'Add the prize details before opening entries.', step: 1 };
      if (number(prizeValue.value) <= 0) return { message: 'Add a positive prize value or maximum savings in CAD before opening entries.', step: 1 };
      const version = text(state.data && state.data.rules_version);
      if (!version) return { message: 'Reload the current Official Rules before opening entries.', step: 2 };
      const settings = state.data && state.data.settings ? state.data.settings : {};
      if (!trustedWeddingWinUrl((state.data && state.data.terms_url) || settings.official_rules_url)) {
        return { message: 'Reload the current Official Rules link before opening entries.', step: 2 };
      }
      if (!text(state.data && state.data.vendor_responsibility_disclosure)) return { message: 'Reload the exact vendor responsibility agreement before opening entries.', step: 2 };
      if (!legalAccepted.checked || state.rulesViewedVersion !== version || state.responsibilityViewedVersion !== version) {
        return { message: 'Read the rules above, then check the agreement box.', step: 2 };
      }
      return null;
    }

    async function save() {
      if (state.busy || state.conflict || !state.data) return;
      const validationError = validateDraft();
      if (validationError) {
        showWizardStep(validationError.step, { userInitiated: false, focus: true });
        setStatus(validationError.message, 'error');
        return;
      }

      const descriptionValue = text(description.value);
      const settings = state.data.settings || {};
      const locked = prizeDetailsLocked(state.data);
      const requestDescription = locked
        ? text(settings.prize_description)
        : descriptionValue;
      const requestPrizeTitle = locked
        ? text(settings.prize_title)
        : firstLine(descriptionValue);
      const requestPrizeValue = locked
        ? number(settings.prize_approx_value_cad)
        : number(prizeValue.value);
      // Accepting a newly published rules version remains a fresh vendor action,
      // independent of the winner-email prize lock.
      const requestLegalAccepted = Boolean(legalAccepted.checked);
      const rulesVersion = text(state.data.rules_version);
      const rulesReviewed = Boolean(
        requestLegalAccepted &&
        rulesVersion &&
        state.rulesViewedVersion === rulesVersion &&
        state.responsibilityViewedVersion === rulesVersion
      );
      const combinedAcceptance = Boolean(requestLegalAccepted && rulesReviewed);
      const submittedDraftSignature = currentDraftSignature();
      const submittedPrizeValue = prizeValue.value;
      const submittedEnabled = Boolean(enabled.checked);
      const submittedEvent = text(state.data.event_key);
      const submittedVendor = text(state.data.vendor && state.data.vendor.id);
      setBusy(true);
      setStatus('Saving your draw…');
      try {
        const data = await request(root, 'vendor_raffle_update', {
          enabled: submittedEnabled,
          prize_title: requestPrizeTitle,
          prize_description: requestDescription,
          prize_approx_value_cad: requestPrizeValue,
          max_winners: 1,
          exclude_previous_winners: true,
          legal_terms_accepted: combinedAcceptance,
          consent_version: rulesVersion,
          rules_viewed: combinedAcceptance,
          apple_non_sponsor_acknowledged: combinedAcceptance,
          vendor_responsibility_acknowledged: combinedAcceptance,
          vendor_responsibility_disclosure: text(state.data.vendor_responsibility_disclosure),
          client_platform: 'website',
          settings_updated_at: text(state.data.settings && state.data.settings.updated_at),
        });
        if (!data || data.ok !== true || !data.settings || !text(data.settings.updated_at) ||
          data.settings.enabled !== submittedEnabled || text(data.event_key) !== submittedEvent ||
          text(data.vendor && data.vendor.id) !== submittedVendor) {
          throw new Error('The save could not be confirmed. Please try again.');
        }
        const hasNewerEdits = currentDraftSignature() !== submittedDraftSignature;
        state.conflict = false;
        renderDashboard(data, {
          hydrateForm: !hasNewerEdits,
          draftFormatting: { description: descriptionValue, prizeValue: submittedPrizeValue },
        });
        if (!hasNewerEdits) showWizardStep(3, { userInitiated: false, focus: true });
        setStatus(
          hasNewerEdits
            ? 'Saved your earlier changes. Save again to keep your latest edits.'
            : `Saved. ${savedDrawReadiness(data).label}. ${savedDrawReadiness(data).message}`,
          'success'
        );
      } catch (error) {
        const conflictData = error && error.data;
        if ((error && error.status === 409) || (conflictData && conflictData.conflict)) {
          state.conflict = true;
          if (conflictData && conflictData.settings) renderDashboard(conflictData, { hydrateForm: false });
          reloadButton.classList.remove('is-hidden');
          saveButton.disabled = true;
          setStatus(`${error.message} Your unsaved draft is still visible. Reload the current settings before saving again.`, 'error');
        } else {
          setStatus(error.message || 'Could not save this draw.', 'error');
        }
      } finally {
        setBusy(false);
      }
    }

    async function drawPotentialWinner() {
      if (state.busy || !state.data) return;
      if (activeDraws().length > 0 || state.data.draw_limit_reached) return;
      if (!window.confirm('Select one potential winner at random? This does not send an email.')) return;

      setBusy(true);
      setStatus('Selecting your potential winner at random…');
      try {
        const data = await request(root, 'vendor_raffle_draw', {
          draw_reason: 'initial',
        });
        // The selection response intentionally omits the full entrant list.
        // Invalidate the cached cards so returning to Step 3 reloads the exact
        // pool status (pending/selected, no-repeat, or disqualified) instead of
        // showing the pre-selection label.
        state.entries = [];
        state.entriesLoaded = false;
        renderDashboard(data);
        setStatus('Couple selected. No email was sent.', 'success');
      } catch (error) {
        const responseData = error && error.data;
        if (responseData && responseData.settings) renderDashboard(responseData, { hydrateForm: false });
        setStatus(error.message || 'Could not select a potential winner.', 'error');
      } finally {
        setBusy(false);
      }
    }

    async function sendWinnerNotice(drawId) {
      if (state.busy || !state.data || !drawId) return;
      const draw = Array.isArray(state.data.draws)
        ? state.data.draws.find(function (item) { return text(item.id) === drawId; })
        : null;
      const potential = draw && draw.selection_status === 'potential';
      const suppressedTest = Boolean(draw && (potential
        ? draw.can_confirm_and_test_suppressed_notice === true
        : draw.can_test_suppressed_notice === true || state.data.can_test_suppressed_notice === true));
      const canSend = Boolean(draw && (potential
        ? draw.can_confirm_and_send_notice === true || suppressedTest
        : draw.selection_status === 'verified' && (draw.can_send_notice === true || suppressedTest)));
      const recipient = text(draw && draw.winner_email);
      if (!canSend || !recipient) {
        setStatus('Winner email is not available for this selection. Reload to check its status.', 'error');
        return;
      }
      const vendorId = text(state.data.vendor && state.data.vendor.id);
      const eventKey = text(state.data.event_key);
      const rulesVersion = text(state.data.rules_version);
      function sameNoticeContext(data) {
        return Boolean(data && vendorId && eventKey && rulesVersion &&
          text(data.vendor && data.vendor.id) === vendorId &&
          text(data.event_key) === eventKey && text(data.rules_version) === rulesVersion);
      }
      if (!sameNoticeContext(state.data)) return;
      const confirmation = suppressedTest
        ? `I confirm my business has completed the required checks in the Draw Rules. Run Test Send for ${recipient}? Email is suppressed in this App Review fixture and will not be delivered.`
        : `I confirm my business has completed the required checks in the Draw Rules. Send the winner email to ${recipient} now?`;
      if (!window.confirm(confirmation)) return;
      if (state.busy || !Array.isArray(state.data.draws) || !state.data.draws.includes(draw)) return;

      setBusy(true);
      setStatus('Sending winner email…');
      try {
        const data = await request(root, 'vendor_raffle_send_notice', {
          draw_id: drawId,
          winner_checks_confirmed: true,
          client_platform: 'website',
        });
        if (!sameNoticeContext(state.data) || !sameNoticeContext(data) || !data.settings || !Array.isArray(data.draws)) {
          throw new Error('Reload this draw to check the current email status. Do not send again until its status is shown.');
        }
        if (data.outbound_email_suppressed === true || suppressedTest) {
          state.suppressedTestedDrawIds.add(drawId);
        }
        renderDashboard(data);
        setStatus(
          data.outbound_email_suppressed === true || suppressedTest
            ? 'Test Send completed. Email was suppressed for App Review and was not delivered.'
            : data.email_test_fixture
            ? 'The isolated prize-email QA notice was processed for the allowlisted mailbox.'
            : 'Winner email sent. The selection record and delivery status are shown below.',
          'success'
        );
      } catch (error) {
        const responseData = error && error.data;
        if (sameNoticeContext(state.data) && sameNoticeContext(responseData) && responseData.settings && Array.isArray(responseData.draws)) {
          renderDashboard(responseData, { hydrateForm: false });
        }
        setStatus(error.message || 'Could not send the verified winner email. No new winner was selected.', 'error');
      } finally {
        setBusy(false);
      }
    }


    function currentPendingSelectionId() {
      const pending = pendingPotentialWinner();
      return text(pending && pending.id);
    }

    async function replacePotentialWinner(drawId) {
      if (state.busy || !state.data || !text(drawId)) return;
      drawId = text(drawId);
      const pending = activeDraws().find(function (draw) {
        return text(draw.id) === drawId && draw.selection_status === 'potential';
      });
      if (!pending) {
        setStatus('This selection has changed. Reload before choosing another winner.', 'error');
        return;
      }
      const vendorId = text(state.data.vendor && state.data.vendor.id);
      const eventKey = text(state.data.event_key);
      const rulesVersion = text(state.data.rules_version);
      if (!vendorId || !eventKey || !rulesVersion) {
        setStatus('Reload the current draw before choosing another winner.', 'error');
        return;
      }
      if (!window.confirm('Choose a different couple at random? Everyone stays in your contacts. No email will be sent.')) return;

      function sameSelectionContext(data) {
        return Boolean(data && text(data.event_key) === eventKey &&
          text(data.vendor && data.vendor.id) === vendorId && text(data.rules_version) === rulesVersion);
      }
      if (state.busy || currentPendingSelectionId() !== drawId || !sameSelectionContext(state.data)) return;

      setBusy(true);
      setStatus('Choosing a different winner…');
      try {
        const data = await request(root, 'vendor_raffle_replace', { draw_id: drawId });
        if (currentPendingSelectionId() !== drawId || !sameSelectionContext(state.data)) {
          throw new Error('The displayed draw has changed. Reload to see the current winner.');
        }
        const replaced = data && Array.isArray(data.draws) && data.draws.find(function (draw) {
          return text(draw.id) === drawId && draw.selection_status === 'replaced';
        });
        const replacement = data && Array.isArray(data.draws) && data.draws.find(function (draw) {
          return text(draw.id) && text(draw.id) !== drawId && draw.selection_status === 'potential';
        });
        if (!sameSelectionContext(data) || data.ok !== true || !data.settings || !replaced || !replacement) {
          throw new Error('The selection response could not be verified. Reload to see the current winner before trying again.');
        }
        state.entries = [];
        state.entriesLoaded = false;
        renderDashboard(data, { hydrateForm: false });
        setStatus('A different couple was selected. Everyone stays in your contacts. No email was sent.', 'success');
      } catch (error) {
        const responseData = error && error.data;
        const currentSelectionUnchanged = currentPendingSelectionId() === drawId && sameSelectionContext(state.data);
        if (currentSelectionUnchanged && sameSelectionContext(responseData) && responseData.settings) {
          renderDashboard(responseData, { hydrateForm: false });
        }
        const noAlternative = error && error.status === 409 && responseData && responseData.code === 'no_replacement_available';
        setStatus(!currentSelectionUnchanged
          ? 'The displayed draw has changed. Reload to see the current winner.'
          : noAlternative
            ? 'No other eligible couple is available. Your current selection is unchanged.'
            : error.message || 'Could not choose a different winner. Reload to check the current selection.', 'error');
      } finally {
        setBusy(false);
      }
    }

    function downloadCsv(report) {
      const filename = text(report && report.filename).replace(/[^A-Za-z0-9._-]/g, '-') || 'weddingwin-draw-entrants.csv';
      const csv = String(report && report.csv || '');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      link.hidden = true;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 1000);
    }

    async function downloadParticipationReport() {
      if (state.busy) return;
      setBusy(true);
      setStatus('Preparing your contact list…');
      try {
        const data = await request(root, 'vendor_raffle_export', { client_platform: 'website' });
        const current = state.data || {};
        const currentVendor = current.vendor || {};
        const expectedVendorBingoId = text(currentVendor.id);
        const expectedVendorBdUserId = text(currentVendor.user_id || root.dataset.userId);
        const expectedVendorName = text(currentVendor.name);
        const expectedEventKey = text(current.event_key);
        const expectedEventRevision = current.event_revision;
        const expectedRulesVersion = text(current.rules_version);
        if (
          !data.report ||
          data.report.contains_contact_data !== true ||
          data.report.contact_share_scope !== 'named_vendor_draw_administration' ||
          data.report.marketing_consent_included !== true ||
          data.report.report_kind !== 'named_vendor_draw_contacts' ||
          data.report.mime_type !== 'text/csv;charset=utf-8' ||
          data.report.rules_version !== expectedRulesVersion ||
          data.report.event_key !== expectedEventKey ||
          data.report.event_revision !== expectedEventRevision ||
          data.report.vendor_bingo_id !== expectedVendorBingoId ||
          data.report.vendor_bd_user_id !== expectedVendorBdUserId ||
          data.report.vendor_name !== expectedVendorName ||
          !expectedRulesVersion ||
          !expectedEventKey ||
          typeof expectedEventRevision !== 'number' ||
          !Number.isSafeInteger(expectedEventRevision) ||
          !expectedVendorBingoId ||
          !expectedVendorBdUserId ||
          !expectedVendorName ||
          typeof data.report.csv !== 'string'
        ) {
          throw new Error('The entrant list did not match this vendor, event, current rules, or required CSV privacy contract.');
        }
        if (number(data.report.row_count) < 1) {
          setStatus('No couples have entered your draw yet.', 'success');
          return;
        }
        downloadCsv(data.report);
        const count = Math.floor(number(data.report.row_count));
        setStatus(`Downloaded ${count} ${count === 1 ? 'contact' : 'contacts'}.`, 'success');
      } catch (error) {
        setStatus('Could not download your contacts. Please try again.', 'error');
      } finally {
        setBusy(false);
      }
    }

    rulesLink.addEventListener('click', function (event) {
      const url = trustedWeddingWinUrl(rulesLink.href);
      if (!url) {
        event.preventDefault();
        setStatus('The current official-rules link is unavailable. Keep entries off and contact Wedding Win.', 'error');
        return;
      }
    });

    legalAccepted.addEventListener('change', function () {
      const version = text(state.data && state.data.rules_version);
      const disclosureAvailable = Boolean(text(state.data && state.data.vendor_responsibility_disclosure));
      const settings = state.data && state.data.settings ? state.data.settings : {};
      const rulesUrlAvailable = Boolean(trustedWeddingWinUrl((state.data && state.data.terms_url) || settings.official_rules_url));
      if (legalAccepted.checked && (!version || !disclosureAvailable || !rulesUrlAvailable)) {
        legalAccepted.checked = false;
        state.rulesViewedVersion = '';
        state.responsibilityViewedVersion = '';
        setStatus('The current Official Rules or vendor responsibilities are unavailable. Reload before accepting.', 'error');
      } else if (legalAccepted.checked) {
        state.rulesViewedVersion = version;
        state.responsibilityViewedVersion = version;
      } else {
        state.rulesViewedVersion = '';
        state.responsibilityViewedVersion = '';
      }
      updateRulesReviewProgress();
      updateWizardSummary();
    });

    wizardButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        showWizardStep(button.dataset.wizardStep, { focus: true });
      });
    });
    root.querySelectorAll('[data-wizard-next]').forEach(function (button) {
      button.addEventListener('click', function () {
        showWizardStep(button.dataset.wizardNext, { focus: true });
      });
    });
    root.querySelectorAll('[data-wizard-back]').forEach(function (button) {
      button.addEventListener('click', function () {
        showWizardStep(button.dataset.wizardBack, { focus: true });
      });
    });
    description.addEventListener('input', updateWizardSummary);
    prizeValue.addEventListener('input', updateWizardSummary);
    enabled.addEventListener('change', updateWizardSummary);

    saveButton.addEventListener('click', save);
    reloadButton.addEventListener('click', load);
    drawButton.addEventListener('click', drawPotentialWinner);
    participationReportButton.addEventListener('click', downloadParticipationReport);
    entriesReloadButton.addEventListener('click', function () { void loadEntrants(); });
    entrantSearch.addEventListener('input', function () {
      state.entrantQuery = entrantSearch.value;
      renderEntrants();
    });
    entrantFilter.addEventListener('change', function () {
      state.entrantFilter = entrantFilter.value;
      renderEntrants();
    });
    entrants.addEventListener('click', function (event) {
      const button = event.target instanceof Element
        ? event.target.closest('[data-action="entry-update"]')
        : null;
      if (!button || !entrants.contains(button)) return;
      const card = button.closest('.ww-qrvd-entrant');
      const reasonSelect = card ? card.querySelector('[data-role="exclude-reason"]') : null;
      void updateEntrant(
        text(button.dataset.participantReference),
        button.dataset.included === 'true',
        reasonSelect ? text(reasonSelect.value) : ''
      );
    });
    draws.addEventListener('click', function (event) {
      const button = event.target instanceof Element
        ? event.target.closest('[data-action="send-notice"], [data-action="replace-winner"]')
        : null;
      if (!button || !draws.contains(button) || button.disabled) return;
      if (button.dataset.action === 'replace-winner') void replacePotentialWinner(text(button.dataset.drawId));
      else void sendWinnerNotice(text(button.dataset.drawId));
    });
    load();
  }

  document.querySelectorAll('[data-ww-qrvd]').forEach(initialize);
})();
</script>
