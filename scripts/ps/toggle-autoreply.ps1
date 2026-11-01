$sw = "C:\Users\<你的用户名>\.dsh\whale-work\qq-autoreply-switch.txt"
$log = "C:\Users\<你的用户名>\.dsh\whale-work\toggle-autoreply.log"
$cur = "on"
if (Test-Path $sw) { $cur = (Get-Content $sw -Raw).Trim().ToLower() }
if ($cur -eq "off") { $new = "on" } else { $new = "off" }
Set-Content -Path $sw -Value $new -Encoding ASCII
if ($new -eq "on") { $msg = "自动回复：已开启（QQ 私聊会直接进桌宠那条会话）" } else { $msg = "自动回复：已关闭（QQ 私聊我不再接话）" }
"$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') switched to $new" | Out-File -FilePath $log -Append -Encoding UTF8
Add-Type -AssemblyName PresentationFramework
[System.Windows.MessageBox]::Show($msg, "桌宠自动回复") | Out-Null