# Security Policy

## 🛡️ Reporting Security Vulnerabilities

We take the security of PGit CLI seriously. If you discover a security vulnerability, we appreciate your help in disclosing it to us in a responsible manner.

### 🚨 Please Do Not:

- **Create public GitHub issues** for security vulnerabilities
- **Disclose the vulnerability publicly** before it has been addressed
- **Test the vulnerability** on systems you do not own

### ✅ Please Do:

- **Report privately** using one of the methods below
- **Provide detailed information** about the vulnerability
- **Allow reasonable time** for us to address the issue before disclosure
- **Follow responsible disclosure practices**

## 📧 How to Report

### Preferred Method: GitHub Security Advisories

1. Go to our [GitHub repository](https://github.com/your-org/pgit-cli)
2. Click on "Security" tab
3. Click "Report a vulnerability"
4. Fill out the security advisory form

### Alternative Method: Email

Send an email to: **cp@zoratrox.com** (if available)

Include the following information:

- **Description**: Clear description of the vulnerability
- **Steps to Reproduce**: Detailed steps to reproduce the issue
- **Impact**: Assessment of the potential impact
- **System Information**: OS, Node.js version, PGit CLI version
- **Proof of Concept**: Code or screenshots (if applicable)

## 🔍 What We're Looking For

We're particularly interested in vulnerabilities related to:

### High Priority
- **Path traversal** attacks that could escape the working directory
- **Command injection** through user inputs
- **Symlink attacks** that could overwrite system files
- **Privilege escalation** vulnerabilities
- **Code execution** through malicious inputs

### Medium Priority  
- **Information disclosure** of sensitive data
- **Denial of service** attacks
- **Input validation** bypasses
- **Configuration vulnerabilities**

### Out of Scope
- **Social engineering** attacks
- **Physical access** vulnerabilities
- **Issues in dependencies** (please report to the respective projects)
- **Self-XSS** or similar client-side issues

## ⏱️ Response Timeline

We aim to respond to security reports according to the following timeline:

- **Initial Response**: Within 48 hours
- **Triage and Assessment**: Within 5 business days
- **Status Updates**: Every 7 days until resolution
- **Resolution**: Varies based on complexity and severity

### Severity Levels

| Severity | Response Time | Resolution Target |
|----------|---------------|-------------------|
| **Critical** | < 24 hours | < 7 days |
| **High** | < 48 hours | < 14 days |
| **Medium** | < 5 days | < 30 days |
| **Low** | < 7 days | < 90 days |

## 🏆 Recognition

We believe in recognizing security researchers who help keep PGit CLI secure:

- **Hall of Fame**: Listed in our security acknowledgments
- **CVE Credit**: Credited in CVE assignments (when applicable)
- **Release Notes**: Mentioned in security-related release notes
- **Swag**: PGit CLI stickers and merchandise (when available)

## 🛠️ Security Features

PGit CLI includes several built-in security features:

### Input Validation
- **Path sanitization** prevents directory traversal
- **Command validation** prevents injection attacks
- **File type checking** ensures safe operations
- **Size limits** prevent resource exhaustion

### File System Security
- **Symbolic link validation** prevents malicious links
- **Permission checking** ensures safe file operations
- **Working directory constraints** prevent escaping project boundaries
- **Atomic operations** prevent race conditions

### No Network Operations
- **Completely offline** operation
- **No data collection** or telemetry
- **No external dependencies** at runtime
- **Local-only** git operations

## 🔒 Security Best Practices

### For Users
- **Keep updated** to the latest version
- **Verify downloads** using checksums (when available)
- **Use in trusted environments** only
- **Review permissions** for symbolic links on Windows

### For Contributors
- **Follow secure coding practices**
- **Validate all user inputs**
- **Use TypeScript strict mode**
- **Write security-focused tests**
- **Review dependencies** regularly

## 📚 Security Resources

### Documentation
- [OWASP CLI Security Guidelines](https://owasp.org/www-project-application-security-verification-standard/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [npm Security Guidelines](https://docs.npmjs.com/security)

### Tools We Use
- **npm audit**: Dependency vulnerability scanning
- **CodeQL**: Static code analysis
- **ESLint Security Plugin**: Security-focused linting
- **Semgrep**: Additional security scanning

## 📋 Security Checklist

Before each release, we verify:

- [ ] All dependencies are up to date
- [ ] No known vulnerabilities in dependencies
- [ ] Input validation covers all user inputs
- [ ] File operations are properly sandboxed
- [ ] Error messages don't leak sensitive information
- [ ] Security tests pass on all platforms

## 🔄 Updates to This Policy

This security policy may be updated from time to time. We will:

- **Notify** via GitHub releases for major changes
- **Update** the version date below
- **Maintain** backward compatibility for reporting methods

---

**Last Updated**: January 2024  
**Version**: 1.0

For questions about this security policy, please contact us through the reporting channels above.

**Thank you for keeping PGit CLI secure! 🛡️**