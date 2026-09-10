-- Run once through the authenticated BD database admin before publishing widgets.
-- This private table must not be registered as a user-editable BD/API resource.
-- No public widget provisions tables or treats users_meta as confirmation proof.
CREATE TABLE IF NOT EXISTS ww_email_verification_state (
    user_id BIGINT UNSIGNED NOT NULL,
    verification_required TINYINT(1) NOT NULL DEFAULT 0,
    pending_email VARCHAR(254) NULL,
    existing_email VARCHAR(254) NULL,
    token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    requested_at DATETIME NULL,
    confirmed_email VARCHAR(254) NULL,
    confirmed_at DATETIME NULL,
    generation BIGINT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id),
    UNIQUE KEY ww_ev_token_hash (token_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
