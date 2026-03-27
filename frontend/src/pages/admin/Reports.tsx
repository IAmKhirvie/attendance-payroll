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
              <div className="p-4 rounded-xl" style={{ background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)', border: '2px solid #93c5fd' }}>
                <p className="text-sm font-semibold" style={{ color: '#1e40af' }}>Total Employees</p>
                <p className="text-2xl font-bold" style={{ color: '#1e3a8a' }}>{reportData.summary?.total_employees || 0}</p>
              </div>
              <div className="p-4 rounded-xl" style={{ background: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)', border: '2px solid #6ee7b7' }}>
                <p className="text-sm font-semibold" style={{ color: '#047857' }}>Total Gross</p>
                <p className="text-2xl font-bold" style={{ color: '#065f46' }}>{formatCurrency(reportData.summary?.total_gross || 0)}</p>
              </div>
              <div className="p-4 rounded-xl" style={{ background: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)', border: '2px solid #f87171' }}>
                <p className="text-sm font-semibold" style={{ color: '#b91c1c' }}>Total Deductions</p>
                <p className="text-2xl font-bold" style={{ color: '#991b1b' }}>{formatCurrency(reportData.summary?.total_deductions || 0)}</p>
              </div>
              <div className="p-4 rounded-xl" style={{ background: 'linear-gradient(135deg, #e9d5ff 0%, #d8b4fe 100%)', border: '2px solid #c084fc' }}>
                <p className="text-sm font-semibold" style={{ color: '#7c3aed' }}>Total Net</p>
                <p className="text-2xl font-bold" style={{ color: '#6d28d9' }}>{formatCurrency(reportData.summary?.total_net || 0)}</p>
              </div>
            </div>

            {/* Government Contributions */}
            <div className="p-4 rounded-xl" style={{ background: 'var(--bg-accent)', border: '2px solid var(--border)' }}>
              <h3 className="font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Government Contributions</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p style={{ color: 'var(--text-muted)' }}>SSS (Employee)</p>
                  <p className="font-bold" style={{ color: 'var(--text-primary)' }}>{formatCurrency(reportData.government_contributions?.sss_employee || 0)}</p>
                </div>
                <div>
                  <p style={{ color: 'var(--text-muted)' }}>SSS (Employer)</p>
                  <p className="font-bold" style={{ color: 'var(--text-primary)' }}>{formatCurrency(reportData.government_contributions?.sss_employer || 0)}</p>
                </div>
                <div>
                  <p style={{ color: 'var(--text-muted)' }}>PhilHealth (EE)</p>
                  <p className="font-bold" style={{ color: 'var(--text-primary)' }}>{formatCurrency(reportData.government_contributions?.philhealth_employee || 0)}</p>
                </div>
                <div>
                  <p style={{ color: 'var(--text-muted)' }}>Pag-IBIG (EE)</p>
                  <p className="font-bold" style={{ color: 'var(--text-primary)' }}>{formatCurrency(reportData.government_contributions?.pagibig_employee || 0)}</p>
                </div>
              </div>
            </div>

            {/* By Department */}
            {reportData.by_department?.length > 0 && (
              <div>
                <h3 className="font-bold mb-3" style={{ color: 'var(--text-primary)' }}>By Department</h3>
                <div className="overflow-x-auto rounded-xl" style={{ border: '2px solid var(--border)' }}>
                  <table className="min-w-full">
                    <thead>
                      <tr>
                        <th className="px-4 py-3 text-left">Department</th>
                        <th className="px-4 py-3 text-right">Employees</th>
                        <th className="px-4 py-3 text-right">Gross Pay</th>
                        <th className="px-4 py-3 text-right">Deductions</th>
                        <th className="px-4 py-3 text-right">Net Pay</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.by_department.map((dept: any, index: number) => (
                        <tr key={index}>
                          <td className="px-4 py-3">{dept.department || 'N/A'}</td>
                          <td className="px-4 py-3 text-right">{dept.employee_count}</td>
                          <td className="px-4 py-3 text-right">{formatCurrency(dept.gross_pay)}</td>
                          <td className="px-4 py-3 text-right">{formatCurrency(dept.total_deductions)}</td>
                          <td className="px-4 py-3 text-right font-bold">{formatCurrency(dept.net_pay)}</td>
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
              <div className="p-4 rounded-xl" style={{ background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)', border: '2px solid #93c5fd' }}>
                <p className="text-sm font-semibold" style={{ color: '#1e40af' }}>Total Employees</p>
                <p className="text-2xl font-bold" style={{ color: '#1e3a8a' }}>{reportData.summary?.total_employees || 0}</p>
              </div>
              <div className="p-4 rounded-xl" style={{ background: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)', border: '2px solid #6ee7b7' }}>
                <p className="text-sm font-semibold" style={{ color: '#047857' }}>Present Days</p>
                <p className="text-2xl font-bold" style={{ color: '#065f46' }}>{reportData.summary?.total_present_days || 0}</p>
              </div>
              <div className="p-4 rounded-xl" style={{ background: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)', border: '2px solid #f87171' }}>
                <p className="text-sm font-semibold" style={{ color: '#b91c1c' }}>Absent Days</p>
                <p className="text-2xl font-bold" style={{ color: '#991b1b' }}>{reportData.summary?.total_absent_days || 0}</p>
              </div>
              <div className="p-4 rounded-xl" style={{ background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)', border: '2px solid #fcd34d' }}>
                <p className="text-sm font-semibold" style={{ color: '#b45309' }}>Late Instances</p>
                <p className="text-2xl font-bold" style={{ color: '#92400e' }}>{reportData.summary?.total_late_instances || 0}</p>
              </div>
              <div className="p-4 rounded-xl" style={{ background: 'linear-gradient(135deg, #e9d5ff 0%, #d8b4fe 100%)', border: '2px solid #c084fc' }}>
                <p className="text-sm font-semibold" style={{ color: '#7c3aed' }}>Attendance Rate</p>
                <p className="text-2xl font-bold" style={{ color: '#6d28d9' }}>{reportData.summary?.average_attendance_rate || 0}%</p>
              </div>
            </div>

            {/* Employee Table */}
            {reportData.employees?.length > 0 && (
              <div className="overflow-x-auto rounded-xl" style={{ border: '2px solid var(--border)' }}>
                <table className="min-w-full">
                  <thead>
                    <tr>
                      <th className="px-4 py-3 text-left">Employee</th>
                      <th className="px-4 py-3 text-right">Present</th>
                      <th className="px-4 py-3 text-right">Absent</th>
                      <th className="px-4 py-3 text-right">Late</th>
                      <th className="px-4 py-3 text-right">Late (mins)</th>
                      <th className="px-4 py-3 text-right">OT Hours</th>
                      <th className="px-4 py-3 text-right">Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.employees.map((emp: any) => (
                      <tr key={emp.employee_id}>
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-bold">{emp.employee_name}</p>
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{emp.employee_no}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold" style={{ color: '#059669' }}>{emp.present_days}</td>
                        <td className="px-4 py-3 text-right font-semibold" style={{ color: '#dc2626' }}>{emp.absent_days}</td>
                        <td className="px-4 py-3 text-right font-semibold" style={{ color: '#d97706' }}>{emp.late_count}</td>
                        <td className="px-4 py-3 text-right">{emp.total_late_minutes}</td>
                        <td className="px-4 py-3 text-right">{emp.overtime_hours?.toFixed(1)}</td>
                        <td className="px-4 py-3 text-right font-bold">{emp.attendance_rate}%</td>
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
              <div className="p-4 rounded-xl" style={{ background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)', border: '2px solid #93c5fd' }}>
                <p className="text-sm font-semibold" style={{ color: '#1e40af' }}>Total Employees</p>
                <p className="text-2xl font-bold" style={{ color: '#1e3a8a' }}>{reportData.total_employees || 0}</p>
              </div>
              <div className="p-4 rounded-xl" style={{ background: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)', border: '2px solid #6ee7b7' }}>
                <p className="text-sm font-semibold" style={{ color: '#047857' }}>Employee Share</p>
                <p className="text-2xl font-bold" style={{ color: '#065f46' }}>{formatCurrency(reportData[totalEeField] || 0)}</p>
              </div>
              <div className="p-4 rounded-xl" style={{ background: 'linear-gradient(135deg, #e9d5ff 0%, #d8b4fe 100%)', border: '2px solid #c084fc' }}>
                <p className="text-sm font-semibold" style={{ color: '#7c3aed' }}>Employer Share</p>
                <p className="text-2xl font-bold" style={{ color: '#6d28d9' }}>{formatCurrency(reportData[totalErField] || 0)}</p>
              </div>
              <div className="p-4 rounded-xl" style={{ background: 'linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)', border: '2px solid #a5b4fc' }}>
                <p className="text-sm font-semibold" style={{ color: '#4338ca' }}>Total</p>
                <p className="text-2xl font-bold" style={{ color: '#3730a3' }}>{formatCurrency(reportData.total_contribution || 0)}</p>
              </div>
            </div>

            {/* Contributions Table */}
            {reportData.contributions?.length > 0 && (
              <div className="overflow-x-auto rounded-xl" style={{ border: '2px solid var(--border)' }}>
                <table className="min-w-full">
                  <thead>
                    <tr>
                      <th className="px-4 py-3 text-left">
                        {isSSS ? 'SSS No.' : isPhilHealth ? 'PhilHealth No.' : 'Pag-IBIG MID'}
                      </th>
                      <th className="px-4 py-3 text-left">Name</th>
                      <th className="px-4 py-3 text-right">Employee</th>
                      <th className="px-4 py-3 text-right">Employer</th>
                      <th className="px-4 py-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.contributions.map((c: any, index: number) => (
                      <tr key={index}>
                        <td className="px-4 py-3 text-sm font-mono">{c[idField] || '-'}</td>
                        <td className="px-4 py-3">
                          <span className="font-bold">{c.last_name}, {c.first_name}</span>
                          {c.middle_name && <span style={{ color: 'var(--text-muted)' }}> {c.middle_name}</span>}
                        </td>
                        <td className="px-4 py-3 text-right">{formatCurrency(c[eeField])}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(c[erField])}</td>
                        <td className="px-4 py-3 text-right font-bold">{formatCurrency(c.total_contribution)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: 'var(--bg-accent)' }}>
                      <td colSpan={2} className="px-4 py-3 font-bold">TOTAL</td>
                      <td className="px-4 py-3 text-right font-bold">{formatCurrency(reportData[totalEeField] || 0)}</td>
                      <td className="px-4 py-3 text-right font-bold">{formatCurrency(reportData[totalErField] || 0)}</td>
                      <td className="px-4 py-3 text-right font-bold">{formatCurrency(reportData.total_contribution || 0)}</td>
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
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Reports</h1>
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
            className={`p-4 rounded-xl text-left transition-all ${
              selectedReport === report.id
                ? ''
                : 'hover:shadow-md'
            }`}
            style={{
              background: selectedReport === report.id
                ? 'linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)'
                : 'var(--bg-card)',
              border: selectedReport === report.id
                ? '2px solid #818cf8'
                : '2px solid var(--border)',
            }}
          >
            <div style={{ color: selectedReport === report.id ? '#4f46e5' : 'var(--text-muted)' }}>
              {report.icon}
            </div>
            <h3 className="mt-2 font-bold" style={{ color: 'var(--text-primary)' }}>{report.name}</h3>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{report.description}</p>
          </button>
        ))}
      </div>

      {/* Parameters */}
      <div className="card">
        <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Report Parameters</h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {selectedReport === 'attendance' ? (
            <>
              <div>
                <label className="form-label">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="form-input"
                />
              </div>
              <div>
                <label className="form-label">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="form-input"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="form-label">Year</label>
                <select
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="form-input"
                >
                  {years.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Month</label>
                <select
                  value={month}
                  onChange={(e) => setMonth(Number(e.target.value))}
                  className="form-input"
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
              className="btn-primary"
            >
              {loading ? 'Generating...' : 'Generate Report'}
            </button>
            {reportData && (
              <button
                onClick={downloadCsv}
                disabled={loading}
                className="btn-secondary"
                style={{ background: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)', border: '2px solid #6ee7b7', color: '#065f46' }}
              >
                Download CSV
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-4 p-4 rounded-xl" style={{ background: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)', border: '2px solid #f87171', color: '#991b1b' }}>
            {error}
          </div>
        )}
      </div>

      {/* Report Results */}
      {reportData && (
        <div className="card">
          <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
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
