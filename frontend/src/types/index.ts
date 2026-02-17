// User types
export type Role = 'admin' | 'employee';
export type UserStatus = 'pending' | 'active' | 'inactive' | 'locked';

export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  role: Role;
  status: UserStatus;
  must_change_password: boolean;
  employee_id?: number;
  created_at: string;
  last_login?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
}

export interface RegisterRequest {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
}

// Department type
export interface Department {
  id: number;
  name: string;
  code: string;
  description?: string;
  is_active: boolean;
}

// Employee types
export type EmployeeStatus = 'pending' | 'active' | 'inactive';

export interface Employee {
  id: number;
  employee_no: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  full_name?: string;
  email?: string;
  phone?: string;
  hire_date: string;
  position?: string;
  department_id?: number;
  department?: Department;
  employment_type: 'regular' | 'probationary' | 'contractual' | 'part_time';
  shift_id?: number;
  basic_salary?: string;
  hourly_rate?: string;
  daily_rate?: string;
  allowance?: string;
  productivity_incentive?: string;
  language_incentive?: string;
  biometric_id?: string;
  // Government contributions
  sss_contribution?: string;
  philhealth_contribution?: string;
  pagibig_contribution?: string;
  tax_amount?: string;
  status?: EmployeeStatus;
  is_active: boolean;
}

// Attendance types
export interface AttendanceRecord {
  id: number;
  employee_id: number;
  date: string;
  time_in?: string;
  time_out?: string;
  status: 'present' | 'absent' | 'late' | 'half_day' | 'leave' | 'holiday';
  late_minutes?: number;
  undertime_minutes?: number;
  overtime_minutes?: number;
  remarks?: string;
}

// Payroll types
export interface PayrollRun {
  id: number;
  period_start: string;
  period_end: string;
  cutoff: number;  // 1 = 1st half (1-15), 2 = 2nd half (16-end)
  status: 'draft' | 'processing' | 'review' | 'approved' | 'locked';
  total_gross?: number;
  total_deductions?: number;
  total_net?: number;
  employee_count?: number;
  run_at?: string;
  run_by?: number;
  approved_at?: string;
  approved_by?: number;
  locked_at?: string;
  locked_by?: number;
}

export interface Payslip {
  id: number;
  payroll_run_id: number;
  employee_id: number;
  basic_pay: number;
  overtime_pay: number;
  night_diff_pay: number;
  holiday_pay: number;
  gross_pay: number;
  sss_deduction: number;
  philhealth_deduction: number;
  pagibig_deduction: number;
  tax_deduction: number;
  other_deductions: number;
  total_deductions: number;
  net_pay: number;
  is_released: boolean;
}

// System settings
export interface SystemSettings {
  company_name: string;
  company_address?: string;
  password_min_length: number;
  password_require_uppercase: boolean;
  password_require_numbers: boolean;
  password_require_special: boolean;
  password_expiry_days: number;
  max_failed_login_attempts: number;
  lockout_duration_minutes: number;
  allow_self_registration: boolean;
  require_approval_for_registration: boolean;
  default_shift_id?: number;
  payroll_day_1: number;
  payroll_day_2: number;
}

// API response types
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface ApiError {
  detail: string;
}
