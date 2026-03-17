#!/bin/bash

# =============================================
# Attendance & Payroll System Launcher
# Double-click this file to start the system
# =============================================

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

FRONTEND_PORT=4000
BACKEND_PORT=8000

clear
echo "=============================================="
echo "   Attendance & Payroll System Launcher"
echo "=============================================="
echo ""

# Get local IP address (works on Mac)
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "localhost")
echo "Your Local IP: $LOCAL_IP"
echo ""

# Check if Python virtual environment exists
if [ ! -d "$SCRIPT_DIR/backend/venv" ]; then
    echo "ERROR: Python virtual environment not found!"
    echo "Please run the following first:"
    echo "  cd $SCRIPT_DIR/backend"
    echo "  python3 -m venv venv"
    echo "  source venv/bin/activate"
    echo "  pip install -r requirements.txt"
    echo ""
    echo "Press any key to exit..."
    read -n 1
    exit 1
fi

# Check if node_modules exists
if [ ! -d "$SCRIPT_DIR/frontend/node_modules" ]; then
    echo "ERROR: Node modules not found!"
    echo "Please run the following first:"
    echo "  cd $SCRIPT_DIR/frontend"
    echo "  npm install"
    echo ""
    echo "Press any key to exit..."
    read -n 1
    exit 1
fi

# Kill any existing processes on the ports
echo "Cleaning up old processes..."
lsof -ti:$BACKEND_PORT | xargs kill -9 2>/dev/null
lsof -ti:$FRONTEND_PORT | xargs kill -9 2>/dev/null
sleep 2

# Start Backend
echo "Starting Backend API..."
cd "$SCRIPT_DIR/backend"
source venv/bin/activate
nohup uvicorn app.main:app --host 0.0.0.0 --port $BACKEND_PORT > /tmp/payroll-backend.log 2>&1 &
BACKEND_PID=$!
echo "  Backend started (PID: $BACKEND_PID)"

# Wait for backend to be ready
sleep 3

# Start Frontend
echo "Starting Frontend..."
cd "$SCRIPT_DIR/frontend"
npm run build > /dev/null 2>&1
nohup npm run preview -- --host 0.0.0.0 --port $FRONTEND_PORT > /tmp/payroll-frontend.log 2>&1 &
FRONTEND_PID=$!
echo "  Frontend started (PID: $FRONTEND_PID)"

sleep 3

echo ""
echo "=============================================="
echo "   SYSTEM IS RUNNING!"
echo "=============================================="
echo ""
echo "Open in browser:"
echo ""
echo "  From THIS computer:"
echo "    http://localhost:$FRONTEND_PORT"
echo ""
echo "  From OTHER devices on the network:"
echo "    http://$LOCAL_IP:$FRONTEND_PORT"
echo ""
echo "  API Documentation:"
echo "    http://$LOCAL_IP:$BACKEND_PORT/docs"
echo ""
echo "=============================================="
echo ""
echo "To STOP the system, close this window or run:"
echo "  $SCRIPT_DIR/stop-servers.sh"
echo ""
echo "Press Ctrl+C or close this window to exit"
echo "(The servers will keep running in the background)"
echo ""

# Keep the window open
read -p "Press Enter to close this window..."
