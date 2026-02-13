-- Default assistant
INSERT OR IGNORE INTO assistants (id, name, icon, temperature, sort_order)
VALUES ('default', 'Default', '🤖', 0.7, 0);

-- Built-in prompts
INSERT OR IGNORE INTO prompts (id, name, content, builtin, sort_order)
VALUES
  ('summarize', 'Summarize', 'Please summarize the following content concisely:\n\n@{{content}}', 1, 0),
  ('translate', 'Translate', 'Please translate the following text to @{{target_language}}:\n\n@{{content}}', 1, 1),
  ('explain', 'Explain', 'Please explain the following concept in simple terms:\n\n@{{content}}', 1, 2),
  ('fix-grammar', 'Fix Grammar', 'Please fix the grammar and spelling errors in the following text while preserving the original meaning:\n\n@{{content}}', 1, 3),
  ('improve-writing', 'Improve Writing', 'Please improve the clarity and style of the following text:\n\n@{{content}}', 1, 4),
  ('change-tone', 'Change Tone', 'Please rewrite the following text in a @{{tone}} tone:\n\n@{{content}}', 1, 5),
  ('change-length', 'Change Length', 'Please make the following text @{{length}}:\n\n@{{content}}', 1, 6);
