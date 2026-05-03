# Troubleshooting

## Common issues

### `pgit add` reports paths are invalid or outside repository

- Run from the project root.
- Use repo-relative paths (for example `.claude/`, `specs/design.md`).
- Ensure files/directories exist before adding.

### `pgit pull` or `pgit push` reports conflict

- Use `--force` to allow overwrite after backup.
- Resolve manual edits after reviewing backups under `.pgit/private-config/<project-id>/` and run again.

### `pgit status` shows drift

- `modified-locally`: repo file changed; run `pgit push`.
- `modified-private`: private copy changed; run `pgit pull`.
- `missing-*`: check whether the path was moved/removed and re-add as needed.

### Commit is blocked by pre-commit/pre-push hooks

- This normally means tracked private paths are staged for a shared commit.
- Confirm tracked entries with `pgit status`.
- Use `pgit remove <path>` to untrack or intentionally keep working in private flow.

### Legacy command says not enabled

- Set `PGIT_FEATURE_LEGACY=1` or `PGIT_LEGACY=1` to make legacy commands visible.
- Legacy mode uses `pgit legacy ...`.

## Need more help

- `pgit --help`
- `pgit config info`
- Review `docs/commands.md` and `docs/architecture.md`
