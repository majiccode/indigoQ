$ErrorActionPreference = "Stop"

$Repo = "majiccode/indigoQ"
$Version = $env:INDIGOQ_VERSION
$InstallDir = if ($env:INDIGOQ_INSTALL_DIR) { $env:INDIGOQ_INSTALL_DIR } else { Join-Path $env:LOCALAPPDATA "indigoQ" }
$BinDir = Join-Path $InstallDir "bin"

if (-not $Version) {
  $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest" -Headers @{ "User-Agent" = "indigoQ-installer" }
  $Version = $release.tag_name
}
$Version = $Version.TrimStart("v")
if (-not $Version) { throw "Could not determine the latest release. Set INDIGOQ_VERSION to a version such as 0.1.2." }

$asset = "indigoQ-$Version-win32-x64-server.zip"
$url = "https://github.com/$Repo/releases/download/v$Version/$asset"
$tmp = Join-Path $env:TEMP ("indigoq-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $tmp -Force | Out-Null

try {
  $archive = Join-Path $tmp $asset
  if ($env:INDIGOQ_ARCHIVE) {
    Copy-Item $env:INDIGOQ_ARCHIVE $archive
  } else {
    Write-Host "Downloading indigoQ $Version..."
    Invoke-WebRequest -Uri $url -OutFile $archive
  }

  Expand-Archive -Path $archive -DestinationPath $tmp -Force
  $bundle = Join-Path $tmp "indigoQ-$Version-win32-x64-server"
  if (-not (Test-Path $bundle)) { throw "Unexpected archive layout." }

  $appDir = Join-Path $InstallDir "app"
  if (Test-Path $appDir) { Remove-Item -Recurse -Force $appDir }
  New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
  Move-Item $bundle $appDir
  Get-ChildItem -Path $appDir -Recurse -File | Unblock-File

  New-Item -ItemType Directory -Path $BinDir -Force | Out-Null
  $launcher = Join-Path $BinDir "indigoq.cmd"
  "@echo off`r`n`"$appDir\indigoq-server.exe`" %*`r`n" | Set-Content -Path $launcher -Encoding ASCII

  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $parts = @($userPath -split ';' | Where-Object { $_ })
  if ($parts -notcontains $BinDir) {
    $newPath = (@($parts) + $BinDir) -join ';'
    [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
    Write-Host "Added $BinDir to your user PATH. Restart your terminal to use 'indigoq'."
  }

  try {
    $startMenu = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"
    New-Item -ItemType Directory -Path $startMenu -Force | Out-Null
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut((Join-Path $startMenu "indigoQ.lnk"))
    $shortcut.TargetPath = Join-Path $appDir "Start indigoQ.cmd"
    $shortcut.WorkingDirectory = $appDir
    $shortcut.Description = "indigoQ"
    $shortcut.Save()
  } catch {
    Write-Warning "Could not create Start Menu shortcut: $_"
  }

  Write-Host ""
  Write-Host "indigoQ $Version installed to $appDir"
  Write-Host "  Run:  indigoq"
  Write-Host "  Open: http://127.0.0.1:8787"
} finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
