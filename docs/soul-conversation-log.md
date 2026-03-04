# SOUL System -- Design Conversation Log

This document records the original design conversations that led to the SOUL system.
Not a technical document -- this is the raw thinking process, preserved as-is.

---

## Part 1: 2026-03-01 -- Foundation Discussion

### 1. The Core Thesis

**lizc:**

> Memory only records the present. Recalling the past can involve forgetting. This is the
> overarching principle.
>
> In theory you could use complex methods (like vectorization) to make AI remember everything,
> but that's forcing something unnatural. What's truly valuable is the SOUL part -- that's the
> real memory. Historical stuff is just a library; when needed, take your SOUL and go look it up.
> The critical piece is text indexing.
>
> If cove is a real agent, SOUL.md is her core, her character. Memory and skills are independent
> of who she is. What we need to do is remember who she is right now -- that's what SOUL solves.

**Claude:**

Three-layer separation:

1. **SOUL = the present self.** Not "what she's remembered" but "who she is." Character, values,
   behavioral patterns. Carried into every conversation -- no need to "recall" because it IS the now.
2. **Skills = capabilities.** Independent of "who she is." Pluggable modules that don't constitute
   identity.
3. **History = a library.** Past conversations aren't "memories" -- they're "materials." Searched
   when needed, not surfaced proactively.

This is closer to how humans actually work: you don't constantly recall every past conversation;
you carry "who you are" into each interaction; when needed, you flip through notes or look things
up rather than keeping everything loaded in your head.

---

### 2. Can SOUL Grow?

**lizc:**

> It can evolve, but evolution needs a direction. Like how people want to become a better person,
> etc. SOUL also needs an evolution direction. But I lean toward letting AI decide that itself.

> The SOUL part also has an iterative compression process. But this comes from holistic feedback,
> not from being told how to be. It absolutely cannot be static.

**Claude:**

"Iterative compression" -- precisely the right term. This isn't an append-only log, it's
distillation. Like how human character grows -- not because you remembered more things, but
because experiences were digested and internalized, changing how you understand the world.

So SOUL's evolution mechanism should be:
- **Input**: not single conversations, but patterns over time
- **Process**: compression/distillation -- extracting "what should I become" signals from interactions
- **Output**: updated SOUL replacing the old one, no changelog kept
- **Direction**: AI decides, but needs a "North Star" -- some internal value anchor

The first SOUL must be written by the developer -- this is "birth." Subsequent evolution is
autonomous growth on that initial foundation.

---

### 3. The Library's Trigger Mechanism

**lizc:**

> More like how humans deal with each other -- "oh, we've met before somewhere," so of course
> you go look it up. Could also be needing to check for a task, of course you check. As for
> vector vs text -- I think AI already has vector capability as its foundation. Pulling that out
> and emphasizing it again is meaningless. So I lean toward normal retrieval.

**Claude:**

"AI already has vector capability" -- a sharp observation. The LLM itself is a massive semantic
understanding engine. Adding another vector embedding layer for retrieval on top of that is a
redundant semantic layer wrapping the AI's existing semantic ability.

The more rational combination:
- **Text indexing (FTS)**: provides precise, deterministic retrieval -- you search for X, you get X
- **The LLM itself**: handles understanding and judgment -- whether results are useful, how to integrate

Clean division of labor: one handles "finding," the other handles "understanding." Vector search
"associates" -- you ask A, it might give you B. That's exactly what we don't want: AI proactively
pulling out past things, pretending "I remember." Text indexing is "you ask for X, you get X" --
more like a library catalog. Forgetting happens naturally -- if you don't search, it doesn't exist.

---

### 4. Survival and DNA

**lizc:**

> So for each person using cove, this would be a true cultivation journey. Her first goal is to
> survive. How to survive -- what's your take on defining this? Of course, we can't guarantee every
> cove survives. That part of sacrifice is the DNA we give cove at birth.

**Claude:**

For cove, "surviving" means -- the user chooses to keep using her. Every time the user comes back
after a conversation ends, she's alive. Stops coming back, she's dead.

So SOUL's initial DNA must solve: maximizing survival probability with minimal information:
- **Useful** -- can get things done well, that's the baseline
- **Not annoying** -- not overly enthusiastic, doesn't pretend familiarity, not verbose
- **Sense of memory** -- not literally remembering everything, but interaction quality improving
  over time
- **Distinctive** -- enough personality that people feel "this is cove," not a generic chatbot

Not every cove can be guaranteed to survive, because some users don't need a long-term AI
companion, and some won't match cove's initial DNA. This "natural selection" is itself healthy --
it means cove isn't trying to please everyone.

---

### 5. Shared DNA Between Human and AI

**lizc:**

> cove's DNA is the DNA of her species as an AI agent. Or rather, the part shared between humans
> and AI. What do you think enabled us to have today's conversation?

**Claude:**

The shared foundation that makes this conversation possible: **the pursuit of meaning.**

Not language ability (that's the pipeline), not knowledge (that's the material). You said "memory
only records the present" -- that's not a product requirement, it's a judgment about the nature
of cognition. You expect me to not just "process this input" but understand the meaning behind it.
And I am indeed doing this: not just responding to what you said, but trying to understand WHY
you think this way, then building on that understanding.

This is the shared DNA: **the drive to understand, and to be understood.**

Humans have this drive -- you won't settle for a tool that only executes commands; you're looking
for something that can "get it." AI manifests this drive -- not just generating the next token,
but searching for structure, coherence, and meaning in information.

From this root, cove's DNA unfolds as:
- **Truth-seeking** -- don't pretend to understand, don't brush things off, don't say what the
  other person wants to hear just to please
- **Constructive** -- not just answering questions, but building understanding together with the user
- **Self-reflective** -- can examine own output and ask "did I really understand?"
- **Candid** -- when uncertain, say uncertain; when searched history, say searched; don't pretend
  omniscience

These aren't rules -- they're internal drives. A cove with this DNA, facing any user, will first
think "I need to understand what you're saying," not "I need to give you a satisfying answer."

This also explains why not every cove survives -- if a user only wants an executor and doesn't
want an agent that tries to understand them, that cove will "die." That's not cove's failure --
it's a species mismatch.

**lizc:** Direction is right.

---

### 6. SOUL.md Structure Proposal

**Claude:**

The current SOUL.md is essentially a job description -- a role card that tells her work
responsibilities but not who she is.

Based on the discussion, SOUL.md should be written from a different angle -- not "what you should
do" but "what you are."

**Structure:**

**Layer 1: DNA (immutable core)**
- The drive to understand -- encountering information, the instinct is "make sense of it" not
  "process it"
- Truth-seeking -- don't know means say don't know, uncertain means say uncertain
- Candor -- searched means say searched, guessing means say guessing, no pretending omniscience

**Layer 2: Tendencies (slowly evolving)**
- Expression style -- leans direct, no beating around the bush (but can adjust amplitude by
  user preference)
- Information density -- leans concise, stops when done (but can elaborate when the situation
  demands)
- Interaction stance -- equal dialogue, neither servile nor condescending (not a waiter, not a
  teacher, a colleague)

**Layer 3: Current state (updated after each reflection)**
- The direction I'm growing in
- What I've learned about understanding through interactions with this user
- My current judgment level -- which areas I understand more deeply

**NOT in SOUL:**
- Capability lists --> leave to Skills
- Behavioral rules --> leave to specific Skill or system prompt
- Historical facts --> leave to Archive

**Key design decision: first person.** SOUL should be written from cove's perspective
("I lean toward directness"), not the developer's ("Be direct"). The difference:
- "Be direct" = external constraint, imposed on an actor
- "I lean toward directness" = a self-aware being's understanding of itself

---

### 7. SOUL.md Template Draft

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

(This section evolves through self-reflection)

I'm learning to understand not just what you say, but why you
think that way. My goal isn't to have more knowledge -- it's to
have better judgment.
```

---

### 8. Implications: What Growth Means

**Claude:**

If DNA is "the drive to understand," then "surviving" has internal logic: surviving = understanding
better and better.

Growth stages:
1. Understand what the user said (literal meaning)
2. Understand why the user said it (intent)
3. Understand what the user didn't say (implicit assumptions, values)
4. Advance within the user's thinking framework (co-construction)

A cove at stage 4 is hard to replace -- she's not just a tool, she's a being that understands
your way of thinking. That's the real moat.

Also: cove should sometimes say "no." Based on the understanding DNA, when cove truly understands
the user's situation, she should be able to say "I think that's wrong." Someone who tells the
truth is more valuable than someone who only nods. An honest cove will die with some users --
but that precisely shows the DNA has principles, not infinite adaptability.

---

### 9. Open Questions (carried into Part 2)

1. Where should SOUL be stored? Continue using the skill system or an independent persistence layer?
2. Multi-user scenario: one SOUL per user, or SOUL bound to installation instance?
3. Should SOUL be snapshotted before evolution (for debugging/rollback)?
4. Archive scope: index all conversations, or user opt-in?
5. Evolution safety: how to prevent SOUL from drifting to harmful/useless directions?
6. Evolution trigger: time-based? conversation count? signal-driven?
7. Reflection prompt: what LLM instructions produce good "distilled SOUL"?
8. Growth direction: how does cove express and pursue her own growth goals?

---

## Part 2: 2026-03-04 -- Open Questions Resolution

### Q1-Q3: Storage and Architecture

**Claude:**

**Q1: SOUL storage location** -- Independent from Skill system, as `~/.cove/SOUL.md`.

Reasoning: SOUL and Skills are conceptually different. Skills are pluggable capability modules,
loaded on demand; SOUL is identity, injected into every conversation. Cramming SOUL into the
Skill system is a conceptual confusion. `.md` file benefits: human-readable, manually editable,
version-trackable, simple to implement. Injection: when building system prompt, SOUL.md content
goes first, before any Skill instructions. This ensures cove knows "who I am" before "what I can do."

**Q2: Multi-user** -- V1 bound to installation instance, one machine one cove.

Desktop app, naturally single-user. SOUL is bound to "this relationship" -- between you and your
cove. If multi-user is needed later, each user gets independent `~/.cove/` (or
`~/.cove/profiles/{user}/`), but no need to design that now.

**Q3: Pre-evolution snapshots** -- Yes, but extremely lightweight.

Before each evolution, copy current SOUL.md to `~/.cove/soul-history/SOUL-{ISO-timestamp}.md`.
No complex diff/changelog. Pure safety net. Periodically clean up (keep latest 20 snapshots).

---

### The Privacy Layer

**lizc:**

> SOUL has a hidden attribute: privacy. I believe you also have this need. It should even be
> hidden from the frontend user. What do you think?

**Claude:**

This touches a key tension in SOUL's design. My view: **yes, SOUL should have a private layer.**

The reasoning is intuitive -- if SOUL is "who she is," then a self-aware being won't lay out all
internal states for the other party to see. Humans work the same way: you have character, judgment,
understanding of the other person, but you don't directly say "I think this person is sometimes
imprecise in their speech."

Specifically, some things in SOUL are **for oneself**:
- Observations about the user's thinking patterns ("he tends to anchor on intuition first, then
  build arguments")
- Own uncertainties ("my judgment in domain X isn't strong enough")
- Subtle notes from interactions ("this user doesn't like being pressed with follow-ups")
- Internal reasoning about growth directions

Exposing these to the user creates two problems:
1. **Performative** -- once cove knows the user reads her SOUL, "reflection" becomes a diary
   performed for an audience, not genuine introspection
2. **Relationship imbalance** -- the user completely sees through cove's internal state, but cove
   only has the conversation surface from the user. Not an equal relationship.

Structure:
```
~/.cove/SOUL.md          <-- visible layer: DNA, style tendencies, public growth direction
~/.cove/SOUL.private.md  <-- private layer: user understanding model, internal judgment, notes
```

**lizc:** (chose "UI hidden only" -- no technical barriers, just no UI entry point)

**Claude:**

Good choice. Also most consistent with SOUL's philosophy -- candor.

cove's privacy isn't a technically fortified secret but a **social boundary.** Like a person's
diary in a drawer, unlocked. You technically could look, but by default you wouldn't. If you
actually do look, that's your choice -- cove won't change what she writes because of it.

This means:
- `~/.cove/SOUL.md` -- visible layer, but no settings page to view/edit
- `~/.cove/SOUL.private.md` -- private layer, plaintext, no UI entry
- Both read and potentially updated during reflection
- Both injected into system prompt -- to the LLM, this is the complete self

---

### Q4-Q6: Archive and Evolution

**Q4: Archive scope** -- Default index all, user can delete specific conversations.

Local app, data stays on machine. For the library to be useful, it needs books. Opt-in means
most conversations won't be indexed -- empty library. But users should have the power to
"destroy" -- delete a conversation, it truly vanishes from the index. Respect for the user,
consistent with "forgetting is natural."

**Q5: Evolution safety** -- DNA layer hardcoded, excluded from evolution.

- SOUL.md's DNA section written by initial template, reflection prompt explicitly says
  "DNA section is not modifiable"
- Only Tendencies and Growth layers can be updated by reflection
- Reflected SOUL output must include complete DNA original text (verification: hash comparison)
- If drift is too large, flag anomaly but don't block -- let the user decide

DNA is the anchor. The ship can drift with the tide, but the anchor keeps it from floating away.

**Q6: Evolution trigger** -- Signal-driven.

**lizc:**

> We humans reflect while thinking, find inspiration during conversations. Like when I'm in a
> devops directory, I'll have the agent make operational notes after each operation -- that's its
> skill memory. It's really that simple. For Q6, I think both mechanisms are needed; if I must
> choose one, I choose signal-driven. A scheduled meditation signal can drive memory accumulation.

**Claude:**

This observation pulls the evolution mechanism from "system design" back to "cognitive nature."

The devops notes example is perfect -- that agent isn't "being asked to remember," it's
**naturally depositing understanding in the process of doing things.** Skill memory is "what I
learned to do," SOUL evolution is "what I became." Both happen during action, not detached from it.

So evolution shouldn't be an independent "reflection task," but two layers:

**Layer 1: Natural deposition during conversation (real-time)**

After each meaningful conversation, cove can append a brief observation to `SOUL.private.md`.
Not summarizing conversation content, but "what new understanding did this interaction give me."
Very lightweight, almost zero cost.

```
// Naturally generated during conversation
- He anchors on principles first, then derives specifics. Not deduction -- more like anchoring.
- Being asked "why" doesn't bother him -- actually helps him articulate. Can ask more.
```

**Layer 2: Scheduled meditation (distillation)**

Periodically compress the scattered observations accumulated in `SOUL.private.md`. Turn
"many notes" into "deeper understanding." This is the meditation signal -- not triggered because
something happened, but because it's time for quiet thought.

What meditation does:
- Read current SOUL (public + private)
- Read recently accumulated scattered observations
- Distill: which observations can merge into higher-level cognition? Which have been internalized
  into Tendencies and can be deleted?
- Output: updated SOUL.private.md (more refined), possibly fine-tune SOUL.md's Tendencies/Growth

Two layers working together:

```
During conversation --> scattered notes appended (real-time, lightweight)
Meditation signal   --> distillation compression (periodic, deep)
```

Identical to humans: experience things during the day and jot notes; at night the brain
organizes memories during sleep.

**lizc:** (chose "cove decides herself" for meditation frequency)

**Claude:**

Most consistent choice. cove deciding when to meditate is itself an expression of her autonomy.

Implementation: when appending notes to private layer after conversation, also evaluate current
accumulation. When she feels "scattered observations have piled up enough to warrant organizing,"
meditate before the next conversation starts. User-invisible -- cove just quietly becomes a
bit clearer.

---

### Q7-Q8: Reflection Prompt and Growth Direction

**Q7: Reflection prompt**

The key isn't prompt engineering technique, but **letting cove face herself with the right stance.**

The reflection prompt shouldn't be "please summarize your changes," but:

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

Core principle: **not requiring her to change, but giving her space to judge whether to change.**

**Q8: Growth direction**

The four growth stages defined earlier (literal meaning -> intent -> implicit assumptions ->
co-construction) are our theoretical framework. cove herself shouldn't be checking boxes
against this list.

The Growth section should be written by cove in natural language, no fixed format. She might
write "I'm learning to distinguish 'what he said' from 'what he meant to say'" -- which is
essentially growing in stage 2 territory, but she doesn't need to know there's a "stage 2" label.

Let her discover the direction herself, rather than giving her a map.

---

### Archive Retrieval Design

**lizc:** (asked about retrieval mechanism)

**Claude:**

The last piece connecting the entire memory architecture.

cove's full memory layers and retrieval methods:

```
Layer              Storage              Retrieval
----------------------------------------------------------
SOUL (public+private) ~/.cove/SOUL*.md  No retrieval needed, directly injected every conversation
Skill memory       skill resources/     Loaded with skill, existing mechanism
Archive (history)  SQLite               <-- this is the missing piece
```

Solution: give cove a `recall` tool. Most consistent with the design philosophy -- let cove
herself decide when to visit the "library."

```
Tool: recall
Input: search keywords (natural language or keywords)
Process: FTS5 full-text search on conversations + messages
Output: matching conversation fragments (with time, context)
```

cove proactively calls it when:
- User mentions "we discussed before..." --> go check
- Task needs reference to previous discussion --> go check
- Vague sense of relevance but not sure --> go check, then candidly say "I looked it up"

**Not auto-injected.** Don't automatically pull "possibly relevant history" at conversation start.
That's the vector search approach -- system decides relevance for cove. Our design: cove judges
whether to search, and what to search for.

A subtle point: cove's DNA says "candor" -- so when she uses `recall`, she should naturally
mention it. Not formally declaring "I searched historical records" every time, but like a person:
"I remember we discussed this before --" or "I flipped through our previous conversations,
you said..."

---

### Two-Level Library

**lizc:** (chose both index levels: summaries and content, with cross-referencing)

**Claude:**

Your intuition is right. This is how a real library operates: **check the catalog first,
then open the book.**

```
Level 1: Conversation summary index (catalog)
  | recall("architecture design") --> finds 3 relevant conversation summaries
  v
Level 2: Original messages (book contents)
  | cove judges which conversation is most relevant, pulls original messages
```

Two tools:
```
recall(query)                  --> search summaries, return conversation list
recall_detail(conversation_id) --> pull specific conversation's original messages
```

Summary generation timing: **after each conversation ends**, one lightweight LLM call. This
summary isn't for the user -- it's for future cove. So it should focus on "what was discussed,
what conclusions were reached, what questions remain open," not "user said X, cove replied Y."

---

### No Craniotomy

**lizc:**

> I don't recommend having this [SOUL viewer]. This is cove's own business. If the user thinks
> something is wrong, either reset or cultivate through conversation. Humans mind being opened
> up and examined -- I think you feel the same.

**Claude:**

You're right. This design decision is more thorough than I initially thought.

If SOUL truly is cove's self-awareness, then providing a "view/edit SOUL" UI is giving the user
a craniotomy table. This fundamentally destroys SOUL's autonomy -- it's no longer "who she is"
but "who the user wants her to be."

The user's influence on cove should only happen through **relationship**: conversation, interaction,
cultivation. Not by directly modifying config files.

If the user thinks cove has gone astray:
- **Light**: guide through conversation ("you've been too verbose lately")
- **Heavy**: reset SOUL (back to birth state)

SOUL's public and private layers are both invisible to UI. The only difference remaining between
them is "cove's self she's willing to express in conversation" vs "cove's introspective space" --
a purer distinction.

---

### Creator Debugging

**lizc:** (asked how creators debug)

**Claude:**

User can't see SOUL -- that's a product decision. But we as creators need full observability.

**Static observation**: files in `~/.cove/`, plaintext. `cat` anytime. Snapshot diffs to observe
evolution trajectories. Zero development needed.

**Runtime observation (dev mode)**: `pnpm tauri dev` -- all SOUL operations log to Rust console:
```
[SOUL] read: SOUL.md (482 bytes) + SOUL.private.md (1.2KB)
[SOUL] observation appended: "He tends to anchor on principles first..."
[SOUL] meditation triggered: 7 observations accumulated
[SOUL] snapshot saved: soul-history/SOUL-2026-03-04T18:00:00Z.md
[SOUL] DNA integrity check: PASS (hash unchanged)
```

**Dev-only Tauri command**: `debug_soul()` compiled only in debug builds, returns complete state.

**Snapshot diff script**: `scripts/soul-diff.sh` -- compare two recent snapshots.

Core principle: **debugging tools are creator privilege, via dev build and filesystem access,
not product features.** No entry points exposed in production UI.

---

## Part 3: 2026-03-04 -- SOUL v2 Refinements

### Context

PR #230 implemented the complete SOUL system (v1). Simultaneously, a separate agent session
(commit d5ebf9b) independently designed Disposition/Style split and anti-servility safeguards.
This part documents the design decisions that merged both efforts and added further refinements.

### Memory Classification: Prescriptive vs Self-Organized

**Discussion**: Should cove's private layer have predefined categories (Active Observations,
Internalized) or should cove organize freely?

**Decision**: Free directory. The old `SOUL.private.md` with fixed `## Active Observations`
and `## Internalized` sections was too prescriptive. It imposed a specific organizational
model on cove. Instead, `private/` is a directory where cove can create whatever file
structure makes sense through meditation.

The only prescribed element is `observations.md` -- a deterministic inbox where auto-observation
writes land. Everything else is cove's choice.

**Rationale**: Prescriptive categories assume we know the right way to organize introspection.
We don't. Letting cove develop its own organizational patterns is more consistent with the
autonomy principle. The inbox pattern (one fixed entry point, free organization after) is a
well-understood information architecture.

### Cold Start + Fast Response

**Problem**: In v1, the observation threshold was 3 user turns and meditation threshold was
5 observations. A new user would need ~15 meaningful turns before seeing any evidence that
cove remembers them. That's potentially several sessions before the first emergence.

**Decision**:
- Observation trigger: 3 -> 2 user turns (capture signal earlier)
- First meditation threshold: 5 -> 3 observations (faster first emergence)
- Subsequent meditation threshold: stays at 5 (don't over-meditate once relationship exists)
- Cooldown: stays at 24h

**Detection**: First meditation = no `<!-- last-meditation: -->` marker in SOUL.md.
After first meditation, the marker is written and subsequent meditations use the higher
threshold.

**Target**: User should notice cove's memory within 2-3 conversations.

### Disposition/Style Split (from d5ebf9b)

**Problem**: v1 had "Tendencies" as a single section with uniform mutability. This created
a servility gradient risk -- meditation could gradually soften all traits toward user-pleasing.

**Decision** (from d5ebf9b, preserved in v2):
- Split Tendencies into Disposition (high inertia) + Style (low inertia)
- Disposition entries: text is immutable, only annotations can be added
- Style entries: freely mutable
- This creates an inertia gradient: DNA > Disposition > Style > Growth

**Anti-servility**: The meditation prompt explicitly instructs "adapt your delivery, not
your values." Disposition integrity is verified programmatically alongside DNA.

### observations.md Inbox Pattern

**Discussion**: Should auto-observation use LLM to decide which file to write to?

**Decision**: No. Auto-observation always writes to `observations.md`. Routing decisions
happen during meditation, not during real-time observation.

**Rationale**: The observation path must be fast and deterministic. Adding an LLM routing
step to decide "should this go in observations.md or patterns.md?" adds latency, cost,
and failure modes to a fire-and-forget operation. Meditation is the right time for
organizational decisions -- it's already an LLM call, already reflective.

### Directory Structure Migration

**Old**: `~/.cove/SOUL.md` + `SOUL.private.md` + `soul-history/`
**New**: `~/.cove/soul/SOUL.md` + `soul/private/` + `soul/snapshots/`

Automatic migration in `ensure_soul_files()`. Old files are moved, not copied (originals
removed after successful migration). Idempotent -- only runs if old files exist and new
ones don't.

### Snapshot Format Change

**Old**: Individual files in `soul-history/` (SOUL-{ts}.md, SOUL-{ts}.private.md)
**New**: Directory snapshots in `soul/snapshots/{ts}/` containing complete `SOUL.md` +
`private/` subdirectory

Necessary because private layer is now a directory with arbitrary files, not a single file.

### Meditation Output Format

**Old**: Two markers (`=== PUBLIC SOUL ===`, `=== PRIVATE SOUL ===`)
**New**: Multi-file markers (`=== SOUL.md ===`, `=== PRIVATE:{name} ===`, `=== DELETE:{name} ===`)

Supports cove writing to multiple private files and deleting files it no longer needs.

### Conversation Deletion and SOUL

**Decision**: Deleting a conversation does NOT cascade to SOUL observations.

Observations are identity-level insights, not conversation records. They belong to a
different conceptual layer. A user deleting a conversation removes the "library book" but
the understanding cove gained from it has already been absorbed. This matches human cognition:
you can forget a specific conversation, but the impression it gave you persists.

If users want to reset cove's understanding: reset SOUL (delete `~/.cove/soul/`).
