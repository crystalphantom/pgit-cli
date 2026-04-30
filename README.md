# PGit - Private Git Tracking CLI

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-5.0%2B-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A powerful CLI tool that enables developers to version control private files within team repositories using a dual git repository system. Keep your sensitive configuration files, environment variables, and personal notes tracked privately while maintaining complete isolation from your team's shared repository.

## 🚀 What is PGit?

PGit now focuses on agent-visible private-config workflows. It tracks selected repository files
in a private side store while keeping them at their original paths so tools and agents can
discover them.

This release prefers:
- `pgit config add` for onboarding private config paths into tracking
- `pgit config drop` for removing local private config copies before normal Git commits
- `pgit config sync` for keeping repo files and private store aligned (`pull`, `push`, `status`)

### How It Works

```
Your Project Structure:
├── .git/
├── .pgit/                # Optional global/private-config metadata under your home dir
└── .env                  # Real file remains at repo path
      └── pgit-private-store  # Mirror under ~/.pgit/private-config/<repo-id>/files
```

## 🎯 Quick Start

### 1. Add Private Config Paths

```bash
cd your-project
pgit config add .env .claude/settings.md
```

### 2. Sync Between Repo and Private Store

```bash
# Pull private store into your working tree (when cloning or switching workspaces)
pgit config sync pull

# Push your local edits back into private store
pgit config sync push

# Drop all tracked private config files from the working tree before normal Git work
pgit config drop .
```

### 3. Check Drift

```bash
pgit config sync status
```

## 📚 Command Reference (MVP)

| Command | Description | Example |
|---------|-------------|---------|
| `pgit config add <paths...>` | Track private config paths in repo (creates mirror under `~/.pgit/private-config/...`) | `pgit config add .env .claude/` |
| `pgit config drop <paths...>` | Remove repo-local private config copies while keeping private-store entries | `pgit config drop .` |
| `pgit config remove <paths...>` | Stop tracking private-config paths and remove private mirror entries | `pgit config remove .env` |
| `pgit config sync pull` | Copy private-store files into repository paths | `pgit config sync pull` |
| `pgit config sync push` | Copy repository files back into private store | `pgit config sync push` |
| `pgit config sync status` | Show sync state for tracked entries | `pgit config sync status` |

### Advanced / Legacy (Deprecated)

`pgit init`, `pgit add`, and related workflows are still available for advanced users only and are now hidden from the normal help output.

- `pgit legacy init` to run legacy initialization
- `pgit legacy add <path...>` to use legacy private tracking
- or set `PGIT_LEGACY=1` to expose legacy command help

## 🧩 Legacy Compatibility Section

The sections below describe the legacy workflow kept for backward compatibility.
For MVP usage, prefer only the MVP commands above.

## 📦 Installation

### Global Installation (Recommended)

```bash
npm install -g pgit-cli
```

### Local Development Installation

```bash
# Clone the repository
git clone https://github.com/crystalphantom/pgit-cli.git
cd pgit-cli

# Install dependencies
npm install

# Build the project
npm run build

# Link for global use
npm link
```

### Verify Installation

```bash
pgit --version
pgit --help
```

## 🧩 Legacy Quick Start (Deprecated)

### 1. Legacy Initialization (deprecated)

```bash
# Navigate to your project directory
cd your-project

# Initialize pgit git tracking
pgit init
```

This creates:
- `.git-pgit/` - Hidden pgit git repository
- `.pgit-storage/` - Storage for your pgit files
- `.pgit-config.json` - Configuration file
- Updates `.gitignore` to exclude pgit system files

### 2. Add Private Files

```bash
# Option 1: Use presets for quick setup
pgit preset apply nodejs-dev  # Adds common Node.js files
pgit preset apply claude-flow  # Adds AI workflow files

# Option 2: Add files individually
pgit add .env
pgit add config/secrets.json
pgit add .env.local

# Option 3: Add entire directory
pgit add personal-notes/
```

### 3. Manage Private Repository

```bash
# Check status of both repositories
pgit status

# Stage changes in pgit repository
pgit add-changes --all

# Commit to pgit repository
pgit commit -m "Update environment variables"

# View pgit commit history
pgit log --oneline
```

## 📚 Legacy Command Reference (Deprecated)

### Initialization Commands

| Command | Description | Example |
|---------|-------------|---------|
| `pgit init` | Initialize dual repository system | `pgit init` |

### File Management Commands

| Command | Description | Options | Example |
|---------|-------------|---------|---------|
| `pgit add <path>` | Add file/directory to legacy pgit tracking with automatic git protection | `<path>` (required) | `pgit add .env` |
| `pgit status` | Show status of both repositories | `--verbose`, `-v` | `pgit status -v` |
| `pgit-status` | Show detailed pgit repository status | `--verbose`, `-v` | `pgit-status -v` |

### Agent-Visible Private Config Commands

Use these when coding agents must discover private files at their real repo paths. PGit copies files to a private store and keeps real files in the repo working tree. It does not write private file names to `.gitignore` or `.git/info/exclude`.

| Command | Description | Options | Example |
|---------|-------------|---------|---------|
| `pgit config add <paths...>` | Track private config files/directories at repo paths; auto-validates all paths before mutation, auto-commits already-tracked removals, and pushes repo-local contents to private store | `--no-commit`, `--no-sync-push` | `pgit config add research docs specs` |
| `pgit config drop <paths...>` | Drop repo-local private config files/directories without removing private-store copies. Use `.` to drop all tracked entries | `--force`, `-f` | `pgit config drop .` |
| `pgit config remove <paths...>` | Stop tracking private config files/directories and remove their private-store copies without deleting repo-local files | none | `pgit config remove research docs` |
| `pgit config sync pull` | Copy private-store files into repo paths | `--force`, `-f` | `pgit config sync pull` |
| `pgit config sync push` | Copy repo-path files back to private store | `--force`, `-f` | `pgit config sync push --force` |
| `pgit config sync status` | Show private config sync status | none | `pgit config sync status` |

### Preset Commands

Presets allow you to quickly add common sets of files for specific workflows. PGit includes built-in presets for popular development scenarios, and you can create your own custom presets.

| Command | Description | Options | Example |
|---------|-------------|---------|---------|
| `pgit preset list` | List all available presets (built-in and user-defined) | `--verbose`, `-v` | `pgit preset list -v` |
| `pgit preset show <name>` | Show details about a specific preset | `<name>` (required) | `pgit preset show claude-flow` |
| `pgit preset apply <name>` | Apply a preset by adding all its paths to pgit tracking | `<name>` (required) | `pgit preset apply nodejs-dev` |
| `pgit preset define <name> <paths...>` | Create a custom user preset with specified paths | `<name>`, `<paths...>` (required) | `pgit preset define my-setup .env dist/ logs/` |
| `pgit preset undefine <name>` | Remove a user-defined preset | `<name>` (required) | `pgit preset undefine my-setup` |

#### Built-in Presets

PGit comes with several useful presets for common development workflows:

- **`claude-flow`** - AI agent workflow files (`.claude/`, `CLAUDE.md`, `memory/`, etc.)
- **`nodejs-dev`** - Node.js development artifacts (`node_modules/`, `.env*`, `dist/`, `build/`, etc.)
- **`python-dev`** - Python development files (`__pycache__/`, `.venv/`, `.pytest_cache/`, etc.)
- **`docs-infra`** - Documentation infrastructure (`docs/`, `mkdocs.yml`, `.vitepress/`, etc.)
- **`docker-dev`** - Docker development files (`.docker/`, `docker-compose.override.yml`, etc.)
- **`vscode-workspace`** - VS Code configuration (`.vscode/`, `*.code-workspace`, etc.)

#### Preset Usage Examples

```bash
# Apply a preset for Node.js development
pgit preset apply nodejs-dev

# View available presets
pgit preset list

# Show details about a specific preset
pgit preset show claude-flow

# Create a custom preset for your workflow
pgit preset define backend-secrets .env .env.local secrets/ config/local.json

# Apply your custom preset
pgit preset apply backend-secrets

# Remove a custom preset
pgit preset undefine backend-secrets
```

### Git Operations Commands

| Command | Description | Options | Example |
|---------|-------------|---------|---------|
| `pgit commit` | Commit changes to pgit repository | `-m <message>` | `pgit commit -m "update secrets"` |
| `pgit add-changes` | Stage modifications to tracked files | `--all`, `-A` | `pgit add-changes --all` |
| `pgit log` | Show commit history | `--oneline`, `-n <num>` | `pgit log --oneline` |
| `pgit diff` | Show differences in pgit repository | `--cached`, `--name-only` | `pgit diff --cached` |
| `pgit branch` | List or create branches | `<branch-name>` | `pgit branch feature` |
| `pgit checkout` | Switch branches or restore files | `<branch>`, `<file>` | `pgit checkout main` |

### Maintenance Commands

| Command | Description | Options | Example |
|---------|-------------|---------|---------|
| `pgit cleanup` | Fix and repair pgit git tracking | `--force` | `pgit cleanup` |

## 💡 Legacy Usage Examples

### Agent-Visible Private Config

```bash
# Track a private rules file without symlinks or gitignore entries
pgit config add my-rules.md

# Track nested private directories/files together
pgit config add .claude/private/ research docs/private-notes.md

# Stop tracking files/directories without deleting repo-local copies
pgit config remove .claude/private/ docs/private-notes.md

# Restore private config into a fresh checkout/worktree
pgit config sync pull

# Save repo-local edits back to private store
pgit config sync push

# Drop all tracked private config from the working tree before Git status/commit
pgit config drop .

# Restore dropped private config when agents or local tools need it again
pgit config sync pull

# Check drift/conflicts
pgit config sync status
```

Behavior:

- Files stay as real files at repo-relative paths, so coding agents can discover them.
- Private copies live in `~/.pgit/private-config/<repo-name>-<hash>/files/`.
- `pgit config add` validates all requested paths before copying, untracking, saving manifests, installing hooks, or committing. If any path is missing, nothing is changed.
- If paths are already tracked by main Git, `pgit config add` runs `git rm --cached -r <path>` so files stay local and commits the shared-Git removal by default.
- `pgit config add` runs `pgit config sync push` by default after successful add, so private store stays current. Use `--no-sync-push` to skip this.
- Use `--no-commit` to leave staged removals for manual commit. In that mode, do not run `git add .` before committing or Git can re-add the files.
- `pgit config drop .` removes all tracked private config from the repo working tree while keeping private-store copies. Explicit paths drop only those entries.
- `pgit config drop` refuses to delete local copies that differ from the private store unless `--force` is used.
- `pgit config remove` stops tracking paths, removes their private-store copies, and leaves repo-local files/directories untouched.
- Local `pre-commit` and `pre-push` hooks block private paths from re-entering shared Git history. In Git worktrees, hooks install into the common hooks directory, or `core.hooksPath` when configured.
- Native `git status` may show private file names because files are intentionally not ignored.
- `--force` resolves sync conflicts and creates backups under `.backups/` before overwrite.

### Managing Environment Files

```bash
# Initialize in your project
pgit init

# Add environment files
pgit add .env
pgit add .env.local
pgit add .env.development

# Your app can still read from .env (symbolic link)
# But the actual file is pgitly tracked

# Make changes and commit
pgit add-changes --all
pgit commit -m "Update API endpoints"
```

### Working with Configuration Files (Legacy)

```bash
# Add configuration files
pgit add config/database.json
pgit add config/api-keys.json

# Create a feature branch for testing
pgit branch testing-config
pgit checkout testing-config

# Make changes and commit
pgit add-changes --all
pgit commit -m "Test new database config"

# Switch back to main
pgit checkout main
```

### Using Presets for Quick Setup

```bash
# Set up a Node.js project with common private files
pgit preset apply nodejs-dev

# Output:
# Applying preset 'nodejs-dev'...
# ✔ Added 'node_modules/' to private tracking.
# ✔ Added '.env' to private tracking.
# ✔ Added '.env.local' to private tracking.
# ⚠ 'dist/' does not exist, skipping.
# ✔ Added 'build/' to private tracking.
# 
# Preset 'nodejs-dev' applied successfully.
# 8 added, 0 skipped, 1 failed (9 total).

# Create a custom preset for your specific workflow
pgit preset define my-backend .env .env.local secrets/ logs/ temp/

# Apply your custom preset to another project
pgit preset apply my-backend

# View all available presets
pgit preset list

# Get details about a specific preset
pgit preset show claude-flow
```

### Checking Repository Status

```bash
# Quick status check
pgit status

# Output:
# 📊 Private Git Tracking Status
# ✓ System is healthy
# 📋 Main Repository - Branch: main, Status: Clean
# 🔒 Private Repository - Branch: main, Status: Has changes

# Detailed pgit repository status
pgit-status --verbose

# View commit history
pgit log --oneline
```

### Enhanced Git Protection Examples

```bash
# Add sensitive files with automatic git protection
pgit add .env
pgit add config/api-keys.json
pgit add personal-todos.txt

# Verify protection is active
git status          # ✅ No pgit files appear
git add .env        # ✅ Ignored due to .git/info/exclude protection

# Check what's protected
cat .git/info/exclude

# Output:
# # pgit-cli managed exclusions
# .env
# config/api-keys.json
# personal-todos.txt

# Files remain accessible to your applications
node -e "console.log(require('fs').readFileSync('.env', 'utf8'))"
```

### Batch Operations with Protection

```bash
# Add multiple files at once with batch git protection
pgit add .env .env.local config/secrets.json

# All files are automatically protected from git tracking
git status  # Clean - no pgit files visible

# Even if you try to add them manually later
git add .env.local  # Still ignored due to exclude rules
```

## 🔧 Legacy Advanced Features

### Branch Management

Create separate branches for different environments or configurations:

```bash
# Create development branch
pgit branch development
pgit checkout development

# Make dev-specific changes
echo "DEV_API_URL=http://localhost:3000" >> .env
pgit add-changes --all
pgit commit -m "Add development API URL"

# Switch between configurations
pgit checkout main      # Production config
pgit checkout development # Development config
```

### Collaborative Workflows

While pgit files remain pgit, you can share configurations with trusted team members:

```bash
# Export pgit repository (to share with trusted colleagues)
cd .pgit-storage
git remote add origin git@github.com:your-org/project-pgit.git
git push -u origin main

# Another team member can clone and set up
git clone git@github.com:your-org/project-pgit.git .pgit-storage
pgit cleanup  # Repairs symbolic links
```

### Backup and Recovery

```bash
# Your pgit repository is a full git repository
cd .pgit-storage
git remote add backup git@github.com:your-org/project-backup.git
git push backup main

# To restore after cleanup or system changes
pgit cleanup --force
```

## 🛠️ How to Contribute

We welcome contributions to the Private Git Tracking CLI! Here's how you can help:

### Development Setup

1. **Fork and Clone**
   ```bash
   git clone https://github.com/crystalphantom/pgit-cli.git
   cd pgit-cli
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Development Workflow**
   ```bash
   # Run in development mode
   npm run dev -- init

   # Build the project
   npm run build

   # Run tests
   npm test

   # Run tests in watch mode
   npm run test:watch

   # Lint code
   npm run lint

   # Format code
   npm run format
   ```

### Project Structure

```
pgit-git-cli/
├── src/
│   ├── commands/              # Command implementations
│   │   ├── init.command.ts
│   │   ├── add.command.ts
│   │   ├── status.command.ts
│   │   └── ...
│   ├── core/                  # Core business logic
│   │   ├── config.manager.ts
│   │   ├── git.service.ts
│   │   ├── symlink.service.ts
│   │   └── filesystem.service.ts
│   ├── types/                 # TypeScript type definitions
│   ├── utils/                 # Utility functions
│   ├── errors/                # Custom error classes
│   └── cli.ts                 # CLI entry point
├── tests/                     # Test files
├── docs/                      # Documentation
└── dist/                      # Built output
```

### Contribution Guidelines

#### 1. Code Standards

- **TypeScript**: Use strict mode with full type safety
- **ESLint**: Follow the established linting rules (`npm run lint`)
- **Prettier**: Use consistent formatting (`npm run format`)
- **Testing**: Maintain >90% test coverage (`npm run test`)

#### 2. Commit Standards

```bash
# Use conventional commit format
git commit -m "feat: add symbolic link validation"
git commit -m "fix: handle Windows junction points correctly"
git commit -m "docs: update installation instructions"
git commit -m "test: add cross-platform symbolic link tests"
```

#### 3. Pull Request Process

1. **Create Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make Changes**
   - Write code following project standards
   - Add tests for new functionality
   - Update documentation as needed

3. **Test Your Changes**
   ```bash
   npm run test
   npm run lint
   npm run build
   
   # Test CLI functionality
   npm link
   cd /tmp/test-project
   git init
   pgit init
   echo "test" > .env
   pgit add .env
   ```

4. **Submit Pull Request**
   - Clear description of changes
   - Reference any related issues
   - Include testing instructions

#### 4. Areas for Contribution

**🐛 Bug Fixes**
- Cross-platform compatibility issues
- Symbolic link handling edge cases
- Git operation error handling
- Performance optimizations

**✨ New Features**
- Additional git operations (merge, rebase, stash)
- Configuration templates
- Integration with popular development tools
- Backup and sync features

**📚 Documentation**
- Tutorial guides
- Video examples
- API documentation
- Troubleshooting guides

**🧪 Testing**
- Cross-platform test coverage
- Performance benchmarks
- Integration test scenarios
- Error condition testing

#### 5. Development Tips

**Running Local Tests**
```bash
# Test specific functionality
npm test -- --testNamePattern="ConfigManager"

# Test with coverage
npm run test:coverage

# Test in different environments
docker run -v $(pwd):/app -w /app node:18 npm test
```

**Debugging**
```bash
# Enable verbose output
npm run dev -- status --verbose

# Debug with Node.js debugger
npm run dev:debug -- init
```

**Testing Commands Locally**
```bash
# Build and link for testing
npm run build && npm link

# Test in a temporary directory
mkdir /tmp/test-project
cd /tmp/test-project
git init
pgit init
```

### Code of Conduct

We are committed to providing a welcoming and inclusive environment for all contributors. Please:

- Be respectful and constructive in discussions
- Follow the established coding standards
- Write clear commit messages and documentation
- Test your changes thoroughly
- Help others learn and grow

### Getting Help

**📞 Questions?**
- Open a [Discussion](https://github.com/crystalphantom/pgit-cli/discussions)
- Join our [Discord community](https://discord.gg/your-server)
- Check the [Wiki](https://github.com/crystalphantom/pgit-cli/wiki)

**🐛 Found a Bug?**
- Open an [Issue](https://github.com/crystalphantom/pgit-cli/issues)
- Include reproduction steps
- Specify your operating system and Node.js version

**💡 Feature Ideas?**
- Open a [Feature Request](https://github.com/crystalphantom/pgit-cli/issues/new?template=feature_request.md)
- Describe the use case and expected behavior
- Discuss implementation approach

## 🔒 Security & Privacy

- **No data collection**: The CLI operates entirely locally
- **No network requests**: All operations are performed on your local machine
- **Private files stay pgit**: Only you control access to your pgit repository
- **Symbolic links are secure**: Files remain in their expected locations for applications

## 📋 System Requirements

- **Node.js**: 18.0.0 or higher
- **Operating System**: macOS, Linux, or Windows
- **Git**: Must be installed and available in PATH
- **File System**: Must support symbolic links (most modern systems do)

## 🔍 Troubleshooting

### Common Issues

**Q: Symbolic links not working on Windows?**
```bash
# Enable Developer Mode or run as Administrator
# Then run cleanup to recreate links
pgit cleanup --force
```

**Q: Files not showing up in pgit repository?**
```bash
# Check status and stage changes
pgit status
pgit add-changes --all
pgit commit -m "Add missing files"
```

**Q: Main repository shows pgit files?**
```bash
# Ensure .gitignore is updated
pgit cleanup
git status  # Should not show pgit files
```

**Q: Git protection not working - files still appear in git status?**
```bash
# Check if .git/info/exclude is properly configured
cat .git/info/exclude

# Re-run pgit add to ensure protection is applied
pgit add .env

# Verify file is now protected
git add .env  # Should show "nothing to commit" or be ignored
```

**Q: Want to remove git protection for a specific file?**
```bash
# Remove from .git/info/exclude manually
# Edit .git/info/exclude and remove the file path
# Then you can git add it normally
git add previously-protected-file.txt
```

**Q: Permission denied errors?**
```bash
# Check file permissions
ls -la .pgit-storage/
# Fix permissions if needed
chmod 644 .pgit-storage/*
```

### Getting Support

1. **Check the logs**: Enable verbose output with `--verbose` flag
2. **Run cleanup**: `pgit cleanup --force` fixes most issues
3. **Check system requirements**: Ensure Node.js 18+ and git are installed
4. **Open an issue**: Include error messages and system information

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [Commander.js](https://github.com/tj/commander.js/) for CLI framework
- Uses [simple-git](https://github.com/steveukx/git-js) for git operations
- Styled with [Chalk](https://github.com/chalk/chalk) for colored output
- File operations powered by [fs-extra](https://github.com/jprichardson/node-fs-extra)
- Type safety with [Zod](https://github.com/colinhacks/zod) schemas

---

**Made with ❤️ by developers, for developers who value privacy and clean git workflows.**
