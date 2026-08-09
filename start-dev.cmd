@echo off
setlocal

cd /d "%~dp0"

echo.
echo ========================================
echo   Hnovel - AI Novel Writing Workspace:3
echo ========================================
echo.

if not exist "node_modules" (
  echo [1/3] Installing root dependencies...
  call npm install
  if errorlevel 1 goto error
)

if not exist "server\node_modules" (
  echo [2/3] Installing server dependencies...
  pushd server
  call npm install
  if errorlevel 1 goto error
  popd
)

if not exist "web\node_modules" (
  echo [3/4] Installing web dependencies...
  pushd web
  call npm install
  if errorlevel 1 goto error
  popd
)

if not exist "reader\node_modules" (
  echo [4/4] Installing reader dependencies...
  pushd reader
  call npm install
  if errorlevel 1 goto error
  popd
)

if not exist "server\.env" (
  echo.
  echo [Notice] server\.env does not exist.
  echo          Copy server\.env.example to server\.env and fill LLM_API_KEY before using AI features.
  echo.
)

echo Starting development server...
echo Frontend: http://localhost:3000  (工作台 /，阅读器 /reader)
echo Backend:  http://localhost:4000
echo.
call npm run app
goto end

:error
echo.
echo Failed to start Hnovel. Please check the error above.
pause

:end
endlocal
