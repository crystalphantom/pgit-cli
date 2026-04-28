# Agent-Visible Private Config Flow (`pgit config add/remove/sync`)

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

## Command flow: `pgit config add <paths...>`

`pgit config add` is the primary entry point for agent-visible tracking.

1. Normalize each requested path and verify it is inside the repo and exists.
2. Validate all paths before mutating anything. If one path is invalid, no path is changed.
3. Load or create manifest for the project.
4. Copy each repo path into private store path:
   - file paths copy as files
   - directory paths copy recursively.
5. Remove already-tracked main-repo entries via `git rm --cached -r -- <path>`.
6. Save/update manifest entries and checkout state.
7. Install/refresh hooks (`.git/hooks` or common hooks path).
8. Optionally auto-run `pgit config sync push` unless `--no-sync-push`.
9. Optionally auto-commit the shared-Git removals unless `--no-commit`.

### `--force` and existing entries

- Without `--force`, re-adding an already-tracked path throws.
- With `--force`, existing private copies are replaced and hash state is rebuilt.

## Command flow: `pgit config remove <paths...>`

1. Validate every requested path is tracked.
2. Delete the corresponding private-store entries.
3. Remove those entries from `manifest.json`.
4. Rewrite checkout state and refresh hooks.

Repo-local files/directories are **not deleted**.

## Command flow: `pgit config sync push`

- Pushes current repo-local content into private store for all tracked paths.
- Detects changes in private target before overwrite.
- Without `--force`, throws on conflict.
- With `--force`, backs up the target first (`.backups/`) and overwrites.

## Command flow: `pgit config sync pull`

- Pulls private-store content back into repo paths.
- Uses same conflict logic and `--force` backup behavior as `push`.

## Command flow: `pgit config sync status`

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

These are separate from legacy `pgit init`/`pgit add`:

- `pgit config init/location/info/edit/reset` are for global preset/config management.
- `pgit status`, `commit`, and other private-repo commands are still valid but do not drive this
  flow.

## What this flow is optimized for

- Agent/tooling discoverability (private files remain real files).
- Explicit sync control between repo and private store.
- Safer discovery in automation pipelines that ignore symlinks.

## Coexistence note

- This flow is also **not disjoint** from the legacy flow; both can exist in the same repository.
- Use one model per path to avoid conflicting ownership of the same private artifact.
- Prefer this flow for agent-visible workflows where tools must traverse private config in place.
