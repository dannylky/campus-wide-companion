@echo off
setlocal

echo Stopping animated N4 Pro background compositor...
powershell -NoProfile -Command "$p = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'mirabox-animated-background' }; if (-not $p) { Write-Host 'No compositor process found.' } else { $p | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Host ('Stopped PID ' + $_.ProcessId) } }"

echo.
pause
