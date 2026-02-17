#!/bin/bash
# Attendance & Payroll Backend Setup Script
# ==========================================

echo "Setting up Attendance & Payroll Backend..."

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is not installed"
    exit 1
fi

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

# Check if PostgreSQL is available
if command -v psql &> /dev/null; then
    echo "PostgreSQL is installed."
    echo "NOTE: Make sure PostgreSQL is running and create the database:"
    echo "  createdb attendance_payroll"
    echo "Or run: psql -c 'CREATE DATABASE attendance_payroll;'"
else
    echo "WARNING: PostgreSQL not found. Please install PostgreSQL and create the database."
fi

echo ""
echo "Setup complete!"
echo "To start the server, run: ./run.sh"
echo ""
echo "Default admin credentials:"
echo "  Email: admin@localhost"
echo "  Password: admin123"
echo ""
echo "WARNING: Please change the default admin password after first login!"
