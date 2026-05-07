# pgit-cli Project Release Checklist

## Release target
- Package: `pgit-cli`
- Registry: npm (`pgit-cli`)
- Current branch target: `main`
- Current package version: check with `node -p "require('./package.json').version"`
- Current HEAD tag: check with `git describe --tags --exact-match HEAD`

## Current release status
- Latest local tag: check with `git tag -l | sort -V | tail -n 5`
- Latest pushed tag: check with `git ls-remote --tags origin`
- GitHub release status: check with `gh release list --repo crystalphantom/pgit-cli --limit 5`
- CI release run status: check with `gh run list --repo crystalphantom/pgit-cli --limit 10`

## Failure cause (observed)
- `v0.8.1` CI failed during packed CLI installation because `postinstall` runs `node scripts/install-presets.cjs`, but the tarball did not include that script.
- `v0.8.1` release failed because the tag version was `0.8.1` while `package.json` still declared `0.8.0`.
- Root cause: local release validation did not run the same packed tarball install smoke that CI runs, and the actual release was run with `--no-npm`, which skipped the manifest bump.

## Release readiness checks
1. Confirm clean working tree and correct branch.
2. Confirm `package.json` version matches tag version.
3. Confirm all user-facing changes are documented in `CHANGELOG.md` and references are present for new behavior.
4. Confirm tags and release branch mapping: `v*` tag on intended commit.
5. Confirm the packed tarball installs cleanly with `npm run test:package`.
6. Confirm required secrets: `NPM_TOKEN`, repository `GITHUB_TOKEN`.

## Commands by stage

### Local
- `git status --short --branch`
- `git tag -l | sort -V | tail -n 5`
- `node -p "require('./package.json').version"`
- `npm run lint`
- `npm run test:ci`
- `npm run format:check`
- `npm run build`
- `npm run test:package`

Do not use `--no-npm` for an actual release. This project relies on release-it's npm integration with `publish: false` to bump package metadata without publishing locally.

### CI/tag
- `git tag vX.Y.Z`
- `git push --tags`
- Push commit(s) and tag to `main`.
- Trigger release workflow by pushing tag matching `v*`.

### Publish
- Workflow runs from `.github/workflows/release.yml` on tag push.
- It performs: lint, build, test:coverage, release notes extraction, GitHub release, npm publish, and post-release validation.

### Post-release
- Verify GitHub release exists: `gh release list --repo crystalphantom/pgit-cli --limit 5`
- Verify NPM availability: `npm view pgit-cli@<version> version`
- Smoke test installation: `npm install -g pgit-cli@<version>`

## Required secrets
- `GITHUB_TOKEN` (repository)
- `NPM_TOKEN` with publish scope for `pgit-cli`

## Rollback / hotfix notes
- If publish fails after release notes/repo tagging, do not retag same version.
- Bump patch/minor/major appropriately and create new tag.
- If a bad version reaches npm, prefer deprecate/remove with registry tooling and publish a corrected follow-up version.

## Blockers discovered in this run
1. Release pipeline is currently fixed in this repository at `.github/workflows/release.yml` by adding `npm run build` before `npm run test:coverage`.
2. `v0.7.0` release remains unpublished until a successful rerun.
3. The workflow should be retriggered after this patch via a new tag or manual rerun of the failed run (if permissions allow).
