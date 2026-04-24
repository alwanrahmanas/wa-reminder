@echo off
title BPS WhatsApp Reminder Bot
color 0A

echo ========================================
echo   BPS WhatsApp Reminder Bot
echo   Auto-Start Script
echo ========================================
echo.

:: Set working directory
cd /d "c:\Users\Acer\Downloads\kodingan-alwan\fix-timeline-kerja\wa-reminder"

:: Set Node.js path
set PATH=C:\Program Files\nodejs;%PATH%

echo [%date% %time%] Starting bot...
echo.

:: Run the bot (will keep running for scheduler)
"C:\Program Files\nodejs\node.exe" index.js

:: If bot crashes, wait and restart
echo.
echo [%date% %time%] Bot stopped unexpectedly. Restarting in 10 seconds...
timeout /t 10 /nobreak
goto :restart

:restart
echo [%date% %time%] Restarting bot...
"C:\Program Files\nodejs\node.exe" index.js
echo.
echo [%date% %time%] Bot stopped again. Restarting in 10 seconds...
timeout /t 10 /nobreak
goto :restart
