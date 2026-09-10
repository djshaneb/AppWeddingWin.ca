-- Roll back ONLY the four new chat guards and the private email-state cleanup trigger.
-- Preserve the private verification table and all members/messages/history.
-- Removing these guards re-enables the prior database-write behavior; keep the
-- application/UI verification gates enabled while investigating.
DROP TRIGGER IF EXISTS ww_chat_email_pending_bi;
DROP TRIGGER IF EXISTS ww_chat_email_pending_bu;
DROP TRIGGER IF EXISTS ww_chat_thread_email_pending_bi;
DROP TRIGGER IF EXISTS ww_chat_thread_email_pending_bu;
DROP TRIGGER IF EXISTS ww_member_email_state_ad;
