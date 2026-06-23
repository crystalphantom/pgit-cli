# PGit CLI

[![NPM Version](https://img.shields.io/npm/v/pgit-cli.svg)](https://www.npmjs.com/package/pgit-cli)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-5.0%2B-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Website](https://img.shields.io/badge/website-live-10b981)](https://crystalphantom.github.io/pgit-cli/)

**Agent-visible private config tracking for Git workspaces.** Keep local and agent-specific files as real repo files without committing them to shared Git history.

🌐 **[Explore the Interactive Landing Page & Terminal Simulation](https://crystalphantom.github.io/pgit-cli/)**

PGit keeps local configurations, agent-specific folders (like `.codex/`, `.claude/`, `.docs/`, `.specs/`, `.plans/`, and `.opencode/`), and private notes visible to Codex, Claude Code, OpenCode, and other local tools while syncing canonical copies through a user-level private store.

## Quick Start

### Installation

```bash
npm install -g pgit-cli
```

### Basic Usage

Track files locally in your private store:

```bash
cd your-project

# Add files and folders to your private store
pgit add .codex/ .claude/ .opencode/ specs/

# Add by glob, with optional excludes
pgit add '*.env'
pgit add . --exclude '*.log' --exclude 'tmp/**'
```

Synchronize your private configs across machines/workspaces:

```bash
# Push your local updates to your private store
pgit push .

# Pull private configurations into a new workspace
pgit pull .

# Or sync only specific tracked paths
pgit push todo.md docs
pgit pull todo.md

# Check the sync status (drift)
pgit status
```

**Develop with Agents:**  
Use the AI coding agents of your choice (e.g., Codex, Claude Code, OpenCode) to implement features with your private, local context.

**Clean up before Code Review:**  
Once feature development is done, you can drop the private files from your working tree before doing a code review or creating a PR.

```bash
pgit drop .
```

_Note: Don't worry if you accidentally try to commit directly—PGit automatically installs `pre-commit` and `pre-push` hooks to prevent your tracked private files from leaking into the shared repository._

## Documentation

Comprehensive guides, architecture details, and full command references can be found in our documentation:

- 🌐 [Interactive Web Landing Page](https://crystalphantom.github.io/pgit-cli/)
- 📖 [Full Command Reference](./docs/commands.md)
- 🏗️ [Architecture Overview](./docs/architecture.md)
- 🔄 [Legacy Workflows](./docs/legacy.md)
- 🛠️ [Troubleshooting Guide](./docs/troubleshooting.md)

## Contributing & Security

- **Contributing**: Please see our [Contributing Guide](./docs/CONTRIBUTING.md) to get started with development, testing, and submitting pull requests.
- **Security**: All files stay strictly local. See [Security & Privacy](./docs/SECURITY.md) for more details.

## System Requirements

- **Node.js**: 18.0.0 or higher
- **Git**: Must be installed and available in `PATH`

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Made with ❤️ by developers, for developers who value privacy and clean git workflows.**
