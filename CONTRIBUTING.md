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

- Windows 10/11, macOS 11+ or Linux (build on Ubuntu 22.04 or Debian 12)
- Node.js 20+ (22 or 24 recommended)
- Rust 1.89+ (https://rustup.rs/) and the
  [Tauri 1 system dependencies](https://v1.tauri.app/v1/guides/getting-started/prerequisites)
- Git

### Running Locally

```bash
# Clone the repo
git clone https://github.com/sevenevesai/bitgit.git
cd bitgit

# Install dependencies and build the git-service
npm ci
npm --prefix git-service ci
npm --prefix git-service run build

# Start development mode
npm run tauri:dev
```

Run the checks before opening a pull request; CI runs the same on Windows, macOS and Linux:

```bash
npm run build
node --test git-service/tests/*.test.mjs
cargo test --manifest-path src-tauri/Cargo.toml
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
- Ensure the checks above pass and the app builds: `npm run tauri:build`
- Test your changes with real git repositories

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
