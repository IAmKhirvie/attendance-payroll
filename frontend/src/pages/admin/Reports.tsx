import { useState } from 'react';
import { reportsApi } from '../../api/client';

type ReportType = 'payroll-summary' | 'attendance' | 'sss-r3' | 'philhealth-rf1' | 'pagibig-mcr';

const months = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

export default function ReportsPage() {
  const [selectedReport, setSelectedReport] = useState<ReportType>('payroll-summary');
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<any>(null);
  const [error, setError] = useState('');

  const reports = [
    {
      id: 'payroll-summary' as ReportType,
      name: 'Monthly Payroll Summary',
      description: 'Summary of payroll by department with government contribution totals',
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      id: 'attendance' as ReportType,
      name: 'Attendance Report',
      description: 'Attendance summary with late, absent, and overtime tracking',
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      id: 'sss-r3' as ReportType,
      name: 'SSS R3',
      description: 'Monthly SSS Contribution Report for submission',
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      id: 'philhealth-rf1' as ReportType,
      name: 'PhilHealth RF-1',
      description: 'Monthly PhilHealth Premium Remittance Report',
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      id: 'pagibig-mcr' as ReportType,
      name: 'Pag-IBIG MCR',
      description: 'Monthly Pag-IBIG Collection Report',
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
  ];

  const generateReport = async () => {
    setLoading(true);
    setError('');
    setReportData(null);

    try {
      let data;
      switch (selectedReport) {
        case 'payroll-summary':
          data = await reportsApi.getPayrollSummary(year, month);
          break;
        case 'attendance':
          if (!startDate || !endDate) {
            setError('Please select start and end dates');
            setLoading(false);
            return;
          }
          data = await reportsApi.getAttendance(startDate, endDate);
          break;
        case 'sss-r3':
          data = await reportsApi.getSSR3(year, month);
          break;
        case 'philhealth-rf1':
          data = await reportsApi.getPhilHealthRF1(year, month);
          break;
        case 'pagibig-mcr':
          data = await reportsApi.getPagIBIGMCR(year, month);
          break;
      }
      setReportData(data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  const downloadCsv = async () => {
    setLoading(true);
    try {
      let blob;
      let filename;

      switch (selectedReport) {
        case 'payroll-summary':
          blob = await reportsApi.exportPayrollSummaryCsv(year, month);
          filename = `payroll_summary_${year}_${String(month).padStart(2, '0')}.csv`;
          break;
        case 'attendance':
          blob = await reportsApi.exportAttendanceCsv(startDate, endDate);
          filename = `attendance_${startDate}_${endDate}.csv`;
          break;
        case 'sss-r3':
          blob = await reportsApi.exportSSR3Csv(year, month);
          filename = `sss_r3_${year}_${String(month).padStart(2, '0')}.csv`;
          break;
        case 'philhealth-rf1':
          blob = await reportsApi.exportPhilHealthRF1Csv(year, month);
          filename = `philhealth_rf1_${year}_${String(month).padStart(2, '0')}.csv`;
          break;
        case 'pagibig-mcr':
          blob = await reportsApi.exportPagIBIGMCRCsv(year, month);
          filename = `pagibig_mcr_${year}_${String(month).padStart(2, '0')}.csv`;
          break;
        default:
          return;
      }

      // Create download link
      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to download CSV');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
    }).format(value);
  };

  const renderReportData = () => {
    if (!reportData) return null;

    switch (selectedReport) {
      case 'payroll-summary':
        return (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <p className="text-sm text-blue-600">Total Employees</p>
                <p className="text-2xl font-bold text-blue-800">{reportData.summary?.total_employees || 0}</p>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <p className="text-sm text-green-600">Total Gross</p>
                <p className="text-2xl font-bold text-green-800">{formatCurrency(reportData.summary?.total_gross || 0)}</p>
              </div>
              <div className="bg-red-50 p-4 rounded-lg">
                <p className="text-sm text-red-600">Total Deductions</p>
                <p className="text-2xl font-bold text-red-800">{formatCurrency(reportData.summary?.total_deductions || 0)}</p>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <p className="text-sm text-purple-600">Total Net</p>
                <p className="text-2xl font-bold text-purple-800">{formatCurrency(reportData.summary?.total_net || 0)}</p>
              </div>
            </div>

            {/* Government Contributions */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-semibold mb-3">Government Contributions</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">SSS (Employee)</p>
                  <p className="font-semibold">{formatCurrency(reportData.government_contributions?.sss_employee || 0)}</p>
                </div>
                <div>
                  <p className="text-gray-500">SSS (Employer)</p>
                  <p className="font-semibold">{formatCurrency(reportData.government_contributions?.sss_employer || 0)}</p>
                </div>
                <div>
                  <p className="text-gray-500">PhilHealth (EE)</p>
                  <p className="font-semibold">{formatCurrency(reportData.government_contributions?.philhealth_employee || 0)}</p>
                </div>
                <div>
                  <p className="text-gray-500">Pag-IBIG (EE)</p>
                  <p className="font-semibold">{formatCurrency(reportData.government_contributions?.pagibig_employee || 0)}</p>
                </div>
              </div>
            </div>

            {/* By Department */}
            {reportData.by_department?.length > 0 && (
              <div>
                <h3 className="font-semibold mb-3">By Department</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full bg-white border rounded">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">Department</th>
                        <th className="px-4 py-2 text-right text-sm font-medium text-gray-600">Employees</th>
                        <th className="px-4 py-2 text-right text-sm font-medium text-gray-600">Gross Pay</th>
                        <th className="px-4 py-2 text-right text-sm font-medium text-gray-600">Deductions</th>
                        <th className="px-4 py-2 text-right text-sm font-medium text-gray-600">Net Pay</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.by_department.map((dept: any, index: number) => (
                        <tr key={index} className="border-t">
                          <td className="px-4 py-2">{dept.department || 'N/A'}</td>
                          <td className="px-4 py-2 text-right">{dept.employee_count}</td>
                          <td className="px-4 py-2 text-right">{formatCurrency(dept.gross_pay)}</td>
                          <td className="px-4 py-2 text-right">{formatCurrency(dept.total_deductions)}</td>
                          <td className="px-4 py-2 text-right">{formatCurrency(dept.net_pay)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );

      case 'attendance':
        return (
          <div className="space-y-6">
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <p className="text-sm text-blue-600">Total Employees</p>
                <p className="text-2xl font-bold">{reportData.summary?.total_employees || 0}</p>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <p className="text-sm text-green-600">Present Days</p>
                <p className="text-2xl font-bold">{reportData.summary?.total_present_days || 0}</p>
              </div>
              <div className="bg-red-50 p-4 rounded-lg">
                <p className="text-sm text-red-600">Absent Days</p>
                <p className="text-2xl font-bold">{reportData.summary?.total_absent_days || 0}</p>
              </div>
              <div className="bg-yellow-50 p-4 rounded-lg">
                <p className="text-sm text-yellow-600">Late Instances</p>
                <p className="text-2xl font-bold">{reportData.summary?.total_late_instances || 0}</p>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <p className="text-sm text-purple-600">Attendance Rate</p>
                <p className="text-2xl font-bold">{reportData.summary?.average_attendance_rate || 0}%</p>
              </div>
            </div>

            {/* Employee Table */}
            {reportData.employees?.length > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-full bg-white border rounded">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">Employee</th>
                      <th className="px-4 py-2 text-right text-sm font-medium text-gray-600">Present</th>
                      <th className="px-4 py-2 text-right text-sm font-medium text-gray-600">Absent</th>
                      <th className="px-4 py-2 text-right text-sm font-medium text-gray-600">Late</th>
                      <th className="px-4 py-2 text-right text-sm font-medium text-gray-600">Late (mins)</th>
                      <th className="px-4 py-2 text-right text-sm font-medium text-gray-600">OT Hours</th>
                      <th className="px-4 py-2 text-right text-sm font-medium text-gray-600">Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.employees.map((emp: any) => (
                      <tr key={emp.employee_id} className="border-t">
                        <td className="px-4 py-2">
                          <div>
                            <p className="font-medium">{emp.employee_name}</p>
                            <p className="text-xs text-gray-500">{emp.employee_no}</p>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right">{emp.present_days}</td>
                        <td className="px-4 py-2 text-right text-red-600">{emp.absent_days}</td>
                        <td className="px-4 py-2 text-right text-yellow-600">{emp.late_count}</td>
                        <td className="px-4 py-2 text-right">{emp.total_late_minutes}</td>
                        <td className="px-4 py-2 text-right">{emp.overtime_hours?.toFixed(1)}</td>
                        <td className="px-4 py-2 text-right">{emp.attendance_rate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );

      case 'sss-r3':
      case 'philhealth-rf1':
      case 'pagibig-mcr':
        const isSSS = selectedReport === 'sss-r3';
        const isPhilHealth = selectedReport === 'philhealth-rf1';
        const idField = isSSS ? 'sss_no' : isPhilHealth ? 'philhealth_no' : 'pagibig_no';
        const eeField = isSSS ? 'ee_contribution' : 'ee_share';
        const erField = isSSS ? 'er_contribution' : 'er_share';
        const totalEeField = isSSS ? 'total_ee_contribution' : 'total_ee_share';
        const totalErField = isSSS ? 'total_er_contribution' : 'total_er_share';

        return (
          <div className="space-y-6">
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <p className="text-sm text-blue-600">Total Employees</p>
                <p className="text-2xl font-bold">{reportData.total_employees || 0}</p>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <p className="text-sm text-green-600">Employee Share</p>
                <p className="text-2xl font-bold">{formatCurrency(reportData[totalEeField] || 0)}</p>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <p className="text-sm text-purple-600">Employer Share</p>
                <p className="text-2xl font-bold">{formatCurrency(reportData[totalErField] || 0)}</p>
              </div>
              <div className="bg-indigo-50 p-4 rounded-lg">
                <p className="text-sm text-indigo-600">Total</p>
                <p className="text-2xl font-bold">{formatCurrency(reportData.total_contribution || 0)}</p>
              </div>
            </div>

            {/* Contributions Table */}
            {reportData.contributions?.length > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-full bg-white border rounded">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">
                        {isSSS ? 'SSS No.' : isPhilHealth ? 'PhilHealth No.' : 'Pag-IBIG MID'}
                      </th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">Name</th>
                      <th className="px-4 py-2 text-right text-sm font-medium text-gray-600">Employee</th>
                      <th className="px-4 py-2 text-right text-sm font-medium text-gray-600">Employer</th>
                      <th className="px-4 py-2 text-right text-sm font-medium text-gray-600">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.contributions.map((c: any, index: number) => (
                      <tr key={index} className="border-t">
                        <td className="px-4 py-2 text-sm">{c[idField] || '-'}</td>
                        <td className="px-4 py-2">
                          <span className="font-medium">{c.last_name}, {c.first_name}</span>
                          {c.middle_name && <span className="text-gray-500"> {c.middle_name}</span>}
                        </td>
                        <td className="px-4 py-2 text-right">{formatCurrency(c[eeField])}</td>
                        <td className="px-4 py-2 text-right">{formatCurrency(c[erField])}</td>
                        <td className="px-4 py-2 text-right font-medium">{formatCurrency(c.total_contribution)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 font-bold">
                    <tr>
                      <td colSpan={2} className="px-4 py-2">TOTAL</td>
                      <td className="px-4 py-2 text-right">{formatCurrency(reportData[totalEeField] || 0)}</td>
                      <td className="px-4 py-2 text-right">{formatCurrency(reportData[totalErField] || 0)}</td>
                      <td className="px-4 py-2 text-right">{formatCurrency(reportData.total_contribution || 0)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
      </div>

      {/* Report Selection */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {reports.map((report) => (
          <button
            key={report.id}
            onClick={() => {
              setSelectedReport(report.id);
              setReportData(null);
              setError('');
            }}
            className={`p-4 rounded-lg border-2 text-left transition-all ${
              selectedReport === report.id
                ? 'border-indigo-500 bg-indigo-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className={`${selectedReport === report.id ? 'text-indigo-600' : 'text-gray-400'}`}>
              {report.icon}
            </div>
            <h3 className="mt-2 font-semibold text-gray-900">{report.name}</h3>
            <p className="text-xs text-gray-500 mt-1">{report.description}</p>
          </button>
        ))}
      </div>

      {/* Parameters */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-4">Report Parameters</h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {selectedReport === 'attendance' ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
                <select
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  {years.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
                <select
                  value={month}
                  onChange={(e) => setMonth(Number(e.target.value))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  {months.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div className="flex items-end gap-2">
            <button
              onClick={generateReport}
              disabled={loading}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? 'Generating...' : 'Generate Report'}
            </button>
            {reportData && (
              <button
                onClick={downloadCsv}
                disabled={loading}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                Download CSV
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-50 text-red-600 rounded">
            {error}
          </div>
        )}
      </div>

      {/* Report Results */}
      {reportData && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">
            {reports.find(r => r.id === selectedReport)?.name} - {
              selectedReport === 'attendance'
                ? `${startDate} to ${endDate}`
                : `${months.find(m => m.value === month)?.label} ${year}`
            }
          </h2>
          {renderReportData()}
        </div>
      )}
    </div>
  );
}
