# Private Config Agent Visibility Spec

## Problem

`pgit` currently uses symlinks for files or directories added to private config. This keeps one source of truth, but many coding agents do not reliably discover symlinked files or symlinked directories during search, indexing, or glob traversal.

That defeats the main goal: private config should be available to coding agents such as Claude Code, OpenCode, and similar tools as normal project context.

## Goals

- Keep private files and directories at their intended repo-relative paths.
- Make private files and directories visible to coding agents as normal filesystem entries.
- Prevent private files from being committed accidentally.
- Support both files and directories.
- Support nested paths.
- Avoid writing private file names to committed project files.
- Preserve a private backup/source outside the repo.
- Provide explicit sync between repo-local files and private store.

## Non-goals

- Hide private files from local `git status` while also guaranteeing agent discovery.
- Make private files invisible to local shell commands.
- Protect against users intentionally bypassing all local safety mechanisms.
- Provide cryptographic secret management.
- Replace dedicated secret stores for high-risk credentials.

## Key constraint

Vanilla Git cannot satisfy all three properties at once:

1. Files are discoverable by coding agents.
2. Files are hidden from `git status`.
3. Files cannot be committed.

If files are ignored through `.gitignore` or `.git/info/exclude`, Git status is cleaner, but many agents may also skip them during discovery because their search/indexing tools often respect Git ignore rules.

If files are real, unignored files at repo paths, agents can discover them, but native `git status` will show them as untracked.

Therefore, preferred design prioritizes:

- agent visibility
- commit protection

and accepts:

- local `git status` may show private file names

## Proposed solution

Use real files at repo-relative paths, no symlinks, no `.gitignore`, no `.git/info/exclude` by default.

Store canonical/private copies outside the repo and sync them into the repo when needed.

```text
repo/my-rules.md
repo/private-folder/nested/config.md

~/.pgit/private-config/<project-id>/my-rules.md
~/.pgit/private-config/<project-id>/private-folder/nested/config.md
```

Example project ID format:

```text
necto-pro-a1b2c3d4
```

The repo name is human-readable. The hash prevents collisions between different repos with the same name.

### Core model

Private config is path-preserving.

```text
repo path <-> private store path
```

Example:

```text
repo/my-rules.md
<->
~/.pgit/private-config/necto-pro-a1b2c3d4/my-rules.md
```

Directory example:

```text
repo/private-folder/
<->
~/.pgit/private-config/necto-pro-a1b2c3d4/private-folder/
```

### Manifest

A private manifest tracks entries and sync state. It should live outside the repo.

Example:

```json
{
  "projectId": "necto-pro-a1b2c3d4",
  "identityHash": "a1b2c3d4",
  "repoName": "necto-pro",
  "entries": [
    {
      "repoPath": "my-rules.md",
      "type": "file",
      "privatePath": "~/.pgit/private-config/necto-pro-a1b2c3d4/my-rules.md",
      "lastSyncedHash": "abc123"
    },
    {
      "repoPath": "private-folder",
      "type": "directory",
      "privatePath": "~/.pgit/private-config/necto-pro-a1b2c3d4/private-folder",
      "files": {
        "nested/config.md": "def456"
      }
    }
  ]
}
```

`repoPath` is the identity. Do not key by basename because nested files can collide.

## Project identity

Private store paths need a stable project ID.

Recommended MVP format:

```text
<repo-name>-<hash>
```

Example:

```text
necto-pro-a1b2c3d4
```

### Repo name

Use the basename of the main worktree root or repository root as the readable prefix.

Examples:

```text
/Users/me/work/necto-pro -> necto-pro
/Users/me/tmp/necto-pro -> necto-pro
```

### Hash source

Use stable Git identity when available:

1. normalized `origin` remote URL
2. if no remote, root repository common-dir path
3. if neither is available, absolute repo root path

Hash should be short but collision-resistant enough for local storage, for example first 8-12 hex chars of SHA-256.

This handles same-name repos in different locations:

```text
~/work/client-a/app -> app-91ab23cd
~/work/client-b/app -> app-7f3e10aa
```

### Worktree behavior

Git worktrees create multiple working directories for the same underlying repository. These should normally share the same private config because they represent the same project.

For worktrees, derive identity from the Git common directory or canonical remote, not the worktree path.

Example:

```text
repo main worktree:      ~/src/necto-pro
repo feature worktree:   ~/src/necto-pro/.worktrees/feature-x
Git common dir:          ~/src/necto-pro/.git
project ID:              necto-pro-a1b2c3d4
```

Both worktrees use:

```text
~/.pgit/private-config/necto-pro-a1b2c3d4/
```

Open worktree question: if two worktrees need different private files at the same repo paths, shared project ID will conflict. Recommended future solution is an optional worktree profile layered on top of project ID:

```text
~/.pgit/private-config/<project-id>/base/
~/.pgit/private-config/<project-id>/worktrees/<worktree-profile>/
```

MVP uses shared project-level private config for all worktrees. Per-worktree profiles are deferred.

### Project rename behavior

If repo directory is renamed but remote/common-dir identity stays same, the hash remains stable but repo-name prefix changes.

Recommended MVP behavior:

- compute current desired ID
- if hash matches existing private config ID with old name prefix, reuse existing private config
- optionally rename private store directory from old prefix to new prefix

Example:

```text
old: old-name-a1b2c3d4
new: necto-pro-a1b2c3d4
```

MVP defers automatic rename and keeps using the existing ID. The hash is the true identity; the name is for readability.

## Commands

### `pgit config add <path>`

Adds a file or directory to private config tracking.

Behavior:

1. Resolve `<path>` to a repo-relative path.
2. Create or resolve project ID.
3. Copy repo path to private store, preserving relative path.
4. If paths are already tracked by main Git, run `git rm --cached -r -- <path>` so files stay local but are removed from shared Git tracking.
5. Auto-commit those deletion-only removals by default.
6. If `--no-commit` is used, leave removals staged and print explicit next steps.
7. Add entries to private manifest.
8. Install or update local Git hooks.
9. Do not update `.gitignore`.
10. Do not update `.git/info/exclude` by default.

Example:

```text
pgit config add my-rules.md

repo/my-rules.md
->
~/.pgit/private-config/<project-id>/my-rules.md
```

### `pgit config sync pull`

Copies private-store files into the repo at their original repo-relative paths.

```text
~/.pgit/private-config/<project-id>/my-rules.md
->
repo/my-rules.md
```

Rules:

- Create parent directories as needed.
- Preserve repo-relative paths.
- Refuse to overwrite changed repo-local files unless `--force` is provided.
- Use per-file hashes for files and directory contents.
- Update `lastSyncedHash` after successful sync.

### `pgit config sync push`

Copies repo-local private files back to the private store.

```text
repo/my-rules.md
->
~/.pgit/private-config/<project-id>/my-rules.md
```

Rules:

- Preserve repo-relative paths.
- Refuse to overwrite changed private-store files unless `--force` is provided.
- Use per-file hashes for files and directory contents.
- Update `lastSyncedHash` after successful sync.

### `pgit config sync status`

Shows sync state for private config entries.

Example output:

```text
my-rules.md modified locally
private-folder/ up to date
secrets.env missing in repo
```

### `pgit status`

Optional convenience command that wraps or filters Git status output to hide private config paths from user-facing status output.

This does not change native Git behavior. It only provides a cleaner `pgit` view.

## Git hooks

Hooks are safety rails, not hiding mechanisms.

### `pre-commit`

Checks staged files before commit.

Input:

```bash
git diff --cached --name-only
```

If any staged added/modified path matches a manifest `repoPath`, block commit. Deletion-only entries are allowed so `pgit config add <tracked-path>` can create a normal commit that removes private files from shared Git tracking.

Example message:

```text
Blocked commit: private config path staged: my-rules.md
Run: git restore --staged my-rules.md
```

Recommended behavior: block, do not auto-unstage. Blocking is explicit and avoids surprising index mutation.

Hook matching rules:

- file entry blocks exact `repoPath`
- directory entry blocks any staged path equal to or under `repoPath`

### `pre-push`

Installed by default with the `pre-commit` guard. Checks outgoing commits for private config paths.

Purpose:

- catch commits made before hook installation
- catch commits made with bypassed `pre-commit`
- protect remote from accidental private file push

MVP scans outgoing commits only. For existing remote branches, scan `<remote-sha>..<local-sha>`. For new remote branches, scan `<local-sha> --not --remotes=<remote-name>`, with full local branch scan as fallback.

If private paths appear in outgoing commit history, block push and report paths.

## Visibility behavior

### Default mode: agent-visible

No `.gitignore` entry. No `.git/info/exclude` entry.

```text
git status                 shows private untracked file names
git diff                   does not show untracked content
git add .                  stages private files
git diff --cached          shows staged private content
git commit                 blocked by pre-commit hook
git push                   blocked by pre-push hook if leaked commit exists
coding agent discovery     works best; files are normal filesystem entries
```

## Why not symlinks?

Symlinks keep one source of truth but fail the agent-discovery requirement.

Common agent/tool behavior:

- skip symlinked directories during glob/search
- avoid following links outside workspace
- avoid infinite loops
- respect sandbox boundaries
- avoid accidental private data traversal

Symlink targets may still be readable if explicitly addressed, but discoverability is unreliable.

## Why not `.gitignore`?

`.gitignore` is committed. It can reveal private file names to teammates and the organization.

Example leak:

```text
secrets.env
.personal/aliases.sh
my-private-agent-rules.md
```

Even if contents remain private, names may reveal sensitive workflow or secret presence.

## Why not `.git/info/exclude`?

`.git/info/exclude` is local-only and not committed, so it avoids sharing private file names with teammates.

However, many coding agents and search tools may still respect it. That means files may disappear from agent search/indexing just like `.gitignore` files.

Good for hiding from native Git status. Bad for guaranteed agent discovery.

MVP should not write `.git/info/exclude`.

## Why hooks alone cannot hide files

Git hooks do not run for:

```bash
git status
git diff
git add
```

Hooks can block commits and pushes, but they cannot hide untracked files from `git status`.

Therefore hook-only design keeps files visible to agents but also visible to local Git status.

## Trade-offs

### Agent-visible mode

Pros:

- best coding-agent compatibility
- real files at expected repo paths
- no symlink traversal issues
- no committed ignore entries
- hooks prevent accidental commit/push

Cons:

- `git status` shows private file names locally
- `git add .` can stage files before hook blocks commit
- staged private content can appear in `git diff --cached` locally

### `.git/info/exclude` mode

Pros:

- private paths hidden from normal `git status`
- no committed `.gitignore` leak
- Git refuses normal `git add <path>`

Cons:

- coding agents may not discover files
- still bypassable with `git add -f`
- still needs hooks
- not part of MVP default behavior

### Symlink mode

Pros:

- one source of truth
- no sync conflicts
- simple storage model

Cons:

- poor agent discovery
- tool/sandbox behavior inconsistent
- symlinked directories often skipped

### Materialized nested private folder

Example:

```text
repo/.pgit/private/my-rules.md
```

Pros:

- agents can read real files if not ignored
- simpler boundary folder

Cons:

- paths do not match intended project locations
- agents may miss context if expected file path matters
- still needs ignore/hook decision
- nested structure defeats root-path use case

## Recommended default

Use agent-visible mode by default:

```text
real files at repo-relative paths
private path-preserving store in ~/.pgit/private-config/<project-id>/
private manifest outside repo
sync pull/push
pre-commit guard
pre-push guard
pgit status filtered view
```

Accept that native `git status` shows private file names locally. Provide `pgit status` for cleaner day-to-day workflow.

Do not include stealth mode in MVP. Revisit only if users strongly prefer Git-status privacy over coding-agent visibility.

## Hashing strategy

Use per-file hashes.

For a file entry, store one hash for the file content.

For a directory entry, store hashes per relative child file.

Example:

```json
{
  "repoPath": "private-folder",
  "type": "directory",
  "files": {
    "nested/config.md": "abc123",
    "rules/local.md": "def456"
  }
}
```

Why per-file hashes:

- easier conflict detection
- easier status output
- partial directory changes are understandable
- no need to resync whole directory when one file changes

Aggregate directory hash can be derived later if needed for quick comparison, but should not be the primary source of truth.

## Conflict handling

Support `--force` for sync conflicts.

Default behavior:

- detect repo-local changes since last sync on `pull`
- detect private-store changes since last sync on `push`
- stop and report conflict

With `--force`:

- `sync pull --force` overwrites repo-local files from private store
- `sync push --force` overwrites private-store files from repo

MVP creates backup files before overwrite. Keep latest 20 backup sets per project.

## Deferred questions

- Do users need per-worktree profiles with different private contents per worktree?
- Should an explicit `pgit config project rename` command rename private store directories?
- Should `--force` support `--no-backup` for users who do not want backup sets?
