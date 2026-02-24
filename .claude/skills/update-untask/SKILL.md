---
name: update-untask
description: Release a new version of Untask — bump version, generate changelog, push, build, publish, update Homebrew and website
disable-model-invocation: true
argument-hint: [version e.g. 0.1.10]
---

# Release Untask

Automate the full release pipeline for Untask. Argument: the new version number (e.g. `0.1.10`).

## Prerequisites

Gather these before starting:

```bash
# Current version
CURRENT=$(node -p "require('./package.json').version")

# Last version tag
LAST_TAG="v$CURRENT"
```

## Step 1: Analyze commits

Get all commits since the last release for `untask/`:

```bash
git log --oneline $(git log --oneline --all -- untask/ | grep "chore: bump version to $CURRENT" | head -1 | awk '{print $1}')..HEAD -- untask/
```

Categorize them into:

- **Added** — new features, capabilities
- **Improved** — enhancements to existing features, refactors, UX polish
- **Fixed** — bug fixes, corrections

Consolidate related commits (e.g. multiple Ollama commits become one "Ollama overhaul" entry). Use bold lead text for major items. Match the style of existing CHANGELOG.md entries.

## Step 2: Present changelog for approval

Show the user the proposed changelog in markdown format. **Wait for explicit approval before proceeding.** The user may want edits.

## Step 3: Bump version

Update these files with the new version `$ARGUMENTS`:

1. **`package.json`** — `"version": "$ARGUMENTS"`
2. **`CHANGELOG.md`** — Add new section at top with today's date, add compare link at bottom
3. **`website/src/config.ts`** — `export const version = "v$ARGUMENTS";`

## Step 4: Commit and push

```bash
# Commit all version changes
git add package.json CHANGELOG.md website/src/config.ts
git commit -m "chore: bump version to $ARGUMENTS"

# Push to GitHub
git push untask main
```

If push fails with non-fast-forward:

```bash
git fetch untask
git merge untask/main --no-edit
# Resolve any conflicts keeping ours (local is source of truth)
git push untask main
```

**Note:** `website/` and `docs/plans/` are in `.gitignore` and untracked — they never reach GitHub. Only the app code is published.

## Step 5: Create tag and trigger Release build

The Release workflow (`.github/workflows/release.yml`) triggers on tag push `v*`. Create the tag via GitHub API:

```bash
# Get the SHA of latest main on GitHub
SHA=$(gh api repos/mbenhard/untask/branches/main --jq '.commit.sha')

# Create the tag
gh api repos/mbenhard/untask/git/refs -f ref="refs/tags/v$ARGUMENTS" -f sha="$SHA"
```

**Do NOT use `gh release create --draft`** to create the tag — draft releases don't create real tags and won't trigger the workflow.

## Step 6: Wait for CI

```bash
# Watch the Release workflow
gh run list --repo mbenhard/untask --workflow=release.yml --limit 1
gh run watch <run-id> --repo mbenhard/untask --exit-status
```

If the build fails:
1. Check logs: `gh run view <run-id> --repo mbenhard/untask --log-failed | tail -50`
2. Fix the issue, commit, subtree push
3. Delete and recreate the tag to retrigger:
   ```bash
   gh api repos/mbenhard/untask/git/refs/tags/v$ARGUMENTS -X DELETE
   NEW_SHA=$(gh api repos/mbenhard/untask/branches/main --jq '.commit.sha')
   gh api repos/mbenhard/untask/git/refs -f ref="refs/tags/v$ARGUMENTS" -f sha="$NEW_SHA"
   ```

## Step 7: Publish the release

The Release workflow creates a draft release with the .zip attached. Update notes and publish:

```bash
gh release edit v$ARGUMENTS --repo mbenhard/untask \
  --title "Untask v$ARGUMENTS" \
  --notes "<changelog in markdown — include Install/Updating sections>" \
  --draft=false
```

Release notes format:

```markdown
## What's New in v$ARGUMENTS

### Added
- ...

### Improved
- ...

### Fixed
- ...

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
# Download the zip and get sha256
gh release download v$ARGUMENTS --repo mbenhard/untask --pattern '*.zip' --dir /tmp --clobber
SHA256=$(shasum -a 256 /tmp/Untask-darwin-arm64-$ARGUMENTS.zip | awk '{print $1}')

# Update the cask via GitHub API
gh api repos/mbenhard/homebrew-untask/contents/Casks/untask.rb -X PUT \
  -f message="chore: bump untask to v$ARGUMENTS" \
  -f content="$(printf 'cask "untask" do\n  version "%s"\n  sha256 "%s"\n\n  url "https://github.com/mbenhard/untask/releases/download/v#{version}/Untask-darwin-arm64-#{version}.zip"\n  name "Untask"\n  desc "Local-first personal task manager with optional AI assistant"\n  homepage "https://github.com/mbenhard/untask"\n\n  app "Untask.app"\n\n  postflight do\n    system_command "/usr/bin/xattr",\n                   args: ["-cr", "#{appdir}/Untask.app"],\n                   sudo: false\n  end\nend\n' "$ARGUMENTS" "$SHA256" | base64)" \
  -f sha="$(gh api repos/mbenhard/homebrew-untask/contents/Casks/untask.rb --jq '.sha')"
```

## Step 9: Deploy website

```bash
cd website && vercel --prod --yes
```

Verify the version badge at https://unta.sk shows `v$ARGUMENTS`.

## Step 10: Verify

Confirm everything is live:

```bash
# Release published
gh release view v$ARGUMENTS --repo mbenhard/untask --json tagName,isDraft,name

# Homebrew cask updated
gh api repos/mbenhard/homebrew-untask/contents/Casks/untask.rb --jq '.content' | base64 -d | head -3

# All releases consistent
gh release list --repo mbenhard/untask --json tagName,name --jq '.[:3]'
```

Report the final status to the user.
