import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api, { employeesApi, leaveApi, loansApi } from '../../api/client';
import dayjs from 'dayjs';
import { getNotionEmployeeBirthday } from '../../data/notionEmployeeAssets';

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
  total_gross?: number;
  total_deductions?: number;
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
  const [payrollRuns, setPayrollRuns] = useState<PayrollRunSummary[]>([]);
  const [leaveSummary, setLeaveSummary] = useState({ pending: 0, upcoming: 0, next: null as any });
  const [loanSummary, setLoanSummary] = useState({ active: 0, balance: 0, monthly: 0, next: null as any });
  const [birthdays, setBirthdays] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      // Get counts by status using separate API calls with status filter
      // Each call has individual error handling to prevent partial failures
      const currentYear = new Date().getFullYear();
      const [activeData, pendingData, payrollData, importData, employeeData, pendingLeaveData, upcomingLeaveData, activeLoanData] = await Promise.all([
        employeesApi.list({ page: 1, page_size: 1, status: 'active' }).catch(() => ({ total: 0, items: [] })),
        employeesApi.list({ page: 1, page_size: 1, status: 'pending' }).catch(() => ({ total: 0, items: [] })),
        api.get('/payroll/runs', { params: { page: 1, page_size: 100 } }).catch(() => ({ data: { items: [] } })),
        api.get('/attendance/imports', { params: { page: 1, page_size: 1 } }).catch(() => ({ data: { items: [] } })),
        employeesApi.list({ page: 1, page_size: 1000, status: 'active' }).catch(() => ({ total: 0, items: [] })),
        leaveApi.listRequests({ page: 1, page_size: 5, status: 'pending' }).catch(() => ({ total: 0, items: [] })),
        leaveApi.listRequests({
          page: 1,
          page_size: 5,
          status: 'approved',
          date_from: dayjs().format('YYYY-MM-DD'),
          date_to: dayjs().add(30, 'day').format('YYYY-MM-DD'),
        }).catch(() => ({ total: 0, items: [] })),
        loansApi.list({ page: 1, page_size: 1000, status: 'active' }).catch(() => ({ total: 0, items: [] })),
      ]);

      setStats({
        totalEmployees: (activeData?.total ?? 0) + (pendingData?.total ?? 0),
        activeEmployees: activeData?.total ?? 0,
        pendingEmployees: pendingData?.total ?? 0,
      });

      if (payrollData.data.items.length > 0) {
        setLatestPayroll(payrollData.data.items[0]);
        setPayrollRuns(payrollData.data.items);
      }

      if (importData.data.items.length > 0) {
        setLatestImport(importData.data.items[0]);
      }

      const upcomingLeaves = [...(upcomingLeaveData.items || [])].sort(
        (a: any, b: any) => dayjs(a.start_date).valueOf() - dayjs(b.start_date).valueOf()
      );
      setLeaveSummary({
        pending: pendingLeaveData.total || 0,
        upcoming: upcomingLeaveData.total || 0,
        next: upcomingLeaves[0] || null,
      });

      const activeLoans = activeLoanData.items || [];
      setLoanSummary({
        active: activeLoanData.total || 0,
        balance: activeLoans.reduce((sum: number, loan: any) => sum + toAmount(loan.remaining_balance), 0),
        monthly: activeLoans.reduce((sum: number, loan: any) => sum + toAmount(loan.monthly_deduction), 0),
        next: activeLoans[0] || null,
      });

      const upcomingBirthdays = (employeeData.items || [])
        .map((employee: any) => {
          const birthday = getNotionEmployeeBirthday(employee);
          if (!birthday) return null;
          const birthDate = dayjs(birthday);
          if (!birthDate.isValid()) return null;
          let nextDate = birthDate.year(currentYear);
          if (nextDate.isBefore(dayjs(), 'day')) {
            nextDate = nextDate.add(1, 'year');
          }
          return {
            ...employee,
            next_birthday: nextDate.format('YYYY-MM-DD'),
            days_until: nextDate.startOf('day').diff(dayjs().startOf('day'), 'day'),
          };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => a.days_until - b.days_until)
        .slice(0, 3);
      setBirthdays(upcomingBirthdays);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const toAmount = (amount: unknown) => {
    const parsed = Number(amount ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const getRunTotals = (run: PayrollRunSummary) => {
    const deductions = toAmount(run.total_deductions);
    const net = toAmount(run.total_net);
    const storedGross = toAmount(run.total_gross);
    return {
      gross: storedGross > 0 ? storedGross : net + deductions,
      net,
      deductions,
    };
  };

  const formatPayrollLabel = (run: PayrollRunSummary) => {
    const periodEnd = dayjs(run.period_end).format('MMM D');
    const cutoffLabel = run.cutoff === 1 ? '1st cutoff' : '2nd cutoff';
    return `${periodEnd} (${cutoffLabel})`;
  };

  const sortedPayrollRuns = [...payrollRuns].sort(
    (a, b) => dayjs(a.period_end).valueOf() - dayjs(b.period_end).valueOf()
  );
  const recentPayrollRuns = sortedPayrollRuns.slice(-6);

  const payrollChartMax = Math.max(
    1,
    ...recentPayrollRuns.flatMap((run) => {
      const totals = getRunTotals(run);
      return [totals.gross, totals.net, totals.deductions];
    })
  );
  const pieColors = ['#3b82f6', '#22c55e', '#ef4444', '#8b5cf6', '#f59e0b', '#14b8a6'];
  const yearlyPayroll = Object.values(
    sortedPayrollRuns.reduce((acc, run) => {
      const year = dayjs(run.period_end).year();
      const { gross, net, deductions } = getRunTotals(run);
      if (!acc[year]) {
        acc[year] = { year, gross: 0, net: 0, deductions: 0, count: 0 };
      }
      acc[year].gross += gross;
      acc[year].net += net;
      acc[year].deductions += deductions;
      acc[year].count += 1;
      return acc;
    }, {} as Record<number, { year: number; gross: number; net: number; deductions: number; count: number }>)
  ).sort((a, b) => a.year - b.year);
  const yearlyGrossTotal = yearlyPayroll.reduce((sum, item) => sum + item.gross, 0);
  let pieCursor = 0;
  const yearlyPieGradient = yearlyPayroll.length > 0 && yearlyGrossTotal > 0
    ? `conic-gradient(${yearlyPayroll.map((item, index) => {
        const start = pieCursor;
        const share = (item.gross / yearlyGrossTotal) * 100;
        pieCursor += share;
        return `${pieColors[index % pieColors.length]} ${start}% ${pieCursor}%`;
      }).join(', ')})`
    : '#f3f4f6';
  const comparisonYear = yearlyPayroll.find((item) => item.year === new Date().getFullYear()) || yearlyPayroll[yearlyPayroll.length - 1];
  const previousYear = comparisonYear ? yearlyPayroll.find((item) => item.year === comparisonYear.year - 1) : undefined;
  const comparisonShare = comparisonYear && yearlyGrossTotal > 0 ? (comparisonYear.gross / yearlyGrossTotal) * 100 : 0;
  const comparisonChange = comparisonYear && previousYear && previousYear.gross > 0
    ? ((comparisonYear.gross - previousYear.gross) / previousYear.gross) * 100
    : null;

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      ) : (
        <>
          {/* Quick Stats */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Link to="/admin/employees" className="card transition-colors hover:border-primary-200 hover:bg-primary-50/30">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Total Employees</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.totalEmployees}</p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50">
                  <svg className="h-5 w-5 text-primary-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

            <Link to="/admin/attendance" className="card transition-colors hover:border-primary-200 hover:bg-primary-50/30">
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
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50">
                  <svg className="h-5 w-5 text-primary-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

            <Link to="/admin/payroll" className="card transition-colors hover:border-primary-200 hover:bg-primary-50/30">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Latest Payroll</p>
                  {latestPayroll ? (
                    <>
                      <p className="text-lg font-bold text-green-600">{formatCurrency(toAmount(latestPayroll.total_net))}</p>
                      <p className="text-sm text-gray-500">{latestPayroll.employee_count} employees</p>
                    </>
                  ) : (
                    <p className="text-lg text-gray-400">No payroll yet</p>
                  )}
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50">
                  <svg className="h-5 w-5 text-primary-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            {/* Payroll Chart */}
            <div className="card xl:col-span-2">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Payroll by Period</h2>
                  <p className="text-sm text-gray-500">Gross pay, net pay, and deductions for recent payroll runs.</p>
                </div>
                <div className="flex flex-wrap gap-3 text-xs font-semibold uppercase text-gray-500">
                  <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-blue-500" />Gross</span>
                  <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-green-500" />Net Pay</span>
                  <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-red-500" />Deductions</span>
                </div>
              </div>

              {recentPayrollRuns.length > 0 ? (
                <div className="overflow-x-auto overflow-y-visible pt-12">
                  <div className="min-w-[620px] space-y-4">
                    <div className="flex h-56 items-end gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
                      {recentPayrollRuns.map((run, runIndex) => {
                        const { gross, net, deductions } = getRunTotals(run);
                        const periodLabel = formatPayrollLabel(run);

                        return (
                          <div key={run.id} className="flex h-full min-w-[100px] flex-1 flex-col items-center gap-3">
                            <div className="flex h-40 w-full items-end justify-center gap-2">
                              <div
                                className="payroll-bar group relative w-5 rounded-t-lg bg-blue-500 shadow-sm transition-transform duration-300 hover:-translate-y-1"
                                style={{
                                  height: `${Math.max(8, (gross / payrollChartMax) * 100)}%`,
                                  animationDelay: `${runIndex * 90}ms`,
                                }}
                                title={`${periodLabel} - Gross: ${formatCurrency(gross)}`}
                                aria-label={`${periodLabel} gross ${formatCurrency(gross)}`}
                              >
                                <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-44 -translate-x-1/2 rounded-md border border-gray-200 bg-white px-3 py-2 text-left text-xs text-gray-700 shadow-lg group-hover:block">
                                  <p className="font-semibold text-gray-900">{periodLabel}</p>
                                  <p>Gross: {formatCurrency(gross)}</p>
                                </div>
                              </div>
                              <div
                                className="payroll-bar group relative w-5 rounded-t-lg bg-green-500 shadow-sm transition-transform duration-300 hover:-translate-y-1"
                                style={{
                                  height: `${Math.max(8, (net / payrollChartMax) * 100)}%`,
                                  animationDelay: `${runIndex * 90 + 60}ms`,
                                }}
                                title={`${periodLabel} - Net Pay: ${formatCurrency(net)}`}
                                aria-label={`${periodLabel} net pay ${formatCurrency(net)}`}
                              >
                                <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-44 -translate-x-1/2 rounded-md border border-gray-200 bg-white px-3 py-2 text-left text-xs text-gray-700 shadow-lg group-hover:block">
                                  <p className="font-semibold text-gray-900">{periodLabel}</p>
                                  <p>Net Pay: {formatCurrency(net)}</p>
                                </div>
                              </div>
                              <div
                                className="payroll-bar group relative w-5 rounded-t-lg bg-red-500 shadow-sm transition-transform duration-300 hover:-translate-y-1"
                                style={{
                                  height: `${Math.max(8, (deductions / payrollChartMax) * 100)}%`,
                                  animationDelay: `${runIndex * 90 + 120}ms`,
                                }}
                                title={`${periodLabel} - Deductions: ${formatCurrency(deductions)}`}
                                aria-label={`${periodLabel} deductions ${formatCurrency(deductions)}`}
                              >
                                <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-44 -translate-x-1/2 rounded-md border border-gray-200 bg-white px-3 py-2 text-left text-xs text-gray-700 shadow-lg group-hover:block">
                                  <p className="font-semibold text-gray-900">{periodLabel}</p>
                                  <p>Deductions: {formatCurrency(deductions)}</p>
                                </div>
                              </div>
                            </div>
                            <div className="text-center">
                              <p className="text-xs font-semibold text-gray-700">{periodLabel}</p>
                              <p className="text-[11px] text-gray-400">{run.employee_count || 0} employees</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">
                  No payroll runs available yet.
                </div>
              )}
            </div>

            {/* Yearly Comparison */}
            <div className="card">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Yearly Comparison</h2>
                  <p className="text-sm text-gray-500">Gross payroll share by year.</p>
                </div>
                {comparisonYear && (
                  <span className="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700">
                    {comparisonShare.toFixed(1)}%
                  </span>
                )}
              </div>

              {yearlyPayroll.length > 0 && yearlyGrossTotal > 0 ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-center">
                    <div
                      className="payroll-pie relative h-40 w-40 rounded-full shadow-inner"
                      style={{ background: yearlyPieGradient }}
                      role="img"
                      aria-label="Yearly payroll gross comparison pie chart"
                    >
                      <div className="absolute inset-7 flex flex-col items-center justify-center rounded-full bg-white text-center shadow-sm">
                        <span className="text-xs font-medium text-gray-500">Total</span>
                        <span className="text-sm font-bold text-gray-900">{formatCurrency(yearlyGrossTotal)}</span>
                      </div>
                    </div>
                  </div>

                  {comparisonYear && (
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <p className="text-sm font-semibold text-gray-900">{comparisonYear.year}</p>
                      <p className="mt-1 text-xs text-gray-600">
                        {comparisonChange === null
                          ? `${comparisonShare.toFixed(1)}% of loaded yearly payroll.`
                          : `${Math.abs(comparisonChange).toFixed(1)}% ${comparisonChange >= 0 ? 'higher' : 'lower'} than ${previousYear?.year}.`}
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    {yearlyPayroll.map((item, index) => {
                      const share = yearlyGrossTotal > 0 ? (item.gross / yearlyGrossTotal) * 100 : 0;
                      return (
                        <div
                          key={item.year}
                          className="payroll-fade-in flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2"
                          style={{ animationDelay: `${index * 80}ms` }}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <span
                              className="h-3 w-3 shrink-0 rounded-full"
                              style={{ backgroundColor: pieColors[index % pieColors.length] }}
                            />
                            <p className="text-sm font-semibold text-gray-900">{item.year}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold text-gray-900">{share.toFixed(1)}%</p>
                            <p className="text-xs text-gray-500">{item.count} runs</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
                  No yearly payroll data available yet.
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Link to="/admin/leave" className="card transition-colors hover:border-primary-200 hover:bg-primary-50/30">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-gray-500">Leaves</p>
                  <p className="text-2xl font-bold text-gray-900">{leaveSummary.pending}</p>
                  <p className="text-sm text-gray-500">pending request{leaveSummary.pending === 1 ? '' : 's'}</p>
                </div>
                <div className="rounded-lg bg-primary-50 px-3 py-2 text-sm font-semibold text-primary-700">
                  {leaveSummary.upcoming} upcoming
                </div>
              </div>
              <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
                {leaveSummary.next ? (
                  <>
                    <p className="font-semibold text-gray-900">{leaveSummary.next.employee_name}</p>
                    <p className="text-gray-500">
                      {leaveSummary.next.leave_type_name || 'Leave'} on {dayjs(leaveSummary.next.start_date).format('MMM D')}
                    </p>
                  </>
                ) : (
                  <p className="text-gray-500">No upcoming approved leaves.</p>
                )}
              </div>
            </Link>

            <Link to="/admin/loans" className="card transition-colors hover:border-primary-200 hover:bg-primary-50/30">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-gray-500">Loans</p>
                  <p className="text-2xl font-bold text-gray-900">{loanSummary.active}</p>
                  <p className="text-sm text-gray-500">active loan{loanSummary.active === 1 ? '' : 's'}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase text-gray-400">Monthly</p>
                  <p className="text-sm font-semibold text-red-600">{formatCurrency(loanSummary.monthly)}</p>
                </div>
              </div>
              <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Remaining Balance</span>
                  <span className="font-semibold text-gray-900">{formatCurrency(loanSummary.balance)}</span>
                </div>
                {loanSummary.next && (
                  <p className="mt-2 truncate text-xs text-gray-500">
                    Latest: {loanSummary.next.employee_name || 'Employee'} - {formatCurrency(toAmount(loanSummary.next.remaining_balance))}
                  </p>
                )}
              </div>
            </Link>

            <Link to="/admin/employees" className="card transition-colors hover:border-primary-200 hover:bg-primary-50/30">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-gray-500">Birthdays</p>
                  <p className="text-2xl font-bold text-gray-900">{birthdays.length}</p>
                  <p className="text-sm text-gray-500">upcoming birthday{birthdays.length === 1 ? '' : 's'}</p>
                </div>
                <div className="rounded-lg bg-primary-50 px-3 py-2 text-sm font-semibold text-primary-700">
                  Upcoming
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {birthdays.length > 0 ? (
                  birthdays.map((employee) => (
                    <div key={employee.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
                      <span className="truncate font-medium text-gray-900">
                        {employee.full_name || `${employee.first_name || ''} ${employee.last_name || ''}`.trim()}
                      </span>
                      <span className="shrink-0 text-xs text-gray-500">
                        {employee.days_until === 0 ? 'Today' : `in ${employee.days_until}d`}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-sm text-gray-500">
                    No birthdays saved.
                  </div>
                )}
              </div>
            </Link>
          </div>

        </>
      )}
    </div>
  );
}
