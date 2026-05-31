cd agent

Write-Host "Cleaning up old bundles..." -ForegroundColor Gray
if (Test-Path "bundle") { Remove-Item "bundle" -Recurse -Force }
New-Item -ItemType Directory -Force -Path bundle\windows | Out-Null
New-Item -ItemType Directory -Force -Path bundle\linux | Out-Null
New-Item -ItemType Directory -Force -Path bundle\macos | Out-Null
New-Item -ItemType Directory -Force -Path "../dashboard/public/downloads" | Out-Null

# Read competition key from server settings if available
$competitionKey = "GLOBAL_COMP_KEY_12345"
if (Test-Path "../server/settings.json") {
    $settings = Get-Content "../server/settings.json" | ConvertFrom-Json
    if ($settings.competitionKey) {
        $competitionKey = $settings.competitionKey
    }
}

$configTemplate = @"
{
  "server_address": "localhost",
  "grpc_port": 50052,
  "team_name": "YOUR_TEAM_NAME_HERE",
  "contestant_name": "YOUR_ALIAS_HERE",
  "competition_key": "$competitionKey",
  "use_tls": false
}
"@

# 1. Build Windows
Write-Host "Building for Windows (with CGO)..." -ForegroundColor Yellow
$env:GOOS="windows"
$env:GOARCH="amd64"
$env:CGO_ENABLED="1"
$env:CC="gcc"
$env:PATH = "C:\Users\natth\OneDrive\Desktop\MyProject\LOCKON-VOIGHT\gcc_out\mingw64\bin;" + $env:PATH
go build -ldflags="-H=windowsgui -s -w" -o bin/voight-sentinel.exe ./cmd/voight

# Create Windows Bundle
Copy-Item "bin/voight-sentinel.exe" "bundle\windows\"
Set-Content "bundle\windows\README.txt" "LOCKON VOIGHT Sentinel - Windows`n`n1. Extract all files to a folder.`n2. Open config.json and set your team_name.`n3. Run voight-sentinel.exe as Administrator."
Set-Content "bundle\windows\config.json" $configTemplate
if (Test-Path "../dashboard/public/downloads/voight-sentinel-windows-bundle.zip") {
    Remove-Item "../dashboard/public/downloads/voight-sentinel-windows-bundle.zip" -Force
}
Compress-Archive -Path "bundle\windows\*" -DestinationPath "../dashboard/public/downloads/voight-sentinel-windows-bundle.zip"

# 2. Build Linux & macOS using fyne-cross
Write-Host "Checking for fyne-cross tool..." -ForegroundColor Yellow
$env:PATH = "$env:USERPROFILE\go\bin;" + $env:PATH
if (-not (Get-Command "fyne-cross" -ErrorAction SilentlyContinue)) {
    Write-Host "Installing fyne-cross..." -ForegroundColor Yellow
    go install github.com/fyne-io/fyne-cross@latest
}

Write-Host "Building for Linux (via Docker/fyne-cross)..." -ForegroundColor Yellow
fyne-cross linux -arch=amd64 -name=voight-sentinel -dir=./cmd/voight

if (Test-Path "fyne-cross\bin\linux-amd64\voight") {
    Copy-Item "fyne-cross\bin\linux-amd64\voight" "bundle\linux\voight-sentinel"
    Set-Content "bundle\linux\README.txt" "LOCKON VOIGHT Sentinel - Linux`n`n1. Extract all files to a folder.`n2. Open config.json and set your team_name.`n3. Run ./voight-sentinel with sudo/root privileges."
    Set-Content "bundle\linux\config.json" $configTemplate
    if (Test-Path "../dashboard/public/downloads/voight-sentinel-linux-bundle.zip") {
        Remove-Item "../dashboard/public/downloads/voight-sentinel-linux-bundle.zip" -Force
    }
    Compress-Archive -Path "bundle\linux\*" -DestinationPath "../dashboard/public/downloads/voight-sentinel-linux-bundle.zip"
}

Write-Host "Building for macOS (via Docker/fyne-cross)..." -ForegroundColor Yellow
fyne-cross darwin -arch=amd64 -name=voight-sentinel-darwin -app-id=com.lockon.voight -dir=./cmd/voight

if (Test-Path "fyne-cross\bin\darwin-amd64\voight") {
    Copy-Item "fyne-cross\bin\darwin-amd64\voight" "bundle\macos\voight-sentinel-darwin"
    Set-Content "bundle\macos\README.txt" "LOCKON VOIGHT Sentinel - macOS`n`n1. Extract all files to a folder.`n2. Open config.json and set your team_name.`n3. Run ./voight-sentinel-darwin with sudo/root privileges."
    Set-Content "bundle\macos\config.json" $configTemplate
    if (Test-Path "../dashboard/public/downloads/voight-sentinel-darwin-bundle.zip") {
        Remove-Item "../dashboard/public/downloads/voight-sentinel-darwin-bundle.zip" -Force
    }
    Compress-Archive -Path "bundle\macos\*" -DestinationPath "../dashboard/public/downloads/voight-sentinel-darwin-bundle.zip"
} else {
    Write-Host "macOS binary not generated (macOS SDK likely missing). Creating placeholder bundle..." -ForegroundColor Yellow
    Set-Content "bundle\macos\voight-sentinel-darwin.sh" "#!/bin/bash`necho 'Error: macOS binary could not be cross-compiled from this host due to missing Apple SDK.'`necho 'Please build the agent natively on a Mac using: go build -o voight-sentinel-darwin ./cmd/voight'`n"
    Set-Content "bundle\macos\README.txt" "LOCKON VOIGHT Sentinel - macOS`n`nDue to Apple SDK licensing, this agent must be compiled natively on a macOS machine.`nPlease clone the repository on a Mac and run 'go build' inside the 'agent' directory."
    Set-Content "bundle\macos\config.json" $configTemplate
    if (Test-Path "../dashboard/public/downloads/voight-sentinel-darwin-bundle.zip") {
        Remove-Item "../dashboard/public/downloads/voight-sentinel-darwin-bundle.zip" -Force
    }
    Compress-Archive -Path "bundle\macos\*" -DestinationPath "../dashboard/public/downloads/voight-sentinel-darwin-bundle.zip"
}

cd ..
