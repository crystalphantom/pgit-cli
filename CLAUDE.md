# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- Install deps: `npm ci`
- Build: `npm run build` (runs `tsc`, then `scripts/fix-imports.js` to add `.js` extensions in `dist/` ESM output)
- Type check only: `npx tsc --noEmit`
- Run CLI from source: `npm run dev -- <command>` (example: `npm run dev -- status`)
- Lint: `npm run lint`
- Lint fix: `npm run lint:fix`
- Format: `npm run format`
- Format check: `npm run format:check`
- Test all: `npm test`
- Test CI/coverage: `npm run test:ci` or `npm run test:coverage`
- Watch tests: `npm run test:watch`
- Single test file: `npx jest src/__tests__/commands/add.command.test.ts`
- Single test name: `npx jest src/__tests__/commands/add.command.test.ts -t "test name"`
- Clean build output: `npm run clean`

CI runs on Node 20 with: `npm ci`, `npm run format:check`, `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm run test:ci`, then package/install smoke tests.

## Architecture

PGit CLI is a TypeScript ESM command-line app (`type: module`) built around Commander. `src/cli.ts` wires subcommands to command classes, handles global `--verbose`, reads version from package metadata, and sends uncaught command errors through `EnhancedErrorHandler`.

Commands in `src/commands/*.command.ts` are thin orchestration layers. They construct core services for current working directory, validate command-specific inputs, return `CommandResult`, and leave process exits/logging to CLI registration. Core behavior lives under `src/core/`:

- `ConfigManager` owns legacy project config in `.private-config.json`, validates with Zod schemas, tracks `trackedPaths`, and stores git-exclude settings.
- `GitService` wraps `simple-git` for both main repo and private repo operations. It also manages `.git/info/exclude` entries for pgit-protected paths.
- `FileSystemService` centralizes atomic copy/move/write/remove operations, backups, permissions, and rollback hooks.
- `SymlinkService` creates/validates/repairs repo-path symlinks to private storage, with Windows-specific behavior.
- `PresetManager`, `GlobalPresetManager`, and `CentralizedConfigManager` resolve presets from package defaults, project config, and global `~/.pgit/config` with fallback paths for global npm installs.
- `PrivateConfigSyncManager` implements agent-visible private config: copies repo-path files into `~/.pgit/private-config/<project>/files`, tracks a manifest, installs pre-commit/pre-push hooks, and syncs pull/push with conflict backups.

Two private-file models coexist:

1. Legacy tracking (`pgit init`, `pgit add`, `pgit commit`, `pgit status`) stores real content under `.private-storage/`, replaces repo paths with symlinks, records metadata in `.private-config.json`, and protects files via `.git/info/exclude`.
2. Agent-visible config (`pgit config add`, `pgit config sync pull|push|status`) keeps real files at repo paths for coding agents, mirrors them to `~/.pgit/private-config`, removes already-tracked paths from main git, and uses hooks to keep private store in sync.

Runtime validation/types live in `src/types/`: `config.types.ts` defines shared interfaces/constants (`DEFAULT_PATHS`, config versions, command result shapes), and `config.schema.ts` contains Zod schemas used when reading/writing config and presets.

Tests live under `src/__tests__/` and use Jest with `ts-jest` in ESM mode. Unit tests mirror commands/core services; integration tests create temporary git repositories and exercise symlink/git-exclude/private-config flows. `src/__tests__/setup.ts` runs after Jest environment setup.

## Repo-specific notes

- Source imports omit `.js`; compiled `dist/` imports are patched by `scripts/fix-imports.js`. If adding new import forms, make sure postbuild still patches them.
- Package entrypoint is `dist/cli.js`, binary name is `pgit`, Node requirement is `>=18.0.0`.
- ESLint targets `src/**/*.ts`; explicit return types are warnings, `no-explicit-any` and `prefer-readonly` are errors.
- Existing agent guidance in `AGENTS.md` says not to commit or push before GitHub Actions have run.
