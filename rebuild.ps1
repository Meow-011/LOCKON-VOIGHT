cd agent

Write-Host "Cleaning up old bundles..." -ForegroundColor Gray
if (Test-Path "bundle") { Remove-Item "bundle" -Recurse -Force }
New-Item -ItemType Directory -Force -Path bundle\windows | Out-Null
New-Item -ItemType Directory -Force -Path bundle\linux | Out-Null
New-Item -ItemType Directory -Force -Path bundle\macos | Out-Null
New-Item -ItemType Directory -Force -Path "../dashboard/public/downloads" | Out-Null

# 1. Build Windows
Write-Host "Building for Windows..." -ForegroundColor Yellow
$env:GOOS="windows"
$env:GOARCH="amd64"
go build -ldflags="-s -w" -o bin/voight-sentinel.exe ./cmd/voight

# Create Windows Bundle
Copy-Item "bin/voight-sentinel.exe" "bundle\windows\"
Set-Content "bundle\windows\README.txt" "LOCKON VOIGHT Sentinel - Windows`n`n1. Extract all files to a folder.`n2. Open config.json and set your team_name.`n3. Run voight-sentinel.exe as Administrator."
Set-Content "bundle\windows\config.json" "{}"
if (Test-Path "../dashboard/public/downloads/voight-sentinel-windows-bundle.zip") {
    Remove-Item "../dashboard/public/downloads/voight-sentinel-windows-bundle.zip" -Force
}
Compress-Archive -Path "bundle\windows\*" -DestinationPath "../dashboard/public/downloads/voight-sentinel-windows-bundle.zip"

# 2. Build Linux
Write-Host "Building for Linux..." -ForegroundColor Yellow
$env:GOOS="linux"
$env:GOARCH="amd64"
go build -ldflags="-s -w" -o bin/voight-sentinel-linux ./cmd/voight

# Create Linux Bundle
Copy-Item "bin/voight-sentinel-linux" "bundle\linux\"
Set-Content "bundle\linux\README.txt" "LOCKON VOIGHT Sentinel - Linux`n`n1. Extract all files to a folder.`n2. Open config.json and set your team_name.`n3. Run 'chmod +x voight-sentinel-linux'.`n4. Run 'sudo ./voight-sentinel-linux'."
Set-Content "bundle\linux\config.json" "{}"
if (Test-Path "../dashboard/public/downloads/voight-sentinel-linux-bundle.zip") {
    Remove-Item "../dashboard/public/downloads/voight-sentinel-linux-bundle.zip" -Force
}
Compress-Archive -Path "bundle\linux\*" -DestinationPath "../dashboard/public/downloads/voight-sentinel-linux-bundle.zip"

# 3. Build macOS
Write-Host "Building for macOS..." -ForegroundColor Yellow
$env:GOOS="darwin"
$env:GOARCH="arm64"
go build -ldflags="-s -w" -o bin/voight-sentinel-darwin ./cmd/voight

# Create macOS Bundle
Copy-Item "bin/voight-sentinel-darwin" "bundle\macos\"
Set-Content "bundle\macos\README.txt" "LOCKON VOIGHT Sentinel - macOS`n`n1. Extract all files to a folder.`n2. Open config.json and set your team_name.`n3. Run 'chmod +x voight-sentinel-darwin'.`n4. Run 'sudo ./voight-sentinel-darwin'."
Set-Content "bundle\macos\config.json" "{}"
if (Test-Path "../dashboard/public/downloads/voight-sentinel-macos-bundle.zip") {
    Remove-Item "../dashboard/public/downloads/voight-sentinel-macos-bundle.zip" -Force
}
Compress-Archive -Path "bundle\macos\*" -DestinationPath "../dashboard/public/downloads/voight-sentinel-macos-bundle.zip"

cd ..
