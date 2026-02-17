#!/bin/bash
cd /Users/icanstudio2/attendance-payroll/backend
source venv/bin/activate
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
