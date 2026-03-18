import { useState, useRef, useEffect, useMemo } from 'react';
import api, { employeesApi } from '../../api/client';
import dayjs from 'dayjs';
import { useImportStore } from '../../stores/importStore';

interface Department {
  id: number;
  name: string;
}

interface AttendanceRecord {
  id: number;
  employee_id: number;
  employee_name: string;
  employee_no: string;
  date: string;
  time_in: string | null;
  time_out: string | null;
  worked_minutes: number;
  worked_hours: number;
  late_minutes: number;
  overtime_minutes: number;
  status: string;
  has_exception: boolean;
  exceptions: string[];
}

interface ImportHistoryItem {
  id: number;
  batch_id: string;
  filename: string;
  total_records: number;
  imported: number;
  updated: number;
  skipped: number;
  employees_found: number;
  date_from: string | null;
  date_to: string | null;
  imported_by: string;
  created_at: string;
}

interface ImportedRecord {
  employee_name: string;
  employee_biometric_id: string;
  date: string;
  day_name: string;
  time_in: string | null;
  time_out: string | null;
  worked_minutes: number;
  daily_total_hours: number;
  note: string | null;
  status: string;
  exceptions: string[];
  has_exception: boolean;
}

export function AttendancePage() {
  const { isUploading, uploadProgress, importResult, error, startUpload, clearResult } = useImportStore();
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'import' | 'results' | 'history' | 'records'>('import');
  const [dateFrom, setDateFrom] = useState(dayjs().startOf('month').format('YYYY-MM-DD'));
  const [dateTo, setDateTo] = useState(dayjs().endOf('month').format('YYYY-MM-DD'));
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Department and search filters for records tab
  const [_departments, setDepartments] = useState<Department[]>([]);
  const [_selectedDepartment, _setSelectedDepartment] = useState<string>('all');
  const [recordsSearchTerm, setRecordsSearchTerm] = useState('');
  const [recordsStatusFilter, setRecordsStatusFilter] = useState<string>('all');

  // Import results state
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedEmployees, setExpandedEmployees] = useState<Set<string>>(new Set());
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Import history state
  const [importHistory, setImportHistory] = useState<ImportHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedImport, setSelectedImport] = useState<{
    batch_id: string;
    filename: string;
    summary: { total_records: number; imported: number; updated: number; skipped: number; employees_found: number };
    records: ImportedRecord[];
  } | null>(null);
  const [historySearchTerm, setHistorySearchTerm] = useState('');
  const [historyExpandedEmployees, setHistoryExpandedEmployees] = useState<Set<string>>(new Set());
  const [historyFilterStatus, setHistoryFilterStatus] = useState<string>('all');

  // Employee sync state
  const [showEmployeeList, setShowEmployeeList] = useState(false);
  const [employeeListData, setEmployeeListData] = useState<{
    without_users: Array<{ id: number; employee_no: string; full_name: string; email?: string }>;
    with_users: Array<{ id: number; employee_no: string; full_name: string; user_email: string }>;
    total_without: number;
    total_with: number;
  } | null>(null);
  const [syncingUsers, setSyncingUsers] = useState(false);
  const [syncResult, setSyncResult] = useState<{ message: string; created: number; temp_password: string } | null>(null);

  const loadEmployeeList = async () => {
    try {
      const data = await employeesApi.getWithoutUsers();
      setEmployeeListData(data);
      setShowEmployeeList(true);
    } catch (error) {
      console.error('Failed to load employee list:', error);
      alert('Failed to load employee list');
    }
  };

  const handleSyncUsers = async () => {
    if (!confirm('Create user accounts for all active employees without accounts?\n\nTemporary password: 1441@Ican')) {
      return;
    }
    setSyncingUsers(true);
    try {
      const result = await employeesApi.syncUsers();
      setSyncResult(result);
      // Refresh the list
      const data = await employeesApi.getWithoutUsers();
      setEmployeeListData(data);
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to sync users');
    } finally {
      setSyncingUsers(false);
    }
  };

  // Group records by employee
  const groupedRecords = importResult?.records.reduce((acc, record) => {
    const key = `${record.employee_name}|${record.employee_biometric_id}`;
    if (!acc[key]) {
      acc[key] = {
        name: record.employee_name,
        id: record.employee_biometric_id,
        records: []
      };
    }
    acc[key].records.push(record);
    return acc;
  }, {} as Record<string, { name: string; id: string; records: typeof importResult.records }>) || {};

  // Filter employees by search term and status
  const filteredEmployees = Object.entries(groupedRecords).filter(([_key, data]) => {
    const matchesSearch = searchTerm === '' ||
      data.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      data.id.includes(searchTerm);

    if (!matchesSearch) return false;

    if (filterStatus === 'all') return true;
    if (filterStatus === 'exceptions') return data.records.some(r => r.has_exception);
    if (filterStatus === 'complete') return data.records.some(r => r.status === 'complete');
    if (filterStatus === 'incomplete') return data.records.some(r => r.status === 'incomplete');
    return true;
  });

  const toggleEmployee = (key: string) => {
    const newExpanded = new Set(expandedEmployees);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedEmployees(newExpanded);
  };

  const expandAll = () => {
    setExpandedEmployees(new Set(Object.keys(groupedRecords)));
  };

  const collapseAll = () => {
    setExpandedEmployees(new Set());
  };

  // Group history records by employee (for selected import view)
  const historyGroupedRecords = selectedImport?.records.reduce((acc, record) => {
    const key = `${record.employee_name}|${record.employee_biometric_id}`;
    if (!acc[key]) {
      acc[key] = {
        name: record.employee_name,
        id: record.employee_biometric_id,
        records: []
      };
    }
    acc[key].records.push(record);
    return acc;
  }, {} as Record<string, { name: string; id: string; records: ImportedRecord[] }>) || {};

  // Filter history employees
  const historyFilteredEmployees = Object.entries(historyGroupedRecords).filter(([_key, data]) => {
    const matchesSearch = historySearchTerm === '' ||
      data.name.toLowerCase().includes(historySearchTerm.toLowerCase()) ||
      data.id.includes(historySearchTerm);

    if (!matchesSearch) return false;

    if (historyFilterStatus === 'all') return true;
    if (historyFilterStatus === 'exceptions') return data.records.some(r => r.has_exception);
    if (historyFilterStatus === 'complete') return data.records.some(r => r.status === 'complete');
    if (historyFilterStatus === 'incomplete') return data.records.some(r => r.status === 'incomplete');
    return true;
  });

  const toggleHistoryEmployee = (key: string) => {
    const newExpanded = new Set(historyExpandedEmployees);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setHistoryExpandedEmployees(newExpanded);
  };

  const historyExpandAll = () => {
    setHistoryExpandedEmployees(new Set(Object.keys(historyGroupedRecords)));
  };

  const historyCollapseAll = () => {
    setHistoryExpandedEmployees(new Set());
  };

  // Load departments on mount
  useEffect(() => {
    loadDepartments();
  }, []);

  const loadDepartments = async () => {
    try {
      const response = await api.get('/employees/departments');
      setDepartments(response.data);
    } catch (error) {
      console.error('Failed to load departments:', error);
    }
  };

  // Auto-switch to results tab when import completes
  useEffect(() => {
    if (importResult && !isUploading) {
      setActiveTab('results');
      // Refresh history when new import completes
      loadImportHistory();
    }
  }, [importResult, isUploading]);

  useEffect(() => {
    if (activeTab === 'records') {
      loadAttendance();
    }
    if (activeTab === 'history') {
      loadImportHistory();
    }
  }, [activeTab, dateFrom, dateTo]);

  // Filter attendance records
  const filteredAttendance = useMemo(() => {
    return attendance.filter(record => {
      // Search filter
      if (recordsSearchTerm) {
        const searchLower = recordsSearchTerm.toLowerCase();
        if (!record.employee_name.toLowerCase().includes(searchLower) &&
            !record.employee_no.toLowerCase().includes(searchLower)) {
          return false;
        }
      }

      // Status filter
      if (recordsStatusFilter !== 'all') {
        if (recordsStatusFilter === 'exceptions' && !record.has_exception) return false;
        if (recordsStatusFilter === 'complete' && record.status !== 'complete') return false;
        if (recordsStatusFilter === 'incomplete' && record.status !== 'incomplete') return false;
        if (recordsStatusFilter === 'late' && record.late_minutes === 0) return false;
        if (recordsStatusFilter === 'overtime' && record.overtime_minutes === 0) return false;
      }

      return true;
    });
  }, [attendance, recordsSearchTerm, recordsStatusFilter]);

  const loadImportHistory = async () => {
    setHistoryLoading(true);
    try {
      const response = await api.get('/attendance/imports');
      setImportHistory(response.data.items);
    } catch (error) {
      console.error('Failed to load import history:', error);
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadImportDetail = async (batchId: string) => {
    setHistoryLoading(true);
    try {
      const response = await api.get(`/attendance/imports/${batchId}`);
      setSelectedImport(response.data);
      setHistoryExpandedEmployees(new Set());
      setHistorySearchTerm('');
      setHistoryFilterStatus('all');
    } catch (error) {
      console.error('Failed to load import detail:', error);
    } finally {
      setHistoryLoading(false);
    }
  };

  const deleteImport = async (batchId: string) => {
    if (!confirm('Are you sure you want to delete this import record? This only removes the history entry, not the attendance records.')) {
      return;
    }
    try {
      await api.delete(`/attendance/imports/${batchId}`);
      loadImportHistory();
      if (selectedImport?.batch_id === batchId) {
        setSelectedImport(null);
      }
    } catch (error) {
      console.error('Failed to delete import:', error);
    }
  };

  const loadAttendance = async () => {
    setLoading(true);
    try {
      const response = await api.get('/attendance', {
        params: { date_from: dateFrom, date_to: dateTo, page_size: 100 }
      });
      setAttendance(response.data.items);
    } catch (error) {
      console.error('Failed to load attendance:', error);
    } finally {
      setLoading(false);
    }
  };

  const [forceReimport, setForceReimport] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Start upload in global store (continues even when navigating away)
    startUpload(file, { forceReimport });
    setForceReimport(false);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getStatusBadge = (status: string, hasException: boolean) => {
    const colors: Record<string, string> = {
      complete: 'bg-green-100 text-green-800',
      incomplete: 'bg-yellow-100 text-yellow-800',
      absent: 'bg-red-100 text-red-800',
      rest_day: 'bg-gray-100 text-gray-800',
      on_leave: 'bg-blue-100 text-blue-800'
    };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded ${colors[status] || 'bg-gray-100'} ${hasException ? 'ring-2 ring-orange-400' : ''}`}>
        {status.replace('_', ' ')}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Attendance Management</h1>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('import')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'import'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Import File
          </button>
          <button
            onClick={() => setActiveTab('results')}
            className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
              activeTab === 'results'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Import Results
            {importResult && (
              <span className="bg-green-100 text-green-800 text-xs px-2 py-0.5 rounded-full">
                {importResult.summary.total_records}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
              activeTab === 'history'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Import History
            {importHistory.length > 0 && (
              <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">
                {importHistory.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('records')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'records'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Attendance Records
          </button>
        </nav>
      </div>

      {activeTab === 'import' && (
        <div className="space-y-6">
          {/* Instructions Card */}
          <div className="card bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
            <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              How to Import Attendance
            </h2>
            <ol className="list-decimal list-inside space-y-2 text-gray-700 text-sm">
              <li><strong>Export from biometric device:</strong> Get the NGTimereport XLS file from your time tracking system</li>
              <li><strong>Upload the file:</strong> Click the upload area below or drag and drop your file</li>
              <li><strong>Review results:</strong> Check the imported attendance records for any issues</li>
              <li><strong>Payroll auto-generated:</strong> The system automatically creates payroll based on attendance</li>
              <li><strong>Review payroll:</strong> Go to Payroll page to review and adjust if needed (e.g., partial days for some teachers)</li>
            </ol>
            <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                <strong>Note:</strong> If a teacher only works 2 days, you can adjust their payroll in the Payroll section after import.
              </p>
            </div>
          </div>

          {/* Upload Card */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Upload Time Report</h2>

            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".xls,.xlsx"
              className="hidden"
              id="file-upload"
              disabled={isUploading}
            />
            <label htmlFor="file-upload" className="cursor-pointer">
              <div className="text-gray-500">
                {isUploading ? (
                  <div className="flex flex-col items-center justify-center py-4">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600 mb-3"></div>
                    <p className="text-lg font-medium text-primary-600">{uploadProgress || 'Processing file...'}</p>
                    <p className="text-sm text-gray-500 mt-1">You can navigate away - import will continue</p>
                  </div>
                ) : (
                  <>
                    <svg className="mx-auto h-16 w-16 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                      <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <p className="mt-4 text-lg">
                      <span className="text-primary-600 font-medium">Click to upload</span> or drag and drop
                    </p>
                    <p className="text-sm mt-1">XLS or XLSX files only</p>
                  </>
                )}
              </div>
            </label>
          </div>

            {/* Error Display */}
            {error && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <p className="text-red-700">{error}</p>
                    {error.includes('already been imported') && (
                      <div className="mt-3 flex items-center gap-3">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={forceReimport}
                            onChange={(e) => setForceReimport(e.target.checked)}
                            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          />
                          <span className="text-gray-700">Replace existing import data</span>
                        </label>
                        {forceReimport && (
                          <span className="text-xs text-gray-500">(Upload the file again to replace)</span>
                        )}
                      </div>
                    )}
                  </div>
                  <button onClick={clearResult} className="text-red-500 hover:text-red-700 whitespace-nowrap">
                    Dismiss
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'results' && (
        <div className="space-y-4">
          {!importResult ? (
            <div className="card text-center py-12 text-gray-500">
              <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p>No import results yet.</p>
              <p className="text-sm mt-1">Upload a file in the "Import File" tab to see results here.</p>
            </div>
          ) : (
            <>
              {/* Payroll Generated Card */}
              {importResult.payroll && !importResult.payroll.error && (
                <div className="card bg-gradient-to-r from-green-50 to-emerald-50 border-green-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                        <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Payroll Auto-Generated
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">
                        {importResult.payroll.cutoff === 1 ? '1st Cutoff' : '2nd Cutoff'} • {importResult.payroll.period_start} to {importResult.payroll.period_end}
                      </p>
                      <div className="flex gap-4 mt-2 text-sm">
                        <span><strong>{importResult.payroll.employee_count}</strong> employees</span>
                        <span>Total Net: <strong className="text-green-700">₱{importResult.payroll.total_net?.toLocaleString()}</strong></span>
                      </div>
                    </div>
                    <a
                      href="/admin/payroll"
                      className="bg-green-600 hover:bg-green-700 text-white font-semibold px-6 py-3 rounded-lg shadow-md transition-colors"
                    >
                      Review Payroll →
                    </a>
                  </div>
                </div>
              )}

              {importResult.payroll?.error && (
                <div className="card bg-yellow-50 border-yellow-200">
                  <p className="text-yellow-800">
                    <strong>Note:</strong> Payroll could not be auto-generated: {importResult.payroll.error}
                  </p>
                  <p className="text-sm text-yellow-700 mt-1">You can create payroll manually in the Payroll section.</p>
                </div>
              )}

              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="card text-center py-3">
                  <p className="text-2xl font-bold text-blue-600">{importResult.summary.total_records}</p>
                  <p className="text-xs text-gray-600">Total Records</p>
                </div>
                <div className="card text-center py-3">
                  <p className="text-2xl font-bold text-green-600">{importResult.summary.imported}</p>
                  <p className="text-xs text-gray-600">New</p>
                </div>
                <div className="card text-center py-3">
                  <p className="text-2xl font-bold text-yellow-600">{importResult.summary.updated}</p>
                  <p className="text-xs text-gray-600">Updated</p>
                </div>
                <div className="card text-center py-3">
                  <p className="text-2xl font-bold text-gray-600">{importResult.summary.skipped}</p>
                  <p className="text-xs text-gray-600">Skipped</p>
                </div>
                <div className="card text-center py-3">
                  <p className="text-2xl font-bold text-purple-600">{importResult.summary.employees_found}</p>
                  <p className="text-xs text-gray-600">Employees</p>
                </div>
              </div>

              {/* Extract Employee Names Button */}
              <div className="card bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">Register Extracted Employees</h3>
                    <p className="text-sm text-gray-600">Create login accounts for employees so they can view their attendance and payslips</p>
                  </div>
                  <button
                    onClick={loadEmployeeList}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg shadow-md transition-colors"
                  >
                    Register Employees
                  </button>
                </div>
              </div>

              {/* Search and Filter Bar */}
              <div className="card">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex flex-1 gap-3">
                    <input
                      type="text"
                      placeholder="Search employee name or ID..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white"
                    >
                      <option value="all">All Status</option>
                      <option value="exceptions">With Issues</option>
                      <option value="complete">Complete</option>
                      <option value="incomplete">Incomplete</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={expandAll} className="btn-secondary text-sm">
                      Expand All
                    </button>
                    <button onClick={collapseAll} className="btn-secondary text-sm">
                      Collapse All
                    </button>
                    <button onClick={clearResult} className="text-sm text-red-600 hover:text-red-800 px-3">
                      Clear
                    </button>
                  </div>
                </div>
                <p className="text-sm text-gray-500 mt-3">
                  Showing {filteredEmployees.length} of {Object.keys(groupedRecords).length} employees
                </p>
              </div>

              {/* Employee Cards */}
              <div className="space-y-3">
                {filteredEmployees.map(([key, data]) => {
                  const isExpanded = expandedEmployees.has(key);
                  const totalHours = data.records.reduce((sum, r) => sum + (r.daily_total_hours || 0), 0);
                  const hasExceptions = data.records.some(r => r.has_exception);
                  const exceptionCount = data.records.filter(r => r.has_exception).length;

                  return (
                    <div key={key} className={`card p-0 overflow-hidden ${hasExceptions ? 'ring-2 ring-orange-300' : ''}`}>
                      {/* Employee Header - Clickable */}
                      <button
                        onClick={() => toggleEmployee(key)}
                        className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                            <span className="text-primary-700 font-semibold text-sm">
                              {data.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                            </span>
                          </div>
                          <div className="text-left">
                            <p className="font-semibold text-gray-900">{data.name}</p>
                            <p className="text-sm text-gray-500">ID: {data.id}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="font-semibold text-gray-900">{totalHours.toFixed(1)}h</p>
                            <p className="text-xs text-gray-500">{data.records.length} days</p>
                          </div>
                          {hasExceptions && (
                            <span className="px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded-full">
                              {exceptionCount} issues
                            </span>
                          )}
                          <svg
                            className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </button>

                      {/* Attendance Details - Collapsible */}
                      {isExpanded && (
                        <div className="border-t">
                          <table className="w-full">
                            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                              <tr>
                                <th className="px-4 py-2 text-left">Date</th>
                                <th className="px-4 py-2 text-left">Day</th>
                                <th className="px-4 py-2 text-left">Time In</th>
                                <th className="px-4 py-2 text-left">Time Out</th>
                                <th className="px-4 py-2 text-left">Hours</th>
                                <th className="px-4 py-2 text-left">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {data.records.map((record, idx) => (
                                <tr key={idx} className={record.status === 'incomplete' ? 'bg-yellow-50' : record.status === 'absent' ? 'bg-red-50' : 'hover:bg-gray-50'}>
                                  <td className="px-4 py-2 text-sm">{record.date}</td>
                                  <td className="px-4 py-2 text-sm text-gray-500">{record.day_name}</td>
                                  <td className="px-4 py-2 text-sm font-medium">{record.time_in || '-'}</td>
                                  <td className="px-4 py-2 text-sm font-medium">{record.time_out || '-'}</td>
                                  <td className="px-4 py-2 text-sm">{record.daily_total_hours || '-'}</td>
                                  <td className="px-4 py-2">
                                    {getStatusBadge(record.status, record.has_exception)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="space-y-4">
          {historyLoading && !selectedImport ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          ) : selectedImport ? (
            // Viewing specific import details
            <>
              {/* Back button and header */}
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setSelectedImport(null)}
                  className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Back to History
                </button>
                <div className="text-right">
                  <p className="font-semibold text-gray-900">{selectedImport.filename}</p>
                  <p className="text-sm text-gray-500">Batch: {selectedImport.batch_id}</p>
                </div>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="card text-center py-3">
                  <p className="text-2xl font-bold text-blue-600">{selectedImport.summary.total_records}</p>
                  <p className="text-xs text-gray-600">Total Records</p>
                </div>
                <div className="card text-center py-3">
                  <p className="text-2xl font-bold text-green-600">{selectedImport.summary.imported}</p>
                  <p className="text-xs text-gray-600">New</p>
                </div>
                <div className="card text-center py-3">
                  <p className="text-2xl font-bold text-yellow-600">{selectedImport.summary.updated}</p>
                  <p className="text-xs text-gray-600">Updated</p>
                </div>
                <div className="card text-center py-3">
                  <p className="text-2xl font-bold text-gray-600">{selectedImport.summary.skipped}</p>
                  <p className="text-xs text-gray-600">Skipped</p>
                </div>
                <div className="card text-center py-3">
                  <p className="text-2xl font-bold text-purple-600">{selectedImport.summary.employees_found}</p>
                  <p className="text-xs text-gray-600">Employees</p>
                </div>
              </div>

              {/* Search and Filter Bar */}
              <div className="card">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex flex-1 gap-3">
                    <input
                      type="text"
                      placeholder="Search employee name or ID..."
                      value={historySearchTerm}
                      onChange={(e) => setHistorySearchTerm(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                    <select
                      value={historyFilterStatus}
                      onChange={(e) => setHistoryFilterStatus(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white"
                    >
                      <option value="all">All Status</option>
                      <option value="exceptions">With Issues</option>
                      <option value="complete">Complete</option>
                      <option value="incomplete">Incomplete</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={historyExpandAll} className="btn-secondary text-sm">
                      Expand All
                    </button>
                    <button onClick={historyCollapseAll} className="btn-secondary text-sm">
                      Collapse All
                    </button>
                  </div>
                </div>
                <p className="text-sm text-gray-500 mt-3">
                  Showing {historyFilteredEmployees.length} of {Object.keys(historyGroupedRecords).length} employees
                </p>
              </div>

              {/* Employee Cards */}
              <div className="space-y-3">
                {historyFilteredEmployees.map(([key, data]) => {
                  const isExpanded = historyExpandedEmployees.has(key);
                  const totalHours = data.records.reduce((sum, r) => sum + (r.daily_total_hours || 0), 0);
                  const hasExceptions = data.records.some(r => r.has_exception);
                  const exceptionCount = data.records.filter(r => r.has_exception).length;

                  return (
                    <div key={key} className={`card p-0 overflow-hidden ${hasExceptions ? 'ring-2 ring-orange-300' : ''}`}>
                      <button
                        onClick={() => toggleHistoryEmployee(key)}
                        className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                            <span className="text-primary-700 font-semibold text-sm">
                              {data.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                            </span>
                          </div>
                          <div className="text-left">
                            <p className="font-semibold text-gray-900">{data.name}</p>
                            <p className="text-sm text-gray-500">ID: {data.id}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="font-semibold text-gray-900">{totalHours.toFixed(1)}h</p>
                            <p className="text-xs text-gray-500">{data.records.length} days</p>
                          </div>
                          {hasExceptions && (
                            <span className="px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded-full">
                              {exceptionCount} issues
                            </span>
                          )}
                          <svg
                            className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="border-t">
                          <table className="w-full">
                            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                              <tr>
                                <th className="px-4 py-2 text-left">Date</th>
                                <th className="px-4 py-2 text-left">Day</th>
                                <th className="px-4 py-2 text-left">Time In</th>
                                <th className="px-4 py-2 text-left">Time Out</th>
                                <th className="px-4 py-2 text-left">Hours</th>
                                <th className="px-4 py-2 text-left">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {data.records.map((record, idx) => (
                                <tr key={idx} className={record.status === 'incomplete' ? 'bg-yellow-50' : record.status === 'absent' ? 'bg-red-50' : 'hover:bg-gray-50'}>
                                  <td className="px-4 py-2 text-sm">{record.date}</td>
                                  <td className="px-4 py-2 text-sm text-gray-500">{record.day_name}</td>
                                  <td className="px-4 py-2 text-sm font-medium">{record.time_in || '-'}</td>
                                  <td className="px-4 py-2 text-sm font-medium">{record.time_out || '-'}</td>
                                  <td className="px-4 py-2 text-sm">{record.daily_total_hours || '-'}</td>
                                  <td className="px-4 py-2">
                                    {getStatusBadge(record.status, record.has_exception)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : importHistory.length === 0 ? (
            <div className="card text-center py-12 text-gray-500">
              <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p>No import history found.</p>
              <p className="text-sm mt-1">Import a file to start tracking history.</p>
            </div>
          ) : (
            // Import history list
            <div className="card">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Import History</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Filename</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Period</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Records</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employees</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Imported By</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {importHistory.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          {dayjs(item.created_at).format('MMM D, YYYY h:mm A')}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{item.filename}</div>
                          <div className="text-xs text-gray-500">Batch: {item.batch_id}</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                          {item.date_from && item.date_to ? (
                            <>
                              {dayjs(item.date_from).format('MMM D')} - {dayjs(item.date_to).format('MMM D, YYYY')}
                            </>
                          ) : '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-sm font-medium">{item.total_records}</div>
                          <div className="text-xs text-gray-500">
                            <span className="text-green-600">{item.imported} new</span>
                            {item.updated > 0 && <span className="text-yellow-600 ml-1">{item.updated} upd</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">{item.employees_found}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{item.imported_by}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          <div className="flex gap-2">
                            <button
                              onClick={() => loadImportDetail(item.batch_id)}
                              className="text-primary-600 hover:text-primary-800"
                            >
                              View
                            </button>
                            <button
                              onClick={() => deleteImport(item.batch_id)}
                              className="text-red-600 hover:text-red-800"
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
            </div>
          )}
        </div>
      )}

      {activeTab === 'records' && (
        <div className="card">
          {/* Date Range Filters */}
          <div className="flex flex-wrap gap-4 mb-4">
            <div>
              <label className="form-label">From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="form-input"
              />
            </div>
            <div>
              <label className="form-label">To</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="form-input"
              />
            </div>
            <div className="flex items-end">
              <button onClick={loadAttendance} className="btn-primary">
                Load Records
              </button>
            </div>
          </div>

          {/* Search and Filter Controls */}
          <div className="flex flex-wrap gap-4 mb-4 pb-4 border-b">
            <div className="flex-1 min-w-[200px]">
              <input
                type="text"
                placeholder="Search by name or employee no..."
                value={recordsSearchTerm}
                onChange={(e) => setRecordsSearchTerm(e.target.value)}
                className="form-input"
              />
            </div>
            <div>
              <select
                value={recordsStatusFilter}
                onChange={(e) => setRecordsStatusFilter(e.target.value)}
                className="form-input"
              >
                <option value="all">All Status</option>
                <option value="complete">Complete</option>
                <option value="incomplete">Incomplete</option>
                <option value="exceptions">With Exceptions</option>
                <option value="late">Late</option>
                <option value="overtime">With Overtime</option>
              </select>
            </div>
            {(recordsSearchTerm || recordsStatusFilter !== 'all') && (
              <button
                onClick={() => {
                  setRecordsSearchTerm('');
                  setRecordsStatusFilter('all');
                }}
                className="text-sm text-gray-500 hover:text-gray-700 underline"
              >
                Clear filters
              </button>
            )}
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          ) : attendance.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No attendance records found. Import attendance data to get started.
            </div>
          ) : filteredAttendance.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No records match your filters. Try adjusting your search criteria.
            </div>
          ) : (
            <>
              <div className="text-sm text-gray-500 mb-2">
                Showing {filteredAttendance.length} of {attendance.length} records
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time In</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time Out</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hours</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Late</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">OT</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredAttendance.map((record) => (
                      <tr key={record.id} className={record.has_exception ? 'bg-orange-50' : 'hover:bg-gray-50'}>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{record.employee_name}</div>
                          <div className="text-xs text-gray-500">{record.employee_no}</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          {dayjs(record.date).format('ddd, MMM D, YYYY')}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">{record.time_in || '-'}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">{record.time_out || '-'}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">{record.worked_hours}h</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          {record.late_minutes > 0 ? (
                            <span className="text-red-600">{record.late_minutes}m</span>
                          ) : '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          {record.overtime_minutes > 0 ? (
                            <span className="text-green-600">{record.overtime_minutes}m</span>
                          ) : '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {getStatusBadge(record.status, record.has_exception)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Employee List Modal - Global */}
      {showEmployeeList && employeeListData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Register Extracted Employees</h2>
              <button onClick={() => { setShowEmployeeList(false); setSyncResult(null); }} className="text-gray-500 hover:text-gray-700">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {syncResult && (
              <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-green-700 font-medium">{syncResult.message}</p>
                <p className="text-sm text-green-600 mt-1">
                  Temporary password: <span className="font-mono font-bold">{syncResult.temp_password}</span>
                </p>
              </div>
            )}

            <div className="flex gap-4 mb-4">
              <div className="flex-1 p-3 bg-yellow-50 rounded-lg text-center">
                <p className="text-2xl font-bold text-yellow-600">{employeeListData.total_without}</p>
                <p className="text-xs text-gray-600">Without Account</p>
              </div>
              <div className="flex-1 p-3 bg-green-50 rounded-lg text-center">
                <p className="text-2xl font-bold text-green-600">{employeeListData.total_with}</p>
                <p className="text-xs text-gray-600">With Account</p>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 border rounded-lg">
              {employeeListData.without_users.length > 0 && (
                <>
                  <div className="bg-yellow-50 px-4 py-2 border-b sticky top-0">
                    <span className="font-medium text-yellow-800">Employees WITHOUT User Account</span>
                  </div>
                  <div className="divide-y">
                    {employeeListData.without_users.map((emp) => (
                      <div key={emp.id} className="px-4 py-2 flex justify-between items-center">
                        <div>
                          <p className="font-medium">{emp.full_name}</p>
                          <p className="text-xs text-gray-500">{emp.employee_no}</p>
                        </div>
                        <span className="text-xs text-yellow-600 bg-yellow-100 px-2 py-1 rounded">No account</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {employeeListData.with_users.length > 0 && (
                <>
                  <div className="bg-green-50 px-4 py-2 border-b sticky top-0">
                    <span className="font-medium text-green-800">Employees WITH User Account</span>
                  </div>
                  <div className="divide-y">
                    {employeeListData.with_users.map((emp) => (
                      <div key={emp.id} className="px-4 py-2 flex justify-between items-center">
                        <div>
                          <p className="font-medium">{emp.full_name}</p>
                          <p className="text-xs text-gray-500">{emp.employee_no} - {emp.user_email}</p>
                        </div>
                        <span className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded">Has account</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {employeeListData.without_users.length === 0 && employeeListData.with_users.length === 0 && (
                <div className="p-8 text-center text-gray-500">
                  <p>No active employees found.</p>
                  <p className="text-sm mt-1">Import attendance data first to create employees.</p>
                </div>
              )}
            </div>

            <div className="mt-4 flex justify-between items-center">
              <p className="text-sm text-gray-500">
                Temp password: <span className="font-mono font-bold">1441@Ican</span>
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowEmployeeList(false); setSyncResult(null); }}
                  className="btn-secondary"
                >
                  Close
                </button>
                {employeeListData.total_without > 0 && (
                  <button
                    onClick={handleSyncUsers}
                    disabled={syncingUsers}
                    className="bg-green-600 hover:bg-green-700 text-white font-semibold px-6 py-2 rounded-lg shadow-md transition-colors disabled:opacity-50"
                  >
                    {syncingUsers ? 'Registering...' : `Register ${employeeListData.total_without} Employees`}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
