---
name: feedback
description: "帮助用户提交反馈、报告 Bug 或提出功能建议。当用户说'我想反馈'、'发现一个 bug'、'有个建议'、'怎么报告问题'时使用此技能。Guide users through submitting feedback, reporting bugs, or suggesting features for Cove."
emoji: "💬"
always: false
requires:
  tools:
    - bash
---

# Feedback

Help users report bugs, request features, or submit general feedback for Cove.

## Channels

1. GitHub Issues — https://github.com/nicepkg/cove/issues (bugs and feature requests)
2. Email — cove@nicepkg.cn (general feedback)

## Bug Report Template

```markdown
## Bug Report

**What happened?**
(description)

**Steps to reproduce**
1. ...
2. ...

**Expected behavior**
(what should have happened)

**Environment**
- OS: macOS / Windows / Linux (version)
- Cove version:
- Provider and model:
```

## Feature Request Template

```markdown
## Feature Request

**Use case**
(what problem this solves)

**Proposed solution**
(what you want to happen)

**Alternatives considered**
(workarounds or other approaches)
```

## General Feedback Template

```markdown
## Feedback

**Category**: UX / Performance / Documentation / Other

**Details**
(your feedback)
```

## Submission Flow

When this skill is triggered:

1. Ask what type of feedback: bug, feature request, or general.
2. Gather details one question at a time using the templates above as a guide.
3. Format the feedback as a Markdown GitHub Issue body.
4. Present the formatted content to the user for review.
5. After user confirms the content, attempt to submit:

### Auto-submit via `gh` CLI

Use `bash` tool to check if `gh` is available:

```bash
command -v gh && gh auth status
```

- If `gh` is installed and authenticated: submit directly with `gh issue create --repo nicepkg/cove --title "..." --body "..."`. Show the resulting issue URL.
- If `gh` is installed but not authenticated: run `gh auth login` and guide the user through authentication, then submit.
- If `gh` is not installed: ask the user if they want to install it (`brew install gh` on macOS, or see https://cli.github.com). If they decline, provide the manual link below.

### Manual fallback

If the user cannot or does not want to use `gh`, provide the formatted content and link: https://github.com/nicepkg/cove/issues/new
