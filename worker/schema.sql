-- D1 schema for the edge. Apply: bunx wrangler d1 execute qrl --remote --file worker/schema.sql
CREATE TABLE IF NOT EXISTS scans (
  id TEXT PRIMARY KEY,
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  address TEXT,
  stage TEXT NOT NULL,
  score INTEGER NOT NULL,
  ms INTEGER,
  created_at INTEGER NOT NULL,
  result TEXT NOT NULL,
  country TEXT,
  referrer TEXT,
  client TEXT NOT NULL DEFAULT 'web',
  cache_hit INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS scans_host_created ON scans (host, port, created_at DESC);
CREATE INDEX IF NOT EXISTS scans_created ON scans (created_at);

CREATE TABLE IF NOT EXISTS failures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  reason TEXT NOT NULL,
  detail TEXT,
  port INTEGER
);
CREATE INDEX IF NOT EXISTS failures_created ON failures (created_at);

CREATE TABLE IF NOT EXISTS opens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- One row per PDF report served (cache hits included; demo ids excluded).
CREATE TABLE IF NOT EXISTS downloads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS downloads_created ON downloads (created_at);

CREATE TABLE IF NOT EXISTS rate (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  host TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
