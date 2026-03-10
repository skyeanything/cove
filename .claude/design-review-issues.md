# [design] Code Review Issues

Already created: #261, #262, #263

---

## Issue 4 (High) — McpTabContent/SubAgentTabContent: stale list and unhandled rejections

**Title:** `[design] McpTabContent/SubAgentTabContent: stale list and unhandled rejections`
**Label:** bug

McpTabContent and SubAgentTabContent only load data on mount. Creating new records via dialog does not refresh the list. Also, useEffect `.then()` has no `.catch()`, and async handlers swallow rejections via `void`.

Fix: add refresh callback after create; add `.catch()` to async DB calls.

Severity: High

---

## Issue 5 (High) — ExtensionCard/ConversationItem: keyboard-inaccessible buttons

**Title:** `[design] ExtensionCard/ConversationItem: edit/delete buttons invisible to keyboard users`
**Label:** bug

Edit/Delete buttons use `opacity-0 group-hover:opacity-100` without `group-focus-within:opacity-100`. Keyboard-only users cannot see these controls when tabbing.

Affected files:
- src/components/extensions/ExtensionCard.tsx
- src/components/sidebar/ConversationItem.tsx

Fix: add `group-focus-within:opacity-100` to the button containers.

Severity: High

---

## Issue 6 (High) — ExtensionMarketPage: missing ARIA tab pattern

**Title:** `[design] ExtensionMarketPage missing ARIA tab roles`
**Label:** bug

Tab buttons lack `role="tab"`, `aria-selected`, container lacks `role="tablist"`, and content lacks `role="tabpanel"`. Violates WAI-ARIA tab pattern.

Affected file: src/components/extensions/ExtensionMarketPage.tsx

Severity: High

---

## Issue 7 (High) — dataStore and chatStore: duplicate messages state

**Title:** `[design] dataStore and chatStore maintain duplicate messages state`
**Label:** bug

Both `dataStore` and `chatStore` maintain independent `messages` arrays. This violates the single-source-of-truth principle and risks desynchronization. CLAUDE.md states: "Never put derived data in stores -- compute it."

Additionally, `dataStore.setActiveConversation` calls `loadMessages(id)` without `await` or `.catch()`.

Severity: High

---

## Issue 8 (High) — soul-observe: date header append logic may group under wrong date

**Title:** `[design] soul-observe: observations may append under wrong date section`
**Label:** bug

`soul-observe.ts:54-58` -- checks `hasDateHeader` but does not verify today's header is the last section in the file. If the file has headers for multiple dates and today's header exists somewhere in the middle, new observations are appended to the end of the file, appearing under a different date's section.

Severity: High

---

## Issue 9 (Medium) — AppLayout sidebar animation duration violates design spec

**Title:** `[design] AppLayout sidebar uses duration-300 instead of duration-200`
**Label:** enhancement

AppLayout.tsx:117 uses `duration-300` for sidebar transition. CLAUDE.md specifies "Sidebar collapse: 200ms ease-out".

Severity: Medium

---

## Issue 10 (Medium) — ExtensionMarketPage Plus icon strokeWidth violation

**Title:** `[design] ExtensionMarketPage Plus icon uses strokeWidth={2} instead of 1.5`
**Label:** enhancement

ExtensionMarketPage.tsx:79 -- `<Plus strokeWidth={2}>` violates CLAUDE.md design spec: "Stroke width: 1.5 (not 2, to feel lighter)".

Severity: Medium

---

## Issue 11 (Medium) — CreateSkillDialog uses placeholder text as validation error

**Title:** `[design] CreateSkillDialog shows placeholder as validation error message`
**Label:** bug

CreateSkillDialog.tsx:43 -- validation error uses `t("skills.descriptionPlaceholder")` instead of a proper error message i18n key.

Severity: Medium

---

## Issue 12 (Medium) — SkillsTabContent calls listSkills() on every render

**Title:** `[design] SkillsTabContent should memoize listSkills() call`
**Label:** enhancement

SkillsTabContent.tsx:14 -- `listSkills()` is called on every render without `useMemo`. This iterates `import.meta.glob` results unnecessarily.

Severity: Medium

---

## Issue 13 (Medium) — ConversationItem passes t() as prop instead of useTranslation()

**Title:** `[design] ConversationItem: anti-pattern passing t as prop`
**Label:** enhancement

ConversationItem.tsx:25 -- `t: (key: string) => string` is passed as prop. Component should call `useTranslation()` internally.

Severity: Medium

---

## Issue 14 (Medium) — ConversationList saves empty string on rename clear

**Title:** `[design] ConversationList: clearing rename input saves empty string`
**Label:** bug

ConversationList.tsx:102 -- `editingTitle.trim() || undefined` then `title ?? ""` results in saving an empty string title when user clears the field. Should revert to original title instead.

Severity: Medium

---

## Issue 15 (Medium) — soul_commands.rs: &PathBuf should be &Path

**Title:** `[design] soul_commands.rs: use &Path instead of &PathBuf (Clippy ptr_arg)`
**Label:** enhancement

soul_commands.rs:34,134 -- functions take `&PathBuf` instead of idiomatic `&Path`. Clippy `ptr_arg` lint.

Severity: Medium

---

## Issue 16 (Medium) — soul-meditate: fragile parenthetical stripping and hardcoded magic number

**Title:** `[design] soul-meditate: fragile annotation stripping and magic number`
**Label:** bug

1. soul-meditate.ts:226 -- `lastIndexOf(" (")` to strip annotations will misfire if disposition entry legitimately contains parentheses
2. soul-meditate.ts:209 -- hardcoded magic number `9` for `"## My DNA".length`

Severity: Medium

---

## Issue 17 (Medium) — summaryRepo FTS sync is non-atomic

**Title:** `[design] summaryRepo: FTS sync (DELETE + INSERT) should be in a transaction`
**Label:** bug

summaryRepo.ts:27-41 -- Three separate SQL statements (INSERT OR REPLACE, DELETE FTS, INSERT FTS) without a transaction. Crash between DELETE and INSERT leaves FTS index out of sync.

Severity: Medium

---

## Issue 18 (Medium) — chatStore: unsafe type cast and hardcoded Chinese strings

**Title:** `[design] chatStore: unsafe Record cast and hardcoded Chinese strings`
**Label:** bug

1. chatStore.ts:254-255 -- `Record<string, unknown>` cast bypasses AI SDK type safety
2. chatStore.ts:150-151, 235-236 -- hardcoded Chinese text should go through i18n

Severity: Medium

---

## Issue 19 (Medium) — Create dialogs: Labels missing htmlFor attribute

**Title:** `[design] Create dialogs: Label elements missing htmlFor for accessibility`
**Label:** bug

CreateMcpDialog, CreateSkillDialog, CreateSubAgentDialog -- `<Label>` elements are not associated with inputs via `htmlFor`, breaking screen reader accessibility.

Severity: Medium

---

## Issue 20 (Medium) — MainNavSidebar: Cmd+F intercepts globally

**Title:** `[design] MainNavSidebar Cmd+F handler intercepts regardless of focus`
**Label:** bug

MainNavSidebar.tsx:73-81 -- Cmd+F handler does not check if sidebar is focused. It intercepts the shortcut globally, preventing expected behavior in other panes.

Severity: Medium

---

## Issue 21 (Low) — Minor UI/code quality issues

**Title:** `[design] Minor UI and code quality issues`
**Label:** enhancement

Collected low-severity issues:

1. PluginTabContent.tsx:19 -- Switch onToggle is no-op but UI appears interactive
2. SidebarUserArea.tsx:32 -- `size-[16px]` should be `size-4`
3. AppLayout.tsx:140 -- "Loading..." hardcoded English, should use t()
4. AppLayout.tsx:48 -- `.catch(() => {})` silently swallows workspace watcher errors
5. soul_commands.rs:125 -- `let _ = fs::copy(...)` silently ignores snapshot copy failure
6. soul_migrate.rs:19,37 -- old files deleted before verifying full migration success
7. soul-observe.ts:50 -- `split("T")[0]` needs `?? ""` under noUncheckedIndexedAccess

Severity: Low
