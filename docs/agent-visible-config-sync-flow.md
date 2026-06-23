# Agent-Visible Private Config Flow (`pgit add/remove/push/pull/status`)

This document covers the newer path-preserving flow intended for coding agents and tooling that
needs private files visible at their real repository locations.

## Architecture

- No symlinks for tracked paths.
- No mandatory `.git/info/exclude` updates for new entries.
- Real files remain in the repo at their original relative paths.
- Canonical private copies are stored in the user home area:
  `~/.pgit/private-config/<project-id>/files/...`
- A project manifest (`manifest.json`) tracks:
  - tracked repo paths
  - private copy locations
  - per-entry hash snapshots
  - identity details used for stable project binding.
- Pre-commit and pre-push hooks are installed to prevent private config paths from entering shared
  history.

## Identity and storage layout

Project identity is derived from Git identity data (remote URL preferred, then git common dir). A
short hash is attached to a human-readable repo name:

```text
<repo-name>-<short-hash>
```

Examples:

```text
necto-pro-a1b2c3d4/
  files/
    my-rules.md
    private-folder/
      nested/config.md
  manifest.json
```

## Command flow: `pgit add <paths...>`

`pgit add` is the primary entry point for agent-visible tracking.

1. Expand glob inputs such as `*.env` and apply any repeated `--exclude <pattern>` filters.
2. Normalize each resolved path and verify it is inside the repo and exists.
3. Validate all paths before mutating anything. If one path is invalid, no path is changed.
4. Load or create manifest for the project.
5. Copy each repo path into private store path:
   - file paths copy as files
   - directory paths copy recursively.
6. Remove already-tracked main-repo entries via `git rm --cached -r -- <path>`.
7. Save/update manifest entries and checkout state.
8. Install/refresh hooks (`.git/hooks` or common hooks path).
9. Optionally auto-run `pgit push <added-paths...>` unless `--no-sync-push`.
10. Optionally auto-commit the shared-Git removals unless `--no-commit`. The generated
   deletion-only commit bypasses local hooks. If Git still rejects the commit, `pgit add` reports
   success and leaves the removals staged with manual commit instructions.

### Glob and exclude selection

- Glob inputs are expanded against repo-relative paths before mutation. Quote globs when your shell
  would otherwise expand or reject them, for example `pgit add '*.env'`.
- `pgit add .` expands to repo files rather than adding the repository root itself.
- `--exclude <pattern>` removes matching paths from the expanded add set and may be repeated, for
  example `pgit add . --exclude '*.log' --exclude 'tmp/**'`.
- Exclude patterns match repo-relative paths, and basename-only patterns such as `*.log` also match
  nested file basenames.

### `--force` and existing entries

- Without `--force`, re-adding an already-tracked path throws.
- With `--force`, existing private copies are replaced and hash state is rebuilt.

## Command flow: `pgit remove <paths...>`

1. Validate every requested path is tracked.
2. Delete the corresponding private-store entries.
3. Remove those entries from `manifest.json`.
4. Rewrite checkout state and refresh hooks.

Repo-local files/directories are **not deleted**.

## Command flow: `pgit push <paths...>`

- Requires explicit tracked paths.
- `pgit push .` means "push all tracked paths".
- Non-dot inputs must match tracked manifest entries exactly.
- Detects changes in private target before overwrite.
- Without `--force`, throws on conflict.
- With `--force`, backs up the target first (`.backups/`) and overwrites.

## Command flow: `pgit pull <paths...>`

- Requires explicit tracked paths.
- `pgit pull .` means "pull all tracked paths".
- Non-dot inputs must match tracked manifest entries exactly.
- Uses same conflict logic and `--force` backup behavior as `push`.

## Command flow: `pgit status`

For each tracked entry, state is computed from repo/private hash snapshots:

- `up-to-date`
- `modified-locally`
- `modified-private`
- `missing-repo`
- `missing-private`

## Hook behavior (critical for safety)

- `pre-commit`: blocks commits that stage tracked paths.
- `pre-push`: blocks pushes where tracked private content appears in outgoing commit history.
- Deletion-only changes are allowed so manual untracking steps can still be committed.

## Related commands

These are separate from legacy `pgit legacy init`/`pgit legacy add`:

- `pgit config init/location/info/edit/reset` are for global preset/config management.
- Legacy private-repo commands live under `pgit legacy ...` and do not drive this flow.

## What this flow is optimized for

- Agent/tooling discoverability (private files remain real files).
- Explicit sync control between repo and private store.
- Safer discovery in automation pipelines that ignore symlinks.

## Coexistence note

- This flow is also **not disjoint** from the legacy flow; both can exist in the same repository.
- Use one model per path to avoid conflicting ownership of the same private artifact.
- Prefer this flow for agent-visible workflows where tools must traverse private config in place.
