import axios from 'axios';
import type {
  LoginRequest, LoginResponse, RegisterRequest, User,
  Employee, AttendanceRecord, PayrollRun, Payslip, SystemSettings,
  PaginatedResponse
} from '../types';

// API base URL - relative for same-origin, or dynamic for dev
const API_BASE_URL = '/api/v1';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor for token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Skip refresh logic for auth routes (login, register, etc.)
    const isAuthRoute = originalRequest?.url?.startsWith('/auth/');

    // If 401, not an auth route, and not already retrying, try to refresh token
    if (error.response?.status === 401 && !isAuthRoute && !originalRequest._retry) {
      originalRequest._retry = true;

      const refreshToken = localStorage.getItem('refresh_token');
      if (refreshToken) {
        try {
          const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
            refresh_token: refreshToken,
          });

          const { access_token, refresh_token: newRefreshToken } = response.data;
          localStorage.setItem('access_token', access_token);
          localStorage.setItem('refresh_token', newRefreshToken);

          originalRequest.headers.Authorization = `Bearer ${access_token}`;
          return api(originalRequest);
        } catch (refreshError) {
          // Refresh failed, clear tokens and redirect to login
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          window.location.href = '/login';
          return Promise.reject(refreshError);
        }
      }
    }

    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
  login: async (data: LoginRequest): Promise<LoginResponse> => {
    const response = await api.post('/auth/login', data);
    return response.data;
  },

  register: async (data: RegisterRequest): Promise<{ message: string }> => {
    const response = await api.post('/auth/register', data);
    return response.data;
  },

  logout: async (): Promise<void> => {
    await api.post('/auth/logout');
  },

  me: async (): Promise<User> => {
    const response = await api.get('/auth/me');
    return response.data;
  },

  changePassword: async (currentPassword: string, newPassword: string): Promise<{ message: string }> => {
    const response = await api.post('/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    });
    return response.data;
  },
};

// Users API (Admin)
export const usersApi = {
  list: async (params?: { page?: number; status?: string }): Promise<PaginatedResponse<User>> => {
    const response = await api.get('/users', { params });
    return response.data;
  },

  getById: async (id: number): Promise<User> => {
    const response = await api.get(`/users/${id}`);
    return response.data;
  },

  create: async (data: Partial<User> & { password: string }): Promise<User> => {
    const response = await api.post('/users', data);
    return response.data;
  },

  update: async (id: number, data: Partial<User>): Promise<User> => {
    const response = await api.patch(`/users/${id}`, data);
    return response.data;
  },

  approve: async (id: number): Promise<{ message: string }> => {
    const response = await api.post(`/users/${id}/approve`);
    return response.data;
  },

  reject: async (id: number, reason?: string): Promise<{ message: string }> => {
    const response = await api.post(`/users/${id}/reject`, { reason });
    return response.data;
  },

  resetPassword: async (id: number): Promise<{ temp_password: string }> => {
    const response = await api.post(`/users/${id}/reset-password`);
    return response.data;
  },
};

// Employees API
export const employeesApi = {
  list: async (params?: {
    page?: number;
    page_size?: number;
    search?: string;
    status?: string;
    sort_by?: string;
    sort_order?: string;
  }): Promise<PaginatedResponse<Employee>> => {
    const response = await api.get('/employees', { params });
    return response.data;
  },

  getById: async (id: number): Promise<Employee> => {
    const response = await api.get(`/employees/${id}`);
    return response.data;
  },

  create: async (data: Partial<Employee>): Promise<Employee> => {
    const response = await api.post('/employees', data);
    return response.data;
  },

  update: async (id: number, data: Partial<Employee>): Promise<Employee> => {
    const response = await api.patch(`/employees/${id}`, data);
    return response.data;
  },

  verify: async (id: number): Promise<{ message: string }> => {
    const response = await api.post(`/employees/${id}/verify`);
    return response.data;
  },

  verifyAll: async (): Promise<{ message: string }> => {
    const response = await api.post('/employees/verify-all');
    return response.data;
  },

  syncUsers: async (): Promise<{ message: string; created: number; skipped: number; temp_password: string }> => {
    const response = await api.post('/employees/sync-users');
    return response.data;
  },

  getWithoutUsers: async (): Promise<{
    without_users: Array<{ id: number; employee_no: string; full_name: string; email?: string }>;
    with_users: Array<{ id: number; employee_no: string; full_name: string; user_email: string }>;
    total_without: number;
    total_with: number;
  }> => {
    const response = await api.get('/employees/without-users');
    return response.data;
  },
};

// Attendance API
export const attendanceApi = {
  list: async (params?: {
    page?: number;
    employee_id?: number;
    date_from?: string;
    date_to?: string;
  }): Promise<PaginatedResponse<AttendanceRecord>> => {
    const response = await api.get('/attendance', { params });
    return response.data;
  },

  import: async (file: File, periodStart: string, periodEnd: string): Promise<{ message: string; imported: number }> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('period_start', periodStart);
    formData.append('period_end', periodEnd);

    const response = await api.post('/attendance/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  previewEmployees: async (file: File): Promise<{
    filename: string;
    total_records: number;
    total_employees: number;
    new_employees: Array<{ name: string; biometric_id?: string; record_count: number }>;
    existing_employees: Array<{ name: string; biometric_id?: string; record_count: number; existing_employee_no: string }>;
    new_count: number;
    existing_count: number;
  }> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post('/attendance/preview-employees', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  getSummary: async (employeeId: number, month: number, year: number): Promise<{
    total_days: number;
    present_days: number;
    absent_days: number;
    late_count: number;
    total_late_minutes: number;
    total_overtime_minutes: number;
  }> => {
    const response = await api.get(`/attendance/summary/${employeeId}`, {
      params: { month, year },
    });
    return response.data;
  },
};

// Payroll API
export const payrollApi = {
  // Payroll runs
  listRuns: async (params?: { page?: number; status?: string }): Promise<PaginatedResponse<PayrollRun>> => {
    const response = await api.get('/payroll/runs', { params });
    return response.data;
  },

  createRun: async (periodStart: string, periodEnd: string, cutoff: number = 1): Promise<PayrollRun> => {
    const response = await api.post('/payroll/runs', {
      period_start: periodStart,
      period_end: periodEnd,
      cutoff: cutoff,
    });
    return response.data;
  },

  processRun: async (runId: number): Promise<{ message: string }> => {
    const response = await api.post(`/payroll/runs/${runId}/process`);
    return response.data;
  },

  lockRun: async (runId: number): Promise<{ message: string }> => {
    const response = await api.post(`/payroll/runs/${runId}/lock`);
    return response.data;
  },

  releaseRun: async (runId: number): Promise<{ message: string }> => {
    const response = await api.post(`/payroll/runs/${runId}/release`);
    return response.data;
  },

  recalculateRun: async (runId: number): Promise<{
    message: string;
    updated_count: number;
    total_gross: number;
    total_deductions: number;
    total_net: number;
  }> => {
    const response = await api.post(`/payroll/runs/${runId}/recalculate`);
    return response.data;
  },

  // Payslips
  listPayslips: async (params?: {
    page?: number;
    payroll_run_id?: number;
    employee_id?: number;
  }): Promise<PaginatedResponse<Payslip>> => {
    const response = await api.get('/payroll/payslips', { params });
    return response.data;
  },

  getPayslip: async (id: number): Promise<Payslip & {
    employee_name?: string;
    employee_no?: string;
    period_start?: string;
    period_end?: string;
    earnings?: Record<string, number>;
    deductions?: Record<string, number>;
    total_earnings?: number;
    days_worked?: number;
    days_absent?: number;
    late_count?: number;
    total_late_minutes?: number;
    overtime_hours?: number;
  }> => {
    const response = await api.get(`/payroll/payslips/${id}`);
    return response.data;
  },

  getPayslipAttendance: async (payslipId: number): Promise<{
    period_start: string;
    period_end: string;
    records: Array<{
      id: number;
      date: string;
      time_in: string | null;
      time_out: string | null;
      worked_hours: number;
      late_minutes: number;
      overtime_minutes: number;
      status: string;
    }>;
    summary: {
      total_days: number;
      present_days: number;
      absent_days: number;
      late_count: number;
      total_late_minutes: number;
      total_overtime_minutes: number;
      total_overtime_hours: number;
    };
  }> => {
    const response = await api.get(`/payroll/payslips/${payslipId}/attendance`);
    return response.data;
  },

  updatePayslipEarnings: async (id: number, earnings: Record<string, number>): Promise<{ message: string; total_earnings: number; net_pay: number }> => {
    const response = await api.patch(`/payroll/payslips/${id}/earnings`, earnings);
    return response.data;
  },

  updatePayslipDeductions: async (id: number, deductions: Record<string, number>): Promise<{ message: string; total_deductions: number; net_pay: number }> => {
    const response = await api.patch(`/payroll/payslips/${id}/deductions`, deductions);
    return response.data;
  },

  updatePayslipAttendance: async (id: number, attendance: { days_worked?: number; days_absent?: number; late_count?: number; total_late_minutes?: number; overtime_hours?: number; recalculate_deductions?: boolean }): Promise<{ message: string; days_worked: number; days_absent: number; total_deductions: number; net_pay: number; preset_saved?: boolean; preset_message?: string }> => {
    const response = await api.patch(`/payroll/payslips/${id}/attendance`, attendance);
    return response.data;
  },

  // Deduction configs
  listDeductions: async (): Promise<{ id: number; code: string; name: string; is_enabled: boolean }[]> => {
    const response = await api.get('/payroll/deductions');
    return response.data;
  },

  // Payroll Settings
  getSettings: async (): Promise<{
    id: number;
    absent_rate_per_day: number;
    late_rate_per_minute: number;
    late_rate_per_incident: number;
    undertime_rate_per_minute: number;
    late_grace_minutes: number;
    default_sss: number;
    default_philhealth: number;
    default_pagibig: number;
    default_tax: number;
    overtime_rate: number;
    night_diff_rate: number;
    holiday_rate: number;
    special_holiday_rate: number;
    work_hours_per_day: number;
    work_days_per_month: number;
  }> => {
    const response = await api.get('/payroll/settings');
    return response.data;
  },

  updateSettings: async (data: Partial<{
    default_basic_salary: number;
    absent_rate_per_day: number;
    late_rate_per_minute: number;
    late_rate_per_incident: number;
    undertime_rate_per_minute: number;
    late_grace_minutes: number;
    default_sss: number;
    default_philhealth: number;
    default_pagibig: number;
    default_tax: number;
    overtime_rate: number;
    night_diff_rate: number;
    holiday_rate: number;
    special_holiday_rate: number;
    work_hours_per_day: number;
    work_days_per_month: number;
  }>): Promise<{ message: string }> => {
    const response = await api.patch('/payroll/settings', data);
    return response.data;
  },

  applySettingsToAll: async (
    confirmationCode: string,
    options: {
      apply_basic_salary?: boolean;
      apply_sss?: boolean;
      apply_philhealth?: boolean;
      apply_pagibig?: boolean;
      apply_tax?: boolean;
    }
  ): Promise<{
    success: boolean;
    message: string;
    updated_count: number;
    fields_applied: string[];
  }> => {
    const response = await api.post('/payroll/settings/apply-to-all', null, {
      params: {
        confirmation_code: confirmationCode,
        ...options,
      },
    });
    return response.data;
  },

  // 13th Month Pay
  list13thMonth: async (year?: number): Promise<{
    items: Array<{
      id: number;
      employee_id: number;
      employee_name: string;
      employee_no: string;
      year: number;
      total_basic_earned: number;
      months_worked: number;
      amount: number;
      is_released: boolean;
      released_at: string | null;
      created_at: string;
    }>;
    total: number;
  }> => {
    const response = await api.get('/payroll/13th-month', { params: { year } });
    return response.data;
  },

  calculate13thMonth: async (year: number): Promise<{
    message: string;
    year: number;
    employee_count: number;
    total_amount: number;
    records: Array<{
      employee_id: number;
      employee_name: string;
      employee_no: string;
      total_basic_earned: number;
      months_worked: number;
      amount: number;
    }>;
  }> => {
    const response = await api.post('/payroll/13th-month/calculate', null, { params: { year } });
    return response.data;
  },

  release13thMonth: async (year: number): Promise<{ message: string }> => {
    const response = await api.post('/payroll/13th-month/release', null, { params: { year } });
    return response.data;
  },

  // PDF Downloads - uses coded filenames from server
  downloadPayslipPdf: async (payslipId: number): Promise<void> => {
    const response = await api.get(`/payroll/payslips/${payslipId}/pdf`, {
      responseType: 'blob',
    });
    // Extract filename from Content-Disposition header
    const contentDisposition = response.headers['content-disposition'];
    const filenameMatch = contentDisposition?.match(/filename=(.+)/);
    const filename = filenameMatch ? filenameMatch[1] : `REC-${payslipId}.pdf`;

    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  downloadPayslipPng: async (payslipId: number): Promise<void> => {
    const response = await api.get(`/payroll/payslips/${payslipId}/png`, {
      responseType: 'blob',
    });
    // Extract filename from Content-Disposition header
    const contentDisposition = response.headers['content-disposition'];
    const filenameMatch = contentDisposition?.match(/filename=(.+)/);
    const filename = filenameMatch ? filenameMatch[1] : `REC-${payslipId}.png`;

    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  getPayslipsPageCount: async (runId: number): Promise<{ count: number; pages: number }> => {
    const response = await api.get(`/payroll/runs/${runId}/payslips-count`);
    return response.data;
  },

  downloadPayslipsSheet: async (runId: number, page: number): Promise<void> => {
    const response = await api.get(`/payroll/runs/${runId}/payslips-sheet`, {
      params: { page },
      responseType: 'blob',
    });
    // Extract filename from Content-Disposition header
    const contentDisposition = response.headers['content-disposition'];
    const filenameMatch = contentDisposition?.match(/filename=(.+)/);
    const filename = filenameMatch ? filenameMatch[1] : `BATCH-P${page}.png`;

    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  download13thMonthPdf: async (recordId: number): Promise<void> => {
    const response = await api.get(`/payroll/13th-month/${recordId}/pdf`, {
      responseType: 'blob',
    });
    // Extract filename from Content-Disposition header
    const contentDisposition = response.headers['content-disposition'];
    const filenameMatch = contentDisposition?.match(/filename=(.+)/);
    const filename = filenameMatch ? filenameMatch[1] : `BONUS-${recordId}.pdf`;

    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  // Payroll Import
  downloadPayrollTemplate: async (): Promise<void> => {
    const response = await api.get('/payroll/import/template', {
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'payroll_template.xlsx');
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  previewPayrollImport: async (file: File): Promise<{
    success: boolean;
    message: string;
    total_records: number;
    matched: number;
    not_matched: number;
    warnings: string[];
    records: Array<{
      row_number: number;
      employee_no: string;
      employee_name: string;
      basic_salary: number;
      matched: boolean;
      matched_employee_id: number | null;
      matched_employee_name: string | null;
    }>;
  }> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post('/payroll/import/preview', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  importPayroll: async (
    file: File,
    periodStart?: string,
    periodEnd?: string,
    cutoff?: number,
    autoCreateEmployees: boolean = true
  ): Promise<{
    success: boolean;
    message: string;
    payroll_run_id: number;
    payslips_created: number;
    not_found: Array<{ row: number; employee_no: string; employee_name: string }>;
    errors: Array<{ row: number; employee_no: string; error: string }>;
    warnings: string[];
    totals: { gross: number; deductions: number; net: number };
  }> => {
    const formData = new FormData();
    formData.append('file', file);
    // Only append period if provided (otherwise auto-detect from file)
    if (periodStart) formData.append('period_start', periodStart);
    if (periodEnd) formData.append('period_end', periodEnd);
    if (cutoff && cutoff > 0) formData.append('cutoff', cutoff.toString());
    formData.append('auto_create_employees', autoCreateEmployees.toString());

    const response = await api.post('/payroll/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  // Contribution Tables (Government Rates)
  listContributionTables: async (params?: {
    contribution_type?: string;
    year?: number;
    include_inactive?: boolean;
  }): Promise<{
    items: Array<{
      id: number;
      contribution_type: string;
      effective_year: number;
      name: string;
      description: string | null;
      brackets: Record<string, unknown>;
      is_active: boolean;
      created_at: string;
      updated_at: string | null;
    }>;
    total: number;
  }> => {
    const response = await api.get('/payroll/contributions', { params });
    return response.data;
  },

  getContributionTable: async (tableId: number): Promise<{
    id: number;
    contribution_type: string;
    effective_year: number;
    name: string;
    description: string | null;
    brackets: Record<string, unknown>;
    is_active: boolean;
    created_at: string;
    updated_at: string | null;
  }> => {
    const response = await api.get(`/payroll/contributions/${tableId}`);
    return response.data;
  },

  createContributionTable: async (data: {
    contribution_type: string;
    effective_year: number;
    name: string;
    description?: string;
    brackets: Record<string, unknown>;
    is_active?: boolean;
  }): Promise<{
    id: number;
    contribution_type: string;
    effective_year: number;
    name: string;
    description: string | null;
    brackets: Record<string, unknown>;
    is_active: boolean;
    created_at: string;
    updated_at: string | null;
  }> => {
    const response = await api.post('/payroll/contributions', data);
    return response.data;
  },

  updateContributionTable: async (tableId: number, data: {
    name?: string;
    description?: string;
    brackets?: Record<string, unknown>;
    is_active?: boolean;
  }): Promise<{
    id: number;
    contribution_type: string;
    effective_year: number;
    name: string;
    description: string | null;
    brackets: Record<string, unknown>;
    is_active: boolean;
    created_at: string;
    updated_at: string | null;
  }> => {
    const response = await api.patch(`/payroll/contributions/${tableId}`, data);
    return response.data;
  },

  deleteContributionTable: async (tableId: number): Promise<{ message: string }> => {
    const response = await api.delete(`/payroll/contributions/${tableId}`);
    return response.data;
  },

  seedContributionTables: async (): Promise<{ message: string }> => {
    const response = await api.post('/payroll/contributions/seed');
    return response.data;
  },
};

// Departments API
export const departmentsApi = {
  list: async (): Promise<Array<{
    id: number;
    name: string;
    code: string;
    description?: string;
    is_active: boolean;
    created_at: string;
  }>> => {
    const response = await api.get('/employees/departments');
    return response.data;
  },

  getById: async (id: number) => {
    const response = await api.get(`/employees/departments/${id}`);
    return response.data;
  },

  create: async (data: { name: string; code: string; description?: string }) => {
    const response = await api.post('/employees/departments', data);
    return response.data;
  },

  update: async (id: number, data: { name?: string; code?: string; description?: string; is_active?: boolean }) => {
    const response = await api.patch(`/employees/departments/${id}`, data);
    return response.data;
  },

  delete: async (id: number): Promise<{ message: string }> => {
    const response = await api.delete(`/employees/departments/${id}`);
    return response.data;
  },
};

// Shifts API
export const shiftsApi = {
  list: async (): Promise<Array<{
    id: number;
    name: string;
    code: string;
    start_time: string;
    end_time: string;
    break_minutes: number;
    grace_minutes: number;
    overtime_threshold_minutes: number;
    is_active: boolean;
    created_at: string;
  }>> => {
    const response = await api.get('/attendance/shifts');
    return response.data;
  },

  getById: async (id: number) => {
    const response = await api.get(`/attendance/shifts/${id}`);
    return response.data;
  },

  create: async (data: {
    name: string;
    code: string;
    start_time: string;
    end_time: string;
    break_minutes?: number;
    grace_minutes?: number;
    overtime_threshold_minutes?: number;
  }) => {
    const response = await api.post('/attendance/shifts', data);
    return response.data;
  },

  update: async (id: number, data: Partial<{
    name: string;
    code: string;
    start_time: string;
    end_time: string;
    break_minutes: number;
    grace_minutes: number;
    overtime_threshold_minutes: number;
    is_active: boolean;
  }>) => {
    const response = await api.patch(`/attendance/shifts/${id}`, data);
    return response.data;
  },

  delete: async (id: number): Promise<{ message: string }> => {
    const response = await api.delete(`/attendance/shifts/${id}`);
    return response.data;
  },
};

// Deductions API (extended)
export const deductionsApi = {
  list: async (includeInactive: boolean = false): Promise<Array<{
    id: number;
    code: string;
    name: string;
    deduction_type: string;
    is_percentage: boolean;
    rate?: number;
    salary_brackets?: Array<{ min: number; max: number; amount: number }>;
    max_contribution?: number;
    min_contribution?: number;
    employee_share_percent?: number;
    employer_share_percent?: number;
    is_enabled: boolean;
    effective_from?: string;
    effective_until?: string;
    created_at: string;
  }>> => {
    const response = await api.get('/payroll/deductions', { params: { include_inactive: includeInactive } });
    return response.data;
  },

  getById: async (id: number) => {
    const response = await api.get(`/payroll/deductions/${id}`);
    return response.data;
  },

  create: async (data: {
    code: string;
    name: string;
    deduction_type: string;
    is_percentage?: boolean;
    rate?: number;
    salary_brackets?: Array<{ min: number; max: number; amount: number }>;
    max_contribution?: number;
    min_contribution?: number;
    employee_share_percent?: number;
    employer_share_percent?: number;
    is_enabled?: boolean;
    effective_from?: string;
    effective_until?: string;
  }) => {
    const response = await api.post('/payroll/deductions', data);
    return response.data;
  },

  update: async (id: number, data: Partial<{
    code: string;
    name: string;
    deduction_type: string;
    is_percentage: boolean;
    rate: number;
    salary_brackets: Array<{ min: number; max: number; amount: number }>;
    max_contribution: number;
    min_contribution: number;
    employee_share_percent: number;
    employer_share_percent: number;
    is_enabled: boolean;
    effective_from: string;
    effective_until: string;
  }>) => {
    const response = await api.patch(`/payroll/deductions/${id}`, data);
    return response.data;
  },

  delete: async (id: number): Promise<{ message: string }> => {
    const response = await api.delete(`/payroll/deductions/${id}`);
    return response.data;
  },
};

// Payroll Runs extended
export const payrollRunsApi = {
  ...payrollApi,

  update: async (id: number, data: {
    period_start?: string;
    period_end?: string;
    cutoff?: number;
    pay_date?: string;
    description?: string;
    force?: boolean;
    reason?: string;
  }): Promise<PayrollRun> => {
    const { force, reason, ...body } = data;
    const params: Record<string, any> = {};
    if (force) params.force = true;
    if (reason) params.reason = reason;
    const response = await api.patch(`/payroll/runs/${id}`, body, { params });
    return response.data;
  },

  delete: async (id: number, force: boolean = false, reason: string = ''): Promise<{ message: string }> => {
    const params: Record<string, any> = {};
    if (force) params.force = true;
    if (reason) params.reason = reason;
    const response = await api.delete(`/payroll/runs/${id}`, { params });
    return response.data;
  },

  deletePayslip: async (id: number): Promise<{ message: string }> => {
    const response = await api.delete(`/payroll/payslips/${id}`);
    return response.data;
  },

  // Trash endpoints
  listTrash: async (page: number = 1, pageSize: number = 20): Promise<{
    items: Array<{
      id: number;
      period_start: string;
      period_end: string;
      pay_date: string | null;
      cutoff: number;
      description: string | null;
      status: string;
      total_gross: number;
      total_deductions: number;
      total_net: number;
      employee_count: number;
      created_at: string;
      deleted_at: string;
      deleted_by: { id: number; email: string } | null;
      deletion_reason: string;
    }>;
    total: number;
    page: number;
    page_size: number;
  }> => {
    const response = await api.get('/payroll/runs/trash', { params: { page, page_size: pageSize } });
    return response.data;
  },

  restore: async (id: number): Promise<{ message: string; run_id: number }> => {
    const response = await api.post(`/payroll/runs/${id}/restore`);
    return response.data;
  },

  permanentDelete: async (id: number, confirm: boolean = true): Promise<{ message: string; run_id: number }> => {
    const response = await api.delete(`/payroll/runs/${id}/permanent`, { params: { confirm } });
    return response.data;
  },

  validateReason: async (reason: string, minWords: number = 100): Promise<{
    is_valid: boolean;
    error_message: string | null;
    stats: {
      total_words: number;
      valid_words: number;
      invalid_words: number;
      invalid_word_list: string[];
    };
    requirements: {
      min_words: number;
      min_word_length: number;
      max_invalid_ratio: number;
    };
  }> => {
    const response = await api.post('/payroll/validate-reason', null, {
      params: { reason, min_words: minWords }
    });
    return response.data;
  },
};

// 13th Month extended
export const thirteenthMonthApi = {
  ...payrollApi,

  getById: async (id: number) => {
    const response = await api.get(`/payroll/13th-month/${id}`);
    return response.data;
  },

  update: async (id: number, data: {
    amount?: number;
    total_basic_earned?: number;
    months_worked?: number;
  }): Promise<{ message: string; id: number; amount: number }> => {
    const response = await api.patch(`/payroll/13th-month/${id}`, null, { params: data });
    return response.data;
  },

  delete: async (id: number): Promise<{ message: string }> => {
    const response = await api.delete(`/payroll/13th-month/${id}`);
    return response.data;
  },
};

// Settings API (Admin)
export const settingsApi = {
  get: async (): Promise<SystemSettings> => {
    const response = await api.get('/settings');
    return response.data;
  },

  updatePasswordPolicy: async (data: Partial<SystemSettings>): Promise<{ message: string }> => {
    const response = await api.patch('/settings/password-policy', data);
    return response.data;
  },

  updateRegistration: async (data: Partial<SystemSettings>): Promise<{ message: string }> => {
    const response = await api.patch('/settings/registration', data);
    return response.data;
  },

  updateCompany: async (data: Partial<SystemSettings>): Promise<{ message: string }> => {
    const response = await api.patch('/settings/company', data);
    return response.data;
  },
};

// Holidays API (Admin)
export const holidaysApi = {
  list: async (params?: {
    year?: number;
    holiday_type?: string;
    include_inactive?: boolean;
  }): Promise<{
    items: Array<{
      id: number;
      date: string;
      name: string;
      holiday_type: string;
      description: string | null;
      year: number;
      is_recurring: boolean;
      is_active: boolean;
      created_at: string;
      updated_at: string | null;
    }>;
    total: number;
  }> => {
    const response = await api.get('/holidays', { params });
    return response.data;
  },

  getById: async (id: number): Promise<{
    id: number;
    date: string;
    name: string;
    holiday_type: string;
    description: string | null;
    year: number;
    is_recurring: boolean;
    is_active: boolean;
    created_at: string;
    updated_at: string | null;
  }> => {
    const response = await api.get(`/holidays/${id}`);
    return response.data;
  },

  create: async (data: {
    date: string;
    name: string;
    holiday_type?: string;
    description?: string;
    is_recurring?: boolean;
    is_active?: boolean;
  }): Promise<{
    id: number;
    date: string;
    name: string;
    holiday_type: string;
    description: string | null;
    year: number;
    is_recurring: boolean;
    is_active: boolean;
    created_at: string;
    updated_at: string | null;
  }> => {
    const response = await api.post('/holidays', data);
    return response.data;
  },

  update: async (id: number, data: {
    date?: string;
    name?: string;
    holiday_type?: string;
    description?: string;
    is_recurring?: boolean;
    is_active?: boolean;
  }): Promise<{
    id: number;
    date: string;
    name: string;
    holiday_type: string;
    description: string | null;
    year: number;
    is_recurring: boolean;
    is_active: boolean;
    created_at: string;
    updated_at: string | null;
  }> => {
    const response = await api.patch(`/holidays/${id}`, data);
    return response.data;
  },

  delete: async (id: number, permanent: boolean = false): Promise<{ message: string }> => {
    const response = await api.delete(`/holidays/${id}`, { params: { permanent } });
    return response.data;
  },

  seed: async (year: number = 2025): Promise<{
    message: string;
    seeded: number;
    year: number;
  }> => {
    const response = await api.post('/holidays/seed', null, { params: { year } });
    return response.data;
  },

  checkDate: async (date: string): Promise<{
    is_holiday: boolean;
    date?: string;
    holiday?: {
      id: number;
      date: string;
      name: string;
      holiday_type: string;
      description: string | null;
      year: number;
      is_recurring: boolean;
      is_active: boolean;
      created_at: string;
      updated_at: string | null;
    };
  }> => {
    const response = await api.get(`/holidays/check/${date}`);
    return response.data;
  },
};

// Loans API (Admin)
export const loansApi = {
  // Loan Types
  listTypes: async (params?: {
    include_inactive?: boolean;
  }): Promise<{
    items: Array<{
      id: number;
      code: string;
      name: string;
      description: string | null;
      default_interest_rate: number;
      is_active: boolean;
      created_at: string;
      updated_at: string | null;
    }>;
    total: number;
  }> => {
    const response = await api.get('/loans/types', { params });
    return response.data;
  },

  createType: async (data: {
    code: string;
    name: string;
    description?: string;
    default_interest_rate?: number;
    is_active?: boolean;
  }) => {
    const response = await api.post('/loans/types', data);
    return response.data;
  },

  updateType: async (typeId: number, data: {
    code?: string;
    name?: string;
    description?: string;
    default_interest_rate?: number;
    is_active?: boolean;
  }) => {
    const response = await api.patch(`/loans/types/${typeId}`, data);
    return response.data;
  },

  deleteType: async (typeId: number): Promise<{ message: string }> => {
    const response = await api.delete(`/loans/types/${typeId}`);
    return response.data;
  },

  seedTypes: async (): Promise<{ message: string; seeded: number }> => {
    const response = await api.post('/loans/types/seed');
    return response.data;
  },

  // Loans
  list: async (params?: {
    employee_id?: number;
    loan_type_id?: number;
    status?: string;
    include_paid?: boolean;
  }): Promise<{
    items: Array<{
      id: number;
      employee_id: number;
      employee_name: string | null;
      employee_no: string | null;
      loan_type_id: number;
      loan_type_code: string | null;
      loan_type_name: string | null;
      reference_no: string | null;
      principal_amount: number;
      interest_rate: number;
      total_amount: number;
      term_months: number;
      monthly_deduction: number;
      start_date: string;
      end_date: string | null;
      actual_end_date: string | null;
      remaining_balance: number;
      total_paid: number;
      status: string;
      notes: string | null;
      created_at: string;
      updated_at: string | null;
      created_by: number | null;
    }>;
    total: number;
  }> => {
    const response = await api.get('/loans', { params });
    return response.data;
  },

  getById: async (loanId: number) => {
    const response = await api.get(`/loans/${loanId}`);
    return response.data;
  },

  create: async (data: {
    employee_id: number;
    loan_type_id: number;
    reference_no?: string;
    principal_amount: number;
    interest_rate?: number;
    term_months: number;
    monthly_deduction: number;
    start_date: string;
    end_date?: string;
    notes?: string;
  }) => {
    const response = await api.post('/loans', data);
    return response.data;
  },

  update: async (loanId: number, data: {
    reference_no?: string;
    interest_rate?: number;
    term_months?: number;
    monthly_deduction?: number;
    start_date?: string;
    end_date?: string;
    status?: string;
    notes?: string;
  }) => {
    const response = await api.patch(`/loans/${loanId}`, data);
    return response.data;
  },

  delete: async (loanId: number, permanent: boolean = false): Promise<{ message: string }> => {
    const response = await api.delete(`/loans/${loanId}`, { params: { permanent } });
    return response.data;
  },

  getEmployeeSummary: async (employeeId: number): Promise<{
    employee_id: number;
    total_loans: number;
    active_loans: number;
    total_principal: number;
    total_remaining: number;
    total_paid: number;
    monthly_deductions: number;
  }> => {
    const response = await api.get(`/loans/employee/${employeeId}/summary`);
    return response.data;
  },

  getAmortization: async (loanId: number): Promise<{
    loan_id: number;
    principal: number;
    interest_rate: number;
    total_amount: number;
    monthly_payment: number;
    term_months: number;
    schedule: Array<{
      month: number;
      date: string;
      payment: number;
      principal: number;
      interest: number;
      balance: number;
    }>;
  }> => {
    const response = await api.get(`/loans/${loanId}/amortization`);
    return response.data;
  },

  // Loan Deductions
  listDeductions: async (loanId: number): Promise<{
    items: Array<{
      id: number;
      loan_id: number;
      payslip_id: number | null;
      amount: number;
      balance_before: number;
      balance_after: number;
      deduction_date: string;
      notes: string | null;
      created_at: string;
    }>;
    total: number;
  }> => {
    const response = await api.get(`/loans/${loanId}/deductions`);
    return response.data;
  },

  createDeduction: async (loanId: number, data: {
    amount: number;
    deduction_date: string;
    payslip_id?: number;
    notes?: string;
  }) => {
    const response = await api.post(`/loans/${loanId}/deductions`, { ...data, loan_id: loanId });
    return response.data;
  },

  deleteDeduction: async (loanId: number, deductionId: number): Promise<{ message: string }> => {
    const response = await api.delete(`/loans/${loanId}/deductions/${deductionId}`);
    return response.data;
  },

  getEmployeeActiveDeductions: async (employeeId: number): Promise<{
    employee_id: number;
    total_monthly_deductions: number;
    deductions: Array<{
      loan_id: number;
      loan_type: string;
      loan_type_name: string;
      monthly_deduction: number;
      remaining_balance: number;
      reference_no: string | null;
    }>;
  }> => {
    const response = await api.get(`/loans/employee/${employeeId}/active-deductions`);
    return response.data;
  },
};

// Leave API
export const leaveApi = {
  // Leave Types
  listTypes: async (params?: {
    include_inactive?: boolean;
  }): Promise<{
    items: Array<{
      id: number;
      code: string;
      name: string;
      description: string | null;
      default_days_per_year: number;
      is_paid: boolean;
      requires_document: boolean;
      max_consecutive_days: number | null;
      min_notice_days: number;
      is_accrued: boolean;
      accrual_rate_per_month: number | null;
      can_carry_over: boolean;
      max_carry_over_days: number | null;
      is_active: boolean;
      created_at: string;
      updated_at: string | null;
    }>;
    total: number;
  }> => {
    const response = await api.get('/leave/types', { params });
    return response.data;
  },

  createType: async (data: {
    code: string;
    name: string;
    description?: string;
    default_days_per_year?: number;
    is_paid?: boolean;
    requires_document?: boolean;
    max_consecutive_days?: number;
    min_notice_days?: number;
    is_accrued?: boolean;
    accrual_rate_per_month?: number;
    can_carry_over?: boolean;
    max_carry_over_days?: number;
    is_active?: boolean;
  }) => {
    const response = await api.post('/leave/types', data);
    return response.data;
  },

  updateType: async (typeId: number, data: {
    code?: string;
    name?: string;
    description?: string;
    default_days_per_year?: number;
    is_paid?: boolean;
    requires_document?: boolean;
    max_consecutive_days?: number;
    min_notice_days?: number;
    is_accrued?: boolean;
    accrual_rate_per_month?: number;
    can_carry_over?: boolean;
    max_carry_over_days?: number;
    is_active?: boolean;
  }) => {
    const response = await api.patch(`/leave/types/${typeId}`, data);
    return response.data;
  },

  deleteType: async (typeId: number): Promise<{ message: string }> => {
    const response = await api.delete(`/leave/types/${typeId}`);
    return response.data;
  },

  seedTypes: async (): Promise<{ message: string; seeded: number }> => {
    const response = await api.post('/leave/types/seed');
    return response.data;
  },

  // Leave Balances
  listBalances: async (params?: {
    employee_id?: number;
    leave_type_id?: number;
    year?: number;
  }): Promise<{
    items: Array<{
      id: number;
      employee_id: number;
      employee_name: string | null;
      employee_no: string | null;
      leave_type_id: number;
      leave_type_code: string | null;
      leave_type_name: string | null;
      year: number;
      entitled_days: number;
      used_days: number;
      pending_days: number;
      carried_over_days: number;
      remaining_days: number;
      created_at: string;
      updated_at: string | null;
    }>;
    total: number;
  }> => {
    const response = await api.get('/leave/balances', { params });
    return response.data;
  },

  getEmployeeBalances: async (employeeId: number, year?: number): Promise<{
    employee_id: number;
    year: number;
    balances: Array<{
      id: number;
      employee_id: number;
      employee_name: string | null;
      employee_no: string | null;
      leave_type_id: number;
      leave_type_code: string | null;
      leave_type_name: string | null;
      year: number;
      entitled_days: number;
      used_days: number;
      pending_days: number;
      carried_over_days: number;
      remaining_days: number;
      created_at: string;
      updated_at: string | null;
    }>;
    total_entitled: number;
    total_used: number;
    total_remaining: number;
  }> => {
    const response = await api.get(`/leave/balances/employee/${employeeId}`, { params: { year } });
    return response.data;
  },

  createBalance: async (data: {
    employee_id: number;
    leave_type_id: number;
    year: number;
    entitled_days?: number;
    carried_over_days?: number;
  }) => {
    const response = await api.post('/leave/balances', data);
    return response.data;
  },

  updateBalance: async (balanceId: number, data: {
    entitled_days?: number;
    used_days?: number;
    pending_days?: number;
    carried_over_days?: number;
  }) => {
    const response = await api.patch(`/leave/balances/${balanceId}`, data);
    return response.data;
  },

  initializeBalances: async (data: {
    employee_ids: number[];
    year: number;
    use_defaults?: boolean;
  }): Promise<{
    message: string;
    created: number;
    skipped: number;
  }> => {
    const response = await api.post('/leave/balances/initialize', data);
    return response.data;
  },

  // Leave Requests
  listRequests: async (params?: {
    employee_id?: number;
    leave_type_id?: number;
    status?: string;
    date_from?: string;
    date_to?: string;
  }): Promise<{
    items: Array<{
      id: number;
      employee_id: number;
      employee_name: string | null;
      employee_no: string | null;
      leave_type_id: number;
      leave_type_code: string | null;
      leave_type_name: string | null;
      start_date: string;
      end_date: string;
      total_days: number;
      is_half_day: boolean;
      half_day_period: string | null;
      reason: string | null;
      contact_number: string | null;
      attachment_path: string | null;
      status: string;
      reviewed_by: number | null;
      reviewer_name: string | null;
      reviewed_at: string | null;
      review_notes: string | null;
      created_at: string;
      updated_at: string | null;
    }>;
    total: number;
  }> => {
    const response = await api.get('/leave/requests', { params });
    return response.data;
  },

  getRequest: async (requestId: number) => {
    const response = await api.get(`/leave/requests/${requestId}`);
    return response.data;
  },

  createRequest: async (data: {
    employee_id: number;
    leave_type_id: number;
    start_date: string;
    end_date: string;
    is_half_day?: boolean;
    half_day_period?: string;
    reason?: string;
    contact_number?: string;
  }) => {
    const response = await api.post('/leave/requests', data);
    return response.data;
  },

  updateRequest: async (requestId: number, data: {
    start_date?: string;
    end_date?: string;
    is_half_day?: boolean;
    half_day_period?: string;
    reason?: string;
    contact_number?: string;
  }) => {
    const response = await api.patch(`/leave/requests/${requestId}`, data);
    return response.data;
  },

  reviewRequest: async (requestId: number, data: {
    status: 'approved' | 'rejected';
    review_notes?: string;
  }) => {
    const response = await api.post(`/leave/requests/${requestId}/review`, data);
    return response.data;
  },

  cancelRequest: async (requestId: number): Promise<{ message: string }> => {
    const response = await api.post(`/leave/requests/${requestId}/cancel`);
    return response.data;
  },

  deleteRequest: async (requestId: number): Promise<{ message: string }> => {
    const response = await api.delete(`/leave/requests/${requestId}`);
    return response.data;
  },

  // Calendar
  getCalendar: async (params: {
    start_date: string;
    end_date: string;
    employee_id?: number;
    status?: string;
  }): Promise<Array<{
    date: string;
    employee_id: number;
    employee_name: string;
    leave_type: string;
    status: string;
    is_half_day: boolean;
    half_day_period: string | null;
  }>> => {
    const response = await api.get('/leave/calendar', { params });
    return response.data;
  },
};

// Reports API
export const reportsApi = {
  // Get available reports
  list: async (): Promise<{
    reports: Array<{
      id: string;
      name: string;
      description: string;
      parameters: string[];
      formats: string[];
    }>;
  }> => {
    const response = await api.get('/reports');
    return response.data;
  },

  // Payroll Summary
  getPayrollSummary: async (year: number, month: number, department?: string) => {
    const response = await api.get('/reports/payroll-summary', {
      params: { year, month, department }
    });
    return response.data;
  },

  exportPayrollSummaryCsv: async (year: number, month: number, department?: string) => {
    const response = await api.get('/reports/payroll-summary/csv', {
      params: { year, month, department },
      responseType: 'blob'
    });
    return response.data;
  },

  // Attendance Report
  getAttendance: async (startDate: string, endDate: string, employeeId?: number, department?: string) => {
    const response = await api.get('/reports/attendance', {
      params: { start_date: startDate, end_date: endDate, employee_id: employeeId, department }
    });
    return response.data;
  },

  exportAttendanceCsv: async (startDate: string, endDate: string, employeeId?: number, department?: string, detailed?: boolean) => {
    const response = await api.get('/reports/attendance/csv', {
      params: { start_date: startDate, end_date: endDate, employee_id: employeeId, department, detailed },
      responseType: 'blob'
    });
    return response.data;
  },

  // SSS R3
  getSSR3: async (year: number, month: number) => {
    const response = await api.get('/reports/sss-r3', {
      params: { year, month }
    });
    return response.data;
  },

  exportSSR3Csv: async (year: number, month: number) => {
    const response = await api.get('/reports/sss-r3/csv', {
      params: { year, month },
      responseType: 'blob'
    });
    return response.data;
  },

  exportSSR3Txt: async (year: number, month: number, employerSssNo?: string, employerName?: string) => {
    const response = await api.get('/reports/sss-r3/txt', {
      params: { year, month, employer_sss_no: employerSssNo, employer_name: employerName },
      responseType: 'blob'
    });
    return response.data;
  },

  // PhilHealth RF-1
  getPhilHealthRF1: async (year: number, month: number) => {
    const response = await api.get('/reports/philhealth-rf1', {
      params: { year, month }
    });
    return response.data;
  },

  exportPhilHealthRF1Csv: async (year: number, month: number) => {
    const response = await api.get('/reports/philhealth-rf1/csv', {
      params: { year, month },
      responseType: 'blob'
    });
    return response.data;
  },

  exportPhilHealthRF1Txt: async (year: number, month: number, employerNo?: string, employerName?: string, address?: string) => {
    const response = await api.get('/reports/philhealth-rf1/txt', {
      params: { year, month, employer_philhealth_no: employerNo, employer_name: employerName, address },
      responseType: 'blob'
    });
    return response.data;
  },

  // Pag-IBIG MCR
  getPagIBIGMCR: async (year: number, month: number) => {
    const response = await api.get('/reports/pagibig-mcr', {
      params: { year, month }
    });
    return response.data;
  },

  exportPagIBIGMCRCsv: async (year: number, month: number) => {
    const response = await api.get('/reports/pagibig-mcr/csv', {
      params: { year, month },
      responseType: 'blob'
    });
    return response.data;
  },

  exportPagIBIGMCRTxt: async (year: number, month: number, employerNo?: string, employerName?: string, address?: string) => {
    const response = await api.get('/reports/pagibig-mcr/txt', {
      params: { year, month, employer_pagibig_no: employerNo, employer_name: employerName, address },
      responseType: 'blob'
    });
    return response.data;
  },
};

export default api;
