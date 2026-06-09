#!/bin/bash

# Attendance Payroll System - Start Script
# Run both backend and frontend on local network

FRONTEND_PORT=4500
BACKEND_PORT=8500

kill_port() {
    local port="$1"
    local pids
    local pid
    local pgid
    local attempt

    for attempt in {1..10}; do
        pids=$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null)
        if [ -z "$pids" ]; then
            return 0
        fi

        echo "Stopping process(es) on port $port: $pids"
        for pid in $pids; do
            pgid=$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ')
            if [ -n "$pgid" ]; then
                kill -- "-$pgid" 2>/dev/null || true
            fi
            kill "$pid" 2>/dev/null || true
        done
        sleep 1

        pids=$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null)
        if [ -n "$pids" ]; then
            for pid in $pids; do
                pgid=$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ')
                if [ -n "$pgid" ]; then
                    kill -9 -- "-$pgid" 2>/dev/null || true
                fi
                kill -9 "$pid" 2>/dev/null || true
            done
            sleep 1
        fi
    done

    pids=$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null)
    if [ -n "$pids" ]; then
        echo "ERROR: port $port is still occupied by: $pids"
        exit 1
    fi
}

require_port() {
    local port="$1"
    local name="$2"
    local attempt

    for attempt in {1..30}; do
        if lsof -tiTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
            return 0
        fi
        sleep 1
    done

    echo "ERROR: $name did not start on port $port"
    exit 1
}

ensure_port_free() {
    local port="$1"
    local name="$2"
    if lsof -tiTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
        echo "ERROR: $name port $port is still occupied before startup"
        exit 1
    fi
}

echo "Starting Attendance Payroll System..."
echo "========================================"

# Get local IP address
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "localhost")
echo "Local IP: $LOCAL_IP"
echo ""

LAUNCHD_DOMAIN="gui/$(id -u)"
BACKEND_JOB="com.ican.attendance-payroll"
FRONTEND_JOB="com.ican.attendance-payroll-frontend"

if launchctl print "$LAUNCHD_DOMAIN/$BACKEND_JOB" >/dev/null 2>&1 && launchctl print "$LAUNCHD_DOMAIN/$FRONTEND_JOB" >/dev/null 2>&1; then
    echo "LaunchAgents detected. Restarting managed services..."

    PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
    cd "$PROJECT_DIR/frontend"
    npm run build > /dev/null 2>&1

    launchctl kickstart -k "$LAUNCHD_DOMAIN/$BACKEND_JOB"
    launchctl kickstart -k "$LAUNCHD_DOMAIN/$FRONTEND_JOB"
    sleep 5

    require_port "$BACKEND_PORT" "Backend"
    require_port "$FRONTEND_PORT" "Frontend"

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
    exit 0
fi

# Kill any existing payroll processes on the ports
echo "Cleaning up old processes..."
kill_port "$BACKEND_PORT"
kill_port "$FRONTEND_PORT"
kill_port 4501
kill_port 4502
ensure_port_free "$BACKEND_PORT" "Backend"
ensure_port_free "$FRONTEND_PORT" "Frontend"

# Project root
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Start Backend
echo "Starting Backend API..."
cd "$PROJECT_DIR/backend"
nohup "$PROJECT_DIR/backend/venv/bin/python" -m uvicorn app.main:app --host 0.0.0.0 --port $BACKEND_PORT > /tmp/payroll-backend.log 2>&1 &
BACKEND_PID=$!
echo "Backend started (PID: $BACKEND_PID)"

# Wait for backend to be ready
sleep 3
require_port "$BACKEND_PORT" "Backend"

# Start Frontend (using npm run preview for production build)
echo "Starting Frontend..."
cd "$PROJECT_DIR/frontend"
# Build if not built recently
npm run build > /dev/null 2>&1
nohup npm run preview -- --host 0.0.0.0 --port $FRONTEND_PORT --strictPort > /tmp/payroll-frontend.log 2>&1 &
FRONTEND_PID=$!
echo "Frontend started (PID: $FRONTEND_PID)"

sleep 3
require_port "$FRONTEND_PORT" "Frontend"

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
