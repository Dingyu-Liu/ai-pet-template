$ErrorActionPreference = 'Stop'
$log = 'C:\Users\<你的用户名>\.dsh\whale-work\xiaojing-quiet.log'
$helper = 'C:\Users\<你的用户名>\.dsh\whale-work\toggle-quiet.cjs'
$restart = 'C:\Users\<你的用户名>\.dsh\whale-work\restart-dsh.ps1'

function L($m) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $m" | Out-File -FilePath $log -Append -Encoding UTF8 }

function Show-Box($text) {
  try {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show($text, '桌宠') | Out-Null
  } catch { L ('messagebox failed: ' + $_.Exception.Message) }
}

try {
  $out = & node $helper toggle 2>&1
  L ('node: ' + ($out -join ' | '))
  $line = ($out | Where-Object { "$_" -match '^\{' } | Select-Object -Last 1)
  if (-not $line) { throw 'toggle helper returned no json' }
  $s = $line | ConvertFrom-Json

  $tr = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File ' + $restart
  & schtasks.exe /create /tn 'dsh_restart_quiet' /tr $tr /sc once /st 00:00 /f | Out-Null
  & schtasks.exe /run /tn 'dsh_restart_quiet' | Out-Null
  L ('restart scheduled: mute=' + $s.mute + ' groupPolicy=' + $s.groupPolicy + ' dmPolicy=' + $s.dmPolicy + ' biliComment=' + $s.biliListenComment)

  if ($s.mute) {
    Show-Box ("桌宠闭嘴啦。`n`nQQ 不再自动回复，B 站也不再自动说话。`nDSH 宿主几十秒后自己重启生效，不用管它。`n再点一次这个按钮就恢复。")
  } else {
    Show-Box ("桌宠恢复说话啦。`n`nQQ 和 B 站都会重新自动回应。`nDSH 宿主几十秒后自己重启生效。")
  }
} catch {
  L ('ERROR ' + $_.Exception.Message)
  Show-Box ('出错了：' + $_.Exception.Message)
}
