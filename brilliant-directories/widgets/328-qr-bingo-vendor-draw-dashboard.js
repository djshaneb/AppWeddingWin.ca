<script>
(function () {
  'use strict';

  const FUNCTION_URL = 'https://pszcjoyabwvzsxxjtkhs.supabase.co/functions/v1/bd-qr-bingo-vendor-sync';
  const PUBLISHABLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzemNqb3lhYnd2enN4eGp0a2hzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2OTMxMTYsImV4cCI6MjA5NDI2OTExNn0.QLCEmNcn1WAks0IHkCLmI3iY5K4GnRxZ9Sfy89GYrLo';

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function winnerCount(value) {
    const parsed = Math.floor(number(value));
    return parsed >= 1 && parsed <= 3 ? parsed : 1;
  }

  function firstLine(value) {
    return text(value).replaceAll(String.fromCharCode(13), '').split(String.fromCharCode(10))[0].trim();
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

  function makeElement(tag, className, content) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (content != null) element.textContent = String(content);
    return element;
  }

  async function request(root, action, extra) {
    const userId = text(root.dataset.userId);
    const token = text(root.dataset.token);
    if (!userId || !token) {
      const error = new Error('Sign in again before opening vendor draw tools.');
      error.status = 401;
      throw error;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(function () {
      controller.abort();
    }, 15000);

    try {
      const response = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${PUBLISHABLE_KEY}`,
          apikey: PUBLISHABLE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(Object.assign({
          action: action,
          native_session: { user_id: userId, token: token },
        }, extra || {})),
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
    const maxWinners = find('[data-field="max_winners"]');
    const excludePreviousWinners = find('[data-field="exclude_previous_winners"]');
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
    const reviewPanel = find('[data-role="review-panel"]');
    const reviewWinner = find('[data-role="review-winner"]');
    const skillQuestionPrompt = find('[data-role="skill-question-prompt"]');
    const reviewEligibilityConfirmed = find('[data-field="review-eligibility-confirmed"]');
    const reviewRulesReleaseConfirmed = find('[data-field="review-rules-release-confirmed"]');
    const reviewSkillAnswer = find('[data-field="review-skill-answer"]');
    const reviewVerificationDate = find('[data-field="review-verification-date"]');
    const reviewVerificationMethod = find('[data-field="review-verification-method"]');
    const reviewEvidenceReference = find('[data-field="review-evidence-reference"]');
    const reviewDisqualificationReason = find('[data-field="review-disqualification-reason"]');
    const reviewConfirmButton = find('[data-action="review-confirm"]');
    const reviewDisqualifyButton = find('[data-action="review-disqualify"]');
    const draws = find('[data-role="draws"]');

    const state = {
      data: null,
      busy: false,
      conflict: false,
      rulesViewedVersion: '',
      responsibilityViewedVersion: '',
      reviewDrawId: '',
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
        number(prizeValue.value) > 0 &&
        winnerCount(maxWinners.value) === number(maxWinners.value)
      );
      const acceptanceReady = Boolean(
        legalAccepted.checked &&
        text(data.vendor_responsibility_disclosure) &&
        rulesVersion &&
        state.rulesViewedVersion === rulesVersion &&
        state.responsibilityViewedVersion === rulesVersion
      );
      const entriesOpen = Boolean(settings.enabled && settings.legal_terms_accepted && data.rules_current !== false);
      const count = Math.max(0, Math.floor(number(data.entry_count != null ? data.entry_count : data.entrant_count)));

      wizardState1.textContent = prizeReady ? 'Prize ready' : 'Add details';
      wizardState2.textContent = entriesOpen && !enabled.checked
        ? 'Ready to close'
        : entriesOpen
          ? 'Entries open'
        : acceptanceReady && enabled.checked
          ? 'Ready to save'
          : 'Review and open';
      wizardState3.textContent = `${count} ${count === 1 ? 'entry' : 'entries'}`;
      wizardState4.textContent = text(drawStatusLabel.textContent) || 'Select and verify';

      wizardButtons.forEach(function (button) {
        const step = number(button.dataset.wizardStep);
        const complete = (step === 1 && prizeReady) ||
          (step === 2 && entriesOpen) ||
          (step === 4 && activeDraws().some(function (draw) { return draw.selection_status === 'verified'; }));
        button.classList.toggle('is-complete', complete);
      });

      saveButton.textContent = enabled.checked ? 'Save and open entries' : 'Save with entries off';
    }

    function validIsoCalendarDate(value) {
      const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(text(value));
      if (!match) return false;
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      const date = new Date(Date.UTC(year, month - 1, day));
      return date.getUTCFullYear() === year
        && date.getUTCMonth() === month - 1
        && date.getUTCDate() === day;
    }

    function setBusy(value) {
      state.busy = Boolean(value);
      saveButton.disabled = state.busy || state.conflict;
      reloadButton.disabled = state.busy;
      participationReportButton.disabled = state.busy;
      entriesReloadButton.disabled = state.busy || state.entriesBusy;
      reviewConfirmButton.disabled = state.busy;
      reviewDisqualifyButton.disabled = state.busy;
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
      const settings = state.data && state.data.settings ? state.data.settings : {};
      return winnerCount(settings.max_winners || (state.data && state.data.max_winners) || maxWinners.value);
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
      acceptanceState.textContent = !rulesUrlAvailable || !disclosureAvailable
        ? 'Unavailable until the current rules and responsibilities load'
        : combinedAccepted
          ? `Confirmed for rules version ${version}`
          : 'Not confirmed yet';
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

      if (potential) {
        drawStatusLabel.textContent = 'Awaiting vendor verification';
        drawStatus.textContent = 'A potential winner is selected. Complete the required winner verification before sending the winner notice.';
        drawButton.textContent = 'Awaiting verification';
        drawButton.disabled = true;
      } else if (canSelect) {
        drawStatusLabel.textContent = 'Selection is available';
        drawStatus.textContent = `${remaining} of ${maximum} ${remaining === 1 ? 'winner remains' : 'winners remain'} to be selected.`;
        drawButton.textContent = `Select winner ${verified.length + 1} of ${maximum}`;
        drawButton.disabled = state.busy;
      } else if (remaining <= 0 || data.draw_limit_reached) {
        drawStatusLabel.textContent = 'Selection limit reached';
        drawStatus.textContent = maximum === 1
          ? 'The configured winner has been selected. Winner email is sent separately from the verified record below.'
          : `All ${maximum} winners have been selected. Winner email is sent separately from each verified record below.`;
        drawButton.textContent = 'All winners selected';
        drawButton.disabled = true;
      } else if (data.settings && !data.settings.enabled) {
        drawStatusLabel.textContent = 'Entries are off';
        drawStatus.textContent = 'Open entries in Step 2 before potential-winner selection can become available.';
        drawButton.textContent = 'Select potential winner';
        drawButton.disabled = true;
      } else if (!hasPool) {
        drawStatusLabel.textContent = 'No included entrants';
        drawStatus.textContent = 'Restore an eligible entrant in Step 3 before selecting a potential winner.';
        drawButton.textContent = 'Select potential winner';
        drawButton.disabled = true;
      } else {
        drawStatusLabel.textContent = 'Selection is not open yet';
        drawStatus.textContent = `Selection opens after ${formatDate(data.draw_opens_at)}.`;
        drawButton.textContent = 'Select potential winner';
        drawButton.disabled = true;
      }
    }

    function renderDrawHistory() {
      draws.replaceChildren();
      const source = state.data && Array.isArray(state.data.draws) ? state.data.draws : [];
      if (!source.length) {
        draws.appendChild(makeElement('p', '', 'No potential winner has been selected.'));
        return;
      }

      source.forEach(function (draw, index) {
        const card = makeElement('article', 'ww-qrvd-selection');
        const statusValue = text(draw.selection_status || 'legacy').toLowerCase();
        const statusCopy = statusValue === 'potential'
          ? 'Potential winner — awaiting vendor verification'
          : statusValue === 'verified'
            ? 'Verified potential winner — eligible for prize fulfillment'
            : statusValue === 'disqualified'
              ? 'Disqualified selection'
              : 'Historical selection record';
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
          card.appendChild(makeElement('span', '', 'This couple accepted this vendor\u2019s draw and wedding-related marketing terms. Honour unsubscribe requests and protect the information under the Vendor Draw Rules.'));
        } else {
          card.appendChild(makeElement('span', '', 'No contact details were recorded for this selection.'));
        }

        if (draw.email_error && statusValue === 'verified') {
          card.appendChild(makeElement('span', '', `Notice status: ${text(draw.email_error)}`));
        }
        if (statusValue === 'verified') {
          const noticeSentAt = text(draw.couple_email_sent_at || draw.winner_email_sent_at || draw.notice_sent_at);
          const noticeComplete = draw.notice_complete === true || Boolean(noticeSentAt);
          const noticeOutstanding = draw.notice_pending === true && !noticeComplete;
          const canTestSuppressedNotice = Boolean(
            draw.can_test_suppressed_notice === true ||
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
                    : 'Winner email is not ready to send.'
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
            (draw.can_send_notice === false && !canTestSuppressedNotice) ||
            !text(draw.id)
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

    function renderReviewControls() {
      const pending = activeDraws().find(function (draw) {
        return draw.selection_status === 'potential';
      });
      reviewPanel.classList.toggle('is-hidden', !pending);
      if (!pending) {
        state.reviewDrawId = '';
        return;
      }

      const pendingId = text(pending.id);
      reviewWinner.textContent = text(pending.winner_name) || 'Selected entrant';
      skillQuestionPrompt.textContent = text(pending.skill_question_prompt) || 'The required verification question could not be loaded. Contact Wedding Win before confirming this selection.';
      if (state.reviewDrawId !== pendingId) {
        state.reviewDrawId = pendingId;
        reviewEligibilityConfirmed.checked = false;
        reviewRulesReleaseConfirmed.checked = false;
        reviewSkillAnswer.value = '';
        reviewVerificationDate.value = '';
        reviewVerificationMethod.value = '';
        reviewEvidenceReference.value = '';
        reviewDisqualificationReason.value = '';
      }
      reviewConfirmButton.disabled = state.busy;
      reviewDisqualifyButton.disabled = state.busy;
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
      const reacceptanceRequired = poolStatus === 'reacceptance_required';
      const inPersonScanRequired = poolStatus === 'in_person_scan_required';
      const inSelectionPool = poolStatus
        ? poolStatus === 'included'
        : included && !(previousWinner && excludePreviousWinners.checked);
      const selectionProtected = disqualified || alreadySelected || reacceptanceRequired || inPersonScanRequired || (previousWinner && included && excludePreviousWinners.checked);
      const statusLabel = inSelectionPool
        ? 'In winner selection'
        : alreadySelected
          ? 'Already selected'
          : disqualified
            ? 'Disqualified — record kept'
            : reacceptanceRequired
              ? 'New in-show scan and consent required'
              : inPersonScanRequired
                ? 'In-show scan required'
            : previousWinner && included
              ? 'Previous winner — not selectable'
              : 'Removed from winner selection';
      const managementLabel = selectionProtected
        ? 'View entry record'
        : included
          ? 'Manage winner selection'
          : 'Restore or review entry';

      return {
        included: included,
        poolStatus: poolStatus,
        previousWinner: previousWinner,
        alreadySelected: alreadySelected,
        disqualified: disqualified,
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
        entrants.appendChild(makeElement('p', 'ww-qrvd-empty', 'Loading opted-in couples…'));
        return;
      }
      if (!state.entriesLoaded) {
        entrantVisibleCount.textContent = 'Contacts load when this step opens.';
        entrants.appendChild(makeElement('p', 'ww-qrvd-empty', 'Open this step or choose Refresh list to load opted-in couples.'));
        return;
      }
      if (!state.entries.length) {
        entrantVisibleCount.textContent = '0 contacts';
        entrants.appendChild(makeElement('p', 'ww-qrvd-empty', 'No couples have opted in to this vendor draw yet.'));
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
        card.appendChild(contactGrid);

        const adminDetails = makeElement('details', 'ww-qrvd-entry-admin');
        adminDetails.appendChild(makeElement('summary', '', selection.managementLabel));
        const adminBody = makeElement('div', 'ww-qrvd-entry-admin-body');
        if (participantReference) {
          adminBody.appendChild(makeElement('p', 'ww-qrvd-entry-reference', `Entry reference: ${participantReference}`));
        }

        if (!selection.included) {
          const reason = entryValue(entry, ['exclusion_reason', 'reason']);
          if (reason) adminBody.appendChild(makeElement('p', 'ww-qrvd-entry-reason', `Reason: ${reason}`));
        }
        const poolStatusReason = entryValue(entry, ['pool_status_reason']);
        if (poolStatusReason && (selection.included || poolStatusReason !== entryValue(entry, ['exclusion_reason']))) {
          adminBody.appendChild(makeElement('p', 'ww-qrvd-entry-reason', poolStatusReason));
        }
        if (selection.previousWinner && selection.included && excludePreviousWinners.checked) {
          adminBody.appendChild(makeElement('p', 'ww-qrvd-entry-reason', 'This couple remains opted in and stays in the CSV, but the saved no-repeat rule keeps them out of another selection.'));
        }
        if (selection.disqualified) {
          adminBody.appendChild(makeElement('p', 'ww-qrvd-entry-reason', 'This disqualified selection is preserved in the entrant CSV and audit history, but it cannot be restored to the winner pool.'));
        }

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
            selection.included ? 'Remove from winner selection' : 'Restore to winner selection'
          );
          actionButton.type = 'button';
          actionButton.dataset.action = 'entry-update';
          actionButton.dataset.participantReference = participantReference;
          actionButton.dataset.included = selection.included ? 'false' : 'true';
          actionButton.setAttribute(
            'aria-label',
            `${selection.included ? 'Remove' : 'Restore'} ${entrantName} ${selection.included ? 'from' : 'to'} winner selection`
          );
          actionButton.disabled = pending || !rowCanUpdate || state.busy || state.entriesBusy || !participantReference;
          controls.appendChild(actionButton);
        }
        adminBody.appendChild(controls);
        adminBody.appendChild(makeElement('p', 'ww-qrvd-entry-csv-note', 'This contact stays in the CSV whether included in or removed from winner selection.'));
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
      entryStatus.textContent = 'Loading opted-in couples…';
      renderEntrants();
      try {
        const data = await request(root, 'vendor_raffle_entries_get', { client_platform: 'website' });
        applyEntrantData(data);
        const count = state.entries.length;
        entryStatus.textContent = count
          ? `Loaded ${count} ${count === 1 ? 'opted-in couple' : 'opted-in couples'}.`
          : 'No couples have opted in to this vendor draw yet.';
        entryStatus.classList.add('is-success');
      } catch (error) {
        entryStatus.textContent = error.message || 'Could not load opted-in couples.';
        entryStatus.classList.add('is-error');
      } finally {
        state.entriesBusy = false;
        renderEntrants();
      }
    }

    async function updateEntrant(participantReference, included, reason) {
      if (state.entriesBusy || state.busy || pendingPotentialWinner()) return;
      if (!participantReference) {
        entryStatus.textContent = 'This entrant is missing its protected participant reference. Refresh the list.';
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
        description.value = text(settings.prize_description);
        prizeValue.value = number(settings.prize_approx_value_cad) > 0 ? String(settings.prize_approx_value_cad) : '';
        maxWinners.value = String(winnerCount(settings.max_winners));
        excludePreviousWinners.checked = settings.exclude_previous_winners !== false;
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

      const locked = Boolean(data.material_terms_locked);
      description.disabled = locked;
      prizeValue.disabled = locked;
      maxWinners.disabled = locked;
      excludePreviousWinners.disabled = locked;
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
      renderReviewControls();
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
      setStatus('Loading your current vendor draw settings…');
      try {
        const data = await request(root, 'vendor_raffle_get');
        if (!data.vendor) throw new Error('This account is not on the QR Bingo vendor list.');
        renderDashboard(data);
        setStatus('Current settings loaded from the shared app and website record.', 'success');
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
      if (winnerCount(maxWinners.value) !== number(maxWinners.value)) return { message: 'Choose one, two, or three winners before opening entries.', step: 1 };
      const version = text(state.data && state.data.rules_version);
      if (!version) return { message: 'Reload the current Official Rules before opening entries.', step: 2 };
      const settings = state.data && state.data.settings ? state.data.settings : {};
      if (!trustedWeddingWinUrl((state.data && state.data.terms_url) || settings.official_rules_url)) {
        return { message: 'Reload the current Official Rules link before opening entries.', step: 2 };
      }
      if (!text(state.data && state.data.vendor_responsibility_disclosure)) return { message: 'Reload the exact vendor responsibility agreement before opening entries.', step: 2 };
      if (!legalAccepted.checked || state.rulesViewedVersion !== version || state.responsibilityViewedVersion !== version) {
        return { message: 'Check the box confirming you have read and accept the current Official Rules and vendor responsibilities.', step: 2 };
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
      const materialTermsLocked = Boolean(state.data.material_terms_locked);
      const requestDescription = materialTermsLocked
        ? text(settings.prize_description)
        : descriptionValue;
      const requestPrizeTitle = materialTermsLocked
        ? text(settings.prize_title)
        : firstLine(descriptionValue);
      const requestPrizeValue = materialTermsLocked
        ? number(settings.prize_approx_value_cad)
        : number(prizeValue.value);
      const requestMaxWinners = materialTermsLocked
        ? winnerCount(settings.max_winners)
        : winnerCount(maxWinners.value);
      const requestExcludePreviousWinners = materialTermsLocked
        ? settings.exclude_previous_winners !== false
        : Boolean(excludePreviousWinners.checked);
      // Prize terms stay locked after a draw opens, but accepting a newly
      // published rules version is a fresh vendor action. Never freeze this
      // value to the previously saved acceptance just because prize fields are
      // locked.
      const requestLegalAccepted = Boolean(legalAccepted.checked);
      const rulesVersion = text(state.data.rules_version);
      const rulesReviewed = Boolean(
        requestLegalAccepted &&
        rulesVersion &&
        state.rulesViewedVersion === rulesVersion &&
        state.responsibilityViewedVersion === rulesVersion
      );
      const combinedAcceptance = Boolean(requestLegalAccepted && rulesReviewed);
      setBusy(true);
      setStatus('Saving these settings to the shared app and website record…');
      try {
        const data = await request(root, 'vendor_raffle_update', {
          enabled: Boolean(enabled.checked),
          prize_title: requestPrizeTitle,
          prize_description: requestDescription,
          prize_approx_value_cad: requestPrizeValue,
          max_winners: requestMaxWinners,
          exclude_previous_winners: requestExcludePreviousWinners,
          legal_terms_accepted: combinedAcceptance,
          consent_version: rulesVersion,
          rules_viewed: combinedAcceptance,
          apple_non_sponsor_acknowledged: combinedAcceptance,
          vendor_responsibility_acknowledged: combinedAcceptance,
          vendor_responsibility_disclosure: text(state.data.vendor_responsibility_disclosure),
          client_platform: 'website',
          settings_updated_at: text(state.data.settings && state.data.settings.updated_at),
        });
        state.conflict = false;
        renderDashboard(data);
        showWizardStep(data.settings && data.settings.enabled ? 3 : 2, { userInitiated: false, focus: true });
        setStatus(
          data.settings && data.settings.enabled
            ? 'Saved. Entries are open, and the app and website now use the same settings.'
            : 'Saved with entries off. The app and website now use the same settings.',
          'success'
        );
      } catch (error) {
        const conflictData = error && error.data;
        if ((error && error.status === 409) || (conflictData && conflictData.conflict)) {
          state.conflict = true;
          if (conflictData && conflictData.settings) renderDashboard(conflictData, { hydrateForm: false });
          reloadButton.classList.remove('is-hidden');
          saveButton.disabled = true;
          showWizardStep(2, { userInitiated: false, focus: false });
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
      const nextWinner = verifiedDraws().length + 1;
      const maximum = configuredWinnerCount();
      if (!window.confirm(`Select winner ${nextWinner} of ${maximum} at random? This does not send an email.`)) return;

      setBusy(true);
      setStatus(`Selecting winner ${nextWinner} of ${maximum} at random…`);
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
        setStatus('Potential winner selected. No email was sent. Complete the verification step next.', 'success');
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
      if (!draw || draw.selection_status !== 'verified') {
        setStatus('Only a verified winner can receive the winner email.', 'error');
        return;
      }
      const suppressedTest = Boolean(
        draw.can_test_suppressed_notice === true || state.data.can_test_suppressed_notice === true
      );
      const confirmation = suppressedTest
        ? `Run Test Send for ${text(draw.winner_name) || 'this verified winner'}? Email is suppressed in this App Review fixture and will not be delivered.`
        : `Send the winner email to ${text(draw.winner_name) || 'this verified winner'} now? Selecting a winner and sending email are separate actions.`;
      if (!window.confirm(confirmation)) return;

      setBusy(true);
      setStatus('Sending the verified winner email…');
      try {
        const data = await request(root, 'vendor_raffle_send_notice', {
          draw_id: drawId,
          client_platform: 'website',
        });
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
        if (responseData && responseData.settings) renderDashboard(responseData, { hydrateForm: false });
        setStatus(error.message || 'Could not send the verified winner email. No new winner was selected.', 'error');
      } finally {
        setBusy(false);
      }
    }

    async function reviewPotentialWinner(decision) {
      if (state.busy || !state.data || !state.reviewDrawId) return;
      const isConfirm = decision === 'confirm';
      const disqualificationReason = text(reviewDisqualificationReason.value);
      if (isConfirm && !reviewEligibilityConfirmed.checked) {
        setStatus('Confirm the selected entrant’s eligibility before continuing.', 'error');
        return;
      }
      if (isConfirm && !reviewRulesReleaseConfirmed.checked) {
        setStatus('Confirm the rules, winner-notice, and prize-fulfilment responsibilities before continuing.', 'error');
        return;
      }
      if (isConfirm && !text(reviewSkillAnswer.value)) {
        setStatus('Enter the selected couple’s answer to the verification question before confirming.', 'error');
        return;
      }
      if (isConfirm && !validIsoCalendarDate(reviewVerificationDate.value)) {
        setStatus('Enter a valid verification date before confirming.', 'error');
        return;
      }
      if (isConfirm && !text(reviewVerificationMethod.value)) {
        setStatus('Record how the vendor obtained the entrant declaration/release before confirming.', 'error');
        return;
      }
      if (isConfirm && !text(reviewEvidenceReference.value)) {
        setStatus('Record a privacy-safe evidence reference before confirming.', 'error');
        return;
      }
      if (!isConfirm && !disqualificationReason) {
        setStatus('Enter a disqualification reason before disqualifying this selection.', 'error');
        return;
      }

      const confirmation = isConfirm
        ? 'Confirm that your business completed every required winner-verification step and saved its evidence? Wedding Win will preserve—but does not certify—this vendor attestation.'
        : 'Disqualify this potential winner? The audit record will be preserved.';
      if (!window.confirm(confirmation)) return;

      setBusy(true);
      setStatus(isConfirm ? 'Recording the vendor’s completed winner review…' : 'Recording the disqualification…');
      try {
        const data = await request(root, 'vendor_raffle_review', {
          draw_id: state.reviewDrawId,
          decision: decision,
          skill_question_answer: text(reviewSkillAnswer.value),
          eligibility_confirmed: Boolean(reviewEligibilityConfirmed.checked),
          rules_release_confirmed: Boolean(reviewRulesReleaseConfirmed.checked),
          review_notes: isConfirm
            ? [
                `Date: ${text(reviewVerificationDate.value)}`,
                `Method: ${text(reviewVerificationMethod.value)}`,
                `Reference: ${text(reviewEvidenceReference.value)}`,
              ].join(String.fromCharCode(10))
            : '',
          disqualification_reason: disqualificationReason,
        });
        state.entriesLoaded = false;
        renderDashboard(data);
        setStatus(
          isConfirm
            ? 'Potential winner confirmed. Wedding Win recorded the vendor’s completed review attestation.'
            : 'Selection disqualified. The audit record is preserved.',
          'success'
        );
      } catch (error) {
        const responseData = error && error.data;
        if (responseData && responseData.settings) renderDashboard(responseData, { hydrateForm: false });
        setStatus(error.message || 'Could not record the vendor review.', 'error');
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
      setStatus('Creating the protected draw entrant list…');
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
          setStatus('No current vendor-draw entries with the required entrant attestations are available to report.', 'success');
          return;
        }
        downloadCsv(data.report);
        const count = Math.floor(number(data.report.row_count));
        setStatus(`Downloaded ${count} current ${count === 1 ? 'entrant' : 'entrants'}. Every listed couple accepted this vendor's draw and wedding-related marketing terms.`, 'success');
      } catch (error) {
        setStatus(error.message || 'Could not download the draw entrant list.', 'error');
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
    maxWinners.addEventListener('change', updateWizardSummary);
    excludePreviousWinners.addEventListener('change', function () {
      updateWizardSummary();
      renderEntrants();
    });
    enabled.addEventListener('change', updateWizardSummary);

    saveButton.addEventListener('click', save);
    reloadButton.addEventListener('click', load);
    drawButton.addEventListener('click', drawPotentialWinner);
    reviewConfirmButton.addEventListener('click', function () { reviewPotentialWinner('confirm'); });
    reviewDisqualifyButton.addEventListener('click', function () { reviewPotentialWinner('disqualify'); });
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
        ? event.target.closest('[data-action="send-notice"]')
        : null;
      if (!button || !draws.contains(button)) return;
      void sendWinnerNotice(text(button.dataset.drawId));
    });
    load();
  }

  document.querySelectorAll('[data-ww-qrvd]').forEach(initialize);
})();
</script>
