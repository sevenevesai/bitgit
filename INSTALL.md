# BitGit Installation Guide

Simple guide for installing BitGit on Windows. For macOS and Linux, see [macOS](#macos) and
[Linux](#linux).

## System Requirements

- **Operating System:** Windows 10 or Windows 11 (64-bit)
- **Prerequisites:**
  - Git for Windows ([Download here](https://git-scm.com/download/win))
  - Node.js 20 or later; 22 or 24 recommended ([Download here](https://nodejs.org/))
- **Disk Space:** ~100 MB

## Installation Steps

### 1. Install Prerequisites (Required)

**Git for Windows:**
1. Download Git for Windows: https://git-scm.com/download/win
2. Run the installer with default settings
3. Verify: Open Command Prompt and type `git --version`

**Node.js:**
1. Download Node.js: https://nodejs.org/ (LTS version recommended)
2. Run the installer with default settings
3. Verify: Open Command Prompt and type `node --version`

### 2. Download BitGit

Download the latest MSI installer:
```
BitGit_0.1.0_x64_en-US.msi
```

### 3. Unblock the Installer (Important!)

Before running the installer:

1. **Right-click** the downloaded MSI file
2. Select **Properties**
3. If you see an **"Unblock"** checkbox at the bottom, check it
4. Click **OK**

This prevents Windows from blocking the installation.

### 4. Run the Installer

Double-click `BitGit_0.1.0_x64_en-US.msi`

### 5. Handle SmartScreen (If it appears)

If you see **"Windows protected your PC"**:

1. Click **"More info"**
2. Click **"Run anyway"**

This warning appears because the app uses a self-signed certificate. The application is safe to run.

### 6. Complete Installation

1. Follow the installation wizard
2. Choose installation location (default is fine)
3. Click **Install**
4. Wait for installation to complete
5. Click **Finish**

### 7. Launch BitGit

- Find **BitGit** in your Start Menu
- Or run from desktop shortcut (if created)

## macOS

BitGit for macOS is in beta. It needs macOS 11 (Big Sur) or later.

1. **Install Git:** run `xcode-select --install` in Terminal (the Command Line Tools include
   Git), or install Git with Homebrew. Until the tools are installed, macOS's built-in `git` only
   prints an `xcrun` error, and BitGit's errors then point to `xcode-select --install`.
2. **Install Node.js 22 or later** from https://nodejs.org/, Homebrew, nvm, fnm or Volta. BitGit
   reads your login shell's PATH, so it finds the same `node` and `git` as Terminal even when you
   start it from Finder or the Dock.
3. **Install BitGit:** download `BitGit_<version>_aarch64.dmg` (Apple Silicon) or
   `BitGit_<version>_x64.dmg` (Intel), open it and drag BitGit to Applications.

Release downloads are not signed or notarized by Apple yet, so macOS blocks the first launch:
open BitGit once and close the warning, then choose **Open Anyway** under System Settings >
Privacy & Security (System Preferences > Security & Privacy on macOS 12 and earlier) and confirm.
Later launches open normally.

The GitHub token is kept in your login Keychain. If macOS asks whether BitGit may use it, choose
**Always Allow**.

## Linux

Linux releases ship as an AppImage only. The `.deb` and `.rpm` packages are no longer published:
they need webkit2gtk 4.0, which current distributions do not ship. If you installed the 1.1.2
`.deb`, remove it (`sudo apt remove bit-git`) and use the AppImage.

1. **Install the prerequisites:** Git, Node.js 22 or later (20 is the minimum), and FUSE 2 for
   AppImages: `libfuse2` on Ubuntu 22.04 and Debian, `libfuse2t64` on Ubuntu 24.04, `fuse-libs`
   on Fedora, `fuse2` on Arch.
2. **Install BitGit:** download `bit-git_<version>_amd64.AppImage`, make it executable with
   `chmod +x bit-git_*.AppImage`, and run it. Keep it in a folder you can write to: updates
   replace the AppImage file in place.
3. **Store the GitHub token:** BitGit keeps it in the Secret Service, so a running and unlocked
   provider is needed: GNOME Keyring, KWallet, or KeePassXC with Secret Service integration
   enabled. GNOME and KDE desktops provide one; a bare window manager may not. Without one,
   saving the token fails with an error that names the Secret Service.

### Linux troubleshooting

- **The AppImage does not start and mentions FUSE:** install FUSE 2 as above, or run
  `./bit-git_*.AppImage --appimage-extract-and-run`.
- **Blank or white window on NVIDIA drivers:** start BitGit with
  `WEBKIT_DISABLE_DMABUF_RENDERER=1 ./bit-git_*.AppImage`. This is the usual WebKitGTK workaround
  for this driver issue.

## First Time Setup

When you first launch BitGit:

1. **Generate a GitHub Personal Access Token:**
   - Go to: https://github.com/settings/tokens
   - Click **"Generate new token (classic)"**
   - Select scope: `repo` (Full control of private repositories)
   - Copy the token (starts with `ghp_` or `github_pat_`)

2. **Add Token to BitGit:**
   - Open BitGit Settings
   - Paste your GitHub token
   - Click **Save**

3. **Add Repositories:**
   - Click **"Scan for Repositories"**
   - Or manually add repository paths

## Troubleshooting

### "Git is not installed" or "Node is not installed" error

**Solution:**
- Install Git for Windows: https://git-scm.com/download/win
- Install Node.js: https://nodejs.org/
- Restart your computer after installation
- Verify both are in your PATH: `git --version` and `node --version`

### SmartScreen blocks installation completely

**Solution:**
1. Right-click MSI → Properties → Check "Unblock" → OK
2. Try installation again
3. If still blocked, temporarily disable SmartScreen:
   - Open Windows Security
   - Go to App & browser control
   - Click "Reputation-based protection settings"
   - Turn off "Check apps and files" temporarily
   - Install BitGit
   - Turn protection back on

### "Windows Defender deleted the installer"

**Solution:**
1. Open Windows Security
2. Go to Protection history
3. Find BitGit MSI in quarantine
4. Click "Actions" → "Restore"
5. Follow unblock steps above
6. Reinstall

### Application won't start

**Solution:**
1. Verify Git is installed: `git --version` in Command Prompt
2. Reinstall BitGit
3. Check Windows Event Viewer for error details

### GitHub operations fail

**Common causes:**
- Invalid or expired GitHub token
- Token lacks `repo` permissions
- No internet connection

**Solution:**
1. Generate new GitHub token with `repo` scope
2. Update token in BitGit Settings

## Uninstallation

### Method 1: Windows Settings

1. Open **Settings** → **Apps** → **Apps & features**
2. Find **BitGit** in the list
3. Click **Uninstall**

### Method 2: Control Panel

1. Open **Control Panel** → **Programs** → **Programs and Features**
2. Find **BitGit**
3. Right-click → **Uninstall**

### Method 3: Original MSI

1. Double-click the original MSI installer
2. Select **"Remove"**

## Data Location

BitGit stores configuration and logs in:
```
C:\Users\YourUsername\AppData\Roaming\BitGit\
```

On macOS it is `~/Library/Application Support/BitGit/`; on Linux, `$XDG_CONFIG_HOME/BitGit/` or
`~/.config/BitGit/`.

This folder is **NOT** automatically deleted on uninstall. Delete it manually if you want to remove all data.

## Update Instructions

To update to a newer version:

1. Download the new MSI installer
2. Run the new installer
3. It will automatically upgrade the existing installation
4. Your settings and configuration will be preserved

## Support

For issues or questions:
- Check BUILD.md for advanced troubleshooting
- Report bugs on GitHub (if applicable)

## Privacy & Security

- GitHub tokens are stored in the system credential store: Windows Credential Manager, the macOS
  Keychain, or the Secret Service on Linux
- No data is sent to external servers (except GitHub API calls)
- All Git operations happen locally on your machine
