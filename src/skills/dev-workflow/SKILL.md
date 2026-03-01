---
name: dev-workflow
description: "Cove development workflow: dual-track release, worktree creation, version bumping, PR conventions, and release readiness checks. Use when starting issues, creating hotfixes, submitting PRs, preparing releases, or syncing version numbers."
emoji: "🔀"
always: false
requires:
  tools:
    - bash
---

# Development Workflow

## Dual-Track Release

Cove uses Feature releases (`x.y.0`) and Hotfix releases (`x.y.z`).

| | Feature Release | Hotfix Release |
|---|---|---|
| Version | `x.y.0` | `x.y.z` (z > 0) |
| Base | `main` | `release/x.y` |
| Worktree | `start-worktree.sh feature <id> <desc>` | `start-worktree.sh fix <id> <desc> --base release/x.y` |

### Commands

```bash
# Feature worktree (default, from main)
./scripts/start-worktree.sh feature <id> <desc>

# Hotfix worktree (from release branch)
./scripts/start-worktree.sh fix <id> <desc> --base release/x.y

# Bump version (syncs package.json + tauri.conf.json)
./scripts/bump-version.sh <major> <minor> <patch>

# Pre-release automated checks
./scripts/pre-release-check.sh
```

## Release Readiness Check

When the user requests release preparation (e.g., "prepare release 0.2.0"), execute all 5 phases in order.

### Phase 1: Automated Checks

Run `scripts/pre-release-check.sh` via bash. Parse the output:

- Report each check as PASS or FAIL
- Any FAIL is a **blocking** issue

### Phase 2: Changelog Generation

Generate a changelog entry for the target version:

1. Get commits since last tag:
   ```bash
   git log $(git describe --tags --abbrev=0 2>/dev/null || echo "")..HEAD --oneline
   ```
2. Get merged PRs:
   ```bash
   gh pr list --state merged --base main --json number,title,labels,mergedAt
   ```
3. Classify by PR title prefix: `feat:` -> Added, `fix:` -> Fixed, `refactor:` -> Changed, `chore:` / `docs:` -> Other
4. Write the entry into `CHANGELOG.md` under a new version heading, following Keep a Changelog format

### Phase 3: Documentation Review

#### 3a. Writing Style

Read `.agent/workflows/writing-style.md`, then check all `.md` files modified in this version:

- No emoji in documentation
- Direct, imperative tone
- No filler language ("comprehensive", "robust", "elegant")
- List violations with file path and suggested fix

#### 3b. Coverage

- New AI tools must have `description` in their definition
- New skills must have complete frontmatter (name, description, requires)
- Features touching 3+ files should have corresponding CLAUDE.md or workflow doc updates
- List any gaps

### Phase 4: Test Review

#### 4a. Coverage Data

Parse the coverage output from Phase 1. Compare against thresholds in `.agent/workflows/test-quality.md`.

#### 4b. Change Coverage

Identify `.ts`/`.tsx` files changed in this version. For each, check if a corresponding `.test.ts`/`.test.tsx` exists. List files missing tests.

#### 4c. Quality Assessment

Read test files for changed code. Evaluate:

- Edge case coverage
- Mock appropriateness
- Error handling tests
- State transition tests

Rate as: sufficient / needs improvement / insufficient.

### Phase 5: Summary Report

Produce a structured report:

```
## Release Readiness: vX.Y.Z

### Blocking
- [ ] (any FAIL from Phase 1)
- [ ] (any critical gaps)

### Warnings
- [ ] (non-critical issues from Phases 3-4)

### Passed
- [x] (all PASS items)

### Verdict: READY / NOT READY
```

A single blocking item means NOT READY.

## Hard Constraints

- Do not create `release/*` branches. Humans only.
- Do not tag releases. Humans only.
- Do not modify version numbers directly. Use `scripts/bump-version.sh`.
- Do not merge into `main` or `release/*`. PRs only.
- Do not skip any phase during release readiness checks.

## Resources

Use `skill_resource` tool to load `resources/release-flow.md` for detailed step-by-step release procedures.
