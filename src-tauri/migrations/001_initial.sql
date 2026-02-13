-- Providers (OpenAI, Anthropic, Google, Ollama, etc.)
CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  api_key TEXT,
  base_url TEXT,
  enabled INTEGER DEFAULT 1,
  config TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Assistants (configurable AI personalities)
CREATE TABLE IF NOT EXISTS assistants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT,
  model TEXT,
  provider TEXT,
  system_instruction TEXT,
  temperature REAL DEFAULT 0.7,
  top_p REAL DEFAULT 1.0,
  max_tokens INTEGER,
  frequency_penalty REAL DEFAULT 0,
  presence_penalty REAL DEFAULT 0,
  web_search_enabled INTEGER DEFAULT 0,
  artifacts_enabled INTEGER DEFAULT 0,
  tools_enabled INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Conversations
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  assistant_id TEXT NOT NULL,
  title TEXT,
  pinned INTEGER DEFAULT 0,
  model_override TEXT,
  system_instruction_override TEXT,
  temperature_override REAL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (assistant_id) REFERENCES assistants(id)
);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT,
  reasoning TEXT,
  model TEXT,
  tokens_input INTEGER,
  tokens_output INTEGER,
  parent_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- Attachments
CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  type TEXT NOT NULL,
  name TEXT,
  path TEXT,
  mime_type TEXT,
  size INTEGER,
  content TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);

-- Prompts (reusable prompt templates)
CREATE TABLE IF NOT EXISTS prompts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  builtin INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- MCP Servers
CREATE TABLE IF NOT EXISTS mcp_servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  command TEXT,
  args TEXT,
  env TEXT,
  url TEXT,
  auto_run INTEGER DEFAULT 0,
  long_running INTEGER DEFAULT 0,
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Settings (key-value store)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_conversations_assistant ON conversations(assistant_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(message_id);
