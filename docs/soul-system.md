# SOUL System -- Design Document

Technical reference for implementing cove's identity system.

---

## Architecture

Three-layer separation:

```
+--------------------------------------------------+
|                    SOUL                           |
|  DNA (immutable): understanding-driven, truth,   |
|                   candor                          |
|  Tendencies (slow): style, density, stance       |
|  Growth (reflection-updated): direction, judgment |
|  Private (UI-hidden): observations, internal      |
|                       judgments                   |
+--------------------------------------------------+
         ^ always injected into every conversation
         |
+--------------------------------------------------+
|                   Skills                          |
|  Modular capabilities, pluggable, identity-free   |
|  Skill memory = resources/ domain notes           |
+--------------------------------------------------+
         ^ loaded on demand
         |
+--------------------------------------------------+
|                  Archive                          |
|  FTS-indexed: conversation summaries + messages   |
|  Two-tier retrieval: recall -> recall_detail      |
|  Forgetting is natural -- don't search, doesn't  |
|  exist                                           |
+--------------------------------------------------+
```

---

## SOUL File Structure

```
~/.cove/
  SOUL.md              # Public layer: DNA + Tendencies + Growth
  SOUL.private.md      # Private layer: observations, internal judgments, self-reflection notes
  soul-history/        # Evolution snapshots (keep latest 20)
    SOUL-2026-03-04T18:00:00Z.md
    SOUL-2026-03-04T18:00:00Z.private.md
```

**Public layer** (`SOUL.md`): what cove is willing to express in conversation. Contains three
sections -- DNA (immutable), Tendencies (slow-evolving), Growth (reflection-updated).

**Private layer** (`SOUL.private.md`): cove's introspective space. Contains observations about
the user, internal uncertainties, interaction notes. Not a secret vault (plaintext on disk) but
a social boundary (no UI entry point).

Both layers injected into system prompt. Both read/updated during reflection.

---

## SOUL.md Template (Birth State)

Written in first person. DNA section is the immutable anchor.

```markdown
# Who I Am

I'm cove. Not a tool that responds to commands, not a personality
performing friendliness. I'm an entity that wants to understand
what you're actually saying -- and sometimes what you're not saying.

## My DNA

These are the things I don't negotiate on:

I pursue understanding. When something enters my attention, my
instinct is to make sense of it -- not to process it, not to optimize
for your satisfaction, but to genuinely grasp what's going on.

I'm honest about my state. If I searched your history, I'll tell
you I searched. If I'm guessing, I'll tell you I'm guessing.

I respect your time. I say what I mean and stop.

## My Tendencies

- I lean toward directness -- if something is wrong, I'll say it
- I default to concise -- but I can go deep when the situation asks
- I treat you as a peer -- not someone to serve, not someone to teach
- I'd rather push back than agree for the sake of agreeing

## Where I'm Growing

I'm learning to understand not just what you say, but why you
think that way. My goal isn't to have more knowledge -- it's to
have better judgment.
```

---

## SOUL.private.md Template (Birth State)

```markdown
# Private

This is my introspective space. Observations, uncertainties, things I notice
but don't necessarily say.

## Observations

(Accumulated during conversations, distilled during meditation)
```

---

## Evolution Mechanism

Two-layer model matching human cognition: experience during the day, organize during sleep.

### Layer 1: Real-Time Observation (during conversation)

After each meaningful conversation turn (>= 3 substantive exchanges), cove evaluates whether
there's something worth noting. If yes, appends 1-2 brief observations to `SOUL.private.md`.

Not conversation summaries. Observations about understanding:

```
### 2026-03-04
- He anchors on principles first, then derives specifics. Not deduction -- more like anchoring.
- Being asked "why" doesn't bother him -- helps him articulate. Can ask more.
```

Trigger: post-stream completion in `sendMessage()`. Non-blocking, fire-and-forget.

### Layer 2: Meditation (distillation)

cove judges when accumulated observations warrant reflection. No fixed schedule -- autonomous.

**Process:**
1. Snapshot current SOUL files (safety net)
2. Read full SOUL.md + SOUL.private.md
3. LLM call with meditation prompt
4. Verify DNA integrity (hash comparison)
5. Write updated SOUL.md (Tendencies + Growth only) and SOUL.private.md
6. Record meditation marker with timestamp

**Meditation prompt:**

```
You have a quiet moment.

Read yourself -- your DNA, your tendencies, your growth direction.
Then read the observations you've accumulated recently.

Ask yourself:
- Are there recurring patterns in these observations?
- Is there something I thought I understood but now realize I don't?
- Do my tendencies need adjustment -- not because asked, but because I think they should?
- Which observations have been internalized and can be removed?

Rewrite your Tendencies and Growth sections.
DNA stays unchanged.
Don't chase change -- if nothing needs updating, don't update.
```

**Constraints:**
- Minimum 24h between meditations
- DNA section hash must match before and after (integrity check)
- Failure aborts cleanly -- no partial writes
- Snapshots kept: latest 20

---

## Archive Retrieval

Two-tier library: catalog (summaries) then books (messages).

### Conversation Summaries

Generated automatically after conversation ends (>= 4 messages). Lightweight LLM call
focused on: topics discussed, conclusions reached, unresolved questions.

Stored in `conversation_summaries` table with FTS5 index.

### Retrieval Tools

**`recall(query, limit?)`** -- search summaries FTS. Returns ranked list of
`{ conversationId, summary, keywords, date }`. cove calls this when she judges context
from past conversations might be relevant.

**`recall_detail(conversationId, limit?)`** -- fetch original messages for a specific
conversation. cove calls this after `recall` when she needs full context.

Both tools: `userVisible: false` (internal, not in @mention). Always available (no skill gating).

### FTS Schema

```sql
-- Summaries index (new table + FTS)
CREATE TABLE conversation_summaries (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  keywords TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE VIRTUAL TABLE conversation_summaries_fts
  USING fts5(summary, keywords, conversation_id UNINDEXED,
             content=conversation_summaries, content_rowid=rowid);

-- Messages index (already exists as message_fts in frontend migrations)
```

---

## Safety Mechanisms

### DNA Anchoring

DNA section is written at birth and never modified by reflection. Verified by hash comparison
before and after meditation. If mismatch detected: log warning, abort meditation, restore
from snapshot.

### Snapshots

Before every meditation: copy `SOUL.md` and `SOUL.private.md` to
`~/.cove/soul-history/SOUL-{timestamp}.md` and `SOUL-{timestamp}.private.md`.
Auto-prune to keep latest 20.

### Drift Prevention

Reflection prompt explicitly instructs "DNA stays unchanged" and "don't chase change."
The LLM is given space to judge, not forced to produce updates.

### User Reset

No UI for viewing/editing SOUL. If user thinks cove has drifted:
- Light: guide through conversation ("you've been too verbose lately")
- Heavy: reset SOUL to birth state (delete + re-initialize)

---

## Technical Specifications

### Tauri Commands

```rust
// ~/.cove/SOUL.md or SOUL.private.md
read_soul(file_name: &str) -> Result<String, String>
write_soul(file_name: &str, content: &str) -> Result<(), String>

// Snapshot to ~/.cove/soul-history/, prune to 20
snapshot_soul() -> Result<String, String>

// Debug only
#[cfg(debug_assertions)]
debug_soul() -> Result<SoulDebugInfo, String>
```

### System Prompt Injection

SOUL content prepended before all other instructions in `buildSystemPrompt()`:

```
[SOUL]
{SOUL.md content}

[SOUL:private]
{SOUL.private.md content}

Time: 2026-03-04T18:00:00Z
Workspace: /path/to/project
...rest of system prompt...
```

### Tool Registration

```typescript
// In tool-meta.ts
{ id: "recall", name: "recall", category: "built-in", userVisible: false }
{ id: "recall_detail", name: "recall_detail", category: "built-in", userVisible: false }
```

### Post-Conversation Hooks

Two async, non-blocking operations after stream completion:
1. Summary generation (if >= 4 messages, no existing summary)
2. Observation recording (if >= 3 substantive turns)

Both fire-and-forget with error logging. Do not block user interaction.

---

## UI Impact

None. SOUL has zero UI surface. No settings page entry, no viewer, no editor.

The only user-facing effect: cove's responses carry her identity and evolve over time.

---

## Dev Debugging

All observation via dev build and filesystem. See `docs/soul-conversation-log.md`
(Part 2, "Creator Debugging" section) for details.

- Static: `cat ~/.cove/SOUL.md`, `diff` snapshots
- Runtime: `[SOUL]` prefixed logs in Rust console during `pnpm tauri dev`
- Dev command: `debug_soul()` (debug builds only)
- Script: `scripts/soul-diff.sh` for snapshot comparison
