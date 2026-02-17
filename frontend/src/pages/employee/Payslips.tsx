import { useState, useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { payrollApi } from '../../api/client';
import type { Payslip } from '../../types';
import dayjs from 'dayjs';

interface PayslipDetail {
  id: number;
  payroll_run_id: number;
  employee_id: number;
  employee_name?: string;
  employee_no?: string;
  period_start?: string;
  period_end?: string;
  earnings?: Record<string, number>;
  deductions?: Record<string, number>;
  total_earnings?: number;
  total_deductions?: number;
  net_pay: number;
  days_worked?: number;
  days_absent?: number;
  late_count?: number;
  total_late_minutes?: number;
  overtime_hours?: number;
}

interface AttendanceRecord {
  id: number;
  date: string;
  time_in: string | null;
  time_out: string | null;
  worked_hours: number;
  late_minutes: number;
  overtime_minutes: number;
  status: string;
}

interface AttendanceSummary {
  total_days: number;
  present_days: number;
  absent_days: number;
  late_count: number;
  total_late_minutes: number;
  total_overtime_minutes: number;
  total_overtime_hours: number;
}

export function EmployeePayslipsPage() {
  const { user } = useAuthStore();
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPayslip, setSelectedPayslip] = useState<PayslipDetail | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [attendanceSummary, setAttendanceSummary] = useState<AttendanceSummary | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [activeTab, setActiveTab] = useState<'earnings' | 'attendance'>('earnings');

  useEffect(() => {
    if (user?.employee_id) {
      loadPayslips();
    } else {
      setLoading(false);
    }
  }, [user?.employee_id]);

  const loadPayslips = async () => {
    if (!user?.employee_id) return;

    setLoading(true);
    try {
      const response = await payrollApi.listPayslips({
        employee_id: user.employee_id,
      });
      setPayslips(response.items);
    } catch (error) {
      console.error('Failed to load payslips:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPayslipDetail = async (payslipId: number) => {
    setLoadingDetail(true);
    setActiveTab('earnings');
    try {
      const [detail, attendanceData] = await Promise.all([
        payrollApi.getPayslip(payslipId),
        payrollApi.getPayslipAttendance(payslipId)
      ]);
      setSelectedPayslip(detail);
      setAttendance(attendanceData.records);
      setAttendanceSummary(attendanceData.summary);
    } catch (error) {
      console.error('Failed to load payslip detail:', error);
    } finally {
      setLoadingDetail(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
    }).format(amount);
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      present: 'bg-green-100 text-green-800',
      absent: 'bg-red-100 text-red-800',
      late: 'bg-yellow-100 text-yellow-800',
      incomplete: 'bg-gray-100 text-gray-800',
    };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded ${colors[status] || 'bg-gray-100'}`}>
        {status}
      </span>
    );
  };

  const formatEarningLabel = (key: string): string => {
    const labels: Record<string, string> = {
      basic_semi: 'Basic Pay (Semi)',
      basic_salary: 'Basic Salary',
      allowance: 'Allowance',
      allowance_semi: 'Allowance (Semi)',
      productivity_incentive: 'Productivity Incentive',
      productivity_semi: 'Productivity (Semi)',
      language_incentive: 'Language Incentive',
      language_semi: 'Language (Semi)',
      regular_holiday: 'Regular Holiday',
      regular_holiday_ot: 'Regular Holiday OT',
      snwh: 'Special Non-Working Holiday',
      snwh_ot: 'SNWH OT',
      overtime: 'Overtime',
      night_diff: 'Night Differential',
    };
    return labels[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  const formatDeductionLabel = (key: string): string => {
    const labels: Record<string, string> = {
      sss: 'SSS',
      philhealth: 'PhilHealth',
      pagibig: 'Pag-IBIG',
      tax: 'Withholding Tax',
      absences: 'Absences',
      late: 'Late',
      loans: 'Loans',
      ca: 'Cash Advance',
      other: 'Other',
    };
    return labels[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  if (!user?.employee_id) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">My Payslips</h1>
        <div className="card">
          <div className="text-center py-12 text-gray-500">
            <p>Your account is not yet linked to an employee record.</p>
            <p className="text-sm mt-2">Please contact HR to link your account.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">My Payslips</h1>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : payslips.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No payslips available yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Period
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Gross Pay
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Deductions
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Net Pay
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {payslips.map((payslip) => (
                  <tr key={payslip.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      Payroll #{payslip.payroll_run_id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {formatCurrency(payslip.gross_pay)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-red-600">
                      -{formatCurrency(payslip.total_deductions)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap font-semibold text-green-600">
                      {formatCurrency(payslip.net_pay)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => loadPayslipDetail(payslip.id)}
                        className="text-primary-600 hover:text-primary-800 text-sm font-medium"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payslip Detail Modal */}
      {(selectedPayslip || loadingDetail) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {loadingDetail ? (
              <div className="p-12 flex justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
              </div>
            ) : selectedPayslip && (
              <div className="p-6">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h2 className="text-lg font-semibold">Payslip Details</h2>
                    {selectedPayslip.period_start && selectedPayslip.period_end && (
                      <p className="text-sm text-gray-500">
                        {dayjs(selectedPayslip.period_start).format('MMM D')} - {dayjs(selectedPayslip.period_end).format('MMM D, YYYY')}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setSelectedPayslip(null);
                      setAttendance([]);
                      setAttendanceSummary(null);
                    }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b mb-4">
                  <button
                    onClick={() => setActiveTab('earnings')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                      activeTab === 'earnings'
                        ? 'border-primary-500 text-primary-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Earnings & Deductions
                  </button>
                  <button
                    onClick={() => setActiveTab('attendance')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                      activeTab === 'attendance'
                        ? 'border-primary-500 text-primary-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Attendance ({attendanceSummary?.total_days || 0} days)
                  </button>
                </div>

                {activeTab === 'earnings' ? (
                  <>
                    {/* Earnings */}
                    <div className="mb-6">
                      <h3 className="text-sm font-medium text-gray-500 mb-2">Earnings</h3>
                      <div className="space-y-2">
                        {selectedPayslip.earnings && Object.entries(selectedPayslip.earnings)
                          .filter(([_, value]) => value > 0)
                          .map(([key, value]) => (
                            <div key={key} className="flex justify-between">
                              <span className="text-sm">{formatEarningLabel(key)}</span>
                              <span className="text-sm">{formatCurrency(value)}</span>
                            </div>
                          ))
                        }
                        <div className="flex justify-between font-semibold border-t pt-2">
                          <span>Total Earnings</span>
                          <span>{formatCurrency(selectedPayslip.total_earnings || 0)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Deductions */}
                    <div className="mb-6">
                      <h3 className="text-sm font-medium text-gray-500 mb-2">Deductions</h3>
                      <div className="space-y-2">
                        {selectedPayslip.deductions && Object.entries(selectedPayslip.deductions)
                          .filter(([_, value]) => value > 0)
                          .map(([key, value]) => (
                            <div key={key} className="flex justify-between">
                              <span className="text-sm">{formatDeductionLabel(key)}</span>
                              <span className="text-sm text-red-600">-{formatCurrency(value)}</span>
                            </div>
                          ))
                        }
                        <div className="flex justify-between font-semibold border-t pt-2 text-red-600">
                          <span>Total Deductions</span>
                          <span>-{formatCurrency(selectedPayslip.total_deductions || 0)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Attendance Summary (compact) */}
                    {attendanceSummary && (
                      <div className="mb-6 bg-gray-50 rounded-lg p-4">
                        <h3 className="text-sm font-medium text-gray-500 mb-2">Attendance Summary</h3>
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <span className="text-gray-500">Present:</span>{' '}
                            <span className="font-medium text-green-600">{attendanceSummary.present_days} days</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Absent:</span>{' '}
                            <span className="font-medium text-red-600">{attendanceSummary.absent_days} days</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Late:</span>{' '}
                            <span className="font-medium text-yellow-600">{attendanceSummary.late_count}x ({attendanceSummary.total_late_minutes}m)</span>
                          </div>
                          {attendanceSummary.total_overtime_hours > 0 && (
                            <div>
                              <span className="text-gray-500">Overtime:</span>{' '}
                              <span className="font-medium text-blue-600">{attendanceSummary.total_overtime_hours} hrs</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Net Pay */}
                    <div className="bg-green-50 rounded-lg p-4">
                      <div className="flex justify-between text-lg font-bold text-green-700">
                        <span>Net Pay</span>
                        <span>{formatCurrency(selectedPayslip.net_pay)}</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Attendance Records */}
                    {attendanceSummary && (
                      <div className="mb-4 bg-gray-50 rounded-lg p-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div className="text-center">
                            <div className="text-2xl font-bold text-green-600">{attendanceSummary.present_days}</div>
                            <div className="text-gray-500">Present</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-red-600">{attendanceSummary.absent_days}</div>
                            <div className="text-gray-500">Absent</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-yellow-600">{attendanceSummary.late_count}</div>
                            <div className="text-gray-500">Late</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-blue-600">{attendanceSummary.total_overtime_hours}</div>
                            <div className="text-gray-500">OT Hours</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {attendance.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        No attendance records for this period.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">In</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Out</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Hours</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {attendance.map((record) => (
                              <tr key={record.id} className="hover:bg-gray-50">
                                <td className="px-3 py-2 whitespace-nowrap">
                                  {dayjs(record.date).format('ddd, MMM D')}
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap">
                                  {record.time_in || '-'}
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap">
                                  {record.time_out || '-'}
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap">
                                  {record.worked_hours > 0 ? `${record.worked_hours}h` : '-'}
                                  {record.late_minutes > 0 && (
                                    <span className="text-yellow-600 text-xs ml-1">(-{record.late_minutes}m)</span>
                                  )}
                                  {record.overtime_minutes > 0 && (
                                    <span className="text-blue-600 text-xs ml-1">(+{Math.round(record.overtime_minutes / 60 * 10) / 10}h OT)</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap">
                                  {getStatusBadge(record.status)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}

                <div className="flex gap-2 mt-6">
                  <button
                    onClick={() => payrollApi.downloadPayslipPdf(selectedPayslip.id)}
                    className="btn-primary flex-1"
                  >
                    Download PDF
                  </button>
                  <button
                    onClick={() => {
                      setSelectedPayslip(null);
                      setAttendance([]);
                      setAttendanceSummary(null);
                    }}
                    className="btn-secondary flex-1"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
