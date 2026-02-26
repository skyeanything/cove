# Audit & Undo Guide

> **Relationship**: This guide expands on [SKILL.md Section 8](../SKILL.md) (Command Reference → Management Commands). For the full command index, see SKILL.md.

OfficeLLM provides an operation audit log and multi-step undo system for tracking and reverting document changes. The `--backup` global flag creates automatic backups before each write, and the `audit` and `undo` commands let you query history and restore previous states.

## Automatic Backups

### The `--backup` Global Flag

Add `--backup` to any write command to create a timestamped backup before the file is overwritten:

```bash
officellm replace-text -i doc.docx --find "old" --replace "new" -o doc.docx --backup
```

This creates `doc.bak-{timestamp}.docx` alongside the original before writing.

### Enable by Default

```bash
officellm config --init-agent-profile
```

This sets `backup=true` globally, so every write command automatically creates backups. You can also set it manually in `~/.officellm/config.json`:

```json
{
  "defaults": {
    "backup": true
  }
}
```

## Audit Log

### `audit --list`

Query the operation audit log with optional filtering and pagination.

```bash
# Recent operations (default: last 50)
officellm audit --list

# Filter by time
officellm audit --list --since 2h
officellm audit --list --since 1d --before 12h

# Filter by file
officellm audit --list --file report.docx

# Pagination
officellm audit --list --max-results 20 --skip 10
```

#### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `--since` | string | — | Return entries after this time |
| `--before` | string | — | Return entries before this time |
| `--file` | string | — | Filter by document file path |
| `--max-results` | int | 50 | Maximum entries to return |
| `--skip` | int | 0 | Entries to skip (pagination) |

#### Time Syntax

Two formats are accepted for `--since` and `--before`:

| Format | Example | Meaning |
|--------|---------|---------|
| Relative | `2h`, `30m`, `1d`, `7d` | Hours/minutes/days ago from now |
| ISO 8601 | `2026-02-23T10:00:00Z` | Absolute timestamp |

### `audit --clear`

Clear the entire audit log.

```bash
officellm audit --clear
```

This is a destructive operation — all audit history is permanently removed.

## Undo

### List Available Backups

```bash
officellm undo -i doc.docx --list
```

Returns a JSON array of all available backups for the document, with metadata (backup ID, timestamp, file size).

### Restore Most Recent Backup

```bash
officellm undo -i doc.docx
```

Restores the most recent backup. Before restoring, a safety backup of the current state is created automatically.

### Restore N Steps Back

```bash
officellm undo -i doc.docx --steps 3
```

Rolls back 3 operations. `--steps` must be >= 1.

### Restore Specific Backup

```bash
officellm undo -i doc.docx --backup-id "abc123"
```

Restores a specific backup by ID (from `--list` output).

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `--input` / `-i` | file path | Yes | Document to restore |
| `--list` | flag | No | List backups without restoring |
| `--steps` | int | No | Number of undo steps (>= 1) |
| `--backup-id` | string | No | Specific backup ID to restore |

#### Constraints

- `--steps` and `--backup-id` are **mutually exclusive** (error if both provided)
- `--steps` must be >= 1
- If neither `--steps` nor `--backup-id` is specified, restores the most recent backup
- When `--list` is set, no restoration occurs (read-only)

## End-to-End Safety Workflow

### 1. Configure Automatic Backups

```bash
officellm config --init-agent-profile  # sets backup=true
```

### 2. Perform Edits (backups created automatically)

```bash
officellm replace-text -i doc.docx --find "Draft" --replace "Final" -o doc.docx
officellm apply-format -i doc.docx --find "Final" --bold -o doc.docx
officellm insert -i doc.docx --markdown "## Appendix" --position append -o doc.docx
```

### 3. Review History

```bash
# Check what was done
officellm audit --list --file doc.docx --since 1h

# Check available restore points
officellm undo -i doc.docx --list
```

### 4. Revert If Needed

```bash
# Undo the last 2 operations
officellm undo -i doc.docx --steps 2

# Or revert to a specific backup
officellm undo -i doc.docx --backup-id "abc123"
```

### 5. Verify

```bash
officellm extract-text -i doc.docx --limit 5
```

## Integration with the 5-Stage Pipeline

In the [Agent Orchestration Contract](AGENT_ORCHESTRATION_GUIDE.md):

| Stage | Audit/Undo Role |
|-------|----------------|
| **Stage 1 (Inspect)** | `audit --list --file doc.docx` to check recent operations |
| **Stage 2 (Edit)** | `--backup` flag ensures restore points exist |
| **Stage 3 (Verify)** | If verification fails, `undo --steps 1` to revert |
| **Stage 5 (Decide)** | On **abort**: `undo` to restore original state |

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| No backups available | `--backup` not enabled | Run `config --init-agent-profile` or add `--backup` to commands |
| `--steps` too high | Requested more steps than available backups | Use `undo --list` to check available count |
| Both `--steps` and `--backup-id` | Mutually exclusive parameters | Use one or the other |
| Audit log too large | Many operations accumulated | Use `audit --clear` to reset |
