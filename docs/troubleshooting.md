# Troubleshooting

## Common issues

### `pgit config add` reports paths are invalid or outside repository

- Run from the project root.
- Use repo-relative paths (for example `.claude/`, `specs/design.md`).
- Ensure files/directories exist before adding.

### `pgit config sync pull/push` reports conflict

- Use `--force` to allow overwrite after backup.
- Resolve manual edits after reviewing backups under `.pgit/private-config/<project-id>/` and run again.

### `pgit config sync status` shows drift

- `modified-locally`: repo file changed; run `pgit config sync push`.
- `modified-private`: private copy changed; run `pgit config sync pull`.
- `missing-*`: check whether the path was moved/removed and re-add as needed.

### Commit is blocked by pre-commit/pre-push hooks

- This normally means tracked private paths are staged for a shared commit.
- Confirm tracked entries with `pgit config sync status`.
- Use `pgit config remove <path>` to untrack or intentionally keep working in private flow.

### Legacy command says not enabled

- Set `PGIT_FEATURE_LEGACY=1` or `PGIT_LEGACY=1` to make legacy commands visible.
- Legacy mode uses `pgit legacy ...`; direct root `pgit init/add` are deprecated.

## Need more help

- `pgit --help`
- `pgit config info`
- Review `docs/commands.md` and `docs/architecture.md`

