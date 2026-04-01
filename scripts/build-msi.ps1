# BitGit MSI Build Script
# Builds the production MSI installer

param(
    [switch]$SkipCertCheck = $false
)

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "BitGit MSI Builder" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

# Change to project root
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location $projectRoot

Write-Host "Project root: $projectRoot" -ForegroundColor Gray
Write-Host ""

# Check for certificate if not skipping
if (-not $SkipCertCheck) {
    Write-Host "Checking for code signing certificate..." -ForegroundColor Yellow
    $tauriConfigPath = Join-Path $projectRoot "src-tauri\tauri.conf.json"
    $config = Get-Content $tauriConfigPath -Raw | ConvertFrom-Json
    $thumbprint = $config.tauri.bundle.windows.certificateThumbprint

    if ([string]::IsNullOrEmpty($thumbprint) -or $thumbprint -eq "null") {
        Write-Host ""
        Write-Host "WARNING: No code signing certificate configured!" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Your MSI will be unsigned, which may trigger Windows Defender warnings." -ForegroundColor Yellow
        Write-Host ""
        Write-Host "To create a self-signed certificate:" -ForegroundColor Cyan
        Write-Host "  1. Open PowerShell as Administrator" -ForegroundColor White
        Write-Host "  2. Run: .\scripts\create-signing-cert.ps1" -ForegroundColor White
        Write-Host ""
        $continue = Read-Host "Continue without signing? (y/N)"
        if ($continue -ne 'y') {
            Write-Host "Build cancelled." -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "✓ Certificate configured: $thumbprint" -ForegroundColor Green
    }
    Write-Host ""
}

# Step 1: Build git-service
Write-Host "Step 1/3: Building git-service..." -ForegroundColor Cyan
Write-Host "-----------------------------------" -ForegroundColor Gray
Set-Location "git-service"

if (-not (Test-Path "node_modules")) {
    Write-Host "Installing git-service dependencies..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Failed to install git-service dependencies" -ForegroundColor Red
        exit 1
    }
}

Write-Host "Building git-service TypeScript..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to build git-service" -ForegroundColor Red
    exit 1
}

Write-Host "✓ git-service built successfully" -ForegroundColor Green
Write-Host ""

# Step 2: Build frontend
Set-Location $projectRoot
Write-Host "Step 2/3: Building frontend..." -ForegroundColor Cyan
Write-Host "-----------------------------------" -ForegroundColor Gray

if (-not (Test-Path "node_modules")) {
    Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Failed to install frontend dependencies" -ForegroundColor Red
        exit 1
    }
}

Write-Host "Building React frontend..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to build frontend" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Frontend built successfully" -ForegroundColor Green
Write-Host ""

# Step 3: Build Tauri MSI
Write-Host "Step 3/3: Building Tauri MSI..." -ForegroundColor Cyan
Write-Host "-----------------------------------" -ForegroundColor Gray
Write-Host "This may take several minutes..." -ForegroundColor Gray
Write-Host ""

npm run tauri build
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to build Tauri MSI" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "BUILD COMPLETE!" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

# Find and display the MSI location
$msiPath = Get-ChildItem -Path "$projectRoot\src-tauri\target\release\bundle\msi" -Filter "*.msi" -ErrorAction SilentlyContinue | Select-Object -First 1

if ($msiPath) {
    Write-Host "Your MSI installer is ready:" -ForegroundColor Green
    Write-Host "$($msiPath.FullName)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "File size: $([math]::Round($msiPath.Length / 1MB, 2)) MB" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "1. Test the installer on a clean Windows machine" -ForegroundColor White
    Write-Host "2. Distribute to users" -ForegroundColor White
    Write-Host "3. Users may need to click 'More info' > 'Run anyway' on SmartScreen" -ForegroundColor Yellow
    Write-Host ""
} else {
    Write-Host "WARNING: Could not locate MSI file in expected location" -ForegroundColor Yellow
    Write-Host "Check: $projectRoot\src-tauri\target\release\bundle\msi" -ForegroundColor Gray
    Write-Host ""
}

Write-Host "To open the output folder, run:" -ForegroundColor Cyan
Write-Host "  explorer `"$projectRoot\src-tauri\target\release\bundle\msi`"" -ForegroundColor White
Write-Host ""
