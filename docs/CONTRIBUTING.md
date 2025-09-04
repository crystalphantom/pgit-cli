# Contributing to PGit CLI

We love your input! We want to make contributing to PGit CLI as easy and transparent as possible, whether it's:

- Reporting a bug
- Discussing the current state of the code
- Submitting a fix
- Proposing new features
- Becoming a maintainer

## 🚀 Quick Start

1. Fork the repository
2. Clone your fork: `git clone https://github.com/your-username/pgit-cli.git`
3. Install dependencies: `npm install`
4. Create a branch: `git checkout -b feature/your-feature-name`
5. Make your changes
6. Test your changes: `npm test`
7. Commit using conventional commits
8. Push and create a Pull Request

## 📋 Development Setup

### Prerequisites

- **Node.js** 18.0.0 or higher
- **Git** (latest version recommended)
- **npm** (comes with Node.js)

### Local Development

```bash
# Clone the repository
git clone https://github.com/your-org/pgit-cli.git
cd pgit-cli

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format

# Test CLI locally
npm run dev -- --help
```

### Testing Your Changes

```bash
# Run the full test suite
npm test

# Test CLI functionality locally
npm run build
npm link
pgit --version
pgit --help

# Test in a temporary directory
mkdir /tmp/test-pgit && cd /tmp/test-pgit
git init
echo "test" > .env
pgit init
pgit add .env
pgit status
```

## 🤝 How We Work

### Git Workflow

We use a standard Git workflow with the following branches:

- **`main`**: Production-ready code
- **`feature/*`**: New features
- **`fix/*`**: Bug fixes
- **`docs/*`**: Documentation updates
- **`chore/*`**: Maintenance tasks

### Conventional Commits

We use [Conventional Commits](https://conventionalcommits.org/) for automatic changelog generation and semantic versioning.

**Format**: `<type>[optional scope]: <description>`

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, missing semicolons, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding or modifying tests
- `chore`: Maintenance tasks
- `ci`: CI/CD changes

**Examples**:
```bash
feat(add): support for multiple file patterns
fix(symlink): resolve Windows junction point issue
docs: update installation guide
test(core): add cross-platform symbolic link tests
chore(deps): upgrade zod to v3.23.0
```

### Pull Request Process

1. **Create a descriptive branch name**
   ```bash
   git checkout -b feat/add-config-templates
   git checkout -b fix/windows-symlink-permissions
   git checkout -b docs/improve-readme-examples
   ```

2. **Make your changes following our coding standards**

3. **Write or update tests**
   - All new features must include tests
   - Bug fixes must include regression tests
   - Maintain >90% test coverage

4. **Update documentation**
   - Update README.md if adding new features
   - Add JSDoc comments for new functions
   - Update CHANGELOG.md if using manual releases

5. **Test thoroughly**
   ```bash
   npm run lint
   npm run build
   npm test
   npm run test:coverage
   ```

6. **Commit using conventional commits**
   ```bash
   git add .
   git commit -m "feat(add): support for directory exclusion patterns"
   ```

7. **Push and create Pull Request**
   ```bash
   git push origin feat/add-config-templates
   ```

## 🎯 Contribution Guidelines

### Code Style

We enforce code style through automated tools:

- **TypeScript**: Strict mode enabled
- **ESLint**: TypeScript recommended rules
- **Prettier**: Consistent formatting
- **Husky**: Pre-commit hooks

### Code Quality Requirements

- **Test Coverage**: Minimum 90% (branches, functions, lines, statements)
- **Type Safety**: All code must be fully typed (no `any` types)
- **Documentation**: All public functions must have JSDoc comments
- **Performance**: CLI commands should respond within 2 seconds

### Architecture Guidelines

1. **Command Pattern**: Each CLI command is a separate class
2. **Service Layer**: Core business logic in service classes
3. **Error Handling**: Use custom error classes with recovery suggestions
4. **Cross-Platform**: Code must work on macOS, Linux, and Windows

### Testing Guidelines

- **Unit Tests**: Test individual functions and classes
- **Integration Tests**: Test command interactions
- **Cross-Platform Tests**: Verify symbolic link behavior
- **Error Tests**: Test error conditions and recovery

```typescript
// Example test structure
describe('AddCommand', () => {
  describe('execute', () => {
    it('should add file to private tracking', async () => {
      // Test implementation
    });
    
    it('should handle permission errors gracefully', async () => {
      // Error handling test
    });
    
    it('should work on Windows with junction points', async () => {
      // Platform-specific test
    });
  });
});
```

## 🐛 Bug Reports

Great bug reports tend to have:

- A quick summary and/or background
- Steps to reproduce (be specific!)
- What you expected would happen
- What actually happens
- System information (OS, Node.js version, etc.)

**Use our bug report template when creating issues.**

## 💡 Feature Requests

We love feature requests! Please:

- Use our feature request template
- Explain the use case and why it would be valuable
- Consider backwards compatibility
- Be open to discussion about implementation

## 📚 Documentation

Documentation improvements are always welcome:

- Fix typos and clarify explanations
- Add examples and use cases
- Improve API documentation
- Translate documentation (future)

## 🛡️ Security

If you discover a security vulnerability, please follow our security reporting process outlined in [SECURITY.md](SECURITY.md).

**Do not create public issues for security vulnerabilities.**

## 🎉 Recognition

Contributors will be:

- Listed in the project's contributors
- Mentioned in release notes for significant contributions
- Invited to join the maintainer team for outstanding contributions

## 📞 Getting Help

- **GitHub Discussions**: For questions and general discussion
- **Issues**: For bug reports and feature requests
- **Discord**: For real-time chat (link in README)

## 📄 Code of Conduct

This project adheres to the Contributor Covenant [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## 📜 License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

**Thank you for contributing to PGit CLI! 🚀**