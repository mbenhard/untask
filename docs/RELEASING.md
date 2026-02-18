# Releasing Untask

## Prerequisites
- GitHub repo set up at `github.com/mbenhard/untask`
- GitHub Actions workflows in `.github/workflows/`

## Creating a Release

1. Update version in `package.json`
2. Commit: `git commit -am "chore: bump version to X.Y.Z"`
3. Tag: `git tag vX.Y.Z`
4. Push: `git push origin main --tags`
5. GitHub Actions will automatically:
   - Run typecheck and tests
   - Build the macOS app
   - Create a draft GitHub Release with the build artifact
6. Go to GitHub Releases, review the draft, add release notes, and publish

## Version Scheme
- `v0.x.y` — pre-1.0 releases
- Bump minor for new features, patch for fixes
