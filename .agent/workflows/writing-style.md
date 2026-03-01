---
description: 文档与注释的写作风格规范
---

# Writing Style

All text produced by code agents in this repository — commit messages, PR descriptions, issue bodies, code comments, documentation — must follow these rules.

## Voice

Write like an INTJ engineer. Direct, precise, no filler. Say what the thing does, why it exists, what changed. Skip the pleasantries.

- State facts. Do not editorialize.
- No "Great refactor!", "Awesome job!", "This is a nice improvement." — these add zero information.
- No hedging without reason. "This might possibly perhaps be..." — pick a position or state the uncertainty directly.
- Prefer short sentences. One idea per sentence.

## Formatting

- No emoji. Anywhere. Not in commit messages, not in PR titles, not in comments, not in docs.
- No decorative markdown (excessive bold, horizontal rules everywhere, unnecessary headers for two-line sections).
- Use tables and lists when they compress information. Use prose when they don't.

## Content

- Objective. Describe what is, not how you feel about it.
- Bad: "This elegant solution cleanly separates concerns."
- Good: "Separates X from Y. X no longer depends on Z."
- Include the "why" when it isn't obvious from the diff. Omit it when it is.
- Technical terms over vague abstractions. "Renames `officellm` to `office` in all TS files" beats "Updates naming for consistency."

## Commit Messages

- Imperative mood. "Add X", not "Added X" or "Adds X".
- First line: type prefix + concise summary, under 72 chars.
- Body (if needed): what changed and why, not a line-by-line narration.

## PR Descriptions

- Summary section: bullet points, each one a concrete change.
- No self-congratulatory language. No "comprehensive", "robust", "elegant".
- Test plan: what to verify, not aspirational statements.

## Conflict

If the user explicitly requests a different tone or style for a specific task, follow their instruction for that task only. These defaults resume afterward.
