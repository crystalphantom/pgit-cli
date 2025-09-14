# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v0.4.1] - 2025-09-14

### Fixed
- ESLint configuration module type issue causing CI startup failures
- Renamed eslint.config.js to eslint.config.mjs for proper ES module handling

## [v0.4.0] - 2025-09-14

### Added
- Complete CI/CD pipeline with automated testing and releases
- Comprehensive documentation and contribution guidelines
- Code formatting and linting automation
- Release automation with version syncing

### Changed
- Updated repository URLs and contact information for public release
- Refined global error handler for better CLI experience

### Fixed
- CI workflow issues and test expectations
- Prettier-ESLint quote style conflicts
- Help command behavior in CI environment

## [v0.3.0] - 2025-09-10

### Added
- Robust error handling for git operations
- Centralized logging service across all commands
- Improved user feedback and debugging capabilities
- Atomic operations with rollback support

### Changed
- Enhanced preset command to support global presets and bulk operations
- Implemented preset management commands and functionality

## [v0.2.0] - 2025-09-09

### Added
- `pgit reset` command to remove pgit setup and restore tracked files
- Enhanced error handling for .git/info/exclude operations
- Configuration options for exclude behavior

### Changed
- Updated single file operations to use enhanced logic

## [v0.1.0] - 2025-09-08

### Added
- `pgit init` command for project initialization
- `pgit add` command with support for multiple file tracking
- Basic CLI infrastructure and command structure

### Changed
- Migrated ESLint config to flat config format for v9 compatibility
- Regenerated package-lock.json with updated package name

## [v0.0.1] - 2025-09-06

### Added
- Initial public release of pgit-cli
- Core git integration setup
- Project scaffolding and configuration
- Initial testing framework and infrastructure
