-- Optional rollback: removes ONLY this new nonunique performance index.
-- No members, tokens, chat records, verification state, or triggers are deleted.
SET SESSION lock_wait_timeout = 5;
ALTER TABLE users_data
    DROP INDEX ww_users_data_chat_token,
    ALGORITHM=NOCOPY,
    LOCK=NONE;
