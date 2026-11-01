$exe = 'C:\Users\<你的用户名>\AppData\Local\Programs\DeepSeek Harness\DeepSeek Harness.exe'
$log = 'C:\Users\<你的用户名>\.dsh\whale-work\restart-dsh.log'
function L($m) { "$(Get-Date -Format 'HH:mm:ss') $m" | Out-File -FilePath $log -Append -Encoding UTF8 }
L 'scheduled restart started'
Start-Sleep -Seconds 8
try { Stop-Process -Name 'DeepSeek Harness' -Force -ErrorAction Stop; L 'killed host' } catch { L "kill error: $($_.Exception.Message)" }
Start-Sleep -Seconds 5
try { Start-Process $exe; L 'launched host' } catch { L "launch error: $($_.Exception.Message)" }
Start-Sleep -Seconds 45
if (-not (Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue)) {
  try { Start-Process $exe; L 'retry launched host' } catch { L "retry error: $($_.Exception.Message)" }
  Start-Sleep -Seconds 40
} else { L 'host running' }
$conn = Get-NetTCPConnection -RemotePort 3002 -State Established -ErrorAction SilentlyContinue
if ($conn) { L ("ws3002 established: " + (($conn | ForEach-Object { "$($_.LocalPort)->$($_.RemotePort)" }) -join ',')) } else { L 'ws3002 NOT connected' }
