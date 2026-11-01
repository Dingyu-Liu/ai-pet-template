Start-Sleep -Seconds 130
$dir = '<你的用户名>\.dsh\whale-work\majsoul'
$listen = @(Get-NetTCPConnection -LocalPort 29735 -State Listen -ErrorAction SilentlyContinue).Count
if ($listen -eq 0) {
  Start-Process -FilePath 'node.exe' -ArgumentList 'service.mjs' -WorkingDirectory $dir -WindowStyle Hidden
  Add-Content -Path (Join-Path $dir 'boot.log') -Value ((Get-Date -Format o) + ' service started after host restart')
} else {
  Add-Content -Path (Join-Path $dir 'boot.log') -Value ((Get-Date -Format o) + ' service already listening')
}