# Release Flow Reference

Step-by-step procedures for Feature and Hotfix releases.

## A. Feature Release (x.y.0)

1. Confirm all target PRs are merged to `main`
2. Run release readiness check (all 5 phases from SKILL.md)
3. Fix any blocking issues; re-run until clean
4. Bump version:
   ```bash
   ./scripts/bump-version.sh <major> <minor> 0
   ```
5. Commit version bump: `chore: bump version to x.y.0`
6. Human creates tag `vx.y.0` on `main`
7. Human creates branch `release/x.y` from that tag
8. Human triggers build/publish pipeline

## B. Hotfix Release (x.y.z)

1. Create hotfix worktree:
   ```bash
   ./scripts/start-worktree.sh fix <id> <desc> --base release/x.y
   ```
2. Implement fix, add tests
3. Run `scripts/pre-release-check.sh` in the worktree
4. Open PR targeting `release/x.y`
5. After merge, bump version on `release/x.y`:
   ```bash
   ./scripts/bump-version.sh <major> <minor> <patch>
   ```
6. Human tags `vx.y.z` on `release/x.y`
7. Cherry-pick the fix commit(s) back to `main`:
   ```bash
   git cherry-pick <commit-hash>
   ```

## C. Version Sync Rules

`scripts/bump-version.sh` updates both files atomically:

- `package.json` -> `version` field
- `src-tauri/tauri.conf.json` -> `version` field

The script refuses to run if the two files have different current versions. Fix any mismatch manually first.

## D. CHANGELOG Convention

Follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/):

```markdown
## [x.y.z] — YYYY-MM-DD

### Added
- New features (from `feat:` PRs)

### Changed
- Modifications to existing features (from `refactor:` PRs)

### Fixed
- Bug fixes (from `fix:` PRs)
```

- Use PR titles as the primary source, supplemented by commit messages
- Group by category, not by PR number
- Each entry: one line, starts with a dash, describes the user-visible change

## E. Backport Strategy

Hotfixes on `release/x.y` should be cherry-picked to `main` after the release PR merges. If the cherry-pick conflicts:

1. Create a new branch from `main`
2. Resolve conflicts manually
3. Open a PR to `main` referencing the original hotfix PR

## F. Git/GH Commands for Changelog Generation

```bash
# Commits since last tag
git log $(git describe --tags --abbrev=0 2>/dev/null || echo "")..HEAD --oneline

# Merged PRs on main
gh pr list --state merged --base main --json number,title,labels,mergedAt

# Files changed since last tag
git diff --name-only $(git describe --tags --abbrev=0 2>/dev/null || echo "")..HEAD
```
