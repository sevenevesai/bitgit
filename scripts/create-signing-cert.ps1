# BitGit Self-Signed Code Signing Certificate Generator
# Run this script as Administrator

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "BitGit Code Signing Certificate Generator" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

# Check if running as administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: This script must be run as Administrator!" -ForegroundColor Red
    Write-Host "Right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    exit 1
}

# Certificate parameters
$certName = "BitGit Code Signing Certificate"
$certSubject = "CN=BitGit Developer"
$validYears = 3
$certPassword = Read-Host -Prompt "Enter a secure certificate password"

Write-Host "Creating self-signed code signing certificate..." -ForegroundColor Green
Write-Host "Subject: $certSubject" -ForegroundColor Gray
Write-Host "Valid for: $validYears years" -ForegroundColor Gray
Write-Host ""

try {
    # Create the certificate
    $cert = New-SelfSignedCertificate `
        -Type CodeSigningCert `
        -Subject $certSubject `
        -KeyUsage DigitalSignature `
        -FriendlyName $certName `
        -CertStoreLocation "Cert:\CurrentUser\My" `
        -NotAfter (Get-Date).AddYears($validYears) `
        -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3")

    Write-Host "✓ Certificate created successfully!" -ForegroundColor Green
    Write-Host ""

    # Display certificate information
    Write-Host "Certificate Details:" -ForegroundColor Cyan
    Write-Host "-------------------" -ForegroundColor Cyan
    Write-Host "Thumbprint: $($cert.Thumbprint)" -ForegroundColor Yellow
    Write-Host "Subject:    $($cert.Subject)" -ForegroundColor Gray
    Write-Host "Expires:    $($cert.NotAfter)" -ForegroundColor Gray
    Write-Host ""

    # Export certificate to PFX (backup)
    $pfxPath = "$PSScriptRoot\bitgit-signing-cert.pfx"
    $securePassword = ConvertTo-SecureString -String $certPassword -Force -AsPlainText
    Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $securePassword | Out-Null

    Write-Host "✓ Certificate exported to: $pfxPath" -ForegroundColor Green
    Write-Host "  (Keep this file and your password safe - it's your backup!)" -ForegroundColor Gray
    Write-Host ""

    # Move certificate to Trusted Root (to trust it system-wide)
    Write-Host "Installing certificate to Trusted Root store..." -ForegroundColor Green
    $store = Get-Item "Cert:\CurrentUser\Root"
    $store.Open("ReadWrite")
    $store.Add($cert)
    $store.Close()

    Write-Host "✓ Certificate installed to Trusted Root" -ForegroundColor Green
    Write-Host ""

    # Save thumbprint to file for easy access
    $thumbprintFile = "$PSScriptRoot\cert-thumbprint.txt"
    $cert.Thumbprint | Out-File -FilePath $thumbprintFile -Encoding UTF8

    Write-Host "✓ Thumbprint saved to: $thumbprintFile" -ForegroundColor Green
    Write-Host ""

    # Update tauri.conf.json with thumbprint
    Write-Host "Updating tauri.conf.json with certificate thumbprint..." -ForegroundColor Green
    $tauriConfigPath = Join-Path (Split-Path $PSScriptRoot -Parent) "src-tauri\tauri.conf.json"

    if (Test-Path $tauriConfigPath) {
        $configContent = Get-Content $tauriConfigPath -Raw | ConvertFrom-Json
        $configContent.tauri.bundle.windows.certificateThumbprint = $cert.Thumbprint
        $configContent | ConvertTo-Json -Depth 100 | Set-Content $tauriConfigPath
        Write-Host "✓ tauri.conf.json updated!" -ForegroundColor Green
    } else {
        Write-Host "! Could not find tauri.conf.json - you will need to add thumbprint manually" -ForegroundColor Yellow
    }

    Write-Host ""
    Write-Host "==================================================" -ForegroundColor Cyan
    Write-Host "SUCCESS! Certificate setup complete." -ForegroundColor Green
    Write-Host "==================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "1. Run 'npm run tauri build' to build your MSI" -ForegroundColor White
    Write-Host "2. The MSI will be signed with your certificate" -ForegroundColor White
    Write-Host "3. Users will see 'BitGit Developer' as the publisher" -ForegroundColor White
    Write-Host ""
    Write-Host "Note: Self-signed certificates will still show a SmartScreen warning" -ForegroundColor Yellow
    Write-Host "      Users need to click 'More info' > 'Run anyway'" -ForegroundColor Yellow
    Write-Host "      For no warnings, you would need a commercial code signing cert (~`$300/year)" -ForegroundColor Gray
    Write-Host ""

} catch {
    Write-Host "ERROR: Failed to create certificate" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
