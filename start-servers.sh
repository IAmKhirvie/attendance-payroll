#!/bin/bash

# Attendance Payroll System - Start Script
# Run both backend and frontend on local network

FRONTEND_PORT=4000
BACKEND_PORT=8000

echo "Starting Attendance Payroll System..."
echo "========================================"

# Get local IP address
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "localhost")
echo "Local IP: $LOCAL_IP"
echo ""

# Kill any existing processes on the ports
echo "Cleaning up old processes..."
lsof -ti:$BACKEND_PORT | xargs kill -9 2>/dev/null
lsof -ti:$FRONTEND_PORT | xargs kill -9 2>/dev/null
sleep 2

# Start Backend
echo "Starting Backend API..."
cd /Users/icanstudio2/attendance-payroll/backend
source venv/bin/activate
nohup uvicorn app.main:app --host 0.0.0.0 --port $BACKEND_PORT > /tmp/payroll-backend.log 2>&1 &
BACKEND_PID=$!
echo "Backend started (PID: $BACKEND_PID)"

# Wait for backend to be ready
sleep 3

# Start Frontend (using npm run preview for production build)
echo "Starting Frontend..."
cd /Users/icanstudio2/attendance-payroll/frontend
# Build if not built recently
npm run build > /dev/null 2>&1
nohup npm run preview -- --host 0.0.0.0 --port $FRONTEND_PORT > /tmp/payroll-frontend.log 2>&1 &
FRONTEND_PID=$!
echo "Frontend started (PID: $FRONTEND_PID)"

sleep 3

echo ""
echo "========================================"
echo "System is running!"
echo ""
echo "Access from this computer:"
echo "  Frontend: http://localhost:$FRONTEND_PORT"
echo "  Backend:  http://localhost:$BACKEND_PORT"
echo ""
echo "Access from other devices on the network:"
echo "  Frontend: http://$LOCAL_IP:$FRONTEND_PORT"
echo "  Backend:  http://$LOCAL_IP:$BACKEND_PORT"
echo "  API Docs: http://$LOCAL_IP:$BACKEND_PORT/docs"
echo ""
echo "Logs:"
echo "  Backend:  /tmp/payroll-backend.log"
echo "  Frontend: /tmp/payroll-frontend.log"
echo ""
echo "To stop: ./stop-servers.sh"
echo "========================================"
