# PGit Command Reference

## Recommended flow

These top-level commands are the primary workflow for keeping agent-visible files private while keeping them in place.

### Private file tracking

| Command | Purpose |
|---|---|
| `pgit add <paths...>` | Track repo paths in the private config flow |
| `pgit remove <paths...>` | Untrack repo paths and remove private store entries |
| `pgit drop <paths...>` | Remove working-tree copies only |
| `pgit pull <paths...>` | Restore explicit tracked paths into repo from private store |
| `pgit push <paths...>` | Push explicit tracked repo paths into private store |
| `pgit status` | Show sync status for tracked files |

### Common options

- `pgit add <paths...> --force` : overwrite already-tracked entries
- `pgit add <paths...> --no-commit` : skip auto-commit of main-repo removals
- `pgit add <paths...> --no-sync-push` : do not auto push after add
- `pgit drop <paths...> --force` : drop local files even if hashes differ
- `pgit pull . --force` : overwrite local conflicts for all tracked paths after backup
- `pgit push . --force` : overwrite private-store conflicts for all tracked paths after backup

### Sync path selection

- `pgit pull .` and `pgit push .` mean "sync all tracked entries".
- `pgit pull todo.md` syncs only `todo.md`.
- `pgit push docs` syncs only tracked entry `docs`.
- `pgit pull` and `pgit push` without paths are invalid.

### Cleanup commits

When `pgit add` removes already-tracked private files from the shared Git index, it attempts a
generated deletion-only cleanup commit. That generated commit bypasses local Git hooks because pgit
has staged only the private-path deletions it just created. If Git still refuses the commit, the add
remains successful and pgit prints manual commit steps for the staged deletions.

### Global config management

| Command | Purpose |
|---|---|
| `pgit config init` | Initialize global PGit config directory (`~/.pgit/config`) |
| `pgit config location` | Show global and project config paths |
| `pgit config info` | Show preset and sync state overview |
| `pgit config edit` | Open config in your default editor |
| `pgit config backup` | Back up global config |
| `pgit config reset --force` | Reset global config to defaults |

## Preset commands

| Command | Purpose |
|---|---|
| `pgit preset list` | List built-in and user presets |
| `pgit preset show <name>` | Show a preset and its paths |
| `pgit preset apply <name>` | Apply a preset via `pgit add ...` |
| `pgit preset add <name> <paths...>` | Create or update a local preset |
| `pgit preset add --global <name> <paths...>` | Create/update a global preset |
| `pgit preset remove <name>` | Remove a local preset |
| `pgit preset remove --global <name>` | Remove a global preset |

## Legacy (deprecated) commands

Legacy commands are hidden unless enabled via feature flag.

- `PGIT_FEATURE_LEGACY=1` or `PGIT_LEGACY=1`

### Legacy command family

- `pgit legacy init`
- `pgit legacy add <path...>`
- `pgit legacy status`, `pgit legacy private-status`
- `pgit legacy add-changes`, `pgit legacy commit`, `pgit legacy log`, `pgit legacy diff`
- `pgit legacy branch`, `pgit legacy checkout`
- `pgit legacy cleanup`, `pgit legacy reset`

For complete legacy details, see:

- `docs/legacy-init-add-flow.md`
- `docs/legacy.md`
