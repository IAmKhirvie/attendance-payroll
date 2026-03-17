#!/bin/bash

# =============================================
# Attendance & Payroll System - First Time Setup
# Run this ONCE when moving to a new device
# =============================================

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

clear
echo "=============================================="
echo "   A&P System - First Time Setup"
echo "=============================================="
echo ""
echo "This will install all required dependencies."
echo "Make sure you have the following installed:"
echo "  - Python 3.8+"
echo "  - Node.js 18+"
echo ""
read -p "Press Enter to continue or Ctrl+C to cancel..."
echo ""

# Setup Backend
echo "=============================================="
echo "Setting up Backend..."
echo "=============================================="
cd "$SCRIPT_DIR/backend"

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "ERROR: Python 3 is not installed!"
    echo "Please install Python 3.8+ first."
    read -p "Press Enter to exit..."
    exit 1
fi

echo "Creating Python virtual environment..."
python3 -m venv venv

echo "Activating virtual environment..."
source venv/bin/activate

echo "Installing Python dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

echo ""
echo "Backend setup complete!"
echo ""

# Setup Frontend
echo "=============================================="
echo "Setting up Frontend..."
echo "=============================================="
cd "$SCRIPT_DIR/frontend"

# Check Node
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed!"
    echo "Please install Node.js 18+ first."
    read -p "Press Enter to exit..."
    exit 1
fi

echo "Installing Node.js dependencies..."
npm install

echo "Building frontend..."
npm run build

echo ""
echo "Frontend setup complete!"
echo ""

echo "=============================================="
echo "   SETUP COMPLETE!"
echo "=============================================="
echo ""
echo "You can now run 'Launch A&P System.command'"
echo "to start the system."
echo ""
read -p "Press Enter to close..."
