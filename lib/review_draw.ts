// A server-authorized review fixture is separate from real draw consent and prizes.
export const REVIEW_DRAW_MODE = 'nonbinding_draw_v1' as const;
export type ReviewDrawState = {
  fixture_id: string;
  generation: number;
  role: 'couple' | 'vendor';
  couple_id: string;
  vendor_id: string;
  vendor_name: string;
  couple_name: string;
  prize_title: string;
  prize_description: string;
  expires_at: string;
  enabled: boolean;
  scanned: boolean;
  entered: boolean;
  draw_id: string | null;
  selection_status: 'none' | 'potential' | 'verified';
  skill_question_prompt: string;
  test_notice_id: string | null;
  test_notice_at: string | null;
};
export type ReviewDrawNotice = {
  review_mode: typeof REVIEW_DRAW_MODE;
  notice_id: string;
  draw_id: string;
  generation: number;
  viewer_role: 'couple' | 'vendor';
  notice_created_at: string;
  review_state: ReviewDrawState;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MEMBER = /^[1-9][0-9]{0,19}$/;

export function normalizeReviewDrawState(value: unknown, memberId: string,
  role: 'couple' | 'vendor', now = Date.now()): ReviewDrawState | null {
  if (!value || typeof value !== 'object') return null;
  const s = value as ReviewDrawState;
  if (!UUID.test(s.fixture_id || '') || !Number.isSafeInteger(s.generation) || s.generation < 1 ||
    s.role !== role || !MEMBER.test(s.couple_id || '') || !MEMBER.test(s.vendor_id || '') ||
    s.couple_id === s.vendor_id || (role === 'couple' ? s.couple_id : s.vendor_id) !== memberId ||
    !Number.isFinite(Date.parse(s.expires_at)) || Date.parse(s.expires_at) <= now ||
    !['vendor_name', 'couple_name', 'prize_title', 'prize_description', 'skill_question_prompt']
      .every(k => typeof (s as unknown as Record<string, unknown>)[k] === 'string') ||
    !['enabled', 'scanned', 'entered'].every(k => typeof (s as unknown as Record<string, unknown>)[k] === 'boolean') ||
    !['none', 'potential', 'verified'].includes(s.selection_status) ||
    (s.draw_id !== null && !UUID.test(s.draw_id || '')) ||
    (s.selection_status === 'none') !== (s.draw_id === null) ||
    (s.test_notice_id !== null && !UUID.test(s.test_notice_id || '')) ||
    (s.test_notice_at !== null && !Number.isFinite(Date.parse(s.test_notice_at))) ||
    (s.test_notice_id === null) !== (s.test_notice_at === null)) return null;
  return s;
}

export function normalizeReviewDrawNotice(value: unknown, noticeId: string,
  memberId: string, role: 'couple' | 'vendor'): ReviewDrawNotice | null {
  if (!value || typeof value !== 'object') return null;
  const n = value as ReviewDrawNotice;
  const state = normalizeReviewDrawState(n.review_state, memberId, role);
  return n.review_mode === REVIEW_DRAW_MODE && UUID.test(noticeId) && n.notice_id === noticeId &&
    n.viewer_role === role && state && n.generation === state.generation && n.draw_id === state.draw_id &&
    state.selection_status === 'verified' && state.test_notice_id === noticeId &&
    Number.isFinite(Date.parse(n.notice_created_at)) ? { ...n, review_state: state } : null;
}

export function reviewDrawActionAllowed(state: ReviewDrawState, action: string) {
  if (Date.parse(state.expires_at) <= Date.now()) return false;
  if (action === 'review_draw_context' || action === 'review_draw_result_get') return true;
  if (state.role === 'couple') {
    if (action === 'review_draw_scan') return state.enabled && !state.scanned;
    if (action === 'review_draw_entry') return state.enabled && state.scanned && !state.entered && state.selection_status === 'none';
    return false;
  }
  if (action === 'review_draw_reset') return true;
  if (action === 'review_draw_enable') return state.selection_status === 'none';
  if (action === 'review_draw_select') return state.enabled && state.entered && state.selection_status === 'none';
  if (action === 'review_draw_verify') return state.selection_status === 'potential';
  return action === 'review_draw_send' && state.selection_status === 'verified' && !state.test_notice_at;
}
