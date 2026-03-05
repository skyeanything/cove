---
description: Systematic review and maintenance of project documentation against codebase reality
---

# Doc Review

Systematic audit of project documentation to catch semantic drift from codebase reality. Includes both trigger-based sync rules for built-in skills and a broad on-demand review procedure.

## When to Run

- After completing a feature or refactor that touches multiple files
- When a PR changes files listed in the Skill Sync Triggers below
- On request ("review docs", "audit documentation")
- Periodically as a health check

## Skill Sync Triggers

Built-in skills that document application features MUST stay in sync with the codebase. When any of the following files change, update the corresponding skill immediately.

### user-manual

When any of these files change, MUST update `src/skills/user-manual/SKILL.md`:

| File | What to update |
|------|---------------|
| `src/lib/ai/tools/tool-meta.ts` | Tools table (added/removed/renamed tools) |
| `src/components/layout/AppLayout.tsx` | Keyboard shortcuts table |
| `src/components/settings/SettingsWindow.tsx` | Settings tabs table |
| `src/lib/ai/provider-meta.ts` | Provider list and count |
| `src/lib/ai/provider-defs-extra.ts` | Provider list and count |
| `src/hooks/useMentionDetect.ts` | @mention system description |
| `src/components/chat/MentionPopover.tsx` | @mention categories |

### feedback

When the following change, MUST check if `src/skills/feedback/SKILL.md` needs updating:

- Repository URL or organization name
- Feedback email address
- Issue template structure

## Scope

All project documentation, by priority:

| Priority | Target | Check against |
|----------|--------|---------------|
| P0 | `src/skills/*/SKILL.md` | Tool registry (`src/lib/ai/tools/`), tool behavior, URLs, org/repo refs |
| P0 | `CLAUDE.md` | `src/` layout, commands vs scripts, tool/skill tables vs registry |
| P1 | `docs/tools.md` | Tool implementations in `src/lib/ai/tools/` |
| P1 | `docs/architecture.md` | Actual import chains and data flow |
| P1 | `docs/providers.md` | Provider implementations |
| P2 | `CONTRIBUTING.md`, `README.md` | Setup steps, repo URLs |
| P2 | `AGENTS.md` | Workflow file list vs actual `.agent/workflows/` |
| P2 | Other `docs/*.md` | Cross-references, file paths, feature descriptions |

## Review Procedure

For each document in scope:

1. Read the document.
2. Identify claims about the codebase: file paths, tool names, API signatures, commands, URLs, org names.
3. Verify each claim:
   - File paths -- `read` or `ls` to confirm existence
   - Tool names -- cross-reference `src/lib/ai/tools/tool-meta.ts`
   - Commands -- confirm scripts exist and accept stated arguments
   - URLs -- verify org/repo is `cove-founders/cove`
   - Feature descriptions -- read implementation, confirm behavior matches
4. Classify findings:
   - **Incorrect** -- actively wrong (wrong URL, wrong API, wrong behavior)
   - **Stale** -- describes something changed or removed
   - **Missing** -- new features/changes not reflected in docs
5. Report findings in a table:

```
| File:Line | Category | Finding | Suggested fix |
|-----------|----------|---------|---------------|
```

6. Apply fixes if approved.

## Common Drift Patterns

Check these first for quick wins:

- Hardcoded org/repo names (must be `cove-founders/cove`)
- File paths in docs that no longer exist
- Tool names or parameters that have been renamed
- `CLAUDE.md` file structure tree vs actual `src/` directories
- Provider/tool counts vs actual registry
- Email addresses or contact info
- Keyboard shortcuts in user-manual vs actual keybinding code

## SKILL.md-Specific Checks

For each `src/skills/*/SKILL.md`:

- `name` is valid slug and matches folder name
- `description` accurately describes what the skill does
- `requires.tools` lists only tools that exist in the registry
- URLs are correct and reachable
- `gh` commands use `--repo cove-founders/cove`
- Instructions match actual tool behavior

## Post-Change Review Shortcut

When reviewing after a specific change rather than doing a full audit:

1. `git diff --name-only HEAD~N` (or vs main) to list changed files.
2. Cross-reference with the Skill Sync Triggers above.
3. For files not in trigger tables, use judgment: does this change affect documented behavior?
4. Review only affected documents.
