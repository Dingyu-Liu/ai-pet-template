$ErrorActionPreference = 'Stop'
$switch = '<你的用户名>\.dsh\whale-work\pet-majsoul.txt'
$dir = '<你的用户名>\.dsh\whale-work\majsoul'
$log = Join-Path $dir 'toggle.log'

$now = 'on'
if (Test-Path $switch) { $now = (Get-Content $switch -Raw).Trim() }
$next = 'off'
if ($now -ieq 'off') { $next = 'on' }
Set-Content -Path $switch -Value $next -Encoding ascii -NoNewline

$running = @(Get-NetTCPConnection -LocalPort 29735 -State Listen -ErrorAction SilentlyContinue).Count -gt 0
if ($next -eq 'on' -and -not $running) {
  Start-Process -FilePath 'node.exe' -ArgumentList 'service.mjs' -WorkingDirectory $dir -WindowStyle Hidden
  Start-Sleep -Seconds 3
}

$msg = if ($next -eq 'on') { 'pet-majsoul：开。她可以在牌桌上出手了。' } else { 'pet-majsoul：关。她只看不打。' }
Add-Content -Path $log -Value ((Get-Date -Format o) + ' -> ' + $next)
Add-Type -AssemblyName PresentationFramework
[void][System.Windows.MessageBox]::Show($msg, 'pet-majsoul')
