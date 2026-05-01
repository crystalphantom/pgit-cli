# Presets

Presets are pre-defined path sets that map to common workflows. Preset apply uses `pgit config add` under the hood.

## Built-in presets

Available built-ins (from `presets.json`):

- `claude-flow` — Claude/agent workflow files (`.claude/`, `CLAUDE.md`, `memory/`, MCP files)
- `nodejs-dev` — Node.js workspace files (`node_modules/`, `.env*`, `dist/`, `build/`, etc.)
- `python-dev` — Python workspace files (`.venv/`, `.pytest_cache/`, `__pycache__/`, etc.)
- `docker-dev` — Docker workflow files (`.docker/`, `docker-compose.override.yml`, etc.)
- `vscode-workspace` — VS Code workspace files (`.vscode/`, `*.code-workspace`, etc.)

## Preset sources and scope

- Package presets are built in and available in every repo.
- Global user presets are stored in `~/.pgit/config/presets.json`.
- Project presets are stored in `.pgit/presets.json` (local to the repo).

## Preset commands

- `pgit preset list`  
  Show all available presets with source (built-in/package/user).
- `pgit preset show <name>`  
  Display preset description and tracked paths.
- `pgit preset apply <name>`  
  Track all paths in that preset.
- `pgit preset add <name> <paths...>`  
  Create a new project preset.
- `pgit preset add --global <name> <paths...>`  
  Create/update a global preset.
- `pgit preset remove <name>`  
  Remove a project preset.
- `pgit preset remove --global <name>`  
  Remove a global preset.

## Example

```bash
pgit preset apply claude-flow
pgit preset add --global my-agent-stack .opencode/ .superpowers/ specs/
pgit preset apply my-agent-stack
```

If you need full control over path bundles per repository, use local presets in `.pgit/presets.json`.

