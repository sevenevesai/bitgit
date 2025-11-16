# BitGit Build & Distribution Guide

This guide explains how to build the BitGit MSI installer for Windows distribution.

## Prerequisites

Before building, ensure you have:

- ✅ Windows 10/11 (x64)
- ✅ Node.js 18+ installed
- ✅ Rust toolchain installed (https://rustup.rs/)
- ✅ Git for Windows installed
- ✅ PowerShell 5.1+ or PowerShell Core

## Quick Start

### Option 1: Using PowerShell (Recommended)

```powershell
# 1. Create code signing certificate (run as Administrator, FIRST TIME ONLY)
.\scripts\create-signing-cert.ps1

# 2. Build the MSI installer
.\scripts\build-msi.ps1
```

### Option 2: Using CMD/Batch

```cmd
REM 1. Create certificate (run PowerShell as Admin, FIRST TIME ONLY)
powershell -ExecutionPolicy Bypass -File .\scripts\create-signing-cert.ps1

REM 2. Build MSI
.\scripts\build-msi.cmd
```

### Option 3: Manual Build

```bash
# 1. Build git-service
cd git-service
npm install
npm run build
cd ..

# 2. Build frontend and Tauri app
npm install
npm run build
npm run tauri build
```

## Code Signing Setup (First Time Only)

### Why Sign Your Application?

Code signing prevents Windows from automatically deleting/blocking your MSI installer. Without signing:
- ❌ Windows Defender may quarantine your installer
- ❌ SmartScreen will show aggressive warnings
- ❌ Users may not trust the installer

With self-signed certificate:
- ✅ Windows recognizes the publisher
- ✅ Defender won't auto-delete
- ⚠️ SmartScreen will still warn (requires EV cert to eliminate)

### Creating the Self-Signed Certificate

**Run as Administrator:**

```powershell
.\scripts\create-signing-cert.ps1
```

This script will:
1. Generate a 3-year self-signed code signing certificate
2. Install it to your certificate stores
3. Export a backup PFX file
4. Update `tauri.conf.json` with the certificate thumbprint

**Important Files Created:**
- `scripts/bitgit-signing-cert.pfx` - Certificate backup (keep safe!)
- `scripts/cert-thumbprint.txt` - Certificate identifier

**Certificate Password:** `BitGit2025!` (change this in the script if desired)

### Backup Your Certificate

⚠️ **CRITICAL:** Back up `scripts/bitgit-signing-cert.pfx` to a secure location!

If you lose this certificate:
- Users who installed previous versions will see trust warnings on updates
- You'll need to create a new certificate and redistribute

To restore certificate on another machine:
```powershell
# Import PFX (you'll be prompted for password)
Import-PfxCertificate -FilePath .\scripts\bitgit-signing-cert.pfx -CertStoreLocation Cert:\CurrentUser\My
```

## Building the MSI Installer

### Using the Build Script

```powershell
.\scripts\build-msi.ps1
```

The script will:
1. ✅ Check for code signing certificate
2. ✅ Build git-service (Node.js → JavaScript)
3. ✅ Build frontend (React → Production bundle)
4. ✅ Build Tauri app (Rust + bundle → MSI)
5. ✅ Sign the MSI with your certificate

**Build time:** 5-10 minutes (first build), 2-3 minutes (subsequent)

### Build Output

Your MSI installer will be located at:
```
src-tauri\target\release\bundle\msi\BitGit_0.1.0_x64_en-US.msi
```

**Typical file size:** 15-25 MB

### Opening the Output Folder

```powershell
explorer "src-tauri\target\release\bundle\msi"
```

## Distribution

### For End Users

**Installation Instructions:**

1. Download `BitGit_x.x.x_x64_en-US.msi`
2. Right-click the MSI → **Properties** → Check **Unblock** (if present) → **OK**
3. Double-click the MSI to install
4. If SmartScreen appears:
   - Click **"More info"**
   - Click **"Run anyway"**
5. Follow the installation wizard

**System Requirements:**
- Windows 10/11 (x64)
- Git for Windows must be installed
- Node.js 18+ must be installed
- ~100MB disk space

### SmartScreen Warnings

**Expected behavior with self-signed certificate:**

```
Windows protected your PC
Microsoft Defender SmartScreen prevented an unrecognized app from starting.

Publisher: BitGit Developer
```

**Users should click:** "More info" → "Run anyway"

### Eliminating SmartScreen (Optional)

To completely remove SmartScreen warnings, you need an **Extended Validation (EV) Code Signing Certificate**:

**Pros:**
- ✅ No SmartScreen warnings
- ✅ Immediate trust from Windows
- ✅ Professional appearance

**Cons:**
- ❌ Costs $300-$500/year
- ❌ Requires business verification
- ❌ Requires physical USB token

**Recommended Vendors:**
- DigiCert (https://www.digicert.com/signing/code-signing-certificates)
- Sectigo (https://sectigo.com/ssl-certificates-tls/code-signing)
- GlobalSign (https://www.globalsign.com/en/code-signing-certificate)

To use a commercial certificate:
1. Purchase EV code signing certificate
2. Install it to your certificate store
3. Copy the thumbprint
4. Update `tauri.conf.json`:
   ```json
   "certificateThumbprint": "YOUR_THUMBPRINT_HERE"
   ```
5. Rebuild with `.\scripts\build-msi.ps1`

## Troubleshooting

### Error: "Certificate not found"

**Solution:** Run `.\scripts\create-signing-cert.ps1` as Administrator

### Error: "Node modules not found"

**Solution:** Run `npm install` in both project root and `git-service/`

### Error: "Rust compiler not found"

**Solution:** Install Rust from https://rustup.rs/

### MSI won't install: "Publisher could not be verified"

**Solution:** Right-click MSI → Properties → Check "Unblock" → OK

### Build fails with "cargo: command not found"

**Solution:**
1. Install Rust: https://rustup.rs/
2. Restart your terminal
3. Verify: `cargo --version`

### Git operations fail in production build

**Cause:** Git for Windows not installed on user's machine

**Solution:** Document Git for Windows as a prerequisite in your installer/docs

## Version Management

### Updating Version Number

Edit version in **both** files:

**package.json:**
```json
{
  "version": "0.2.0"
}
```

**src-tauri/tauri.conf.json:**
```json
{
  "package": {
    "version": "0.2.0"
  }
}
```

**src-tauri/Cargo.toml:**
```toml
[package]
version = "0.2.0"
```

Then rebuild:
```powershell
.\scripts\build-msi.ps1
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Build MSI

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Setup Rust
        uses: actions-rs/toolchain@v1
        with:
          toolchain: stable

      - name: Install dependencies
        run: |
          npm install
          cd git-service && npm install && cd ..

      - name: Build MSI
        run: npm run tauri build

      - name: Upload MSI
        uses: actions/upload-artifact@v3
        with:
          name: bitgit-msi
          path: src-tauri/target/release/bundle/msi/*.msi
```

**Note:** GitHub Actions won't have access to your self-signed certificate. You'll need to:
1. Use GitHub Secrets to store certificate PFX and password
2. Import the certificate in the CI workflow
3. Or skip signing in CI and sign locally before release

## Development vs Production

### Development Build

```bash
npm run tauri dev
```
- Fast hot-reload
- Dev tools enabled
- Not optimized
- No signing required

### Production Build

```bash
npm run tauri build
```
- Fully optimized
- Minified bundle
- Signed MSI
- Ready for distribution

## File Structure

```
BitGit/
├── scripts/
│   ├── create-signing-cert.ps1   # Certificate generator
│   ├── build-msi.ps1              # Build script
│   ├── build-msi.cmd              # CMD wrapper
│   ├── bitgit-signing-cert.pfx    # Certificate backup (gitignored)
│   └── cert-thumbprint.txt        # Certificate ID (gitignored)
├── src-tauri/
│   ├── tauri.conf.json            # Tauri configuration
│   └── target/release/bundle/msi/ # Build output
├── git-service/
│   ├── dist/                      # Compiled JS (bundled into MSI)
│   └── package.json
└── BUILD.md                       # This file
```

## Security Notes

1. **Never commit certificate files to Git:**
   - `*.pfx` files are excluded in `.gitignore`
   - Certificate thumbprints are safe to commit

2. **Certificate backup:**
   - Store `bitgit-signing-cert.pfx` in a secure backup location
   - Password protect the PFX file

3. **Commercial certificates:**
   - Store in hardware token (required for EV certs)
   - Never share private keys

## Support

For build issues:
- Check `src-tauri/target/release/bundle/msi/` for error logs
- Verify all prerequisites are installed
- Check that `git-service/dist/` contains compiled JS files
- Ensure certificate is properly installed (run `certmgr.msc`)

For distribution issues:
- Test MSI on a clean Windows VM before public release
- Document Git for Windows requirement clearly
- Provide SmartScreen bypass instructions to users
