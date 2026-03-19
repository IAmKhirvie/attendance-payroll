import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api, { employeesApi } from '../../api/client';
import dayjs from 'dayjs';

interface DashboardStats {
  totalEmployees: number;
  activeEmployees: number;
  pendingEmployees: number;
}

interface PayrollRunSummary {
  id: number;
  period_start: string;
  period_end: string;
  cutoff: number;
  status: string;
  total_net: number;
  employee_count: number;
  created_at: string;
}

interface ImportHistoryItem {
  id: number;
  batch_id: string;
  filename: string;
  total_records: number;
  imported: number;
  employees_found: number;
  date_from: string | null;
  date_to: string | null;
  created_at: string;
}

export function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalEmployees: 0,
    activeEmployees: 0,
    pendingEmployees: 0,
  });
  const [latestPayroll, setLatestPayroll] = useState<PayrollRunSummary | null>(null);
  const [latestImport, setLatestImport] = useState<ImportHistoryItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      // Get counts by status using separate API calls with status filter
      const [activeData, pendingData, payrollData, importData] = await Promise.all([
        employeesApi.list({ page: 1, page_size: 1, status: 'active' }),
        employeesApi.list({ page: 1, page_size: 1, status: 'pending' }),
        api.get('/payroll/runs', { params: { page: 1, page_size: 1 } }).catch(() => ({ data: { items: [] } })),
        api.get('/attendance/imports', { params: { page: 1, page_size: 1 } }).catch(() => ({ data: { items: [] } })),
      ]);

      setStats({
        totalEmployees: activeData.total + pendingData.total,
        activeEmployees: activeData.total,
        pendingEmployees: pendingData.total,
      });

      if (payrollData.data.items.length > 0) {
        setLatestPayroll(payrollData.data.items[0]);
      }

      if (importData.data.items.length > 0) {
        setLatestImport(importData.data.items[0]);
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div
        className="relative overflow-hidden rounded-2xl p-6 lg:p-8"
        style={{
          background: 'linear-gradient(135deg, #ffffff 0%, #faf9f6 100%)',
          border: '2px solid #e5e5e5',
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.08)',
        }}
      >
        <div className="relative z-10">
          <h1 className="text-2xl lg:text-3xl font-bold mb-2 gradient-text">ICAN Attendance & Payroll</h1>
          <p style={{ color: '#4b5563' }} className="max-w-xl">
            Upload attendance → Review payroll → Download payslips
          </p>
        </div>
        <div className="absolute right-0 top-0 -mt-4 -mr-4 opacity-10">
          <svg width="200" height="200" viewBox="0 0 200 200" fill="#4f46e5">
            <circle cx="100" cy="100" r="80" />
            <circle cx="160" cy="40" r="40" />
          </svg>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      ) : (
        <>
          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link to="/admin/employees" className="card hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Total Employees</p>
                  <p className="text-3xl font-bold text-gray-900">{stats.totalEmployees}</p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
              </div>
              <div className="mt-2 flex gap-4 text-sm">
                <span className="text-green-600">{stats.activeEmployees} active</span>
                {stats.pendingEmployees > 0 && (
                  <span className="text-yellow-600">{stats.pendingEmployees} pending</span>
                )}
              </div>
            </Link>

            <Link to="/admin/attendance" className="card hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Latest Import</p>
                  {latestImport ? (
                    <>
                      <p className="text-lg font-bold text-gray-900">{latestImport.total_records} records</p>
                      <p className="text-sm text-gray-500">{latestImport.employees_found} employees</p>
                    </>
                  ) : (
                    <p className="text-lg text-gray-400">No imports yet</p>
                  )}
                </div>
                <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              {latestImport && (
                <p className="mt-2 text-xs text-gray-400">
                  {dayjs(latestImport.created_at).format('MMM D, YYYY h:mm A')}
                </p>
              )}
            </Link>

            <Link to="/admin/payroll" className="card hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Latest Payroll</p>
                  {latestPayroll ? (
                    <>
                      <p className="text-lg font-bold text-green-600">{formatCurrency(latestPayroll.total_net)}</p>
                      <p className="text-sm text-gray-500">{latestPayroll.employee_count} employees</p>
                    </>
                  ) : (
                    <p className="text-lg text-gray-400">No payroll yet</p>
                  )}
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              {latestPayroll && (
                <div className="mt-2 flex items-center gap-2">
                  <span className={`px-2 py-0.5 text-xs rounded ${
                    latestPayroll.status === 'review' ? 'bg-yellow-100 text-yellow-800' :
                    latestPayroll.status === 'locked' ? 'bg-green-100 text-green-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {latestPayroll.status}
                  </span>
                  <span className="text-xs text-gray-400">
                    {latestPayroll.cutoff === 1 ? '1st' : '2nd'} cutoff
                  </span>
                </div>
              )}
            </Link>
          </div>

          {/* Workflow Guide */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">How It Works</h2>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg">
                <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold shrink-0">1</div>
                <div>
                  <h3 className="font-medium text-gray-900">Upload Attendance</h3>
                  <p className="text-sm text-gray-600 mt-1">Import the NGTimereport XLS file from your biometric device</p>
                  <Link to="/admin/attendance" className="text-sm text-blue-600 hover:underline mt-2 inline-block">
                    Go to Attendance →
                  </Link>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 bg-green-50 rounded-lg">
                <div className="w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center font-bold shrink-0">2</div>
                <div>
                  <h3 className="font-medium text-gray-900">Review Payroll</h3>
                  <p className="text-sm text-gray-600 mt-1">Payroll is auto-generated. Adjust days/salary if needed</p>
                  <Link to="/admin/payroll" className="text-sm text-green-600 hover:underline mt-2 inline-block">
                    Go to Payroll →
                  </Link>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 bg-purple-50 rounded-lg">
                <div className="w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center font-bold shrink-0">3</div>
                <div>
                  <h3 className="font-medium text-gray-900">Download Payslips</h3>
                  <p className="text-sm text-gray-600 mt-1">Print or download payslips as PNG/PDF for distribution</p>
                  <Link to="/admin/payroll" className="text-sm text-purple-600 hover:underline mt-2 inline-block">
                    View Payslips →
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Link
                to="/admin/attendance"
                className="flex flex-col items-center p-4 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
              >
                <svg className="w-8 h-8 text-blue-600 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <span className="text-sm font-medium text-gray-900">Import Attendance</span>
              </Link>

              <Link
                to="/admin/payroll"
                className="flex flex-col items-center p-4 bg-green-50 hover:bg-green-100 rounded-lg transition-colors"
              >
                <svg className="w-8 h-8 text-green-600 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <span className="text-sm font-medium text-gray-900">View Payroll</span>
              </Link>

              <Link
                to="/admin/employees"
                className="flex flex-col items-center p-4 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors"
              >
                <svg className="w-8 h-8 text-purple-600 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <span className="text-sm font-medium text-gray-900">Manage Employees</span>
              </Link>

              <Link
                to="/admin/employees"
                className="flex flex-col items-center p-4 bg-yellow-50 hover:bg-yellow-100 rounded-lg transition-colors"
              >
                <svg className="w-8 h-8 text-yellow-600 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="text-sm font-medium text-gray-900">Employee Rates</span>
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
