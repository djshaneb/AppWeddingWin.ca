-- Optional performance companion for the WeddingWin email-confirmation triggers.
-- Confirmed live: MariaDB 10.11.19, InnoDB, users_data.token VARCHAR(255)
-- utf8mb4_unicode_ci, no existing token index. No member/token data changes.
-- Prefix 64 covers current canonical app tokens and narrows longer website
-- tokens; the trigger still checks full, case-sensitive equality afterward.
-- NOCOPY/NONE fails rather than silently falling back to a copying/blocking DDL.
-- MariaDB supports adding a plain secondary index with this online strategy.
-- https://mariadb.com/docs/server/server-usage/storage-engines/innodb/innodb-online-ddl/innodb-online-ddl-operations-with-the-nocopy-alter-algorithm
SET SESSION lock_wait_timeout = 5;
ALTER TABLE users_data
    ADD INDEX ww_users_data_chat_token (token(64)),
    ALGORITHM=NOCOPY,
    LOCK=NONE;

-- Verify using SHOW INDEX FROM users_data and EXPLAIN of the trigger SELECT.
-- Do not print real member tokens in logs; use the private test account only.
