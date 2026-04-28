# Legacy Tracking Flow (`pgit init` + `pgit add` / `add-changes` / `commit`)

This document describes the original private-tracking flow in PGit that moves files into a
private storage repository and exposes them in the main tree via symlinks.

## Architecture

- `pgit init` creates a legacy private Git setup in the working repository.
- Private files are physically moved to `.private-storage`.
- `.pgit-config.json` is stored in the project root and tracks:
  - storage path
  - tracked paths
  - git-exclude behavior and settings.
- `.git-private/` is not used by the main repository. It is only related to private Git internals.
- Main repo visibility is controlled through `.git/info/exclude` updates (best effort) so private file
  names are hidden from normal `git add`/`git status` workflows.

## Command flow: `pgit init`

Use `pgit init` once per repository before using `pgit add`.

1. Verify the target directory is a Git repo and writable.
2. Ensure the project is not already initialized (`.private-config.json` and legacy dirs are absent).
3. Create:
   - `.git-private/`
   - `.private-storage/`
   - `.private-config.json`
4. Initialize a Git repository inside `.private-storage` and ensure `.git/info/exclude` scaffolding.
5. Create `.private-config.json` with initial metadata.
6. Update `.gitignore` to hide private-system paths.
7. Add an initial `README.md` in `.private-storage` and create a seed commit.

## Command flow: `pgit add <path>`

`pgit add` is the legacy per-path tracker. It now supports single and multi-path adds.

1. Validate all input paths, ensure they are inside the repo and currently exist.
2. Enforce max batch size (100 paths).
3. Check `.private-storage` and `.private-config.json` to confirm initialization.
4. Require symlink support on host OS.
5. For each path:
   - Record current git state (tracked/staged/status metadata).
   - Remove path from main Git index where applicable.
   - Add path to `.git/info/exclude` via `GitService` (warn or fail depending on configured fallback).
   - Move the file/dir from repo path into `.private-storage` preserving relative structure.
   - Create a symlink from the original repo path to the moved storage item.
   - Add the item to private storage repo and commit in private Git.
   - Persist tracked path in `.private-config.json`.
6. If any step fails in a multi-path run, rollback actions are executed in reverse order.

### Multi-path behavior

- Paths are deduplicated and processed in one atomic path set.
- Batches larger than 50 are chunked internally for stability.
- Git index/remove and exclude operations are attempted first in batch form where possible.
- If exclude write operations fail, the command continues in warning mode unless fallback is
  configured as `error`.

### Related commands in the same flow

After `pgit add`, lifecycle continues through the legacy private Git workflow:

- `pgit status`: shows system + both repos health.
- `pgit add-changes --all`: stage private repo changes.
- `pgit commit -m "..."`: commit private repo changes.
- `pgit log`, `pgit diff`, `pgit branch`, `pgit checkout`: operate in private repo context.
- `pgit cleanup`: repairs symlink/config health.

## What this flow is optimized for

- Keeping private artifacts hidden from normal main-repo status flows.
- Strong "do not leak via shared git" behavior through exclude/commit filtering.
- Existing private Git mental model (storage repo + managed symlinks).

## Important constraints

- Requires `pgit init` first.
- It is a symlink-based model (not directly visible to some agent indexing tools).
- `.gitignore` and `.git/info/exclude` updates are separate from `.private-storage` and can be
  user-visible system changes.

## Coexistence note

- This legacy path is **not strictly disjoint** from agent-visible tracking.
- If you must use both workflows in a project, do not mix both models on the same repo path.
- Prefer this flow when you want symlink-based isolation + strong exclusion behavior; use
  `pgit config ...` when you need repo-path discoverability for agents.

## Typical state map

```text
repo/
├── .private-storage/
├── .private-config.json
├── .git-private/
├── .gitignore
└── tracked-secret.env  -> symlink to .private-storage/tracked-secret.env
```
