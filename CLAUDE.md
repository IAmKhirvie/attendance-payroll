# Attendance & Payroll System - Project Context

## XLS Import - Machine Error Fixes

The NGTimereport XLS files from the biometric device have known machine errors that the import automatically fixes:

### 1. Misaligned Rows - Pattern A (Time OUT in OUT column)
**Problem:** When employee forgets to press time_out, the device creates a separate row with no date. Time appears in the OUT column with "Missing IN" note.
```
Row 158: MON, 01/12/2026, 07:37 AM, (empty), "Missing OUT"
Row 159: (empty), (empty), (empty), 09:12 PM, "Missing IN"
```

**Fix:** The import detects this pattern and merges them into one complete record.

### 2. Misaligned Rows - Pattern B (Time OUT in IN column)
**Problem:** Employee presses IN button again instead of OUT. The time_out appears in the IN column with "Missing OUT" note.
```
Row 77: THU, 02/26/2026, 12:51 PM, (empty), "Missing OUT"
Row 78: (empty), (empty), 09:05 PM, (empty), "Missing OUT"
```

**Fix:** The import detects when a row has no date, has time in the IN column, and "Missing OUT" note - it treats this as the time_out for the previous record.

### 3. Duplicate Time IN
**Problem:** Employee presses time_in twice (forgot to press time_out first).
```
Row: 08:00 AM, 08:00 AM (same time in both columns)
```

**Fix:** Keeps as time_in only, marks time_out as missing.

### 4. Work Time Hours
The `work_time` field (e.g., 9.11 hours) includes lunch break. This is correct - employees are still "at work" during lunch.

## Payroll Structure (Philippine)

### Semi-Monthly Cutoffs

| Deduction Type | 1st Cutoff (1-15) | 2nd Cutoff (16-end) |
|----------------|-------------------|---------------------|
| Absences       | ✓                 | ✓                   |
| Lates          | ✓                 | ✓                   |
| Undertime      | ✓                 | ✓                   |
| Loans          | ✓                 | ✗                   |
| Tax            | ✓                 | ✓                   |
| SSS            | ✗                 | ✓                   |
| PhilHealth     | ✗                 | ✓                   |
| Pag-IBIG       | ✗                 | ✓                   |

**Summary:**
- **1st Cutoff (1-15):** Absences, Lates, Loans, Tax
- **2nd Cutoff (16-end):** Absences, Lates, Tax, SSS, PhilHealth, Pag-IBIG (NO loans)

### Earnings (all divided by 2 for semi-monthly)
- Basic Salary / Basic Semi
- Allowance / Semi
- Productivity Incentive / Semi
- Language Incentive / Semi
- Regular Holiday, Regular Holiday OT
- SNWH (Special Non-Working Holiday), SNWH OT
- Overtime

### Attendance Deductions (both cutoffs)
- Absences (days × ICAN daily rate)
- Late/Tardiness (minutes × ICAN minute rate)
- Undertime (minutes × ICAN minute rate)

### Government Contributions (2nd cutoff only)
- SSS - Based on 2024 contribution table (monthly)
- PhilHealth - 5% of monthly basic, split 50/50 (employee pays half)
- Pag-IBIG - 2% employee share, max PHP 200/month

### Loans (1st cutoff only)
- Deducted from active employee loans
- Monthly deduction amount set per loan

### Tax (both cutoffs)
- Withholding tax based on TRAIN Law
- Semi-monthly amount (monthly tax ÷ 2)

### ICAN Salary & Attendance Deduction Formulas

The system uses ICAN Company Policy formulas:

#### Salary Rate Calculation
```
Daily Rate = Basic Monthly × 12 months ÷ 261 days
Hourly Rate = Daily Rate ÷ Work Hours per Day
```

**Examples by work hours:**
- Basic Monthly: ₱8,000
- Daily Rate = ₱8,000 × 12 ÷ 261 = ₱367.82

| Work Hours | Hourly Rate Calculation | Result |
|------------|------------------------|--------|
| 8 hours (Full-time) | ₱367.82 ÷ 8 | ₱45.98 |
| 6 hours (Part-time) | ₱367.82 ÷ 6 | ₱61.30 |
| 4 hours (Part-time) | ₱367.82 ÷ 4 | ₱91.95 |

#### Absence Deduction
```
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
- `work_hours_per_day`: 4, 6, or 8 hours

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
