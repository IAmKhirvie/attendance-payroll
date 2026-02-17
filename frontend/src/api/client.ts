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

  // PDF Downloads
  downloadPayslipPdf: async (payslipId: number): Promise<void> => {
    const response = await api.get(`/payroll/payslips/${payslipId}/pdf`, {
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `payslip_${payslipId}.pdf`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  downloadPayslipPng: async (payslipId: number): Promise<void> => {
    const response = await api.get(`/payroll/payslips/${payslipId}/png`, {
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `payslip_${payslipId}.png`);
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
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `payslips_sheet_page${page}.png`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  download13thMonthPdf: async (recordId: number): Promise<void> => {
    const response = await api.get(`/payroll/13th-month/${recordId}/pdf`, {
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `13th_month_${recordId}.pdf`);
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

export default api;
