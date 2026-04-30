# pgit-cli Project Release Checklist

## Release target
- Package: `pgit-cli`
- Registry: npm (`pgit-cli`)
- Current branch target: `main`
- Current package version: `0.7.0`
- Current HEAD tag: `v0.7.0`

## Current release status
- Latest local tag: `v0.7.0`
- Latest pushed tag: `v0.7.0`
- GitHub release for `v0.7.0`: **missing** (no GitHub release was created)
- CI release run status for `v0.7.0`: **failure**

## Failure cause (observed)
- `.github/workflows/release.yml` failed during `npm run test:coverage`.
- Failure root cause: integration test expects `dist/cli.js`, but release pipeline did not run a build immediately before coverage tests.
- Error seen in logs: `Cannot find module '.../dist/cli.js'`.

## Release readiness checks
1. Confirm clean working tree and correct branch.
2. Confirm `package.json` version matches tag version.
3. Confirm all user-facing changes are documented in `CHANGELOG.md` and references are present for new behavior.
4. Confirm tags and release branch mapping: `v*` tag on intended commit.
5. Confirm required secrets: `NPM_TOKEN`, repository `GITHUB_TOKEN`.

## Commands by stage

### Local
- `git status --short --branch`
- `git tag -l | sort -V | tail -n 5`
- `node -p "require('./package.json').version"`
- `npm run lint`
- `npm run test:ci`
- `npm run format:check`
- `npm run build`

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
