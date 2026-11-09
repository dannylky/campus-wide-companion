@echo off
setlocal

echo Stopping MiraBox knob LED effect...
powershell -NoProfile -Command "$p = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'mirabox-knob-led' }; if (-not $p) { Write-Host 'No knob LED process found.' } else { $p | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Host ('Stopped PID ' + $_.ProcessId) } }"

echo.
pause
