# Contributing to BitGit

Thank you for your interest in contributing to BitGit! This guide will help you get started.

## How to Contribute

### Reporting Bugs

If you find a bug, please open a [GitHub Issue](https://github.com/sevenevesai/bitgit/issues) with:

- A clear, descriptive title
- Steps to reproduce the problem
- Expected vs actual behavior
- Your OS version and BitGit version
- Screenshots if applicable

### Suggesting Features

Feature requests are welcome! Open a [GitHub Issue](https://github.com/sevenevesai/bitgit/issues) and describe:

- The problem you're trying to solve
- How you envision the feature working
- Any alternatives you've considered

### Submitting Code

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Make your changes
4. Test thoroughly (see Development Setup below)
5. Commit with a clear message describing the change
6. Push to your fork and open a Pull Request

## Development Setup

### Prerequisites

- Windows 10/11 (x64)
- Node.js 18+
- Rust toolchain (https://rustup.rs/)
- Git for Windows

### Running Locally

```bash
# Clone the repo
git clone https://github.com/sevenevesai/bitgit.git
cd bitgit

# Install frontend dependencies
npm install

# Install git-service dependencies
cd git-service && npm install && cd ..

# Build the git-service
cd git-service && npm run build && cd ..

# Start development mode
npm run tauri:dev
```

### Project Structure

| Directory | Purpose |
|-----------|---------|
| `src/` | React frontend (TypeScript + Vite + Tailwind) |
| `src-tauri/src/` | Rust backend (Tauri commands, credentials, cache) |
| `git-service/src/` | Node.js git operations service (simple-git, Octokit) |
| `scripts/` | Build and signing scripts |

### Architecture

```
React UI  -->  Tauri IPC  -->  Rust Backend  -->  Node.js Git Service  -->  simple-git / Octokit
```

### Key Development Notes

- **Never use `console.log()` in git-service** - it corrupts the JSON IPC on stdout. Use `console.error()` instead.
- **Use `eprintln!()` in Rust** for debug logging.
- The git-service communicates with the Rust backend via JSON messages over stdin/stdout.

## Code Style

- TypeScript: Follow existing patterns, use proper types (avoid `any`)
- Rust: Run `cargo check` before submitting
- CSS: Use Tailwind utility classes, support dark mode with `dark:` variants
- Keep changes focused and minimal - avoid unrelated refactors in the same PR

## Pull Request Guidelines

- Keep PRs focused on a single change
- Include a description of what changed and why
- Ensure the app builds without errors: `npm run tauri:build`
- Test your changes with real git repositories

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
