@echo off
REM Double-click to start the VR ball room. Needs Node.js 22 (https://nodejs.org).
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies - first run only, takes a minute...
  call npm install || goto :err
)
echo.
echo Starting server. Put on the Quest, open the Browser, and go to the
echo "network" https://...:8081 address shown below. Accept the certificate
echo warning once (Advanced, then Proceed), then press Enter XR.
echo If Windows Firewall asks, allow Node on Private networks.
echo.
call npx @iwsdk/cli dev up --no-open
call npx @iwsdk/cli dev status | findstr /C:"https://"
echo.
echo Server is running. Edit files in src\ and reload the page on the Quest.
echo Run "npx @iwsdk/cli dev down" to stop it.
pause
goto :eof
:err
echo Install failed - is Node.js 22 installed?
pause
