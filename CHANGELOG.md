# Changelog

All notable changes to this project will be documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [0.5.2](https://github.com/crystalphantom/pgit-cli/compare/v0.5.1...v0.5.2) (2025-09-30)

### 🐛 Bug Fixes
* enable preset loading from global npm installs and any directory ([e3f6aa4](https://github.com/crystalphantom/pgit-cli/commit/e3f6aa40d4665d9c8da49ef4003444934c84ac5a))

### ♻️ Code Refactoring  
* improve preset command UX: rename define/undefine to add/remove ([0025194](https://github.com/crystalphantom/pgit-cli/commit/0025194e8c6b0e6f58b4a0e3e7b7bb8c7e1c7b0e))
* fix preset list command to work from any directory ([5ee9d0d](https://github.com/crystalphantom/pgit-cli/commit/5ee9d0de8c6b0e6f58b4a0e3e7b7bb8c7e1c7b0e))

## [0.5.1](https://github.com/crystalphantom/pgit-cli/compare/v0.5.0...v0.5.1) (2025-09-30)


### Bug Fixes

* add .js extensions to ES module imports and fix main module detection ([3aacc6b](https://github.com/crystalphantom/pgit-cli/commit/3aacc6b5e1ff725bcbf3275f80663f8477b2ef85))
* add .js extensions to ES module imports in dist/ ([531b7b1](https://github.com/crystalphantom/pgit-cli/commit/531b7b169b5f2fc7e310b4e5d48633b8a94063fd))
* clean up CI workflow YAML syntax ([668c3a0](https://github.com/crystalphantom/pgit-cli/commit/668c3a079028e70dfacb508554119fd6f584148e))
* correct Codecov action parameter from 'file' to 'files' ([28c5a08](https://github.com/crystalphantom/pgit-cli/commit/28c5a080bf475d5f1227d6675947a1d8cadde7a7))
* correct config file extension in tests from .tson to .json ([1edc62c](https://github.com/crystalphantom/pgit-cli/commit/1edc62ccf5cdad1ddf9ed6f715dfa12f9b5e41be))
* correct YAML indentation in CI workflow ([c1e76f5](https://github.com/crystalphantom/pgit-cli/commit/c1e76f58b445686452773d34d7e4c0d346a07266))
* format code after ES module import fixes ([b5b156c](https://github.com/crystalphantom/pgit-cli/commit/b5b156c7d559171b6a51eaba8cd42442cc989d30))
* improve directory creation reliability in CI environments ([cb47204](https://github.com/crystalphantom/pgit-cli/commit/cb47204e2e711ef97ede7797acef77462b41f9bd))
* rename config and script files to .cjs for ES module compatibility ([f4cc5ec](https://github.com/crystalphantom/pgit-cli/commit/f4cc5ecd962828caaa614d5158f6d3f68a05f40c))
* resolve ES module import issues by updating all relative imports to use .ts extensions ([44df46f](https://github.com/crystalphantom/pgit-cli/commit/44df46f6c1eae4e840b6516057e7730e0c663832))
* resolve ES module import issues by using extensionless imports ([4358b19](https://github.com/crystalphantom/pgit-cli/commit/4358b19f0b51bed70283e720d2ef44cea423a5d2))
* resolve ES module import issues for npm package ([2df1bd4](https://github.com/crystalphantom/pgit-cli/commit/2df1bd4037fd6ae2a98937ffa3a77b86bb0325cd))
* resolve ESM configuration conflicts in CI ([6ff7013](https://github.com/crystalphantom/pgit-cli/commit/6ff70139ade3823de4af19c4f9ae1f619123b12c))
* resolve fs.mkdirSync CI compatibility issue and update dependencies ([#42](https://github.com/crystalphantom/pgit-cli/issues/42)) ([c47add0](https://github.com/crystalphantom/pgit-cli/commit/c47add0267b9925d6fc78870a0f939e85c92de78))
* update chmod calls to use fs.promises for better error handling in CI environments ([a1e4b91](https://github.com/crystalphantom/pgit-cli/commit/a1e4b91fcd542441f280bea14725ab1b69f397ca))
* update config file references from .tson to .json across tests and implementation ([feb0b61](https://github.com/crystalphantom/pgit-cli/commit/feb0b617acbb9f09d079ce27f087591facc78d12))
* update config file references from .tson to .json across tests and implementation ([f8ae55c](https://github.com/crystalphantom/pgit-cli/commit/f8ae55c6eb4a52b0a098255d721a4cc9740fc3dd))


### Features

* Convert project to ESM and upgrade dependencies ([db51af9](https://github.com/crystalphantom/pgit-cli/commit/db51af9c892c62afd842a86bb03f308d0992fd0f))
* **tests:** enhance GitService tests with improved error handling and mocking ([f6f55c6](https://github.com/crystalphantom/pgit-cli/commit/f6f55c60351272c0d071edce84bc564425a71432))

# [0.5.0](https://github.com/crystalphantom/pgit-cli/compare/v0.4.1...v0.5.0) (2025-09-17)


### Bug Fixes

* correct Zod enum configuration in config schema ([3f2e031](https://github.com/crystalphantom/pgit-cli/commit/3f2e031b7527cd9bdb58f6adcbf2b3387ea3336b))
* resolve CI/CD pipeline issues ([26eafee](https://github.com/crystalphantom/pgit-cli/commit/26eafee63674940b56cdf4cee24e9b7bc8d5d9f5))
* resolve ESLint unused variable errors ([e1dd253](https://github.com/crystalphantom/pgit-cli/commit/e1dd25303455880f3a9943c8e83335af0d049f60))


### Features

* add .mcp.json to claude-flow preset ([75dcd74](https://github.com/crystalphantom/pgit-cli/commit/75dcd741ac1d80070a290fa7adb1d026f9316607))

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
