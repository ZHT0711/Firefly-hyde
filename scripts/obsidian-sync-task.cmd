@echo off
rem Obsidian blog auto-sync entry, called by Windows Task Scheduler every 15 min.
cd /d "E:\Firefly-hyde"
if exist "E:\Firefly-hyde\scripts\sync.log" (
    for %%A in ("E:\Firefly-hyde\scripts\sync.log") do (
        if %%~zA gtr 2097152 del "E:\Firefly-hyde\scripts\sync.log"
    )
)
node scripts\sync-obsidian.mjs --push >> "E:\Firefly-hyde\scripts\sync.log" 2>&1
