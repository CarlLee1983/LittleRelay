CREATE TABLE privacy_notices (
  version INTEGER PRIMARY KEY CHECK (version > 0),
  body TEXT NOT NULL CHECK (length(body) > 0),
  published_at INTEGER NOT NULL
);

CREATE TRIGGER privacy_notices_immutable_update
BEFORE UPDATE ON privacy_notices
BEGIN
  SELECT RAISE(ABORT, 'published privacy notice is immutable');
END;

CREATE TRIGGER privacy_notices_immutable_delete
BEFORE DELETE ON privacy_notices
BEGIN
  SELECT RAISE(ABORT, 'published privacy notice is immutable');
END;

CREATE TABLE privacy_current (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  version INTEGER NOT NULL REFERENCES privacy_notices(version)
);

CREATE TABLE oauth_attempts (
  state_hash TEXT PRIMARY KEY,
  browser_hash TEXT NOT NULL,
  store_id TEXT NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('test', 'production')),
  provider_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  nonce TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  notice_version INTEGER NOT NULL REFERENCES privacy_notices(version),
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER
);

CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  line_user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  application_number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'revoked')),
  created_at INTEGER NOT NULL,
  last_active_at INTEGER NOT NULL,
  UNIQUE (store_id, provider_id, channel_id, line_user_id)
);

CREATE TABLE customer_sessions (
  session_hash TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX customer_sessions_customer_id ON customer_sessions(customer_id);
