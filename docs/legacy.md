# Legacy Workflow (Deprecated)

Legacy mode (`pgit legacy`) is maintained for backward compatibility and remains available as an alternative private-tracking model.

## What it does

The legacy model stores private artifacts in a side private repository with symlinks in the working tree and helper exclusion behavior in git metadata.

### Key legacy commands

- `pgit legacy init`
- `pgit legacy add <path...>`
- `pgit status`, `pgit private-status`
- `pgit add-changes`
- `pgit commit`
- `pgit log`
- `pgit diff`
- `pgit branch`
- `pgit checkout`
- `pgit cleanup`

## When to use

- You need the older `.private-storage`/`pgit` flow.
- You need behavior parity with existing setups already using legacy commands.

## When not to use

- New multi-agent setup where files must stay discoverable at real paths.
- New projects where a clean config-first model is preferable.

## Important compatibility note

Legacy and recommended flows can both exist, but they should not own the same paths.
Use one model per artifact to avoid confusing ownership and conflict handling.

## Enable legacy help visibility

- `PGIT_FEATURE_LEGACY=1 pgit --help`
- `PGIT_LEGACY=1 pgit --help`

### Detailed legacy flow docs

- `docs/legacy-init-add-flow.md`
- `docs/agent-visible-config-sync-flow.md` for comparison of command behavior
- `docs/presets.md` for legacy presets configuration

