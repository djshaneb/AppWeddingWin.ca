-- Reviewed target: launc29637_directory (WeddingWin).
-- STAGED: do not execute until the private state table is provisioned, the
-- current trigger inventory is checked, and deployment is approved.
-- These guards prevent committed private-message/thread writes while an email
-- change needs confirmation. They do not replace BD's sender authentication.
-- BD chat stores users_data.token, not the numeric member ID, as the owner.
-- Numeric identity matching covers historical app rows without coercing tokens.
-- Expired requests remain blocked; Apple relay addresses alone remain allowed.
-- The private row is authoritative. Legacy metadata is block-only fallback when
-- no private row exists, matching ww_email_verification_state() in the PHP core.
-- Missing private table/query failure fails the attempted write closed.
-- Do not add a DEFINER: installation should use the approved database account.
-- No existing trigger is dropped/replaced by this deployment.
-- Read receipts, read/status transitions, and timestamp-only updates stay allowed.
-- Proprietary handler email ordering still requires a controlled live test.
DELIMITER $$

CREATE TRIGGER ww_chat_email_pending_bi
BEFORE INSERT ON chat_message_items
FOR EACH ROW
BEGIN
    IF EXISTS (
        SELECT 1
        FROM users_data AS ww_sender
        LEFT JOIN ww_email_verification_state AS ww_state
          ON ww_state.user_id = ww_sender.user_id
        WHERE (
            ((ww_sender.token = NEW.message_owner AND BINARY ww_sender.token = BINARY NEW.message_owner)
             OR (NEW.message_owner REGEXP '^[1-9][0-9]{0,18}$'
                 AND ww_sender.user_id = CAST(NEW.message_owner AS UNSIGNED)
                 AND BINARY CAST(ww_sender.user_id AS CHAR) = BINARY NEW.message_owner))
        )
        AND (
            (ww_state.user_id IS NOT NULL AND (
                ww_state.verification_required = 1
                OR LENGTH(TRIM(COALESCE(ww_state.pending_email, ''))) > 0
            ))
            OR
            (ww_state.user_id IS NULL AND (
                COALESCE((
                    SELECT ww_meta.`value`
                    FROM users_meta AS ww_meta
                    WHERE ww_meta.`database` = 'users_data'
                      AND ww_meta.database_id = ww_sender.user_id
                      AND BINARY CAST(ww_meta.database_id AS CHAR) = BINARY CAST(ww_sender.user_id AS CHAR)
                      AND ww_meta.`key` = 'custom_email_verification_required'
                    ORDER BY ww_meta.meta_id DESC LIMIT 1
                ), '') = '1'
                OR LENGTH(TRIM(COALESCE((
                    SELECT ww_meta.`value`
                    FROM users_meta AS ww_meta
                    WHERE ww_meta.`database` = 'users_data'
                      AND ww_meta.database_id = ww_sender.user_id
                      AND BINARY CAST(ww_meta.database_id AS CHAR) = BINARY CAST(ww_sender.user_id AS CHAR)
                      AND ww_meta.`key` = 'custom_pending_email'
                    ORDER BY ww_meta.meta_id DESC LIMIT 1
                ), ''))) > 0
            ))
        )
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Confirm your new email address before sending messages.';
    END IF;
END$$

CREATE TRIGGER ww_chat_email_pending_bu
BEFORE UPDATE ON chat_message_items
FOR EACH ROW
BEGIN
    IF (
        NOT (BINARY NEW.message_owner <=> BINARY OLD.message_owner)
        OR
        NOT (BINARY NEW.message_content <=> BINARY OLD.message_content)
        OR
        NOT (BINARY NEW.thread_token <=> BINARY OLD.thread_token)
        OR
        NOT (BINARY NEW.message_token <=> BINARY OLD.message_token)
    ) AND EXISTS (
        SELECT 1
        FROM users_data AS ww_sender
        LEFT JOIN ww_email_verification_state AS ww_state
          ON ww_state.user_id = ww_sender.user_id
        WHERE (
            ((ww_sender.token = OLD.message_owner AND BINARY ww_sender.token = BINARY OLD.message_owner)
             OR (OLD.message_owner REGEXP '^[1-9][0-9]{0,18}$'
                 AND ww_sender.user_id = CAST(OLD.message_owner AS UNSIGNED)
                 AND BINARY CAST(ww_sender.user_id AS CHAR) = BINARY OLD.message_owner))
            OR
            ((ww_sender.token = NEW.message_owner AND BINARY ww_sender.token = BINARY NEW.message_owner)
             OR (NEW.message_owner REGEXP '^[1-9][0-9]{0,18}$'
                 AND ww_sender.user_id = CAST(NEW.message_owner AS UNSIGNED)
                 AND BINARY CAST(ww_sender.user_id AS CHAR) = BINARY NEW.message_owner))
        )
        AND (
            (ww_state.user_id IS NOT NULL AND (
                ww_state.verification_required = 1
                OR LENGTH(TRIM(COALESCE(ww_state.pending_email, ''))) > 0
            ))
            OR
            (ww_state.user_id IS NULL AND (
                COALESCE((
                    SELECT ww_meta.`value`
                    FROM users_meta AS ww_meta
                    WHERE ww_meta.`database` = 'users_data'
                      AND ww_meta.database_id = ww_sender.user_id
                      AND BINARY CAST(ww_meta.database_id AS CHAR) = BINARY CAST(ww_sender.user_id AS CHAR)
                      AND ww_meta.`key` = 'custom_email_verification_required'
                    ORDER BY ww_meta.meta_id DESC LIMIT 1
                ), '') = '1'
                OR LENGTH(TRIM(COALESCE((
                    SELECT ww_meta.`value`
                    FROM users_meta AS ww_meta
                    WHERE ww_meta.`database` = 'users_data'
                      AND ww_meta.database_id = ww_sender.user_id
                      AND BINARY CAST(ww_meta.database_id AS CHAR) = BINARY CAST(ww_sender.user_id AS CHAR)
                      AND ww_meta.`key` = 'custom_pending_email'
                    ORDER BY ww_meta.meta_id DESC LIMIT 1
                ), ''))) > 0
            ))
        )
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Confirm your new email address before sending messages.';
    END IF;
END$$

CREATE TRIGGER ww_chat_thread_email_pending_bi
BEFORE INSERT ON chat_message_threads
FOR EACH ROW
BEGIN
    IF EXISTS (
        SELECT 1
        FROM users_data AS ww_sender
        LEFT JOIN ww_email_verification_state AS ww_state
          ON ww_state.user_id = ww_sender.user_id
        WHERE (
            ((ww_sender.token = NEW.thread_owner AND BINARY ww_sender.token = BINARY NEW.thread_owner)
             OR (NEW.thread_owner REGEXP '^[1-9][0-9]{0,18}$'
                 AND ww_sender.user_id = CAST(NEW.thread_owner AS UNSIGNED)
                 AND BINARY CAST(ww_sender.user_id AS CHAR) = BINARY NEW.thread_owner))
        )
        AND (
            (ww_state.user_id IS NOT NULL AND (
                ww_state.verification_required = 1
                OR LENGTH(TRIM(COALESCE(ww_state.pending_email, ''))) > 0
            ))
            OR
            (ww_state.user_id IS NULL AND (
                COALESCE((
                    SELECT ww_meta.`value`
                    FROM users_meta AS ww_meta
                    WHERE ww_meta.`database` = 'users_data'
                      AND ww_meta.database_id = ww_sender.user_id
                      AND BINARY CAST(ww_meta.database_id AS CHAR) = BINARY CAST(ww_sender.user_id AS CHAR)
                      AND ww_meta.`key` = 'custom_email_verification_required'
                    ORDER BY ww_meta.meta_id DESC LIMIT 1
                ), '') = '1'
                OR LENGTH(TRIM(COALESCE((
                    SELECT ww_meta.`value`
                    FROM users_meta AS ww_meta
                    WHERE ww_meta.`database` = 'users_data'
                      AND ww_meta.database_id = ww_sender.user_id
                      AND BINARY CAST(ww_meta.database_id AS CHAR) = BINARY CAST(ww_sender.user_id AS CHAR)
                      AND ww_meta.`key` = 'custom_pending_email'
                    ORDER BY ww_meta.meta_id DESC LIMIT 1
                ), ''))) > 0
            ))
        )
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Confirm your new email address before sending messages.';
    END IF;
END$$

CREATE TRIGGER ww_chat_thread_email_pending_bu
BEFORE UPDATE ON chat_message_threads
FOR EACH ROW
BEGIN
    IF (
        NOT (BINARY NEW.thread_owner <=> BINARY OLD.thread_owner)
        OR
        NOT (BINARY NEW.thread_responders <=> BINARY OLD.thread_responders)
        OR
        NOT (BINARY NEW.thread_token <=> BINARY OLD.thread_token)
    ) AND EXISTS (
        SELECT 1
        FROM users_data AS ww_sender
        LEFT JOIN ww_email_verification_state AS ww_state
          ON ww_state.user_id = ww_sender.user_id
        WHERE (
            ((ww_sender.token = OLD.thread_owner AND BINARY ww_sender.token = BINARY OLD.thread_owner)
             OR (OLD.thread_owner REGEXP '^[1-9][0-9]{0,18}$'
                 AND ww_sender.user_id = CAST(OLD.thread_owner AS UNSIGNED)
                 AND BINARY CAST(ww_sender.user_id AS CHAR) = BINARY OLD.thread_owner))
            OR
            ((ww_sender.token = NEW.thread_owner AND BINARY ww_sender.token = BINARY NEW.thread_owner)
             OR (NEW.thread_owner REGEXP '^[1-9][0-9]{0,18}$'
                 AND ww_sender.user_id = CAST(NEW.thread_owner AS UNSIGNED)
                 AND BINARY CAST(ww_sender.user_id AS CHAR) = BINARY NEW.thread_owner))
        )
        AND (
            (ww_state.user_id IS NOT NULL AND (
                ww_state.verification_required = 1
                OR LENGTH(TRIM(COALESCE(ww_state.pending_email, ''))) > 0
            ))
            OR
            (ww_state.user_id IS NULL AND (
                COALESCE((
                    SELECT ww_meta.`value`
                    FROM users_meta AS ww_meta
                    WHERE ww_meta.`database` = 'users_data'
                      AND ww_meta.database_id = ww_sender.user_id
                      AND BINARY CAST(ww_meta.database_id AS CHAR) = BINARY CAST(ww_sender.user_id AS CHAR)
                      AND ww_meta.`key` = 'custom_email_verification_required'
                    ORDER BY ww_meta.meta_id DESC LIMIT 1
                ), '') = '1'
                OR LENGTH(TRIM(COALESCE((
                    SELECT ww_meta.`value`
                    FROM users_meta AS ww_meta
                    WHERE ww_meta.`database` = 'users_data'
                      AND ww_meta.database_id = ww_sender.user_id
                      AND BINARY CAST(ww_meta.database_id AS CHAR) = BINARY CAST(ww_sender.user_id AS CHAR)
                      AND ww_meta.`key` = 'custom_pending_email'
                    ORDER BY ww_meta.meta_id DESC LIMIT 1
                ), ''))) > 0
            ))
        )
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Confirm your new email address before sending messages.';
    END IF;
END$$

-- Account deletion removes only that member's private contact-email proof.
-- This runs after BD deletes the member; it does not delete the Apple account
-- or any other member, and it does not change existing Apple cleanup hooks.
CREATE TRIGGER ww_member_email_state_ad
AFTER DELETE ON users_data
FOR EACH ROW
BEGIN
    DELETE FROM ww_email_verification_state WHERE user_id = OLD.user_id;
END$$

DELIMITER ;
