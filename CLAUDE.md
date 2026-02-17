# Attendance & Payroll System - Project Context

## XLS Import - Machine Error Fixes

The NGTimereport XLS files from the biometric device have known machine errors that the import automatically fixes:

### 1. Misaligned Rows (Time OUT on separate row)
**Problem:** When employee forgets to press time_out, the device creates a separate row with no date.
```
Row 158: MON, 01/12/2026, 07:37 AM, (empty), "Missing OUT"
Row 159: (empty), (empty), (empty), 09:12 PM, "Missing IN"
```

**Fix:** The import detects this pattern and merges them into one complete record.

### 2. Duplicate Time IN
**Problem:** Employee presses time_in twice (forgot to press time_out first).
```
Row: 08:00 AM, 08:00 AM (same time in both columns)
```

**Fix:** Keeps as time_in only, marks time_out as missing.

### 3. Work Time Hours
The `work_time` field (e.g., 9.11 hours) includes lunch break. This is correct - employees are still "at work" during lunch.

## Payroll Structure (Philippine)

### Semi-Monthly Cutoffs
- **1st Cutoff (1-15):** Deducts only loans and tax
- **2nd Cutoff (16-end):** Deducts SSS, PhilHealth, Pag-IBIG, and tax

### Earnings (all divided by 2 for semi-monthly)
- Basic Salary / Basic Semi
- Allowance / Semi
- Productivity Incentive / Semi
- Language Incentive / Semi
- Regular Holiday, Regular Holiday OT
- SNWH (Special Non-Working Holiday), SNWH OT
- Overtime
- Absences/Late deductions (hours & minutes with amount)

### Government Deductions (2nd cutoff only)
- SSS - Based on 2024 contribution table
- PhilHealth - 5% of monthly basic, split 50/50
- Pag-IBIG - 2% employee share, max PHP 200

### ICAN Attendance Deduction Formulas

The system uses ICAN Company Policy formulas for calculating attendance-based deductions:

#### Absence Deduction
```
Daily Rate = Monthly Salary × 12 months ÷ 261 days
Absence Deduction = Daily Rate × Number of Absent Days
```

**Example:**
- Monthly Salary: ₱20,000
- Daily Rate = ₱20,000 × 12 ÷ 261 = ₱919.54
- 2 days absent = ₱919.54 × 2 = ₱1,839.08

#### Tardiness/Undertime Deduction
```
Minute Rate = Daily Rate ÷ Hours worked per day ÷ 60 minutes
Late/Undertime Deduction = Minute Rate × Total Minutes
```

**Example:**
- Daily Rate: ₱919.54
- Work Hours: 8 hours/day
- Minute Rate = ₱919.54 ÷ 8 ÷ 60 = ₱1.92
- 30 minutes late = ₱1.92 × 30 = ₱57.50

#### Configuration
- `use_ican_formula`: Enabled by default in PayrollSettings
- `working_days_per_year`: 261 (ICAN standard)
- `work_hours_per_day`: 8 hours

### Currency
All amounts in Philippine Peso (PHP), not USD.

## Employee Status Flow
1. Import attendance → Employee auto-created with "pending" status
2. Admin verifies employee → Status changed to "active"
3. Only "active" employees included in payroll

## 13th Month Pay (Philippine Requirement)

### Calculation
- Formula: Total Basic Salary Earned in Year ÷ 12
- Applies to employees who worked at least 1 month
- Must be paid on or before December 24 each year
- First ₱90,000 is tax-exempt

### How to Use
1. Go to Payroll → 13th Month Pay tab
2. Select the year
3. Click "Calculate 13th Month" to generate records
4. Review the amounts
5. Click "Release to Employees" when ready

## Payslip PDF Generation

Payslips can be downloaded as PDF:
- From payslip detail view: Click "Print/Download PDF" button
- From payslips list: Click "PDF" link for each row
- From 13th Month Pay tab: Click "Download PDF" for each record

## Running the Server
```bash
cd /Users/icanstudio2/attendance-payroll/backend
source venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Running the Frontend
```bash
cd /Users/icanstudio2/attendance-payroll/frontend
npm run dev
```

## Network Access (Other Devices)

### Finding Your IP Address
```bash
# On Mac
ipconfig getifaddr en0

# Or use
ifconfig | grep "inet " | grep -v 127.0.0.1
```

### Accessing from Other Devices
1. Backend API: `http://<your-ip>:8000`
2. Frontend: `https://<your-ip>:3000` (or whichever port Vite uses)

Note: HTTPS is required for the frontend. You may need to accept the self-signed certificate warning in your browser.

### Example
If your IP is 192.168.68.225:
- Frontend: https://192.168.68.225:3000
- API: http://192.168.68.225:8000
- API Docs: http://192.168.68.225:8000/docs
