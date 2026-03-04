@echo off
where node >nul 2>&1 || (echo Error: Node.js is required. >&2 & exit /b 127)
node "%~dp0run-cli-job.js" %*
