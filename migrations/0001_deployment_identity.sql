CREATE TABLE deployment_identity (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  store_id TEXT NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('test', 'production')),
  initialized_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
