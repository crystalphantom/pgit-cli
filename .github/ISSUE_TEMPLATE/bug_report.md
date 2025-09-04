---
name: 🐛 Bug Report
about: Create a report to help us improve PGit CLI
title: '[BUG] '
labels: ['bug', 'triage']
assignees: ''
---

## 🐛 Bug Description

A clear and concise description of what the bug is.

## 🔄 Steps to Reproduce

Steps to reproduce the behavior:

1. Go to '...'
2. Run command '....'
3. See error

```bash
# Paste the exact commands you ran
pgit init
pgit add .env
# ... other commands
```

## ✅ Expected Behavior

A clear and concise description of what you expected to happen.

## ❌ Actual Behavior

A clear and concise description of what actually happened.

## 📋 Error Output

If applicable, paste the error message or output:

```
Paste error messages here
```

## 🖥️ Environment

**System Information:**
- OS: [e.g., macOS 13.0, Ubuntu 20.04, Windows 11]
- Node.js version: [run `node --version`]
- PGit CLI version: [run `pgit --version`]
- Git version: [run `git --version`]

**Project Details:**
- Repository type: [e.g., Node.js project, Python project, etc.]
- Project size: [e.g., small (<10 files), medium, large (>100 files)]
- File types being tracked: [e.g., .env, .json, etc.]

## 📁 Repository Structure (if relevant)

```
your-project/
├── .git/
├── .pgit-storage/
├── .env (symlink)
└── other files...
```

## 🔍 Additional Context

Add any other context about the problem here:

- Does this happen consistently or intermittently?
- Have you tried any workarounds?
- Are there any related issues or discussions?

## ✅ Checklist

- [ ] I have searched for existing issues
- [ ] I have provided all required environment information
- [ ] I have included steps to reproduce
- [ ] I have included error messages (if any)
- [ ] I have tested with the latest version of PGit CLI

## 🔒 Privacy Note

Please ensure you don't include any sensitive information (API keys, passwords, etc.) in this bug report.