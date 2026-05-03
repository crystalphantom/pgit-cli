# Agent Guidelines for PGit CLI

## Primary Product Direction

PGit currently supports two private-tracking models. Prefer the newer agent-visible config flow for all new work.

- **Recommended flow**: `pgit config ...`
  - Keeps private files and folders as real files at their original repo-relative paths.
  - Stores canonical private copies under `~/.pgit/private-config/<project-id>/files/`.
  - Tracks state in `~/.pgit/private-config/<project-id>/manifest.json`.
  - Installs/refreshes pre-commit and pre-push hooks to prevent tracked private paths from leaking into shared Git history.
  - Optimized for AI coding agents and tooling that need to discover files in place.
- **Legacy flow**: `pgit legacy ...`
  - Deprecated compatibility path for the old private repo and symlink model.
  - Hidden unless enabled with `PGIT_FEATURE_LEGACY=1` or `PGIT_LEGACY=1`.
  - Do not use for new functionality unless the task is explicitly about legacy compatibility.

Use one ownership model per repo path. Do not make the same artifact owned by both the recommended config flow and the legacy flow.

## Core Docs to Prioritize

Read these first for current behavior:

- `README.md` - product positioning and current quick start.
- `docs/architecture.md` - concise current architecture and safety model.
- `docs/commands.md` - command reference and current options.
- `docs/agent-visible-config-sync-flow.md` - detailed recommended flow.
- `docs/PRIVATE_CONFIG_AGENT_VISIBILITY_SPEC.md` - design rationale and constraints.
- `docs/troubleshooting.md` - expected user-facing recovery guidance.

Read these only when changing compatibility behavior:

- `docs/legacy.md`
- `docs/legacy-init-add-flow.md`
- `docs/presets.md`

## Current Command Model

### Recommended private config commands

- `pgit add <paths...>` - track repo paths in the agent-visible private config flow.
- `pgit remove <paths...>` - untrack paths and remove private-store entries; do not delete repo-local files.
- `pgit drop <paths...>` - remove working-tree copies only.
- `pgit push` - copy repo-local content into private store.
- `pgit pull` - restore private-store content into repo paths.
- `pgit status` - report repo/private drift.
- `pgit config init/location/info/edit/backup/reset` - global config management.

### Legacy commands

Legacy commands are deprecated and feature-gated. Preset commands are part of the legacy model and are incompatible with the new recommended config flow unless explicitly redesigned. Keep legacy/preset behavior working when touched, but do not expand it for new use cases unless explicitly requested.

- `PGIT_FEATURE_LEGACY=1 pgit --help`
- `PGIT_LEGACY=1 pgit --help`
- `pgit legacy init`
- `pgit legacy add <path...>`
- `pgit legacy status`, `pgit legacy private-status`, `pgit legacy add-changes`, `pgit legacy commit`, `pgit legacy log`, `pgit legacy diff`, `pgit legacy branch`, `pgit legacy checkout`, `pgit legacy cleanup`, `pgit legacy reset`
- `pgit preset list`
- `pgit preset show <name>`
- `pgit preset apply <name>`
- `pgit preset add <name> <paths...>`
- `pgit preset add --global <name> <paths...>`
- `pgit preset remove <name>`
- `pgit preset remove --global <name>`

## Recommended Flow Invariants

When implementing or changing the recommended private-config flow, preserve these invariants:

- Private tracked files remain real repo-local files, not symlinks.
- `pgit add` must not update `.gitignore` or `.git/info/exclude` by default.
- Repo-relative path identity must be preserved exactly, including nested paths.
- Validate all requested paths before mutating any state.
- Project identity should prefer normalized Git remote URL, then Git common dir.
- Store contents under `~/.pgit/private-config/<project-id>/files/<repo-path>`.
- Store manifest data outside the repo under `~/.pgit/private-config/<project-id>/manifest.json`.
- Hooks must block committing or pushing tracked private content, while allowing deletion-only untracking commits.
- Conflict handling for sync operations should avoid overwrites unless `--force` is supplied, and forced overwrites should create backups.
- `config sync status` states should align with docs: `up-to-date`, `modified-locally`, `modified-private`, `missing-repo`, `missing-private`.

## Build & Development Commands

- **Build**: `npm run build` - compile TypeScript to `dist/`.
- **Dev**: `npm run dev -- <command>` - run the CLI in development mode.
- **Lint**: `npm run lint` - lint TypeScript files.
- **Lint Fix**: `npm run lint:fix` - auto-fix ESLint issues.
- **Format**: `npm run format` - format with Prettier.
- **Format Check**: `npm run format:check` - check Prettier formatting.
- **Clean**: `npm run clean` - remove `dist/`.

## Testing Commands

- **Full Tests**: `npm test`.
- **Single Test**: `npx jest src/__tests__/commands/add.command.test.ts`.
- **Single Test File**: `npx jest src/__tests__/core/config.manager.test.ts`.
- **Module Tests**: `npx jest --testPathPattern=commands`.
- **Coverage**: `npm run test:coverage` or `npx jest --coverage`.
- **Watch Mode**: `npm run test:watch`.
- **Framework**: Jest with `ts-jest` preset and 90% coverage threshold.

Before PR creation, run the relevant quality gates:

- `npm run lint`
- `npm run format:check`
- `npm run build`
- `npm test` or the narrowest relevant Jest command

## Code Style Guidelines

- **TypeScript**: ES2020 target, CommonJS modules, strict mode enabled.
- **Imports**: external libraries first, then internal modules such as types, core, utils, and errors.
- **Formatting**: single quotes, semicolons, trailing commas, 100 character width, 2 spaces.
- **Naming**: PascalCase for classes/interfaces, camelCase for methods/variables, UPPER_CASE for constants.
- **Error Handling**: custom error classes should extend `BaseError` and use readonly properties.
- **File Structure**: `commands/*.command.ts`, `core/*.service.ts`, `types/*.types.ts`, `utils/*.utils.ts`.
- **Documentation**: add JSDoc for public methods and interface descriptions.
- **Async**: use async/await consistently; avoid raw Promise chains where async/await is clearer.
- **ESLint**: no console, prefer const, no var, explicit return types, no any, prefer readonly.

## Implementation Patterns

- Use Zod schemas for runtime validation with `parse()`.
- Implement command classes with async `execute()` returning `CommandResult`.
- Mock external dependencies in tests with `jest.mock()`.
- Prefer readonly properties, explicit return types, and type guards.
- Use `path.join()` or other path utilities for cross-platform path handling.
- Implement multi-step filesystem and Git operations atomically where possible, with rollback support.
- Keep command behavior, README examples, and docs aligned when changing user-facing behavior.

## Safety Requirements

- Never commit or push code before the required GitHub Actions and local quality gates have run.
- Do not expose private path names in committed project files unless the relevant docs explicitly allow it.
- Treat hook behavior as critical security functionality, not a convenience feature.
- For security-sensitive changes, review `docs/SECURITY.md` and add focused tests.
