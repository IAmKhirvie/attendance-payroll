import { useState, useEffect, useCallback, memo } from 'react';
import { employeesApi } from '../../api/client';
import type { Employee, Department, EmployeeStatus } from '../../types';
import api from '../../api/client';
import { CreatableSelect } from '../../components/CreatableSelect';

interface EmployeeFormData {
  employee_no: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  email: string;
  phone: string;
  department_id: string;
  position: string;
  employment_type: string;
  hire_date: string;
  basic_salary: string;
  daily_rate: string;
  hourly_rate: string;
  allowance: string;
  productivity_incentive: string;
  language_incentive: string;
  biometric_id: string;
  // Government contributions
  sss_contribution: string;
  philhealth_contribution: string;
  pagibig_contribution: string;
  tax_amount: string;
}

const emptyForm: EmployeeFormData = {
  employee_no: '',
  first_name: '',
  middle_name: '',
  last_name: '',
  email: '',
  phone: '',
  department_id: '',
  position: '',
  employment_type: 'regular',
  hire_date: '',
  basic_salary: '',
  daily_rate: '',
  hourly_rate: '',
  allowance: '',
  productivity_incentive: '',
  language_incentive: '',
  biometric_id: '',
  sss_contribution: '',
  philhealth_contribution: '',
  pagibig_contribution: '',
  tax_amount: '',
};

// Props for EmployeeForm component
interface EmployeeFormProps {
  formData: EmployeeFormData;
  setFormData: React.Dispatch<React.SetStateAction<EmployeeFormData>>;
  departments: Department[];
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  onCreateDepartment: (name: string) => Promise<{ id: number; name: string } | null>;
  submitText: string;
  saving: boolean;
  error: string;
}

// Constants for salary computation
const WORKING_DAYS_PER_MONTH = 22; // Standard Philippine working days
const HOURS_PER_DAY = 8;

// Employee Form Component - defined OUTSIDE of EmployeesPage to prevent re-mounting
const EmployeeForm = memo(function EmployeeForm({
  formData,
  setFormData,
  departments,
  onSubmit,
  onCancel,
  onCreateDepartment,
  submitText,
  saving,
  error,
}: EmployeeFormProps) {
  // Use callback for field updates to prevent unnecessary re-renders
  const handleFieldChange = useCallback((field: keyof EmployeeFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, [setFormData]);

  // Auto-compute salary rates
  const handleBasicSalaryChange = useCallback((value: string) => {
    const basicSalary = parseFloat(value) || 0;
    const dailyRate = basicSalary > 0 ? (basicSalary / WORKING_DAYS_PER_MONTH).toFixed(2) : '';
    const hourlyRate = basicSalary > 0 ? (basicSalary / WORKING_DAYS_PER_MONTH / HOURS_PER_DAY).toFixed(2) : '';

    setFormData(prev => ({
      ...prev,
      basic_salary: value,
      daily_rate: dailyRate,
      hourly_rate: hourlyRate,
    }));
  }, [setFormData]);

  const handleDailyRateChange = useCallback((value: string) => {
    const dailyRate = parseFloat(value) || 0;
    const basicSalary = dailyRate > 0 ? (dailyRate * WORKING_DAYS_PER_MONTH).toFixed(2) : '';
    const hourlyRate = dailyRate > 0 ? (dailyRate / HOURS_PER_DAY).toFixed(2) : '';

    setFormData(prev => ({
      ...prev,
      basic_salary: basicSalary,
      daily_rate: value,
      hourly_rate: hourlyRate,
    }));
  }, [setFormData]);

  const handleHourlyRateChange = useCallback((value: string) => {
    const hourlyRate = parseFloat(value) || 0;
    const dailyRate = hourlyRate > 0 ? (hourlyRate * HOURS_PER_DAY).toFixed(2) : '';
    const basicSalary = hourlyRate > 0 ? (hourlyRate * HOURS_PER_DAY * WORKING_DAYS_PER_MONTH).toFixed(2) : '';

    setFormData(prev => ({
      ...prev,
      basic_salary: basicSalary,
      daily_rate: dailyRate,
      hourly_rate: value,
    }));
  }, [setFormData]);

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 text-red-700 rounded text-sm">{error}</div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="form-label">Employee No *</label>
          <input
            type="text"
            value={formData.employee_no}
            onChange={(e) => handleFieldChange('employee_no', e.target.value)}
            className="form-input"
            required
          />
        </div>
        <div>
          <label className="form-label">Biometric ID</label>
          <input
            type="text"
            value={formData.biometric_id}
            onChange={(e) => handleFieldChange('biometric_id', e.target.value)}
            className="form-input"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="form-label">First Name *</label>
          <input
            type="text"
            value={formData.first_name}
            onChange={(e) => handleFieldChange('first_name', e.target.value)}
            className="form-input"
            required
          />
        </div>
        <div>
          <label className="form-label">Middle Name</label>
          <input
            type="text"
            value={formData.middle_name}
            onChange={(e) => handleFieldChange('middle_name', e.target.value)}
            className="form-input"
          />
        </div>
        <div>
          <label className="form-label">Last Name *</label>
          <input
            type="text"
            value={formData.last_name}
            onChange={(e) => handleFieldChange('last_name', e.target.value)}
            className="form-input"
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="form-label">Email</label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => handleFieldChange('email', e.target.value)}
            className="form-input"
          />
        </div>
        <div>
          <label className="form-label">Phone</label>
          <input
            type="text"
            value={formData.phone}
            onChange={(e) => handleFieldChange('phone', e.target.value)}
            className="form-input"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="form-label">Department</label>
          <CreatableSelect
            options={departments.map((dept) => ({ id: dept.id, name: dept.name }))}
            value={formData.department_id}
            onChange={(value) => handleFieldChange('department_id', value)}
            onCreateNew={onCreateDepartment}
            placeholder="Select or type to create..."
          />
        </div>
        <div>
          <label className="form-label">Position</label>
          <input
            type="text"
            value={formData.position}
            onChange={(e) => handleFieldChange('position', e.target.value)}
            className="form-input"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="form-label">Employment Type</label>
          <select
            value={formData.employment_type}
            onChange={(e) => handleFieldChange('employment_type', e.target.value)}
            className="form-input"
          >
            <option value="regular">Regular</option>
            <option value="probationary">Probationary</option>
            <option value="contractual">Contractual</option>
            <option value="part_time">Part Time</option>
          </select>
        </div>
        <div>
          <label className="form-label">Hire Date</label>
          <input
            type="date"
            value={formData.hire_date}
            onChange={(e) => handleFieldChange('hire_date', e.target.value)}
            className="form-input"
          />
        </div>
      </div>

      {/* Salary Rates - Auto-computed */}
      <div className="pt-4 border-t">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-gray-700">Salary Rates</h4>
          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
            Auto-computes: {WORKING_DAYS_PER_MONTH} days/month, {HOURS_PER_DAY} hrs/day
          </span>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="form-label">Basic Salary (Monthly)</label>
            <input
              type="number"
              step="0.01"
              value={formData.basic_salary}
              onChange={(e) => handleBasicSalaryChange(e.target.value)}
              className="form-input"
              placeholder="e.g. 40000"
            />
            <p className="text-xs text-gray-400 mt-1">Enter to auto-compute rates</p>
          </div>
          <div>
            <label className="form-label">Daily Rate</label>
            <input
              type="number"
              step="0.01"
              value={formData.daily_rate}
              onChange={(e) => handleDailyRateChange(e.target.value)}
              className="form-input"
              placeholder="e.g. 1818.18"
            />
            <p className="text-xs text-gray-400 mt-1">= Monthly / {WORKING_DAYS_PER_MONTH} days</p>
          </div>
          <div>
            <label className="form-label">Hourly Rate</label>
            <input
              type="number"
              step="0.01"
              value={formData.hourly_rate}
              onChange={(e) => handleHourlyRateChange(e.target.value)}
              className="form-input"
              placeholder="e.g. 227.27"
            />
            <p className="text-xs text-gray-400 mt-1">= Daily / {HOURS_PER_DAY} hours</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="form-label">Allowance (Monthly)</label>
          <input
            type="number"
            step="0.01"
            value={formData.allowance}
            onChange={(e) => handleFieldChange('allowance', e.target.value)}
            className="form-input"
            placeholder="0.00"
          />
        </div>
        <div>
          <label className="form-label">Productivity Incentive (Monthly)</label>
          <input
            type="number"
            step="0.01"
            value={formData.productivity_incentive}
            onChange={(e) => handleFieldChange('productivity_incentive', e.target.value)}
            className="form-input"
            placeholder="0.00"
          />
        </div>
        <div>
          <label className="form-label">Language Incentive (Monthly)</label>
          <input
            type="number"
            step="0.01"
            value={formData.language_incentive}
            onChange={(e) => handleFieldChange('language_incentive', e.target.value)}
            className="form-input"
            placeholder="0.00"
          />
        </div>
      </div>

      {/* Government Contributions */}
      <div className="pt-4 border-t">
        <h4 className="font-semibold text-gray-700 mb-3">Government Contributions (Monthly)</h4>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="form-label">SSS</label>
            <input
              type="number"
              step="0.01"
              value={formData.sss_contribution}
              onChange={(e) => handleFieldChange('sss_contribution', e.target.value)}
              className="form-input"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="form-label">PhilHealth</label>
            <input
              type="number"
              step="0.01"
              value={formData.philhealth_contribution}
              onChange={(e) => handleFieldChange('philhealth_contribution', e.target.value)}
              className="form-input"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="form-label">Pag-IBIG</label>
            <input
              type="number"
              step="0.01"
              value={formData.pagibig_contribution}
              onChange={(e) => handleFieldChange('pagibig_contribution', e.target.value)}
              className="form-input"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="form-label">Tax</label>
            <input
              type="number"
              step="0.01"
              value={formData.tax_amount}
              onChange={(e) => handleFieldChange('tax_amount', e.target.value)}
              className="form-input"
              placeholder="0.00"
            />
          </div>
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="btn-secondary"
        >
          Cancel
        </button>
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Saving...' : submitText}
        </button>
      </div>
    </form>
  );
});

export function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize] = useState(15);
  const [total, setTotal] = useState(0);

  // Sorting state
  const [sortBy, setSortBy] = useState<string>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [formData, setFormData] = useState<EmployeeFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadDepartments();
  }, []);

  // Auto-search with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      loadEmployees();
    }, 300); // 300ms delay

    return () => clearTimeout(timer);
  }, [statusFilter, page, sortBy, sortOrder, search]);

  const loadEmployees = async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = {
        page,
        page_size: pageSize,
        sort_by: sortBy,
        sort_order: sortOrder,
      };
      if (search) params.search = search;
      if (statusFilter !== 'all') params.status = statusFilter;

      const response = await employeesApi.list(params);
      setEmployees(response.items);
      setTotal(response.total);
    } catch (error) {
      console.error('Failed to load employees:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
    setPage(1); // Reset to first page when sorting
  };

  const totalPages = Math.ceil(total / pageSize);

  const loadDepartments = async () => {
    try {
      const response = await api.get('/employees/departments');
      setDepartments(response.data);
    } catch (error) {
      console.error('Failed to load departments:', error);
    }
  };

  const createDepartment = async (name: string): Promise<{ id: number; name: string } | null> => {
    try {
      // Generate a simple code from name
      const code = name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
      const response = await api.post('/employees/departments', { name, code });
      // Refresh departments list
      await loadDepartments();
      return { id: response.data.id, name: response.data.name };
    } catch (error: any) {
      console.error('Failed to create department:', error);
      alert(error.response?.data?.detail || 'Failed to create department');
      return null;
    }
  };

  const handleAddEmployee = () => {
    setFormData(emptyForm);
    setError('');
    setShowAddModal(true);
  };

  const handleViewEmployee = (emp: Employee) => {
    setSelectedEmployee(emp);
    setShowViewModal(true);
  };

  const handleEditEmployee = (emp: Employee) => {
    setSelectedEmployee(emp);
    setFormData({
      employee_no: emp.employee_no || '',
      first_name: emp.first_name || '',
      middle_name: emp.middle_name || '',
      last_name: emp.last_name || '',
      email: emp.email || '',
      phone: emp.phone || '',
      department_id: emp.department_id?.toString() || '',
      position: emp.position || '',
      employment_type: emp.employment_type || 'regular',
      hire_date: emp.hire_date || '',
      basic_salary: emp.basic_salary || '',
      daily_rate: emp.daily_rate || '',
      hourly_rate: emp.hourly_rate || '',
      allowance: emp.allowance || '',
      productivity_incentive: emp.productivity_incentive || '',
      language_incentive: emp.language_incentive || '',
      biometric_id: emp.biometric_id || '',
      sss_contribution: emp.sss_contribution || '',
      philhealth_contribution: emp.philhealth_contribution || '',
      pagibig_contribution: emp.pagibig_contribution || '',
      tax_amount: emp.tax_amount || '',
    });
    setError('');
    setShowEditModal(true);
  };

  const handleVerifyEmployee = async (emp: Employee) => {
    try {
      await employeesApi.verify(emp.id);
      loadEmployees();
    } catch (error: any) {
      console.error('Failed to verify employee:', error);
      alert(error.response?.data?.detail || 'Failed to verify employee');
    }
  };

  const handleVerifyAll = async () => {
    if (!confirm('Are you sure you want to verify all pending employees?')) return;

    try {
      const result = await employeesApi.verifyAll();
      alert(result.message);
      loadEmployees();
    } catch (error: any) {
      console.error('Failed to verify all:', error);
      alert(error.response?.data?.detail || 'Failed to verify employees');
    }
  };

  const handleDeleteEmployee = async (emp: Employee) => {
    if (!confirm(`Are you sure you want to delete "${emp.full_name || emp.first_name + ' ' + emp.last_name}"?\n\nThis will deactivate the employee record.`)) {
      return;
    }

    try {
      await api.delete(`/employees/${emp.id}`);
      loadEmployees();
    } catch (error: any) {
      console.error('Failed to delete employee:', error);
      alert(error.response?.data?.detail || 'Failed to delete employee');
    }
  };

  const handleSubmitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      await employeesApi.create({
        employee_no: formData.employee_no,
        first_name: formData.first_name,
        middle_name: formData.middle_name || undefined,
        last_name: formData.last_name,
        email: formData.email || undefined,
        phone: formData.phone || undefined,
        department_id: formData.department_id ? parseInt(formData.department_id) : undefined,
        position: formData.position || undefined,
        employment_type: formData.employment_type as any,
        hire_date: formData.hire_date || undefined,
        basic_salary: formData.basic_salary || undefined,
        daily_rate: formData.daily_rate || undefined,
        hourly_rate: formData.hourly_rate || undefined,
        allowance: formData.allowance || undefined,
        productivity_incentive: formData.productivity_incentive || undefined,
        language_incentive: formData.language_incentive || undefined,
        biometric_id: formData.biometric_id || undefined,
        sss_contribution: formData.sss_contribution || undefined,
        philhealth_contribution: formData.philhealth_contribution || undefined,
        pagibig_contribution: formData.pagibig_contribution || undefined,
        tax_amount: formData.tax_amount || undefined,
      });
      setShowAddModal(false);
      loadEmployees();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create employee');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee) return;

    setSaving(true);
    setError('');

    try {
      await employeesApi.update(selectedEmployee.id, {
        employee_no: formData.employee_no,
        first_name: formData.first_name,
        middle_name: formData.middle_name || undefined,
        last_name: formData.last_name,
        email: formData.email || undefined,
        phone: formData.phone || undefined,
        department_id: formData.department_id ? parseInt(formData.department_id) : undefined,
        position: formData.position || undefined,
        employment_type: formData.employment_type as any,
        hire_date: formData.hire_date || undefined,
        basic_salary: formData.basic_salary || undefined,
        daily_rate: formData.daily_rate || undefined,
        hourly_rate: formData.hourly_rate || undefined,
        allowance: formData.allowance || undefined,
        productivity_incentive: formData.productivity_incentive || undefined,
        language_incentive: formData.language_incentive || undefined,
        biometric_id: formData.biometric_id || undefined,
        sss_contribution: formData.sss_contribution || undefined,
        philhealth_contribution: formData.philhealth_contribution || undefined,
        pagibig_contribution: formData.pagibig_contribution || undefined,
        tax_amount: formData.tax_amount || undefined,
      });
      setShowEditModal(false);
      loadEmployees();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update employee');
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (amount: string | undefined) => {
    if (!amount) return '-';
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
    }).format(parseFloat(amount));
  };

  const getStatusBadge = (status: EmployeeStatus | undefined, isActive: boolean) => {
    if (!isActive) {
      return <span className="px-2 py-1 text-xs font-medium rounded bg-gray-100 text-gray-800">Inactive</span>;
    }
    if (status === 'pending') {
      return <span className="px-2 py-1 text-xs font-medium rounded bg-yellow-100 text-yellow-800">Pending</span>;
    }
    return <span className="px-2 py-1 text-xs font-medium rounded bg-green-100 text-green-800">Active</span>;
  };

  const pendingCount = employees.filter(e => e.status === 'pending').length;

  // Memoized cancel handler for Add modal
  const handleCancelAdd = useCallback(() => {
    setShowAddModal(false);
  }, []);

  // Memoized cancel handler for Edit modal
  const handleCancelEdit = useCallback(() => {
    setShowEditModal(false);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Employee Management</h1>
        <div className="flex gap-2">
          {statusFilter === 'pending' && pendingCount > 0 && (
            <button onClick={handleVerifyAll} className="btn-secondary">
              Verify All ({pendingCount})
            </button>
          )}
          <button onClick={handleAddEmployee} className="btn-primary">Add Employee</button>
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex gap-2">
        {[
          { key: 'all', label: 'All' },
          { key: 'pending', label: 'Pending' },
          { key: 'active', label: 'Active' },
          { key: 'inactive', label: 'Inactive' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`px-4 py-2 rounded-md text-sm font-medium ${
              statusFilter === tab.key
                ? 'bg-primary-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            {tab.label}
            {tab.key === 'pending' && pendingCount > 0 && (
              <span className="ml-2 bg-yellow-400 text-yellow-900 px-2 py-0.5 rounded-full text-xs">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Info Banner for Pending */}
      {statusFilter === 'pending' && pendingCount > 0 && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-yellow-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="font-medium text-yellow-800">
                {pendingCount} employee{pendingCount > 1 ? 's' : ''} pending verification
              </p>
              <p className="text-sm text-yellow-700 mt-1">
                These employees were auto-created from attendance imports. Please verify their information and set their salary rates before processing payroll.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-md">
        <input
          type="text"
          placeholder="Search employees..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1); // Reset to first page when searching
          }}
          className="w-full px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Employees Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : employees.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            {statusFilter === 'pending'
              ? 'No pending employees. Import attendance data to auto-create employees.'
              : 'No employees found. Add your first employee or import attendance data.'}
          </div>
        ) : (
          <>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('employee_no')}
                  >
                    <div className="flex items-center gap-1">
                      Employee #
                      {sortBy === 'employee_no' && (
                        <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('name')}
                  >
                    <div className="flex items-center gap-1">
                      Name
                      {sortBy === 'name' && (
                        <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('biometric_id')}
                  >
                    <div className="flex items-center gap-1">
                      Biometric ID
                      {sortBy === 'biometric_id' && (
                        <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('department')}
                  >
                    <div className="flex items-center gap-1">
                      Department
                      {sortBy === 'department' && (
                        <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('position')}
                  >
                    <div className="flex items-center gap-1">
                      Position
                      {sortBy === 'position' && (
                        <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('status')}
                  >
                    <div className="flex items-center gap-1">
                      Status
                      {sortBy === 'status' && (
                        <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {employees.map((emp) => (
                  <tr key={emp.id} className={`hover:bg-gray-50 ${emp.status === 'pending' ? 'bg-yellow-50' : ''}`}>
                    <td className="px-6 py-4 whitespace-nowrap font-medium">{emp.employee_no}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {emp.full_name || `${emp.first_name} ${emp.middle_name ? emp.middle_name + ' ' : ''}${emp.last_name}`}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-500">{emp.biometric_id || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-500">{emp.department?.name || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-500">{emp.position || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(emp.status, emp.is_active)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex gap-2">
                        {emp.status === 'pending' && (
                          <button
                            onClick={() => handleVerifyEmployee(emp)}
                            className="text-green-600 hover:text-green-800 text-sm font-medium"
                          >
                            Verify
                          </button>
                        )}
                        <button
                          onClick={() => handleViewEmployee(emp)}
                          className="text-primary-600 hover:text-primary-800 text-sm font-medium"
                        >
                          View
                        </button>
                        <button
                          onClick={() => handleEditEmployee(emp)}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteEmployee(emp)}
                          className="text-red-600 hover:text-red-800 text-sm font-medium"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
              <div className="text-sm text-gray-500">
                Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, total)} of {total} employees
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(1)}
                  disabled={page === 1}
                  className="px-3 py-1 text-sm border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  First
                </button>
                <button
                  onClick={() => setPage(page - 1)}
                  disabled={page === 1}
                  className="px-3 py-1 text-sm border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Prev
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (page <= 3) {
                      pageNum = i + 1;
                    } else if (page >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = page - 2 + i;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        className={`px-3 py-1 text-sm border rounded ${
                          page === pageNum
                            ? 'bg-primary-600 text-white border-primary-600'
                            : 'hover:bg-gray-50'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={page === totalPages}
                  className="px-3 py-1 text-sm border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
                <button
                  onClick={() => setPage(totalPages)}
                  disabled={page === totalPages}
                  className="px-3 py-1 text-sm border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Last
                </button>
              </div>
            </div>
          )}
          </>
        )}
      </div>

      {/* Add Employee Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">Add New Employee</h2>
            <EmployeeForm
              formData={formData}
              setFormData={setFormData}
              departments={departments}
              onSubmit={handleSubmitAdd}
              onCancel={handleCancelAdd}
              onCreateDepartment={createDepartment}
              submitText="Create Employee"
              saving={saving}
              error={error}
            />
          </div>
        </div>
      )}

      {/* Edit Employee Modal */}
      {showEditModal && selectedEmployee && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">Edit Employee</h2>
            <EmployeeForm
              formData={formData}
              setFormData={setFormData}
              departments={departments}
              onSubmit={handleSubmitEdit}
              onCancel={handleCancelEdit}
              onCreateDepartment={createDepartment}
              submitText="Save Changes"
              saving={saving}
              error={error}
            />
          </div>
        </div>
      )}

      {/* View Employee Modal */}
      {showViewModal && selectedEmployee && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-lg font-semibold">Employee Details</h2>
              <button
                onClick={() => setShowViewModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-center gap-4 pb-4 border-b">
                <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center">
                  <span className="text-primary-700 font-bold text-xl">
                    {selectedEmployee.first_name[0]}{selectedEmployee.last_name[0]}
                  </span>
                </div>
                <div>
                  <h3 className="text-xl font-bold">
                    {selectedEmployee.full_name || `${selectedEmployee.first_name} ${selectedEmployee.middle_name ? selectedEmployee.middle_name + ' ' : ''}${selectedEmployee.last_name}`}
                  </h3>
                  <p className="text-gray-500">{selectedEmployee.employee_no}</p>
                  {getStatusBadge(selectedEmployee.status, selectedEmployee.is_active)}
                </div>
              </div>

              {/* Pending Warning */}
              {selectedEmployee.status === 'pending' && (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-800">
                    This employee was auto-created from attendance import. Please verify their information and set salary rates, then click "Verify" to activate.
                  </p>
                </div>
              )}

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Department</p>
                  <p className="font-medium">{selectedEmployee.department?.name || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Position</p>
                  <p className="font-medium">{selectedEmployee.position || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Employment Type</p>
                  <p className="font-medium capitalize">{selectedEmployee.employment_type?.replace('_', ' ') || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Hire Date</p>
                  <p className="font-medium">{selectedEmployee.hire_date || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Email</p>
                  <p className="font-medium">{selectedEmployee.email || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Phone</p>
                  <p className="font-medium">{selectedEmployee.phone || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Biometric ID</p>
                  <p className="font-medium">{selectedEmployee.biometric_id || '-'}</p>
                </div>
              </div>

              {/* Salary Info */}
              <div className="pt-4 border-t">
                <h4 className="font-semibold mb-3">Compensation</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-3 bg-gray-50 rounded">
                    <p className="text-sm text-gray-500">Basic Salary (Monthly)</p>
                    <p className="font-bold text-lg">{formatCurrency(selectedEmployee.basic_salary)}</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded">
                    <p className="text-sm text-gray-500">Daily Rate</p>
                    <p className="font-bold text-lg">{formatCurrency(selectedEmployee.daily_rate)}</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded">
                    <p className="text-sm text-gray-500">Hourly Rate</p>
                    <p className="font-bold text-lg">{formatCurrency(selectedEmployee.hourly_rate)}</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 mt-4">
                  <div className="p-3 bg-blue-50 rounded">
                    <p className="text-sm text-gray-500">Allowance (Monthly)</p>
                    <p className="font-bold text-lg">{formatCurrency(selectedEmployee.allowance)}</p>
                  </div>
                  <div className="p-3 bg-green-50 rounded">
                    <p className="text-sm text-gray-500">Productivity Incentive</p>
                    <p className="font-bold text-lg">{formatCurrency(selectedEmployee.productivity_incentive)}</p>
                  </div>
                  <div className="p-3 bg-purple-50 rounded">
                    <p className="text-sm text-gray-500">Language Incentive</p>
                    <p className="font-bold text-lg">{formatCurrency(selectedEmployee.language_incentive)}</p>
                  </div>
                </div>
              </div>

              {/* Government Contributions */}
              <div className="pt-4 border-t">
                <h4 className="font-semibold mb-3">Government Contributions (Monthly)</h4>
                <div className="grid grid-cols-4 gap-4">
                  <div className="p-3 bg-red-50 rounded">
                    <p className="text-sm text-gray-500">SSS</p>
                    <p className="font-bold text-lg">{formatCurrency(selectedEmployee.sss_contribution)}</p>
                  </div>
                  <div className="p-3 bg-orange-50 rounded">
                    <p className="text-sm text-gray-500">PhilHealth</p>
                    <p className="font-bold text-lg">{formatCurrency(selectedEmployee.philhealth_contribution)}</p>
                  </div>
                  <div className="p-3 bg-yellow-50 rounded">
                    <p className="text-sm text-gray-500">Pag-IBIG</p>
                    <p className="font-bold text-lg">{formatCurrency(selectedEmployee.pagibig_contribution)}</p>
                  </div>
                  <div className="p-3 bg-indigo-50 rounded">
                    <p className="text-sm text-gray-500">Tax</p>
                    <p className="font-bold text-lg">{formatCurrency(selectedEmployee.tax_amount)}</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-4">
                {selectedEmployee.status === 'pending' && (
                  <button
                    onClick={() => {
                      handleVerifyEmployee(selectedEmployee);
                      setShowViewModal(false);
                    }}
                    className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                  >
                    Verify Employee
                  </button>
                )}
                <button
                  onClick={() => {
                    setShowViewModal(false);
                    handleEditEmployee(selectedEmployee);
                  }}
                  className="btn-secondary"
                >
                  Edit Employee
                </button>
                <button
                  onClick={() => setShowViewModal(false)}
                  className="btn-primary"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
