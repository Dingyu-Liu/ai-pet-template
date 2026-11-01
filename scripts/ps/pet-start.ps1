# 桌宠启动 —— 拉起 QQ 机器人（NapCat）与 DSH 宿主
$ErrorActionPreference = 'SilentlyContinue'
$log = 'C:\Users\<你的用户名>\.dsh\whale-work\xiaojing-start.log'
function L($m) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $m" | Out-File -FilePath $log -Append -Encoding UTF8 }

$napcatDir = 'C:\Users\<你的用户名>\Documents\dsh-qq\NapCat.Shell'
$dshExe = 'C:\Users\<你的用户名>\AppData\Local\Programs\DeepSeek Harness\DeepSeek Harness.exe'

$napcat = Get-Process | Where-Object { $_.Path -like '*dsh-qq*' }
if (-not $napcat) {
  Start-Process cmd -ArgumentList '/c', (Join-Path $napcatDir 'start-napcat.bat') -WorkingDirectory $napcatDir -WindowStyle Minimized
  L 'napcat started'
} else { L "napcat already running ($((($napcat | ForEach-Object Id) -join ',')))" }

if (-not (Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue)) {
  Start-Process $dshExe
  L 'dsh started'
} else { L 'dsh already running' }

# 有二维码就顺手打开，省得去翻目录
Start-Sleep -Seconds 12
$qr = Join-Path $napcatDir 'versions\9.9.33-52230\resources\app\napcat\cache\qrcode.png'
$port3002 = Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue
if ($port3002) { L 'ws 3002 listening' } else {
  if (Test-Path $qr) { Start-Process $qr; L 'qr opened' } else { L 'no qr yet' }
}
