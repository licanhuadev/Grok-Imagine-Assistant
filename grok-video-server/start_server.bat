@echo off
echo Starting Grok Video Generation Server...
echo.

REM Check if virtual environment exists
if not exist "venv\" (
    echo Creating virtual environment...
    python -m venv venv
    echo.
)

REM Activate virtual environment
echo Activating virtual environment...
call venv\Scripts\activate

REM Install dependencies if needed
echo Checking dependencies...
pip install -q -r requirements.txt

REM Start server
echo.
echo Starting server on http://localhost:8000
echo Press Ctrl+C to stop
echo.

python server.py

pause
