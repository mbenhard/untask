---
name: update-untask
description: Release a new version of Untask — bump version, generate changelog, push, build, publish, update Homebrew and website
disable-model-invocation: true
argument-hint: [version e.g. 0.1.10]
---

# Release Untask

Automate the full release pipeline for Untask. Argument: the new version number (e.g. `0.1.10`).

## Prerequisites

```bash
CURRENT=$(node -p "require('./package.json').version")
```

## Step 1: Analyze commits

Find the version bump commit and list everything since:

```bash
git log --oneline $(git log --oneline --all | grep "chore: bump version to $CURRENT" | head -1 | awk '{print $1}')..HEAD --no-merges
```

For large releases, use the Explore agent to read commit diffs and understand the actual scope — commit messages alone can understate changes.

Build a prioritized candidate list from commit diffs before writing bullets:

- **P0 (must include):** user-visible capabilities, workflows, models/providers, onboarding/settings changes, install/update flow changes
- **P1 (usually include):** meaningful UX polish, reliability fixes, behavior changes users will notice
- **P2 (selective):** internal refactors/cleanups/tests only if they affect compatibility, migration risk, or release stability

Then write changelog entries using sections as applicable: **Added**, **Improved**, **Fixed**, **Removed**.

Changelog quality bar:
- Consolidate related commits, but do not hide substantial shipped changes
- Default to a balanced summary (typically 6-12 bullets total)
- For patch releases, keep concise (3-7 bullets); for large releases, expand as needed
- Match the style of existing `CHANGELOG.md` entries, but favor impact over strict symmetry

## Step 2: Present changelog for approval

Show the proposed changelog and explicitly note any intentionally omitted low-priority items.

If scope is ambiguous, provide two options:
- **Concise** (high-signal, user-facing only)
- **Comprehensive** (includes important technical/removal notes)

**Wait for explicit approval before proceeding.**

## Step 3: Bump version

Update version in:

1. **`package.json`** — `"version"` field
2. **`CHANGELOG.md`** — New section at top with today's date + compare link at bottom
3. **`website/src/config.ts`** — `export const version = "v...";`

Check for any other files that reference the version (search if unsure).

## Step 4: Commit and push

Only commit files that are tracked by git. `website/` is gitignored — update it but don't try to `git add` it.

```bash
git add package.json CHANGELOG.md
git commit -m "chore: bump version to $ARGUMENTS"
```

**Push:** This repo pushes directly to the `untask` remote (NOT a subtree split).

```bash
git push untask main
```

If push fails with non-fast-forward (e.g. from merged GitHub PRs):
1. Verify all remote commits exist locally: check every non-merge commit on `untask/main` with `git branch --contains <sha>`
2. If all present, force push is safe: `git push untask main --force`
3. If any are missing, fetch and merge first

**Pre-push safety:** Verify no private directories are tracked (`git ls-files | grep -E '^(website/|offbrand-website/|\.Codex/|\.vercel/)'`). If any show up, add them to `.gitignore` and `git rm -r --cached` before pushing.

## Step 5: Create tag and trigger Release build

```bash
SHA=$(gh api repos/mbenhard/untask/branches/main --jq '.commit.sha')
gh api repos/mbenhard/untask/git/refs -f ref="refs/tags/v$ARGUMENTS" -f sha="$SHA"
```

**Do NOT use `gh release create --draft`** — draft releases don't create real git tags and won't trigger the workflow.

## Step 6: Wait for CI

```bash
gh run list --repo mbenhard/untask --workflow=release.yml --limit 1
gh run watch <run-id> --repo mbenhard/untask --exit-status
```

If the build fails:
1. Check logs: `gh run view <run-id> --repo mbenhard/untask --log-failed | tail -80`
2. Fix the issue, commit, push to `untask main`
3. Delete and recreate the tag to retrigger:
   ```bash
   gh api repos/mbenhard/untask/git/refs/tags/v$ARGUMENTS -X DELETE
   NEW_SHA=$(gh api repos/mbenhard/untask/branches/main --jq '.commit.sha')
   gh api repos/mbenhard/untask/git/refs -f ref="refs/tags/v$ARGUMENTS" -f sha="$NEW_SHA"
   ```

**Common CI issues:**
- Native module rebuild failures — check Python version compatibility with node-gyp
- Workflow files missing — verify `.github/workflows/` exists on the remote (`gh api repos/mbenhard/untask/contents/.github/workflows`)

## Step 7: Publish the release

```bash
gh release edit v$ARGUMENTS --repo mbenhard/untask \
  --title "Untask v$ARGUMENTS" \
  --notes "<changelog in markdown>" \
  --draft=false
```

Release notes should mirror the approved changelog sections (including **Removed** when relevant) plus an Install section:

```markdown
### Install

#### Homebrew (recommended)
\`\`\`
brew install mbenhard/untask/untask
\`\`\`

#### Updating
\`\`\`
brew update && brew upgrade untask
\`\`\`

#### Direct Download
Download the zip from the assets below, unzip, and run Untask.
```

## Step 8: Update Homebrew cask

```bash
gh release download v$ARGUMENTS --repo mbenhard/untask --pattern '*.zip' --dir /tmp --clobber
SHA256=$(shasum -a 256 /tmp/Untask-darwin-arm64-$ARGUMENTS.zip | awk '{print $1}')
```

Then update the cask file via GitHub API — read the current `Casks/untask.rb` to get the sha, then PUT the updated content with new version and sha256.

## Step 9: Deploy website

```bash
cd website && vercel --prod --yes
```

If release notes are edited after publish and `/changelog` still shows cached content, bump `CACHE_PREFIX` in `website/src/pages/changelog.astro` and redeploy.

## Step 10: Verify

```bash
# Release published
gh release view v$ARGUMENTS --repo mbenhard/untask --json tagName,isDraft,name

# Homebrew cask
gh api repos/mbenhard/homebrew-untask/contents/Casks/untask.rb --jq '.content' | base64 -d | head -3

# Website version
```

Check https://unta.sk shows the new version. Report final status.
