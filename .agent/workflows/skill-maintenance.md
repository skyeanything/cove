---
description: Keep built-in skill documentation in sync with code changes
---

# Skill Maintenance

Built-in skills that document application features MUST stay in sync with the codebase.

## user-manual Sync Rules

When any of the following files change, MUST update `src/skills/user-manual/SKILL.md` to reflect the new state:

| File | What to update |
|------|---------------|
| `src/lib/ai/tools/tool-meta.ts` | Tools table (added/removed/renamed tools) |
| `src/components/layout/AppLayout.tsx` | Keyboard shortcuts table |
| `src/components/settings/SettingsWindow.tsx` | Settings tabs table |
| `src/lib/ai/provider-meta.ts` | Provider list and count |
| `src/lib/ai/provider-defs-extra.ts` | Provider list and count |
| `src/hooks/useMentionDetect.ts` | @mention system description |
| `src/components/chat/MentionPopover.tsx` | @mention categories |

## feedback Sync Rules

When the following change, MUST check if `src/skills/feedback/SKILL.md` needs updating:

- Repository URL or organization name
- Feedback email address
- Issue template structure
