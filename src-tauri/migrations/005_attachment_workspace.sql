-- Add workspace-related columns to attachments table
ALTER TABLE attachments ADD COLUMN workspace_path TEXT;
ALTER TABLE attachments ADD COLUMN parsed_content TEXT;
ALTER TABLE attachments ADD COLUMN parsed_summary TEXT;
