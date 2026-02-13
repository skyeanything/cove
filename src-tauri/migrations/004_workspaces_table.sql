-- Workspaces table for storing user project directories
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  is_default INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
