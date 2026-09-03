-- PINs are only unique while a session is active in Redis. Historical MySQL rows may reuse them.
ALTER TABLE game_sessions DROP INDEX uq_game_sessions_pin;
ALTER TABLE game_sessions ADD INDEX idx_game_sessions_pin (pin);
