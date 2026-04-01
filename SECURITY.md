# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in BitGit, please report it responsibly.

**Please do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please report them via [GitHub Security Advisories](https://github.com/sevenevesai/bitgit/security/advisories/new).

We will acknowledge your report within 48 hours and aim to release a fix as quickly as possible.

## Security Design

### Credential Storage

BitGit stores GitHub Personal Access Tokens in the operating system's secure credential store:

- **Windows:** Windows Credential Manager
- **macOS/Linux:** OS keyring (planned)

Tokens are **never** stored in files, environment variables, or application configuration.

### Local Data

- Project metadata is stored in `%APPDATA%/BitGit/projects.json`
- This file contains project names, paths, and GitHub URLs - no credentials
- Atomic writes with backup recovery prevent data corruption

### Git Operations

- BitGit never force-pushes to remote repositories
- All merge operations use `--no-ff` to preserve history
- Pre-sync validation checks for files exceeding GitHub size limits

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |
| < 1.0   | No        |
