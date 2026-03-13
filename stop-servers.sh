#!/bin/bash

# Attendance Payroll System - Stop Script

FRONTEND_PORT=4000
BACKEND_PORT=8000

echo "Stopping Attendance Payroll System..."

# Kill processes on the ports
lsof -ti:$BACKEND_PORT | xargs kill -9 2>/dev/null && echo "Backend stopped" || echo "Backend was not running"
lsof -ti:$FRONTEND_PORT | xargs kill -9 2>/dev/null && echo "Frontend stopped" || echo "Frontend was not running"

echo "Done!"
