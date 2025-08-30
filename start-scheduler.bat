@echo off
echo Starting Sprout Analytics Sequential Scheduler...
echo.
echo This will run both scripts daily at 11:40 PM:
echo 1. simple-analytics.js (first)
echo 2. sprout_april.js (second)
echo.
echo Press Ctrl+C to stop the scheduler
echo.
node schedule-daily-update.js
pause
