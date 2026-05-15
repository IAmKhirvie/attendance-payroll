#!/bin/bash
# Attendance & Payroll Frontend Run Script
# =========================================

# Get local IP address
LOCAL_IP=$(ifconfig | grep -A5 "en0\|en1" | grep "inet " | awk '{print $2}' | head -1)

echo "Starting Attendance & Payroll Frontend (HTTPS)..."
echo ""
echo "Frontend available at:"
echo "  Local:   https://127.0.0.1:4500"
echo "  Network: https://${LOCAL_IP}:4500"
echo ""
echo "Make sure the backend is running at: https://${LOCAL_IP}:8500"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

npm run dev
