#!/bin/bash
# Attendance & Payroll Backend Run Script
# ========================================

# Activate virtual environment
if [ -d "venv" ]; then
    source venv/bin/activate
else
    echo "Error: Virtual environment not found. Run setup.sh first."
    exit 1
fi

# Get local IP address
LOCAL_IP=$(ifconfig | grep -A5 "en0\|en1" | grep "inet " | awk '{print $2}' | head -1)

echo "Starting Attendance & Payroll Backend (HTTPS)..."
echo ""
echo "Server available at:"
echo "  Local:   https://127.0.0.1:8000"
echo "  Network: https://${LOCAL_IP}:8000"
echo ""
echo "API Documentation: https://${LOCAL_IP}:8000/docs"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Run the server with HTTPS
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload \
    --ssl-keyfile=../certs/key.pem --ssl-certfile=../certs/cert.pem
