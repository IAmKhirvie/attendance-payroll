# ICAN Attendance & Payroll System

A web-based attendance and payroll management system designed for ICAN Company. Built with React (Vite) frontend and FastAPI (Python) backend.

## About

This system streamlines the payroll process by importing attendance data from biometric devices and automatically calculating employee salaries, deductions, and benefits according to Philippine labor laws and ICAN company policies.

## Purpose

- **Automate Payroll Processing**: Import attendance from biometric devices (XLS format) and generate payslips automatically
- **Reduce Manual Errors**: Auto-fix common biometric machine errors (misaligned rows, duplicate entries)
- **Philippine Compliance**: Calculate SSS, PhilHealth, Pag-IBIG, and tax deductions according to Philippine regulations
- **Semi-Monthly Payroll**: Support for 1st cutoff (1-15) and 2nd cutoff (16-end of month) pay periods
- **13th Month Pay**: Automatic calculation of mandatory 13th month pay

## Features

### Attendance Management
- Import attendance from NGTimereport XLS files (biometric device export)
- Auto-fix machine errors (missing time-out, duplicate time-in)
- Track absences, late arrivals, and overtime hours
- View and edit attendance records per employee

### Payroll Processing
- Semi-monthly payroll calculation
- Configurable earnings: Basic salary, allowances, incentives
- Government deductions: SSS, PhilHealth, Pag-IBIG, Tax
- Attendance-based deductions using ICAN formula:
  - Daily Rate = Monthly Salary × 12 ÷ 261 days
  - Minute Rate = Daily Rate ÷ Work Hours ÷ 60
- Apply settings to all employees with one click
- Recalculate existing payslips when settings change

### Employee Management
- Individual salary and deduction settings per employee
- Employment status tracking (pending, active, inactive)
- Department and position management

### Reports & Downloads
- Download payslips as PDF or PNG
- Bulk download all payslips (4 per page format)
- Coded filenames for privacy (e.g., REC-GT02-2603A.pdf)
- 13th Month Pay calculation and reports

## Scope and Limitations

### Scope
- ✅ Semi-monthly payroll (Philippine standard)
- ✅ Government-mandated deductions (SSS, PhilHealth, Pag-IBIG)
- ✅ Attendance import from NGTimereport XLS format
- ✅ Basic overtime calculation
- ✅ Holiday pay (Regular & Special Non-Working)
- ✅ 13th Month Pay calculation
- ✅ Multi-device access on local network

### Limitations
- ❌ Does not support weekly or monthly payroll cycles
- ❌ No automatic SSS/PhilHealth/Pag-IBIG contribution table updates (manual configuration required)
- ❌ Single admin account only (no multi-user roles)
- ❌ Local network only (not cloud-hosted)
- ❌ No automatic backup system (manual database backup required)
- ❌ XLS import only (does not support CSV or other formats directly from biometric)
- ❌ No email/SMS notification for payslip release
- ❌ No leave management system
- ❌ No loan tracking/installment system

## Tech Stack

- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS
- **Backend**: FastAPI (Python 3.11+), SQLAlchemy, Pydantic
- **Database**: SQLite
- **PDF Generation**: ReportLab

## Setup Instructions

### Prerequisites

- Node.js 18+
- Python 3.11+
- Git

### 1. Clone the Repository

```bash
git clone https://github.com/IAmKhirvie/attendance-payroll.git
cd attendance-payroll
```

### 2. Backend Setup

```bash
# Navigate to backend
cd backend

# Create virtual environment
python3 -m venv venv

# Activate virtual environment
# On Mac/Linux:
source venv/bin/activate
# On Windows:
venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start the backend server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

The API will be available at `http://localhost:8000`
API Documentation: `http://localhost:8000/docs`

### 3. Frontend Setup

```bash
# Open new terminal, navigate to frontend
cd frontend

# Install dependencies
npm install

# For development
npm run dev -- --host 0.0.0.0

# For production build
npm run build
npm run preview -- --host 0.0.0.0 --port 4000
```

The app will be available at `http://localhost:4000`

### 4. Access from Other Devices (Local Network)

1. Find your computer's IP address:
   ```bash
   # Mac
   ipconfig getifaddr en0

   # Windows
   ipconfig
   ```

2. Access from other devices:
   - Frontend: `http://<your-ip>:4000`
   - API: `http://<your-ip>:8000`

### 5. Quick Start Scripts

```bash
# Start both servers
./start-servers.sh

# Stop both servers
./stop-servers.sh
```

## Default Admin Login

- **Email**: admin@ican.com
- **Password**: admin123

⚠️ **Change the default password after first login!**

## ICAN Payroll Formulas

### Absence Deduction
```
Daily Rate = Monthly Salary × 12 ÷ 261 working days
Absence Deduction = Daily Rate × Days Absent
```

### Tardiness Deduction
```
Minute Rate = Daily Rate ÷ Work Hours ÷ 60
Late Deduction = Minute Rate × Minutes Late
```

### Semi-Monthly Deduction Schedule
| Deduction | 1st Cutoff (1-15) | 2nd Cutoff (16-end) |
|-----------|-------------------|---------------------|
| SSS | ❌ | ✅ |
| PhilHealth | ❌ | ✅ |
| Pag-IBIG | ❌ | ✅ |
| Tax | ✅ (half) | ✅ (half) |
| Loans | ✅ | ✅ |

## Project Structure

```
attendance-payroll/
├── backend/
│   ├── app/
│   │   ├── api/v1/          # API endpoints
│   │   ├── models/          # Database models
│   │   ├── schemas/         # Pydantic schemas
│   │   ├── services/        # Business logic
│   │   └── main.py          # FastAPI app
│   ├── requirements.txt
│   └── venv/
├── frontend/
│   ├── src/
│   │   ├── pages/           # React pages
│   │   ├── components/      # Reusable components
│   │   ├── api/             # API client
│   │   └── stores/          # State management
│   ├── package.json
│   └── vite.config.ts
├── start-servers.sh
├── stop-servers.sh
└── README.md
```

## License

This project is proprietary software developed for ICAN Company.

## Support

For issues and feature requests, please contact the system administrator.
