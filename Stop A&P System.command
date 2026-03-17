#!/bin/bash

# =============================================
# Attendance & Payroll System - Stop Script
# Double-click this file to stop the system
# =============================================

FRONTEND_PORT=4000
BACKEND_PORT=8000

clear
echo "=============================================="
echo "   Stopping Attendance & Payroll System"
echo "=============================================="
echo ""

# Kill processes on the ports
echo "Stopping Backend (port $BACKEND_PORT)..."
lsof -ti:$BACKEND_PORT | xargs kill -9 2>/dev/null && echo "  Backend stopped." || echo "  Backend was not running."

echo "Stopping Frontend (port $FRONTEND_PORT)..."
lsof -ti:$FRONTEND_PORT | xargs kill -9 2>/dev/null && echo "  Frontend stopped." || echo "  Frontend was not running."

echo ""
echo "=============================================="
echo "   System has been stopped."
echo "=============================================="
echo ""
echo "Press Enter to close this window..."
read
