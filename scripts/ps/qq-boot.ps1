$d = 'C:\Users\<你的用户名>\Documents\dsh-qq\NapCat.Shell'
$log = 'C:\Users\<你的用户名>\Documents\dsh-qq\backend-live.log'
Get-Process -Name 'QQ','NapCatWinBootMain' -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 4
Add-Content -Path $log -Value ("`n===== {0} restart by qq-boot.ps1 =====" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')) -Encoding UTF8
Set-Location $d
& cmd /c "start-napcat.bat >> `"$log`" 2>&1"
