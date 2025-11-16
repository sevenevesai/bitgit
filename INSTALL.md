# BitGit Installation Guide

Simple guide for installing BitGit on Windows.

## System Requirements

- **Operating System:** Windows 10 or Windows 11 (64-bit)
- **Prerequisites:**
  - Git for Windows ([Download here](https://git-scm.com/download/win))
  - Node.js 18+ ([Download here](https://nodejs.org/))
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

- GitHub tokens are stored securely in Windows Credential Manager
- No data is sent to external servers (except GitHub API calls)
- All Git operations happen locally on your machine
