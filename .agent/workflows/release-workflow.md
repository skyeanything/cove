---
description: Dual-track release model and version management rules
---

# Release Workflow

Cove uses a dual-track release model: Feature releases (`x.y.0`) and Hotfix releases (`x.y.z`).

## Version Numbering

Semantic versioning: `MAJOR.MINOR.PATCH`

- `MAJOR` — breaking changes or major milestones
- `MINOR` — new features, shipped from `main`
- `PATCH` — hotfixes on an existing release branch

## Dual-Track Model

| | Feature Release | Hotfix Release |
|---|---|---|
| Version | `x.y.0` | `x.y.z` (z > 0) |
| Base branch | `main` | `release/x.y` |
| Branch from | `main` at tag | existing `release/x.y` |
| Merge target | tag on `main`, then cut `release/x.y` | `release/x.y`, cherry-pick to `main` |
| Worktree | `./scripts/start-worktree.sh feature <id> <desc>` | `./scripts/start-worktree.sh fix <id> <desc> --base release/x.y` |

```
main ──●──●──●──●──────────●──●──●──→
               │                ↑
               ▼ tag v0.2.0     │ cherry-pick
         release/0.2 ──●──●────┘
                     v0.2.1
```

## Scripts

| Script | Purpose |
|---|---|
| `scripts/bump-version.sh <M> <m> <p>` | Sync version in `package.json` + `tauri.conf.json` |
| `scripts/pre-release-check.sh` | Run 5 automated checks (build, test, coverage, cargo, file-size) |
| `scripts/start-worktree.sh ... --base <branch>` | Create worktree from a non-main base branch |

## Hard Constraints

- **Do not** create `release/*` branches. Only humans create release branches.
- **Do not** modify version numbers directly. Use `scripts/bump-version.sh`.
- **Do not** tag releases. Only humans tag.
- **Do not** merge into `main` or `release/*`. Only PRs merged by humans.
- Before any release, run the full readiness check via `scripts/pre-release-check.sh`.
- Production builds **must** be code-signed and notarized (see #161). Do not distribute unsigned builds.

## Release Readiness

When the user asks to prepare a release, follow this 5-phase check process:

1. Automated checks (`scripts/pre-release-check.sh`)
2. Changelog generation
3. Documentation review
4. Test review
5. Summary report
