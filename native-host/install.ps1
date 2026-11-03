# Registers the Media Saver yt-dlp helper for Chrome (current user only, no admin rights).
# Run once: powershell -ExecutionPolicy Bypass -File native-host\install.ps1
# Undo:     powershell -ExecutionPolicy Bypass -File native-host\install.ps1 -Uninstall
#
# Chrome starts the helper with the PATH it was started with, which may predate yt-dlp being
# installed. So this script records absolute paths of node, yt-dlp and ffmpeg and the helper
# uses them instead of PATH. Re-run it after moving or reinstalling any of these tools.

param([switch]$Uninstall)

$ErrorActionPreference = 'Stop'
$name = 'com.media_saver.ytdlp'
# Media Saver for YouTube, fixed by the "key" in wxt.youtube.config.ts
$extensionId = 'mbelopldolpphlmgglnhbpklcoopjhjj'
$registryKey = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$name"
$manifestPath = Join-Path $PSScriptRoot "$name.json"
$launcherPath = Join-Path $PSScriptRoot 'host-run.bat'
$configPath = Join-Path $PSScriptRoot 'host-config.json'

if ($Uninstall) {
  Remove-Item $registryKey -ErrorAction SilentlyContinue
  Remove-Item $manifestPath, $launcherPath, $configPath -ErrorAction SilentlyContinue
  Write-Host "Helper unregistered."
  exit 0
}

# Fresh PATH from the registry: this shell may also be older than the winget install
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
  [Environment]::GetEnvironmentVariable('Path', 'User')

$tools = [ordered]@{}
foreach ($tool in 'node', 'yt-dlp', 'ffmpeg') {
  $command = Get-Command $tool -CommandType Application -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($command) {
    $tools[$tool] = $command.Source
    Write-Host "  [ok] $tool -> $($command.Source)"
  } else {
    Write-Host "  [missing] $tool - see README"
  }
}
if (-not $tools['node']) { throw 'node is required to run the helper' }

# Launcher with the absolute node path; Chrome runs .bat/.exe only
@(
  '@echo off',
  "`"$($tools['node'])`" `"%~dp0host.mjs`" %*"
) | Out-File -FilePath $launcherPath -Encoding ascii

[ordered]@{ ytdlp = $tools['yt-dlp']; ffmpeg = $tools['ffmpeg'] } |
  ConvertTo-Json | Out-File -FilePath $configPath -Encoding utf8

[ordered]@{
  name            = $name
  description     = 'Media Saver: downloads YouTube videos with yt-dlp'
  path            = $launcherPath
  type            = 'stdio'
  allowed_origins = @("chrome-extension://$extensionId/")
} | ConvertTo-Json | Out-File -FilePath $manifestPath -Encoding ascii

New-Item -Path $registryKey -Force | Out-Null
Set-ItemProperty -Path $registryKey -Name '(Default)' -Value $manifestPath

Write-Host "Helper registered: $manifestPath"
