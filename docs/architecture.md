# PGit Architecture (Brief)

PGit currently has two workflows:

- **Recommended**: agent-visible flow (`pgit add/remove/push/pull/status`)
  - Keeps tracked files at their original repo locations.
  - Stores canonical copies under `~/.pgit/private-config`.
  - Prevents those tracked local artifacts from being staged into shared commits via hooks.
- **Legacy**: hidden/deprecated root flow (`pgit legacy ...`)
  - Uses a legacy private repository model.
  - Uses symlinks and repo-level tracking internals.

## Recommended flow in practice

### Data layout

- Repo: working tree remains the source of truth for agent tool discovery.
- Private config data store: `~/.pgit/private-config/<project-id>/`.
- Manifest: `~/.pgit/private-config/<project-id>/manifest.json`.
- File contents: `~/.pgit/private-config/<project-id>/files/<repo-path>`.
- Config metadata:
  - Global settings/presets: `~/.pgit/config/`
  - Optional local project presets: `.pgit/presets.json`

### Project identity

PGit computes a stable project id from Git identity:

- Remote URL when available (normalized, lower-cased, stripped from `.git` suffix).
- Otherwise it falls back to git common dir.

The id is reused across workspaces and is used for private storage location and manifest lookup.

### Sync lifecycle

- `pgit add <paths...>` copies tracked paths into the private store and records hash snapshots in manifest.
- `pgit push` updates private store from current repo copies.
- `pgit pull` restores repo paths from private store.
- `pgit status` compares repo/private snapshots and reports:
  - `up-to-date`
  - `modified-locally`
  - `modified-private`
  - `missing-repo`
  - `missing-private`

### Safety model

- `pre-commit` and `pre-push` hooks are installed when using `pgit add`.
- Hooks block commits/pushes that would leak tracked private paths through shared Git.

For deeper command-by-command details, see:

- `docs/agent-visible-config-sync-flow.md` (detailed flow)
- `docs/commands.md` (commands and options)
