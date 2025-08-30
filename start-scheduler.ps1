Write-Host "Starting Sprout Analytics Sequential Scheduler..." -ForegroundColor Green
Write-Host ""
Write-Host "This will run both scripts daily at 11:40 PM:" -ForegroundColor Yellow
Write-Host "1. simple-analytics.js (first)" -ForegroundColor Cyan
Write-Host "2. sprout_april.js (second)" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press Ctrl+C to stop the scheduler" -ForegroundColor Red
Write-Host ""

try {
    node schedule-daily-update.js
} catch {
    Write-Host "Error running scheduler: $_" -ForegroundColor Red
}

Write-Host "Press any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
