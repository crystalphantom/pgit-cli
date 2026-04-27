# Release Management Guide

This document provides a comprehensive guide for implementing automated release management, version management, changelog generation, and package publishing through CI/CD workflows. This template can be adapted for any Node.js/TypeScript project.

## Overview

This release management system provides a fully automated release pipeline that ensures:
- Semantic versioning compliance
- Automated changelog generation
- Consistent version synchronization across all files
- Secure package publishing with provenance
- GitHub release creation with proper artifacts

## Architecture

### Workflows

#### 1. CI Workflow (`.github/workflows/ci.yml`)
**Triggers**: Push to `main`, `develop`, `dev` branches and pull requests

**Purpose**: Continuous integration and quality assurance

**Key Steps**:
- Code formatting check (`npm run format:check`)
- Linting (`npm run lint`)
- Type checking (`npx tsc --noEmit`)
- Building (`npm run build`)
- Testing with coverage (`npm run test:ci`)
- Package installation and functionality testing
- Artifact upload for potential releases

**Template**:
```yaml
name: CI

on:
  push:
    branches: [ main, develop, dev ]
  pull_request:
    branches: [ main, develop, dev ]

jobs:
  test:
    name: Test on ubuntu-latest with Node 20.x
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v5
        with:
          fetch-depth: 0

      - name: Setup Node.js 20.x
        uses: actions/setup-node@v5
        with:
          node-version: '20.x'
          cache: 'npm'

      - name: Configure Git user
        run: |
          git config --global user.email "actions@github.com"
          git config --global user.name "GitHub Actions"
          git config --global core.autocrlf false

      - name: Install dependencies
        run: npm ci

      - name: Check code formatting
        run: npm run format:check

      - name: Lint code
        run: npm run lint

      - name: Type check
        run: npx tsc --noEmit

      - name: Build project
        run: npm run build

      - name: Run tests
        run: npm run test:ci
        env:
          CI: true

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v5
        with:
          files: ./coverage/lcov.info
          flags: unittests
          name: codecov-umbrella

      - name: Test package installation and basic functionality
        run: |
          npm pack
          ls -la *.tgz
          PACKED_FILE=$(ls your-package-name-*.tgz)
          echo "Installing $PACKED_FILE"
          npm install -g "$PACKED_FILE"
          your-cli-name -v
        shell: bash

      - name: Store build artifacts
        uses: actions/upload-artifact@v4
        with:
          name: dist-${{ github.sha }}
          path: |
            dist/
            package.json
            README.md
          retention-days: 30
```

#### 2. Release Workflow (`.github/workflows/release.yml`)
**Triggers**: Git tags matching pattern `v*` (e.g., `v1.2.3`)

**Purpose**: Automated release and package publishing

**Key Steps**:
- Version verification (tag vs package.json)
- Release notes extraction from CHANGELOG.md
- GitHub release creation
- Package publishing with provenance
- Post-release validation

**Template**:
```yaml
name: Release

on:
  push:
    tags: ['v*']

permissions:
  contents: write
  id-token: write

jobs:
  release:
    name: Release and Publish
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout repository
        uses: actions/checkout@v5
        with:
          fetch-depth: 0
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Setup Node.js
        uses: actions/setup-node@v5
        with:
          node-version: '20.x'
          cache: 'npm'
          registry-url: 'https://registry.npmjs.org'

      - name: Install dependencies
        run: npm ci

      - name: Validate package
        run: |
          echo "🔍 Validating package configuration..."
          npm run lint
          npm run test:coverage
          npm run build

      - name: Verify version tag
        id: verify_tag
        run: |
          TAG_VERSION=${GITHUB_REF#refs/tags/v}
          PACKAGE_VERSION=$(node -p "require('./package.json').version")
          echo "Tag version: $TAG_VERSION"
          echo "Package version: $PACKAGE_VERSION"
          
          if [ "$TAG_VERSION" != "$PACKAGE_VERSION" ]; then
            echo "❌ Version mismatch: tag v$TAG_VERSION != package v$PACKAGE_VERSION"
            exit 1
          fi
          
          echo "✅ Version verification passed"
          echo "version=$TAG_VERSION" >> $GITHUB_OUTPUT

      - name: Extract release notes
        id: extract_notes
        run: |
          # Extract release notes from CHANGELOG.md for this version
          VERSION="${{ steps.verify_tag.outputs.version }}"
          
          # Create release notes from changelog
          if [ -f "CHANGELOG.md" ]; then
           # Extract content between current version and next version/end of file
           sed -n "/## \[v$VERSION\]/,/## \[/p" CHANGELOG.md | head -n -1 > release_notes.md
            # Remove the version header line
            tail -n +2 release_notes.md > temp_notes.md && mv temp_notes.md release_notes.md
            
            # If no specific notes found, create generic ones
            if [ ! -s release_notes.md ]; then
              echo "Release v$VERSION" > release_notes.md
              echo "" >> release_notes.md
              echo "See the full changelog for details." >> release_notes.md
            fi
          else
            echo "Release v$VERSION" > release_notes.md
          fi
          
          echo "Release notes created:"
          cat release_notes.md

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: ${{ github.ref }}
          name: "v${{ steps.verify_tag.outputs.version }}"
          body_path: release_notes.md
          draft: false
          prerelease: false
          files: |
            dist/**/*
            package.json
            README.md
            LICENSE
            CHANGELOG.md
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Publish to NPM
        run: |
          echo "📦 Publishing to NPM..."
          
          # Verify we can publish
          npm publish --dry-run
          
          # Publish with provenance
          npm publish --provenance --access public
          
          echo "✅ Successfully published to NPM"
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Post-release validation
        run: |
          echo "🔍 Validating published package..."

          # Wait a moment for NPM to propagate
          sleep 30

          # Verify the package can be installed
          npm info your-package-name@${{ steps.verify_tag.outputs.version }}

          echo "✅ Package successfully published and available on NPM"

      - name: Notify success
        run: |
          echo "🎉 Release v${{ steps.verify_tag.outputs.version }} completed successfully!"
          echo ""
          echo "📦 Package: https://www.npmjs.com/package/your-package-name"
          echo "📋 Release: https://github.com/${{ github.repository }}/releases/tag/v${{ steps.verify_tag.outputs.version }}"
          echo ""
          echo "Install with: npm install -g your-package-name@${{ steps.verify_tag.outputs.version }}"
```

### Release Configuration

#### Release-it Configuration (`.release-it.json`)
```json
{
  "git": {
    "commitMessage": "chore: release v${version}",
    "tagName": "v${version}",
    "requireBranch": "main",
    "requireCleanWorkingDir": true,
    "requireUpstream": false
  },
  "github": {
    "release": true,
    "releaseName": "v${version}",
    "web": true
  },
  "npm": {
    "publish": false,  // Handled by CI workflow
    "skipChecks": false,
    "publishPath": "."
  },
  "plugins": {
    "@release-it/conventional-changelog": {
      "preset": {
        "name": "angular",
        "types": [
          {
            "type": "feat",
            "section": "🚀 Features"
          },
          {
            "type": "fix",
            "section": "🐛 Bug Fixes"
          },
          {
            "type": "perf",
            "section": "⚡ Performance"
          },
          {
            "type": "docs",
            "section": "📚 Documentation"
          },
          {
            "type": "style",
            "section": "💄 Styling"
          },
          {
            "type": "refactor",
            "section": "♻️ Code Refactoring"
          },
          {
            "type": "test",
            "section": "🧪 Tests"
          },
          {
            "type": "build",
            "section": "🏗️ Build System"
          },
          {
            "type": "ci",
            "section": "🔧 CI/CD"
          },
          {
            "type": "chore",
            "section": "🔧 Maintenance"
          }
        ]
      },
      "infile": "CHANGELOG.md",
      "header": "# Changelog\n\nAll notable changes to this project will be documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).\n\n",
      "gitRawCommitsOpts": {
        "format": "%B%n-hash-%n%H%n-gitTags-%n%d%n-committerDate-%n%ci"
      }
    }
  },
  "hooks": {
    "before:init": [
      "npm run lint",
      "npm run test:coverage"
    ],
    "after:bump": [
      "npm run build"
    ],
    "before:release": [
      "git add CHANGELOG.md"
    ]
  }
}
```

#### Conventional Changelog Configuration
- **Preset**: Angular with custom sections
- **Sections**: Features, Bug Fixes, Performance, Documentation, etc.
- **Format**: Keep a Changelog compliant
- **Input**: `CHANGELOG.md`
- **Header**: Standard changelog header with links to standards

**Required Dependencies**:
```json
{
  "devDependencies": {
    "@release-it/conventional-changelog": "^10.0.1",
    "release-it": "^19.0.5"
  }
}
```

## Version Management

### Semantic Versioning
PGit CLI follows Semantic Versioning 2.0.0:
- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

### Version Synchronization
Create a version synchronization script (`scripts/version-sync.cjs`) to ensure version consistency across all project files:

**Template**:
```javascript
#!/usr/bin/env node

/**
 * Version Synchronization Script
 * Ensures version consistency across all project files
 */

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

function syncVersions() {
  try {
    // Get version from package.json (source of truth)
    const packageJsonPath = path.join(__dirname, '..', 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const version = packageJson.version;

    console.log(chalk.blue(`🔄 Synchronizing version ${version} across all files...\n`));

    const filesToSync = [
      {
        path: path.join(__dirname, '..', 'src', 'cli.ts'),
        pattern: /\.version\(['"][^'"]+['"]\)/,
        replacement: `.version('${version}')`,
        description: 'CLI version declaration',
      },
      {
        path: path.join(__dirname, '..', 'src', 'types', 'config.types.ts'),
        pattern: /CURRENT_CONFIG_VERSION = ['"][^'"]+['"]/,
        replacement: `CURRENT_CONFIG_VERSION = '${version}'`,
        description: 'Config version constant',
      },
      {
        path: path.join(__dirname, '..', 'README.md'),
        pattern: /npm install -g your-package-name@[^\s\)]+/g,
        replacement: `npm install -g your-package-name@${version}`,
        description: 'README installation examples',
      },
      // Add more files as needed for your project
    ];

    let syncCount = 0;
    let errors = [];

    filesToSync.forEach(file => {
      if (!fs.existsSync(file.path)) {
        console.log(chalk.yellow(`⚠️  ${file.path} not found, skipping`));
        return;
      }

      try {
        let content = fs.readFileSync(file.path, 'utf8');
        const originalContent = content;

        if (file.pattern.global) {
          content = content.replace(file.pattern, file.replacement);
        } else {
          const match = content.match(file.pattern);
          if (match) {
            content = content.replace(file.pattern, file.replacement);
          } else {
            console.log(chalk.yellow(`⚠️  Pattern not found in ${file.path}`));
            return;
          }
        }

        if (content !== originalContent) {
          fs.writeFileSync(file.path, content);
          console.log(chalk.green(`✅ ${file.description}: Updated to v${version}`));
          syncCount++;
        } else {
          console.log(chalk.gray(`ℹ️  ${file.description}: Already v${version}`));
        }
      } catch (error) {
        errors.push(`${file.description}: ${error.message}`);
        console.log(chalk.red(`❌ ${file.description}: Error - ${error.message}`));
      }
    });

    console.log(chalk.blue(`\n📊 Synchronization Summary:`));
    console.log(chalk.green(`   ✅ Files updated: ${syncCount}`));

    if (errors.length > 0) {
      console.log(chalk.red(`   ❌ Errors: ${errors.length}`));
      errors.forEach(error => console.log(chalk.red(`      • ${error}`)));
      process.exit(1);
    } else {
      console.log(chalk.green(`\n🎉 All versions synchronized successfully to v${version}!`));
    }
  } catch (error) {
    console.error(chalk.red(`💥 Fatal error: ${error.message}`));
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  syncVersions();
}

module.exports = { syncVersions };
```

**Files to synchronize** (customize for your project):
1. **package.json** - Source of truth
2. **CLI files** - Version declarations
3. **Config files** - Version constants
4. **README.md** - Installation examples
5. **Documentation** - Version references

### Version Update Process

#### Manual Version Updates
```bash
# Patch release (0.1.0 → 0.1.1)
npm run release:patch

# Minor release (0.1.0 → 0.2.0)
npm run release:minor

# Major release (0.1.0 → 1.0.0)
npm run release:major

# Custom release with release-it
npm run release
```

#### Automated Version Updates
The release workflow automatically:
1. Verifies tag version matches package.json
2. Updates all synchronized files
3. Creates git commit with version changes
4. Generates changelog entries

## Changelog Management

### Changelog Generation
Changelog is automatically generated using:
- **Conventional Commits**: Commit messages following Angular convention
- **Release-it**: With `@release-it/conventional-changelog` plugin
- **Custom Sections**: Organized by type (Features, Bug Fixes, etc.)

### Changelog Structure
```markdown
# Changelog

All notable changes to this project will be documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v1.2.3](https://github.com/your-username/your-repo/compare/v1.2.2...v1.2.3) (2025-12-01)

### 🚀 Features
* Add new feature description

### 🐛 Bug Fixes
* Fix bug description

### ⚡ Performance
* Performance improvement description
```

### Commit Message Convention
```
type(scope): description

feat(cli): add new command
fix(git): resolve symlink issue
docs(readme): update installation guide
```

**Types**:
- `feat`: New features
- `fix`: Bug fixes
- `perf`: Performance improvements
- `docs`: Documentation changes
- `style`: Code style changes
- `refactor`: Code refactoring
- `test`: Test additions/changes
- `build`: Build system changes
- `ci`: CI/CD changes
- `chore`: Maintenance tasks

## Release Process

### Prerequisites
1. All tests passing
2. Code coverage meets threshold (90%)
3. No linting or formatting issues
4. Clean working directory
5. On `main` branch

### Automated Release (Recommended)

#### Step 1: Update Version
```bash
# Choose appropriate version bump
npm run release:patch  # or minor/major
```

This will:
- Update package.json version
- Run pre-release hooks (lint, test)
- Update CHANGELOG.md
- Commit changes with proper message
- Create git tag

#### Step 2: Push and Trigger Release
```bash
git push origin main --tags
```

This triggers the release workflow which:
1. Verifies version consistency
2. Extracts release notes from CHANGELOG.md
3. Creates GitHub release
4. Publishes to npm with provenance
5. Validates published package

### Manual Release (Advanced)

#### Step 1: Prepare Release
```bash
# Ensure clean state
git checkout main
git pull origin main
npm ci

# Run quality checks
npm run lint
npm run test:coverage
npm run build
```

#### Step 2: Update Version and Changelog
```bash
# Update version manually
npm version patch  # or minor/major

# Generate changelog
npm run changelog

# Commit changes
git add CHANGELOG.md
git commit -m "chore: update changelog for v$(node -p "require('./package.json').version")"
```

#### Step 3: Create Tag and Release
```bash
# Create annotated tag
git tag -a v$(node -p "require('./package.json').version") -m "Release v$(node -p "require('./package.json').version")"

# Push to trigger release
git push origin main --tags
```

## npm Publishing

### Publishing Configuration
**package.json template**:
```json
{
  "name": "your-package-name",
  "version": "1.0.0",
  "description": "Your package description",
  "main": "dist/index.js",
  "bin": {
    "your-cli-name": "dist/cli.js"
  },
  "scripts": {
    "build": "tsc && npm run postbuild",
    "postbuild": "node scripts/fix-imports.js",
    "dev": "ts-node src/cli.ts",
    "test": "jest",
    "test:watch": "jest --watchAll",
    "lint": "eslint src/**/*.ts",
    "lint:fix": "eslint src/**/*.ts --fix",
    "format": "prettier --write src/**/*.ts",
    "format:check": "prettier --check src/**/*.ts",
    "prepublishOnly": "npm run build",
    "clean": "rm -rf dist",
    "test:coverage": "jest --coverage",
    "test:ci": "jest --coverage --passWithNoTests",
    "release": "release-it",
    "release:patch": "release-it patch",
    "release:minor": "release-it minor",
    "release:major": "release-it major",
    "changelog": "auto-changelog -p && git add CHANGELOG.md"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "files": [
    "dist/",
    "presets.json",
    "README.md",
    "LICENSE",
    "CHANGELOG.md"
  ],
  "publishConfig": {
    "registry": "https://registry.npmjs.org/"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/your-username/your-repo.git"
  },
  "bugs": {
    "url": "https://github.com/your-username/your-repo/issues"
  },
  "homepage": "https://github.com/your-username/your-repo#readme"
}
```

### Publishing Process
The release workflow handles npm publishing with:

1. **Dry Run**: Validates package can be published
2. **Provenance**: Adds cryptographic provenance for security
3. **Public Access**: Ensures package is publicly available
4. **Validation**: Post-publish verification

### Publishing Security
- **NPM_TOKEN**: Stored in GitHub secrets
- **Provenance**: Cryptographic proof of origin
- **OIDC**: GitHub Actions identity for npm
- **Two-Factor**: Required for npm organization

## GitHub Releases

### Release Creation
Automatically created by release workflow with:
- **Tag Name**: Matches git tag (e.g., `v1.2.3`)
- **Release Title**: Version number (e.g., `v1.2.3`)
- **Release Notes**: Extracted from CHANGELOG.md
- **Assets**: Distribution files, documentation, license

### Release Notes Generation
```bash
# Extract notes from CHANGELOG.md
sed -n "/## \[v$VERSION\]/,/## \[/p" CHANGELOG.md | head -n -1
```

### Release Validation
Post-release validation includes:
- Package availability on npm
- Installation verification
- Version consistency check

## Quality Gates

### Pre-Release Checks
- **Code Quality**: ESLint, Prettier formatting
- **Type Safety**: TypeScript compilation
- **Test Coverage**: Minimum 90% coverage
- **Build Success**: Clean TypeScript compilation
- **CLI Functionality**: End-to-end testing

### Release Validation
- **Version Consistency**: Tag vs package.json
- **Package Integrity**: npm publish dry-run
- **Installation Test**: Package can be installed globally
- **Functionality Test**: CLI commands work correctly

## Troubleshooting

### Common Issues

#### Version Mismatch
```
❌ Version mismatch: tag v1.2.3 != package v1.2.2
```
**Solution**: Ensure package.json version matches tag before pushing

#### Test Failures
```
❌ Tests failed in CI
```
**Solution**: Run tests locally, fix issues, then retry release

#### npm Publish Failures
```
❌ npm publish failed
```
**Solution**: Check NPM_TOKEN, package name availability, version conflicts

#### Release Notes Missing
```
⚠️ No release notes found
```
**Solution**: Ensure CHANGELOG.md has proper section for version

### Debug Commands
```bash
# Check version consistency
node -p "require('./package.json').version"

# Verify changelog format
grep -A 10 "## \[v1.2.3\]" CHANGELOG.md

# Test package locally
npm pack
npm install -g ./your-package-name-*.tgz
your-cli-name -v

# Run version sync manually
node scripts/version-sync.cjs

# Test release-it dry run
npx release-it --dry-run --no-npm
```

## Best Practices

### Development Workflow
1. Work on feature branches
2. Follow conventional commit messages
3. Ensure all tests pass
4. Merge to main via pull request
5. Create releases from main branch only

### Release Planning
1. Plan releases based on semantic versioning
2. Group related changes in releases
3. Maintain clear changelog entries
4. Test thoroughly before releasing
5. Monitor post-release issues

### Security Considerations
1. Use provenance for npm packages
2. Keep secrets secure in GitHub
3. Validate all inputs in workflows
4. Monitor for security vulnerabilities
5. Use two-factor authentication

## Monitoring and Maintenance

### Release Monitoring
- GitHub Actions workflow status
- npm package download statistics
- GitHub release analytics
- Issue tracker for release-related problems

### Maintenance Tasks
- Update dependencies regularly
- Review and optimize CI/CD performance
- Monitor test coverage trends
- Update documentation as needed
- Security audit of dependencies

## Implementation Checklist

### Prerequisites
- [ ] Node.js 18+ project
- [ ] GitHub repository with appropriate permissions
- [ ] npm account with publishing rights
- [ ] GitHub secrets configured:
  - `NPM_TOKEN`: npm automation token
  - `GITHUB_TOKEN`: Automatically provided by GitHub Actions

### Setup Steps
1. **Create CI Workflow** (`.github/workflows/ci.yml`)
   - [ ] Copy and customize the CI template
   - [ ] Update package name references
   - [ ] Configure test commands for your project
   - [ ] Set appropriate Node.js version

2. **Create Release Workflow** (`.github/workflows/release.yml`)
   - [ ] Copy and customize the release template
   - [ ] Update package name references
   - [ ] Configure registry URL if not npm
   - [ ] Set appropriate permissions

3. **Configure Release-it** (`.release-it.json`)
   - [ ] Copy the release-it configuration
   - [ ] Customize commit message format
   - [ ] Adjust changelog sections as needed
   - [ ] Configure branch requirements

4. **Create Version Sync Script** (`scripts/version-sync.cjs`)
   - [ ] Copy the version sync template
   - [ ] Update file paths and patterns for your project
   - [ ] Add any additional files that need version sync
   - [ ] Make script executable (`chmod +x scripts/version-sync.cjs`)

5. **Update package.json**
   - [ ] Add release-it and conventional-changelog dependencies
   - [ ] Add release scripts
   - [ ] Configure files array for publishing
   - [ ] Set appropriate engines and metadata

6. **Create Initial Changelog** (`CHANGELOG.md`)
   - [ ] Create changelog with proper header
   - [ ] Add initial version section
   - [ ] Include links to standards

7. **Configure GitHub Secrets**
   - [ ] Generate npm automation token
   - [ ] Add `NPM_TOKEN` to repository secrets
   - [ ] Verify GitHub Actions permissions

8. **Test Setup**
   - [ ] Run CI workflow manually
   - [ ] Test version sync script
   - [ ] Verify release-it configuration
   - [ ] Create test release with dry run

### Customization Guide

#### For Different Package Managers
- **Yarn**: Update `npm ci` to `yarn install --frozen-lockfile`
- **pnpm**: Update `npm ci` to `pnpm install --frozen-lockfile`
- **Private Registry**: Update registry URL in release workflow

#### For Different Languages
- **Python**: Replace Node.js setup with Python actions
- **Go**: Replace npm commands with Go build tools
- **Rust**: Replace npm commands with Cargo commands

#### For Different CI Platforms
- **GitLab CI**: Convert GitHub Actions to GitLab CI syntax
- **Azure DevOps**: Convert to Azure Pipelines syntax
- **Jenkins**: Convert to Jenkinsfile syntax

## Conclusion

This automated release management system ensures:
- **Consistency**: Version synchronization across all files
- **Quality**: Comprehensive testing and validation
- **Security**: Provenance and secure publishing
- **Efficiency**: Minimal manual intervention required
- **Transparency**: Clear changelog and release notes
- **Reusability**: Template-based approach for any project

The system is designed to be:
- **Language Agnostic**: Can be adapted for any programming language
- **Platform Flexible**: Works with different CI/CD platforms
- **Package Manager Independent**: Supports npm, yarn, pnpm, or custom registries
- **Customizable**: Easy to modify for specific project needs

For questions or issues with implementing this release process, please create an issue in your repository or refer to the platform-specific documentation.