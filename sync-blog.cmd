@echo off
rem ============================================================
rem  Double-click me to publish your Obsidian blog articles.
rem  (E:\Firefly-hyde  <-  Obsidian "博客" folder  ->  GitHub Pages)
rem ============================================================
cd /d "%~dp0"

echo.
echo [1/2] Syncing Obsidian articles and pushing to GitHub...
echo.
call pnpm sync:push

echo.
echo ------------------------------------------------------------
echo Done. If you saw "already pushed", the site will update in
echo about 2 minutes: https://zht0711.github.io/Firefly-hyde/
echo ------------------------------------------------------------
pause
