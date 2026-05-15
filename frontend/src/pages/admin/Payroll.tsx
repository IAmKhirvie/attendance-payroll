import { useState, useEffect } from 'react';
import { payrollApi, payrollRunsApi, employeesApi } from '../../api/client';
import type { PayrollRun } from '../../types';
import dayjs from 'dayjs';

// Helper function to convert 24-hour time to 12-hour format
const formatTime12Hour = (time24: string): string => {
  if (!time24) return '';
  const [hours, minutes] = time24.split(':');
  const hour = parseInt(hours, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
};

interface PayrollSettings {
  id: number;
  default_basic_salary?: number;
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
}

interface PayslipData {
  id: number;
  payroll_run_id: number;
  employee_id: number;
  employee_name: string;
  employee_no: string;
  period_start: string;
  period_end: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  earnings: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deductions: Record<string, any>;
  total_earnings: number;
  total_deductions: number;
  net_pay: number;
  days_worked: number;
  days_absent: number;
  late_count: number;
  total_late_minutes: number;
  overtime_hours: number;
  is_released: boolean;
}

// Trash item type
interface TrashItem {
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
}

export function PayrollPage() {
  // Active tab
  const [activeTab, setActiveTab] = useState<'runs' | 'import' | '13th-month' | 'settings' | 'trash'>('runs');

  // 13th Month Pay state
  const [thirteenthMonthRecords, setThirteenthMonthRecords] = useState<Array<{
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
  }>>([]);
  const [thirteenthMonthYear, setThirteenthMonthYear] = useState(new Date().getFullYear());
  const [loading13thMonth, setLoading13thMonth] = useState(false);
  const [calculating13th, setCalculating13th] = useState(false);
  const [downloading, setDownloading] = useState<number | null>(null);

  // Payroll Import state
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<{
    success: boolean;
    message: string;
    total_records: number;
    matched: number;
    not_matched: number;
    records: Array<any>;
  } | null>(null);
  const [importResult, setImportResult] = useState<{
    success: boolean;
    message: string;
    total: number;
    imported: number;
    not_found: string[];
  } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);

  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState<{ type: 'edit' | 'delete'; run: PayrollRun } | null>(null);
  const [confirmReason, setConfirmReason] = useState('');
  const [editingRunId, setEditingRunId] = useState<number | null>(null);

  // Trash state
  const [trashItems, setTrashItems] = useState<TrashItem[]>([]);
  const [loadingTrash, setLoadingTrash] = useState(false);
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [permanentlyDeletingId, setPermanentlyDeletingId] = useState<number | null>(null);
  const [selectedTrashItem, setSelectedTrashItem] = useState<TrashItem | null>(null);
  const [editingRunStatus, setEditingRunStatus] = useState<string>('draft');
  const [newPeriod, setNewPeriod] = useState({ start: '', end: '', cutoff: 1 });
  const [creating, setCreating] = useState(false);
  const [processing, setProcessing] = useState<number | null>(null);
  const [recalculating, setRecalculating] = useState<number | null>(null);

  // Search, sort, filter for payroll runs
  const [runSearch, setRunSearch] = useState('');
  const [runStatusFilter, setRunStatusFilter] = useState<string>('');
  const [runSortBy, setRunSortBy] = useState<string>('period_start');
  const [runSortOrder, setRunSortOrder] = useState<'asc' | 'desc'>('desc');

  // Payslips view
  const [selectedRun, setSelectedRun] = useState<PayrollRun | null>(null);
  const [payslips, setPayslips] = useState<PayslipData[]>([]);
  const [loadingPayslips, setLoadingPayslips] = useState(false);
  const [selectedPayslip, setSelectedPayslip] = useState<PayslipData | null>(null);

  // Payslips search/sort
  const [payslipSearch, setPayslipSearch] = useState('');
  const [payslipSortBy, setPayslipSortBy] = useState<string>('employee_name');
  const [payslipSortOrder, setPayslipSortOrder] = useState<'asc' | 'desc'>('asc');

  // Payslips pagination
  const [payslipPage, setPayslipPage] = useState(1);
  const [payslipPageSize, setPayslipPageSize] = useState(25);
  const [payslipTotal, setPayslipTotal] = useState(0);

  // Show additions toggle (hidden by default)
  const [showAdditions, setShowAdditions] = useState(false);

  // Bulk selection & edit
  const [selectedPayslipIds, setSelectedPayslipIds] = useState<Set<number>>(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [bulkFields, setBulkFields] = useState<Record<string, { enabled: boolean; value: number }>>({
    basicSalary: { enabled: false, value: 0 },
    allowance: { enabled: false, value: 0 },
    productivity: { enabled: false, value: 0 },
    language: { enabled: false, value: 0 },
    workHours: { enabled: false, value: 8 },
    daysWorked: { enabled: false, value: 0 },
    daysAbsent: { enabled: false, value: 0 },
    lateMinutes: { enabled: false, value: 0 },
    otHours: { enabled: false, value: 0 },
    tax: { enabled: false, value: 0 },
    sss: { enabled: false, value: 0 },
    philhealth: { enabled: false, value: 0 },
    pagibig: { enabled: false, value: 0 },
    sss_loan: { enabled: false, value: 0 },
    pagibig_loan: { enabled: false, value: 0 },
    other_loan: { enabled: false, value: 0 },
  });
  const [bulkUpdateEmployee, setBulkUpdateEmployee] = useState(true);

  // Edit mode
  const [editMode, setEditMode] = useState(false);
  const [editEarnings, setEditEarnings] = useState<Record<string, any>>({});
  const [editDeductions, setEditDeductions] = useState<Record<string, number>>({});
  const [editAttendance, setEditAttendance] = useState<{ days_worked?: number; days_absent?: number; late_count?: number; total_late_minutes?: number; overtime_hours?: number; work_hours_per_day?: number; call_time?: string; time_out?: string; buffer_minutes?: number; is_flexible?: boolean; recalculate_deductions?: boolean }>({});
  const [editAdditional, setEditAdditional] = useState<{ additional_amount?: number; additional_notes?: string }>({});
  const [saving, setSaving] = useState(false);

  // Prorate Calculator (dynamic periods — full mini-payslip per period)
  interface ProratePeriod {
    startDate: string; basicSalary: number; workHours: number;
    allowance: number; productivity: number; language: number;
    daysWorked: number; daysAbsent: number; lateMinutes: number; otHours: number;
    regularHoliday: number; regularHolidayOt: number; snwh: number; snwhOt: number;
  }
  const defaultPeriod = (workHrs = 8): ProratePeriod => ({
    startDate: '', basicSalary: 0, workHours: workHrs,
    allowance: 0, productivity: 0, language: 0,
    daysWorked: 0, daysAbsent: 0, lateMinutes: 0, otHours: 0,
    regularHoliday: 0, regularHolidayOt: 0, snwh: 0, snwhOt: 0,
  });
  const [showProrate, setShowProrate] = useState(false);
  const [proratePeriods, setProratePeriods] = useState<ProratePeriod[]>([defaultPeriod(4), defaultPeriod(8)]);

  // Version History
  const [showHistory, setShowHistory] = useState(false);
  const [historyItems, setHistoryItems] = useState<Array<{
    id: number; timestamp: string; user_email: string; action: string;
    change_type: string; description: string; snapshot: any; old_snapshot: any; reason: string;
  }>>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Payroll Settings
  const [settings, setSettings] = useState<PayrollSettings | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [editSettings, setEditSettings] = useState<Partial<PayrollSettings>>({});

  // Apply to All modal
  const [showApplyToAllModal, setShowApplyToAllModal] = useState(false);
  const [applyToAllConfirmation, setApplyToAllConfirmation] = useState('');
  const [applyToAllOptions, setApplyToAllOptions] = useState({
    apply_basic_salary: true,
    apply_sss: false,
    apply_philhealth: false,
    apply_pagibig: false,
    apply_tax: false,
  });
  const [applyingToAll, setApplyingToAll] = useState(false);

  useEffect(() => {
    loadPayrollRuns();
  }, []);

  useEffect(() => {
    if (activeTab === 'settings' && !settings) {
      loadSettings();
    }
    if (activeTab === '13th-month') {
      load13thMonth();
    }
    if (activeTab === 'trash') {
      loadTrash();
    }
  }, [activeTab, thirteenthMonthYear]);

  const loadPayrollRuns = async () => {
    setLoading(true);
    try {
      const response = await payrollApi.listRuns();
      setPayrollRuns(response.items);
    } catch (error) {
      console.error('Failed to load payroll runs:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSettings = async () => {
    setLoadingSettings(true);
    try {
      const data = await payrollApi.getSettings();
      setSettings(data);
      setEditSettings(data);
    } catch (error) {
      console.error('Failed to load payroll settings:', error);
    } finally {
      setLoadingSettings(false);
    }
  };

  const loadTrash = async () => {
    setLoadingTrash(true);
    try {
      const data = await payrollRunsApi.listTrash();
      setTrashItems(data.items);
    } catch (error) {
      console.error('Failed to load trash:', error);
    } finally {
      setLoadingTrash(false);
    }
  };

  // Auto-calculate work hours and basic salary based on schedule
  const handleRestoreRun = async (id: number) => {
    if (!confirm('Restore this payroll run from trash?')) return;
    setRestoringId(id);
    try {
      await payrollRunsApi.restore(id);
      alert('Payroll run restored successfully!');
      loadTrash();
      loadPayrollRuns();
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to restore payroll run');
    } finally {
      setRestoringId(null);
    }
  };

  const handlePermanentDelete = async (id: number) => {
    if (!confirm('PERMANENTLY delete this payroll run? This action cannot be undone!')) return;
    if (!confirm('Are you absolutely sure? All associated payslips will be permanently removed.')) return;
    setPermanentlyDeletingId(id);
    try {
      await payrollRunsApi.permanentDelete(id, true);
      alert('Payroll run permanently deleted.');
      loadTrash();
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to permanently delete');
    } finally {
      setPermanentlyDeletingId(null);
    }
  };

  const load13thMonth = async () => {
    setLoading13thMonth(true);
    try {
      const data = await payrollApi.list13thMonth(thirteenthMonthYear);
      setThirteenthMonthRecords(data.items);
    } catch (error) {
      console.error('Failed to load 13th month records:', error);
    } finally {
      setLoading13thMonth(false);
    }
  };

  const handleCalculate13thMonth = async () => {
    if (!confirm(`Calculate 13th month pay for ${thirteenthMonthYear}? This will recalculate all records for the year.`)) {
      return;
    }
    setCalculating13th(true);
    try {
      const result = await payrollApi.calculate13thMonth(thirteenthMonthYear);
      alert(`${result.message}\n\nTotal Amount: ${formatCurrency(result.total_amount)}`);
      load13thMonth();
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to calculate 13th month pay');
    } finally {
      setCalculating13th(false);
    }
  };

  const handleRelease13thMonth = async () => {
    if (!confirm(`Release 13th month pay for ${thirteenthMonthYear}? Employees will be able to view their 13th month pay.`)) {
      return;
    }
    try {
      await payrollApi.release13thMonth(thirteenthMonthYear);
      alert('13th month pay released to employees!');
      load13thMonth();
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to release 13th month pay');
    }
  };

  const handleDownloadPayslipPdf = async (payslipId: number) => {
    setDownloading(payslipId);
    try {
      await payrollApi.downloadPayslipPdf(payslipId);
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to download PDF');
    } finally {
      setDownloading(null);
    }
  };

  const handleDownloadPayslipPng = async (payslipId: number) => {
    setDownloading(payslipId);
    try {
      await payrollApi.downloadPayslipPng(payslipId);
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to download PNG');
    } finally {
      setDownloading(null);
    }
  };

  const handleDownloadAllPayslipsPdf = async (runId: number) => {
    try {
      await payrollApi.downloadAllPayslipsPdf(runId);
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to download PDF');
    }
  };

  const handleDownload13thMonthPdf = async (recordId: number) => {
    setDownloading(recordId);
    try {
      await payrollApi.download13thMonthPdf(recordId);
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to download PDF');
    } finally {
      setDownloading(null);
    }
  };

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImportFile(file);
      setImportPreview(null);
      setImportResult(null);
    }
  };

  const handlePreviewImport = async () => {
    if (!importFile) return;

    setPreviewing(true);
    try {
      const result = await payrollApi.previewPayrollImport(importFile);
      setImportPreview(result);
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to preview file');
    } finally {
      setPreviewing(false);
    }
  };

  const handleImportPayroll = async () => {
    if (!importFile) {
      alert('Please select a file to import');
      return;
    }

    if (!confirm('This will update employee salary and deduction info from the file.\n\nContinue?')) {
      return;
    }

    setImporting(true);
    try {
      const result = await payrollApi.importPayroll(importFile);
      setImportResult(result);
      setImportPreview(null);

      if (result.success) {
        alert(`${result.message}\n\nEmployees Updated: ${result.imported || 0}`);
        loadPayrollRuns(); // Refresh runs list
      }
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to import payroll');
    } finally {
      setImporting(false);
    }
  };

  const resetImport = () => {
    setImportFile(null);
    setImportPreview(null);
    setImportResult(null);
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      await payrollApi.updateSettings(editSettings);
      setSettings({ ...settings, ...editSettings } as PayrollSettings);
      alert('Settings saved successfully!');
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleApplyToAll = async () => {
    if (applyToAllConfirmation !== 'WeCanInICAN!') {
      alert('Please type "WeCanInICAN!" to confirm');
      return;
    }

    setApplyingToAll(true);
    try {
      const result = await payrollApi.applySettingsToAll(applyToAllConfirmation, applyToAllOptions);
      alert(`Success! ${result.message}\n\nFields updated:\n${result.fields_applied.join('\n')}`);
      setShowApplyToAllModal(false);
      setApplyToAllConfirmation('');
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to apply settings to all employees');
    } finally {
      setApplyingToAll(false);
    }
  };

  const loadPayslips = async (runId: number, page: number = 1, pageSize: number = 25) => {
    setLoadingPayslips(true);
    setSelectedPayslipIds(new Set());
    try {
      const response = await payrollApi.listPayslips({
        payroll_run_id: runId,
        page,
        page_size: pageSize
      });
      setPayslips(response.items as unknown as PayslipData[]);
      setPayslipTotal(response.total || 0);
      setPayslipPage(page);

      if (response.summary) {
        const summary = response.summary;
        const applySummary = (run: PayrollRun): PayrollRun => ({
          ...run,
          total_gross: summary.total_gross,
          total_deductions: summary.total_deductions,
          total_net: summary.total_net,
          employee_count: summary.employee_count,
        });

        setSelectedRun(current => current?.id === runId ? applySummary(current) : current);
        setPayrollRuns(current =>
          current.map(run => run.id === runId ? applySummary(run) : run)
        );
      }
    } catch (error) {
      console.error('Failed to load payslips:', error);
    } finally {
      setLoadingPayslips(false);
    }
  };

  const handleViewRun = async (run: PayrollRun) => {
    setSelectedRun(run);
    setPayslipPage(1); // Reset to first page
    await loadPayslips(run.id, 1, payslipPageSize);
  };

  const handlePageChange = (newPage: number) => {
    if (selectedRun) {
      loadPayslips(selectedRun.id, newPage, payslipPageSize);
    }
  };

  const handlePageSizeChange = (newSize: number) => {
    setPayslipPageSize(newSize);
    setPayslipPage(1);
    if (selectedRun) {
      loadPayslips(selectedRun.id, 1, newSize);
    }
  };

  const handleCreateRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPeriod.start || !newPeriod.end) return;

    setCreating(true);
    try {
      await payrollApi.createRun(newPeriod.start, newPeriod.end, newPeriod.cutoff);
      setShowCreateModal(false);
      setNewPeriod({ start: '', end: '', cutoff: 1 });
      loadPayrollRuns();
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to create payroll run');
    } finally {
      setCreating(false);
    }
  };

  const handleProcess = async (runId: number, isReprocess: boolean = false) => {
    if (isReprocess) {
      if (!confirm(
        'WARNING: Reprocess will DELETE all existing payslips and regenerate them from raw attendance data.\n\n' +
        'ALL manual edits (days absent, late minutes, earnings, deductions) will be LOST.\n\n' +
        'Use "Recalculate" instead if you only want to update rates/salaries without losing edits.\n\n' +
        'Are you sure you want to reprocess?'
      )) return;
    }
    setProcessing(runId);
    try {
      const result = await payrollApi.processRun(runId);
      alert(`Payroll processed! ${(result as any).summary?.payslips_created || 0} payslips generated.`);
      loadPayrollRuns();
      if (selectedRun?.id === runId) {
        loadPayslips(runId);
      }
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to process payroll');
    } finally {
      setProcessing(null);
    }
  };



  const handleEditRun = (run: PayrollRun) => {
    if (run.status !== 'draft') {
      // Show confirmation modal for non-DRAFT runs
      setShowConfirmModal({ type: 'edit', run });
      setConfirmReason('');
      return;
    }
    // For DRAFT runs, open edit modal directly
    setNewPeriod({
      start: run.period_start,
      end: run.period_end,
      cutoff: run.cutoff || 1
    });
    setEditingRunId(run.id);
    setEditingRunStatus(run.status);
    setShowEditModal(true);
  };

  const handleConfirmEdit = () => {
    if (!showConfirmModal || showConfirmModal.type !== 'edit') return;
    const run = showConfirmModal.run;

    setNewPeriod({
      start: run.period_start,
      end: run.period_end,
      cutoff: run.cutoff || 1
    });
    setEditingRunId(run.id);
    setEditingRunStatus(run.status);
    setShowConfirmModal(null);
    setShowEditModal(true);
  };

  const handleUpdateRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRunId || !newPeriod.start || !newPeriod.end) return;

    // For non-DRAFT runs, require a reason
    if (editingRunStatus !== 'draft' && !confirmReason.trim()) {
      alert('Please provide a reason for editing this payroll run.');
      return;
    }

    setCreating(true);
    try {
      const params: any = {
        period_start: newPeriod.start,
        period_end: newPeriod.end,
        cutoff: newPeriod.cutoff
      };
      if (editingRunStatus !== 'draft') {
        params.force = true;
        params.reason = confirmReason;
      }
      await payrollRunsApi.update(editingRunId, params);
      setShowEditModal(false);
      setEditingRunId(null);
      setEditingRunStatus('draft');
      setConfirmReason('');
      loadPayrollRuns();
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to update payroll run');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteRun = async (run: PayrollRun) => {
    // Show confirmation modal for deletion
    setShowConfirmModal({ type: 'delete', run });
    setConfirmReason('');
  };

  const handleConfirmDelete = async () => {
    if (!showConfirmModal || showConfirmModal.type !== 'delete') return;
    if (!confirmReason.trim()) {
      alert('Please provide a deletion reason.');
      return;
    }
    await executeDeleteRun(showConfirmModal.run.id, true, confirmReason);
    setShowConfirmModal(null);
    setConfirmReason('');
  };

  const executeDeleteRun = async (runId: number, force: boolean, reason: string) => {
    try {
      const result = await payrollRunsApi.delete(runId, force, reason);
      alert(result.message || 'Payroll run moved to trash');
      loadPayrollRuns();
      if (selectedRun?.id === runId) {
        setSelectedRun(null);
        setPayslips([]);
      }
    } catch (error: any) {
      // Handle the new error format with stats
      const detail = error.response?.data?.detail;
      if (typeof detail === 'object' && detail.message) {
        alert(`${detail.message}\n\nValid words: ${detail.stats?.valid_words || 0}`);
      } else {
        alert(detail || 'Failed to delete payroll run');
      }
    }
  };

  const handleRelease = async (runId: number) => {
    if (!confirm('Release all payslips to employees? They will be able to view their payslips.')) {
      return;
    }
    try {
      await payrollApi.releaseRun(runId);
      alert('Payslips released to employees!');
      loadPayrollRuns();
      if (selectedRun?.id === runId) {
        loadPayslips(runId);
      }
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to release payslips');
    }
  };

  const handleLock = async (runId: number) => {
    if (!confirm('Lock this payroll run? This cannot be undone.')) {
      return;
    }
    try {
      await payrollApi.lockRun(runId);
      loadPayrollRuns();
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to lock payroll');
    }
  };

  const handleEditPayslip = () => {
    if (!selectedPayslip) return;
    const empSettings = (selectedPayslip as any).employee_settings || {};
    setEditEarnings({ ...selectedPayslip.earnings });
    setEditDeductions({ ...selectedPayslip.deductions });
    setEditAttendance({
      days_worked: selectedPayslip.days_worked,
      days_absent: selectedPayslip.days_absent,
      late_count: selectedPayslip.late_count,
      total_late_minutes: selectedPayslip.total_late_minutes,
      overtime_hours: selectedPayslip.overtime_hours,
      work_hours_per_day: empSettings.work_hours_per_day || selectedPayslip.deductions?.work_hours_per_day_used || 8,
      call_time: empSettings.call_time || "08:00",
      time_out: empSettings.time_out || "17:00",
      buffer_minutes: empSettings.buffer_minutes ?? 10,
      is_flexible: empSettings.is_flexible || false,
      recalculate_deductions: false,
    });
    setEditAdditional({
      additional_amount: (selectedPayslip as any).additional_amount || 0,
      additional_notes: (selectedPayslip as any).additional_notes || '',
    });
    setEditMode(true);
  };

  const handleSavePayslip = async () => {
    if (!selectedPayslip) return;
    setSaving(true);
    try {
      // Get current employee settings for comparison
      const empSettings = (selectedPayslip as any).employee_settings || {};
      const proratePayload = showProrate
        ? buildProratePayload(
          proratePeriods,
          (selectedPayslip as any).period_start || '',
          (selectedPayslip as any).period_end || ''
        )
        : null;
      const effectiveEarnings = proratePayload ? { ...editEarnings, ...proratePayload.earnings } : editEarnings;
      const effectiveDeductions = proratePayload ? { ...editDeductions, ...proratePayload.deductions } : editDeductions;
      const effectiveAttendance = proratePayload ? { ...editAttendance, ...proratePayload.attendance } : editAttendance;
      const isProrating = Boolean(proratePayload);

      // Update attendance first (may recalculate deductions)
      const hasAttendanceChanges =
        effectiveAttendance.days_worked !== selectedPayslip.days_worked ||
        effectiveAttendance.days_absent !== selectedPayslip.days_absent ||
        effectiveAttendance.late_count !== selectedPayslip.late_count ||
        effectiveAttendance.total_late_minutes !== selectedPayslip.total_late_minutes ||
        effectiveAttendance.overtime_hours !== selectedPayslip.overtime_hours ||
        effectiveAttendance.work_hours_per_day !== (selectedPayslip.deductions?.work_hours_per_day_used || 8);

      // Check if employee settings changed (these need to be saved to employee record)
      const hasEmployeeSettingsChanges =
        effectiveAttendance.is_flexible !== (empSettings.is_flexible || false) ||
        effectiveAttendance.call_time !== (empSettings.call_time || "08:00") ||
        effectiveAttendance.time_out !== (empSettings.time_out || "17:00") ||
        effectiveAttendance.buffer_minutes !== (empSettings.buffer_minutes ?? 10);

      let updatedPayslip = { ...selectedPayslip };
      let presetMessage = '';

      // Always recalculate deductions when days_absent, late_minutes, or work_hours change
      const shouldRecalculate =
        !isProrating && (
          effectiveAttendance.days_absent !== selectedPayslip.days_absent ||
          effectiveAttendance.total_late_minutes !== selectedPayslip.total_late_minutes ||
          effectiveAttendance.work_hours_per_day !== (selectedPayslip.deductions?.work_hours_per_day_used || 8)
        );

      if (hasAttendanceChanges || hasEmployeeSettingsChanges) {
        const attendanceData = {
          ...effectiveAttendance,
          recalculate_deductions: shouldRecalculate
        };

        const attendanceResult = await payrollApi.updatePayslipAttendance(selectedPayslip.id, attendanceData) as any;
        updatedPayslip.days_worked = attendanceResult.days_worked;
        updatedPayslip.days_absent = attendanceResult.days_absent;
        updatedPayslip.total_late_minutes = attendanceResult.total_late_minutes;
        if (shouldRecalculate) {
          updatedPayslip.total_deductions = attendanceResult.total_deductions;
          updatedPayslip.net_pay = attendanceResult.net_pay;
        }
        // Check if preset was saved
        if (attendanceResult.preset_saved) {
          presetMessage = attendanceResult.preset_message || `Default days saved as ${effectiveAttendance.days_worked} for future payrolls`;
        }
      }

      // Update earnings
      await payrollApi.updatePayslipEarnings(selectedPayslip.id, effectiveEarnings);

      // Update deductions (government + loans + rates)
      // If attendance was recalculated, don't overwrite backend-calculated absences/lates
      const daysAbsent = effectiveAttendance.days_absent ?? selectedPayslip.days_absent ?? 0;
      const lateMinutes = effectiveAttendance.total_late_minutes ?? selectedPayslip.total_late_minutes ?? 0;
      const dailyRate = effectiveDeductions.absences_daily_rate_used ?? selectedPayslip.deductions?.absences_daily_rate_used ?? 0;
      const minuteRate = effectiveDeductions.late_minute_rate_used ?? selectedPayslip.deductions?.late_minute_rate_used ?? 0;

      const allDeductions: Record<string, number> = {
        sss: effectiveDeductions.sss ?? selectedPayslip.deductions?.sss ?? 0,
        philhealth: effectiveDeductions.philhealth ?? selectedPayslip.deductions?.philhealth ?? 0,
        pagibig: effectiveDeductions.pagibig ?? selectedPayslip.deductions?.pagibig ?? 0,
        tax: effectiveDeductions.tax ?? selectedPayslip.deductions?.tax ?? 0,
        sss_loan: effectiveDeductions.sss_loan ?? selectedPayslip.deductions?.sss_loan ?? 0,
        pagibig_loan: effectiveDeductions.pagibig_loan ?? selectedPayslip.deductions?.pagibig_loan ?? 0,
        other_loan: effectiveDeductions.other_loan ?? selectedPayslip.deductions?.other_loan ?? 0,
        absences_daily_rate_used: dailyRate,
        late_minute_rate_used: minuteRate,
        work_hours_per_day_used: effectiveAttendance.work_hours_per_day ?? selectedPayslip.deductions?.work_hours_per_day_used ?? 8,
      };

      const cutoff = selectedRun?.cutoff || 1;
      if (cutoff === 1) {
        allDeductions.sss = 0;
        allDeductions.philhealth = 0;
        allDeductions.pagibig = 0;
      } else {
        allDeductions.sss_loan = 0;
        allDeductions.pagibig_loan = 0;
        allDeductions.other_loan = 0;
      }

      // Prorate has per-period attendance deductions; do not let the generic rate x days formula overwrite them.
      if (isProrating) {
        allDeductions.absences_amount = effectiveDeductions.absences_amount ?? 0;
        allDeductions.late_amount = effectiveDeductions.late_amount ?? 0;
        allDeductions.absences_days = effectiveDeductions.absences_days ?? daysAbsent;
        allDeductions.late_minutes = effectiveDeductions.late_minutes ?? lateMinutes;
      } else if (!shouldRecalculate) {
        allDeductions.absences_amount = daysAbsent * dailyRate;
        allDeductions.late_amount = lateMinutes * minuteRate;
      }

      await payrollApi.updatePayslipDeductions(selectedPayslip.id, allDeductions);

      // Update additional fields (internal use only, not printed)
      if (editAdditional.additional_amount !== undefined || editAdditional.additional_notes !== undefined) {
        await payrollApi.updatePayslipAdditional(selectedPayslip.id, editAdditional);
      }

      // Reload the payslip to get fresh data from server
      const freshPayslip = await payrollApi.getPayslip(selectedPayslip.id) as PayslipData;

      // Update local state with fresh data
      setSelectedPayslip(freshPayslip);

      // Reload payslips list
      if (selectedRun) {
        loadPayslips(selectedRun.id);
      }

      setEditMode(false);
      // Refresh history if panel is open
      if (showHistory) loadPayslipHistory(selectedPayslip.id);
      if (presetMessage) {
        alert(`Payslip updated!\n\n${presetMessage}`);
      } else {
        alert('Payslip updated successfully!');
      }
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to update payslip');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditMode(false);
    setEditEarnings({});
    setEditDeductions({});
    setEditAttendance({});
    setShowProrate(false);
    setProratePeriods([defaultPeriod(4), defaultPeriod(8)]);
  };

  // ---- Shared ICAN Formula Helpers ----
  const icanDailyRate = (monthly: number) => Math.round((monthly * 12 / 261) * 100) / 100;
  const icanMinuteRate = (daily: number, hours: number) => hours > 0 ? Math.round((daily / hours / 60) * 10000) / 10000 : 0;
  const icanOtRate = (daily: number, hours: number) => hours > 0 ? Math.round((daily / hours * 1.30) * 100) / 100 : 0;
  const dayBefore = (dateStr: string) => { const d = new Date(dateStr); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0]; };

  // Count working days between two dates (Mon-Fri default, or use employee schedule)
  const countWorkingDays = (startStr: string, endStr: string, workDays?: Record<string, boolean>) => {
    const start = new Date(startStr);
    const end = new Date(endStr);
    let count = 0;
    const d = new Date(start);
    while (d <= end) {
      const dow = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
      if (workDays) {
        const dayMap: Record<number, string> = { 0: 'work_sunday', 1: 'work_monday', 2: 'work_tuesday', 3: 'work_wednesday', 4: 'work_thursday', 5: 'work_friday', 6: 'work_saturday' };
        if (workDays[dayMap[dow]] !== false) count++;
      } else {
        if (dow >= 1 && dow <= 5) count++; // Mon-Fri
      }
      d.setDate(d.getDate() + 1);
    }
    return count;
  };

  // Auto-compute OT pay from hours
  const computeOtPay = (otHours: number, basicSemi?: number, workHours?: number) => {
    const basic = basicSemi ?? editEarnings.basic_semi ?? selectedPayslip?.earnings?.basic_semi ?? 0;
    const daily = icanDailyRate(basic * 2);
    const hrs = workHours ?? editAttendance.work_hours_per_day ?? 8;
    return Math.round(icanOtRate(daily, hrs) * otHours * 100) / 100;
  };

  const buildProratePayload = (periods: ProratePeriod[], periodStart: string, periodEnd: string) => {
    const computed = periods.map((p, i) => {
      const end = i < periods.length - 1
        ? (periods[i + 1].startDate ? dayBefore(periods[i + 1].startDate) : '')
        : periodEnd;
      const dr = icanDailyRate(p.basicSalary);
      const minuteRate = p.workHours > 0 ? dr / p.workHours / 60 : 0;
      return {
        end, dailyRate: dr,
        basicEarn: dr * p.daysWorked,
        allowEarn: icanDailyRate(p.allowance) * p.daysWorked,
        prodEarn: icanDailyRate(p.productivity) * p.daysWorked,
        langEarn: icanDailyRate(p.language) * p.daysWorked,
        otPay: icanOtRate(dr, p.workHours) * p.otHours,
        absentDed: Math.round(dr * p.daysAbsent * 100) / 100,
        lateDed: Math.round(minuteRate * p.lateMinutes * 100) / 100,
      };
    });

    const sum = (fn: (c: typeof computed[0]) => number) => Math.round(computed.reduce((s, c) => s + fn(c), 0) * 100) / 100;
    const sumP = (fn: (p: ProratePeriod) => number) => periods.reduce((s, p) => s + fn(p), 0);
    const grandBasic = sum(c => c.basicEarn);
    const grandAllow = sum(c => c.allowEarn);
    const grandProd = sum(c => c.prodEarn);
    const grandLang = sum(c => c.langEarn);
    const grandOt = sum(c => c.otPay);
    const grandRegHol = sumP(p => p.regularHoliday);
    const grandRegHolOt = sumP(p => p.regularHolidayOt);
    const grandSnwh = sumP(p => p.snwh);
    const grandSnwhOt = sumP(p => p.snwhOt);
    const grandDaysWorked = sumP(p => p.daysWorked);
    const grandDaysAbsent = sumP(p => p.daysAbsent);
    const grandLateMins = sumP(p => p.lateMinutes);
    const grandOtHours = sumP(p => p.otHours);
    const grandAbsent = sum(c => c.absentDed);
    const grandLate = sum(c => c.lateDed);
    const lastPeriod = periods[periods.length - 1];
    const lastDr = icanDailyRate(lastPeriod.basicSalary);
    const lastMr = icanMinuteRate(lastDr, lastPeriod.workHours);

    const prorateInfo = periods.map((p, i) => {
      const minuteRate = p.workHours > 0 ? computed[i].dailyRate / p.workHours / 60 : 0;
      const totalEarn = computed[i].basicEarn + computed[i].allowEarn + computed[i].prodEarn + computed[i].langEarn + computed[i].otPay + p.regularHoliday + p.regularHolidayOt + p.snwh + p.snwhOt;
      return {
        period: i + 1,
        startDate: i === 0 ? periodStart : p.startDate,
        endDate: computed[i].end,
        daysWorked: p.daysWorked, daysAbsent: p.daysAbsent, lateMinutes: p.lateMinutes, otHours: p.otHours,
        monthlyBasic: p.basicSalary, workHours: p.workHours,
        monthlyAllowance: p.allowance, monthlyProductivity: p.productivity, monthlyLanguage: p.language,
        dailyRate: Math.round(computed[i].dailyRate * 100) / 100,
        minuteRate: Math.round(minuteRate * 10000) / 10000,
        basicEarned: Math.round(computed[i].basicEarn * 100) / 100,
        allowanceEarned: Math.round(computed[i].allowEarn * 100) / 100,
        productivityEarned: Math.round(computed[i].prodEarn * 100) / 100,
        languageEarned: Math.round(computed[i].langEarn * 100) / 100,
        otPay: Math.round(computed[i].otPay * 100) / 100,
        regularHoliday: p.regularHoliday,
        regularHolidayOt: p.regularHolidayOt,
        snwh: p.snwh,
        snwhOt: p.snwhOt,
        totalEarnings: Math.round(totalEarn * 100) / 100,
        absentDeduction: computed[i].absentDed,
        lateDeduction: computed[i].lateDed,
      };
    });

    return {
      earnings: {
      basic_semi: grandBasic,
      allowance_semi: grandAllow,
      productivity_incentive_semi: grandProd,
      language_incentive_semi: grandLang,
      regular_holiday: grandRegHol,
      regular_holiday_ot: grandRegHolOt,
      snwh: grandSnwh,
      snwh_ot: grandSnwhOt,
      overtime: grandOt,
      _prorate_info: prorateInfo as any,
      },
      deductions: {
        absences_daily_rate_used: lastDr,
        late_minute_rate_used: lastMr,
        absences_amount: grandAbsent,
        late_amount: grandLate,
        absences_days: grandDaysAbsent,
        late_minutes: grandLateMins,
      },
      attendance: {
        days_worked: grandDaysWorked,
        days_absent: grandDaysAbsent,
        total_late_minutes: grandLateMins,
        overtime_hours: grandOtHours,
      },
    };
  };

  // Sync prorate periods → editEarnings + editAttendance (called on every prorate change)
  const syncProrateToEarnings = (periods: ProratePeriod[], periodStart: string, periodEnd: string, _workDaySchedule?: Record<string, boolean>) => {
    const payload = buildProratePayload(periods, periodStart, periodEnd);
    setEditEarnings(prev => ({ ...prev, ...payload.earnings }));
    setEditDeductions(prev => ({ ...prev, ...payload.deductions }));
    setEditAttendance(prev => ({ ...prev, ...payload.attendance }));
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-800',
      processing: 'bg-blue-100 text-blue-800',
      review: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800',
      locked: 'bg-purple-100 text-purple-800',
    };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded ${colors[status] || 'bg-gray-100'}`}>
        {status}
      </span>
    );
  };

  const getCutoffLabel = (cutoff: number) => {
    return cutoff === 1 ? '1st Cutoff (1-15)' : '2nd Cutoff (16-end)';
  };

  // Filter and sort payroll runs
  const filteredRuns = payrollRuns
    .filter((run) => {
      // Status filter
      if (runStatusFilter && run.status !== runStatusFilter) return false;
      // Search (by period)
      if (runSearch) {
        const searchLower = runSearch.toLowerCase();
        const period = `${dayjs(run.period_start).format('MMM D')} - ${dayjs(run.period_end).format('MMM D, YYYY')}`.toLowerCase();
        if (!period.includes(searchLower)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      let aVal: any, bVal: any;
      switch (runSortBy) {
        case 'period_start':
          aVal = new Date(a.period_start).getTime();
          bVal = new Date(b.period_start).getTime();
          break;
        case 'status':
          aVal = a.status;
          bVal = b.status;
          break;
        case 'employee_count':
          aVal = a.employee_count || 0;
          bVal = b.employee_count || 0;
          break;
        case 'total_net':
          aVal = a.total_net || 0;
          bVal = b.total_net || 0;
          break;
        default:
          aVal = a.id;
          bVal = b.id;
      }
      if (runSortOrder === 'asc') {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      } else {
        return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
      }
    });

  // Filter and sort payslips
  const filteredPayslips = payslips
    .filter((p) => {
      if (payslipSearch) {
        const searchLower = payslipSearch.toLowerCase();
        return (
          p.employee_name.toLowerCase().includes(searchLower) ||
          p.employee_no.toLowerCase().includes(searchLower)
        );
      }
      return true;
    })
    .sort((a, b) => {
      let aVal: any, bVal: any;
      switch (payslipSortBy) {
        case 'employee_name':
          aVal = a.employee_name.toLowerCase();
          bVal = b.employee_name.toLowerCase();
          break;
        case 'employee_no':
          aVal = a.employee_no;
          bVal = b.employee_no;
          break;
        case 'days_worked':
          aVal = a.days_worked;
          bVal = b.days_worked;
          break;
        case 'total_earnings':
          aVal = a.total_earnings;
          bVal = b.total_earnings;
          break;
        case 'total_deductions':
          aVal = a.total_deductions;
          bVal = b.total_deductions;
          break;
        case 'net_pay':
          aVal = a.net_pay;
          bVal = b.net_pay;
          break;
        default:
          aVal = a.employee_name.toLowerCase();
          bVal = b.employee_name.toLowerCase();
      }
      if (payslipSortOrder === 'asc') {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      } else {
        return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
      }
    });

  const handleRunSort = (column: string) => {
    if (runSortBy === column) {
      setRunSortOrder(runSortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setRunSortBy(column);
      setRunSortOrder('asc');
    }
  };

  const handlePayslipSort = (column: string) => {
    if (payslipSortBy === column) {
      setPayslipSortOrder(payslipSortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setPayslipSortBy(column);
      setPayslipSortOrder('asc');
    }
  };

  const loadPayslipHistory = async (payslipId: number) => {
    setHistoryLoading(true);
    try {
      const data = await payrollApi.getPayslipHistory(payslipId);
      setHistoryItems(data.items);
    } catch (error) {
      console.error('Failed to load history:', error);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleRestore = async (auditLogId: number, description: string) => {
    if (!selectedPayslip) return;
    if (!confirm(`Restore payslip to this state?\n\n${description}\n\nThis will overwrite current values. A restore entry will be created in history so you can undo this.`)) return;
    setRestoringId(auditLogId);
    try {
      const result = await payrollApi.restorePayslip(selectedPayslip.id, auditLogId);
      alert(result.message);
      // Reload payslip and history
      const fresh = await payrollApi.getPayslip(selectedPayslip.id) as PayslipData;
      setSelectedPayslip(fresh);
      setEditMode(false);
      loadPayslipHistory(selectedPayslip.id);
      if (selectedRun) loadPayslips(selectedRun.id);
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to restore payslip');
    } finally {
      setRestoringId(null);
    }
  };

  const SortIcon = ({ column, currentSort, currentOrder }: { column: string; currentSort: string; currentOrder: 'asc' | 'desc' }) => (
    <span className="ml-1 inline-block">
      {currentSort === column ? (
        currentOrder === 'asc' ? '▲' : '▼'
      ) : (
        <span className="text-gray-300">▼</span>
      )}
    </span>
  );

  // Payslip Detail Modal
  if (selectedPayslip) {
    const cutoff = selectedRun?.cutoff || 1;

    // Live-computed totals for edit mode
    const liveEarnings = editMode ? (
      (editEarnings.basic_semi ?? selectedPayslip.earnings?.basic_semi ?? 0) +
      (editEarnings.allowance_semi ?? selectedPayslip.earnings?.allowance_semi ?? 0) +
      (editEarnings.productivity_incentive_semi ?? selectedPayslip.earnings?.productivity_incentive_semi ?? 0) +
      (editEarnings.language_incentive_semi ?? selectedPayslip.earnings?.language_incentive_semi ?? 0) +
      (editEarnings.regular_holiday ?? selectedPayslip.earnings?.regular_holiday ?? 0) +
      (editEarnings.regular_holiday_ot ?? selectedPayslip.earnings?.regular_holiday_ot ?? 0) +
      (editEarnings.snwh ?? selectedPayslip.earnings?.snwh ?? 0) +
      (editEarnings.snwh_ot ?? selectedPayslip.earnings?.snwh_ot ?? 0) +
      (editEarnings.overtime ?? selectedPayslip.earnings?.overtime ?? 0)
    ) : selectedPayslip.total_earnings;

    const liveDaysAbsent = editAttendance.days_absent ?? selectedPayslip.days_absent ?? 0;
    const liveLateMinutes = editAttendance.total_late_minutes ?? selectedPayslip.total_late_minutes ?? 0;
    const liveDailyRate = editDeductions.absences_daily_rate_used ?? selectedPayslip.deductions?.absences_daily_rate_used ?? 0;
    const liveMinuteRate = editDeductions.late_minute_rate_used ?? selectedPayslip.deductions?.late_minute_rate_used ?? 0;
    const liveAbsenceAmt = liveDaysAbsent * liveDailyRate;
    const liveLateAmt = liveLateMinutes * liveMinuteRate;

    const liveDeductions = editMode ? (() => {
      const absLate = liveAbsenceAmt + liveLateAmt;
      if (cutoff === 1) {
        return absLate +
          (editDeductions.tax ?? selectedPayslip.deductions?.tax ?? 0) +
          (editDeductions.sss_loan ?? selectedPayslip.deductions?.sss_loan ?? 0) +
          (editDeductions.pagibig_loan ?? selectedPayslip.deductions?.pagibig_loan ?? 0) +
          (editDeductions.other_loan ?? selectedPayslip.deductions?.other_loan ?? 0);
      } else {
        return absLate +
          (editDeductions.tax ?? selectedPayslip.deductions?.tax ?? 0) +
          (editDeductions.sss ?? selectedPayslip.deductions?.sss ?? 0) +
          (editDeductions.philhealth ?? selectedPayslip.deductions?.philhealth ?? 0) +
          (editDeductions.pagibig ?? selectedPayslip.deductions?.pagibig ?? 0);
      }
    })() : selectedPayslip.total_deductions;

    const liveNetPay = editMode ? (liveEarnings - liveDeductions) : selectedPayslip.net_pay;

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => { setSelectedPayslip(null); setEditMode(false); setShowHistory(false); setHistoryItems([]); }}
            className="text-gray-600 hover:text-gray-900"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Payslip Details</h1>
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => handleDownloadPayslipPdf(selectedPayslip.id)}
              disabled={downloading === selectedPayslip.id}
              className="btn-secondary flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              PDF
            </button>
            <button
              onClick={() => handleDownloadPayslipPng(selectedPayslip.id)}
              disabled={downloading === selectedPayslip.id}
              className="btn-secondary flex items-center gap-2"
            >
              PNG
            </button>
            <button
              onClick={() => {
                setShowHistory(!showHistory);
                if (!showHistory) loadPayslipHistory(selectedPayslip.id);
              }}
              className={`btn-secondary flex items-center gap-2 ${showHistory ? 'bg-blue-100 border-blue-400' : ''}`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              History
            </button>
            {selectedRun?.status === 'review' && !editMode && (
              <button onClick={handleEditPayslip} className="btn-secondary">
                Edit Payslip
              </button>
            )}
          </div>
        </div>

        {/* Version History Panel */}
        {showHistory && (
          <div className="card bg-gray-50 border-l-4 border-blue-500">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Edit History
              <span className="text-xs font-normal text-gray-500">({historyItems.length} changes)</span>
            </h3>
            {historyLoading ? (
              <p className="text-sm text-gray-500">Loading history...</p>
            ) : historyItems.length === 0 ? (
              <p className="text-sm text-gray-500">No edit history yet. Changes will appear here after saving.</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {historyItems.map((item) => (
                  <div key={item.id} className={`flex items-start gap-3 p-3 rounded border ${item.action === 'payslip_restore' ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'}`}>
                    <div className="flex-shrink-0 mt-0.5">
                      {item.action === 'payslip_restore' ? (
                        <span className="inline-block w-2 h-2 rounded-full bg-amber-500"></span>
                      ) : (
                        <span className="inline-block w-2 h-2 rounded-full bg-blue-500"></span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span>{new Date(item.timestamp).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}</span>
                        <span className="text-gray-300">|</span>
                        <span>{item.user_email}</span>
                      </div>
                      <p className="text-sm text-gray-800 mt-0.5">
                        {item.action === 'payslip_restore' ? (
                          <span className="font-medium text-amber-700">{item.description || item.reason}</span>
                        ) : (
                          <span>{item.description || item.change_type?.replace(/_/g, ' ')}</span>
                        )}
                      </p>
                      {item.snapshot && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          Net Pay: {formatCurrency(item.snapshot.net_pay || 0)}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleRestore(item.id, item.description || item.reason || 'this state')}
                      disabled={restoringId === item.id}
                      className="flex-shrink-0 px-2 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-blue-50 hover:border-blue-400 text-gray-600 hover:text-blue-700 disabled:opacity-50"
                    >
                      {restoringId === item.id ? 'Restoring...' : 'Restore'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="card">
          {/* Header */}
          <div className="border-b pb-4 mb-4">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-xl font-bold">{selectedPayslip.employee_name}</h2>
                <p className="text-gray-500">{selectedPayslip.employee_no}</p>
                {/* Schedule Info */}
                {(() => {
                  const empSettings = (selectedPayslip as any).employee_settings || {};
                  const callTime = empSettings.call_time || "08:00";
                  const timeOut = empSettings.time_out || "17:00";
                  const isFlexible = empSettings.is_flexible || false;
                  return (
                    <p className="text-xs text-gray-400 mt-1">
                      {isFlexible ? (
                        <span className="inline-flex items-center gap-1">
                          <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded text-xs font-medium">Flexible</span>
                          <span>Schedule</span>
                        </span>
                      ) : (
                        <span>Schedule: {formatTime12Hour(callTime)} - {formatTime12Hour(timeOut)}</span>
                      )}
                    </p>
                  );
                })()}
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-500">Pay Period</p>
                <p className="font-medium">
                  {dayjs(selectedPayslip.period_start).format('MMM D')} - {dayjs(selectedPayslip.period_end).format('MMM D, YYYY')}
                </p>
                <p className="text-sm text-blue-600 font-medium mt-1">
                  {getCutoffLabel(cutoff)}
                </p>
              </div>
            </div>
          </div>

          {/* Attendance Summary */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
                Attendance
              </h3>
              {editMode && (
                <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                  Tip: Adjust days for partial schedules
                </span>
              )}
            </div>
            <div className="grid grid-cols-5 gap-3">
              <div className="text-center p-3 bg-gray-50 rounded">
                {editMode ? (
                  <>
                    <select
                      value={editAttendance.work_hours_per_day ?? selectedPayslip.deductions?.work_hours_per_day_used ?? 8}
                      onChange={(e) => {
                        const newHrs = parseInt(e.target.value);
                        const basicSemi = editEarnings.basic_semi ?? selectedPayslip.earnings?.basic_semi ?? 0;
                        const dr = icanDailyRate(basicSemi * 2);
                        const otHours = editAttendance.overtime_hours ?? selectedPayslip.overtime_hours ?? 0;
                        setEditAttendance({ ...editAttendance, work_hours_per_day: newHrs });
                        setEditDeductions(prev => ({ ...prev, late_minute_rate_used: icanMinuteRate(dr, newHrs), work_hours_per_day_used: newHrs }));
                        setEditEarnings(prev => ({ ...prev, overtime: computeOtPay(otHours, basicSemi, newHrs) }));
                      }}
                      className="w-full h-12 text-center text-xl font-bold text-purple-600 bg-white border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 appearance-none"
                    >
                      <option value={4}>4</option>
                      <option value={6}>6</option>
                      <option value={8}>8</option>
                    </select>
                    <p className="text-xs text-gray-500 mt-1">Hrs/Day</p>
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-bold text-purple-600">{selectedPayslip.deductions?.work_hours_per_day_used || 8}</p>
                    <p className="text-xs text-gray-500">Hrs/Day</p>
                  </>
                )}
              </div>
              <div className="text-center p-3 bg-gray-50 rounded">
                {editMode ? (
                  <>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={editAttendance.days_absent ?? selectedPayslip.days_absent}
                      onChange={(e) => setEditAttendance({ ...editAttendance, days_absent: parseInt(e.target.value) || 0, recalculate_deductions: true })}
                      className="w-full h-12 text-center text-xl font-bold text-red-600 bg-white border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">Days Absent</p>
                    {selectedPayslip.deductions?.absences_daily_rate_used > 0 && (
                      <p className="text-xs text-red-600 font-medium mt-1">
                        = {formatCurrency((editAttendance.days_absent ?? selectedPayslip.days_absent ?? 0) * selectedPayslip.deductions.absences_daily_rate_used)}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-bold text-red-600">{selectedPayslip.days_absent}</p>
                    <p className="text-xs text-gray-500">Days Absent</p>
                  </>
                )}
              </div>
              <div className="text-center p-3 bg-gray-50 rounded">
                {editMode ? (
                  <>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={editAttendance.late_count ?? selectedPayslip.late_count}
                      onChange={(e) => setEditAttendance({ ...editAttendance, late_count: parseInt(e.target.value) || 0 })}
                      className="w-full h-12 text-center text-xl font-bold text-orange-600 bg-white border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">Late Count</p>
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-bold text-orange-600">{selectedPayslip.late_count}</p>
                    <p className="text-xs text-gray-500">Late Count</p>
                  </>
                )}
              </div>
              <div className="text-center p-3 bg-gray-50 rounded">
                {editMode ? (
                  <>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={editAttendance.total_late_minutes ?? selectedPayslip.total_late_minutes}
                      onChange={(e) => setEditAttendance({ ...editAttendance, total_late_minutes: parseInt(e.target.value) || 0, recalculate_deductions: true })}
                      className="w-full h-12 text-center text-xl font-bold text-orange-600 bg-white border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">Late Mins</p>
                    {selectedPayslip.deductions?.late_minute_rate_used > 0 && (
                      <p className="text-xs text-red-600 font-medium mt-1">
                        = {formatCurrency((editAttendance.total_late_minutes ?? selectedPayslip.total_late_minutes ?? 0) * selectedPayslip.deductions.late_minute_rate_used)}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-bold text-orange-600">{selectedPayslip.total_late_minutes}</p>
                    <p className="text-xs text-gray-500">Late Mins</p>
                  </>
                )}
              </div>
              <div className="text-center p-3 bg-gray-50 rounded">
                {editMode ? (
                  <>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={editAttendance.overtime_hours ?? selectedPayslip.overtime_hours}
                      onChange={(e) => {
                        const otHours = parseFloat(e.target.value) || 0;
                        setEditAttendance({ ...editAttendance, overtime_hours: otHours });
                        // Auto-compute OT pay
                        const otPay = computeOtPay(otHours);
                        setEditEarnings(prev => ({ ...prev, overtime: otPay }));
                      }}
                      className="w-full h-12 text-center text-xl font-bold text-green-600 bg-white border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">OT Hours</p>
                    {(editAttendance.overtime_hours ?? selectedPayslip.overtime_hours ?? 0) > 0 && (
                      <p className="text-xs text-green-600 font-medium mt-0.5">
                        = {formatCurrency(editEarnings.overtime ?? 0)}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-bold text-green-600">{selectedPayslip.overtime_hours}</p>
                    <p className="text-xs text-gray-500">OT Hours</p>
                  </>
                )}
              </div>
            </div>
            {/* ICAN Formula Reference */}
            {editMode && selectedPayslip.deductions?.absences_daily_rate_used > 0 && (
              <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs font-semibold text-blue-800 mb-2">ICAN Deduction Formula</p>
                <div className="text-xs text-blue-700 space-y-1">
                  <p>
                    <span className="font-medium">Daily Rate:</span> {formatCurrency(selectedPayslip.earnings?._calculation_info?.monthly_basic || 0)} × 12 ÷ 261 = <span className="font-bold">{formatCurrency(selectedPayslip.deductions.absences_daily_rate_used)}</span>
                  </p>
                  <p>
                    <span className="font-medium">Minute Rate:</span> {formatCurrency(selectedPayslip.deductions.absences_daily_rate_used)} ÷ {selectedPayslip.earnings?._calculation_info?.work_hours_per_day || 8}hrs ÷ 60 = <span className="font-bold">{formatCurrency(selectedPayslip.deductions.late_minute_rate_used || 0)}</span>
                  </p>
                  <p>
                    <span className="font-medium">OT Rate:</span> {formatCurrency(selectedPayslip.deductions.absences_daily_rate_used)} ÷ {selectedPayslip.earnings?._calculation_info?.work_hours_per_day || 8}hrs × 130% = <span className="font-bold">{formatCurrency((selectedPayslip.deductions.absences_daily_rate_used / (selectedPayslip.earnings?._calculation_info?.work_hours_per_day || 8)) * 1.30)}/hr</span>
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Prorate Mode — Replaces Earnings + Attendance Deductions */}
          {editMode && showProrate && selectedPayslip && (() => {
            const empSettings = (selectedPayslip as any).employee_settings || {};
            const periodStart = (selectedPayslip as any).period_start || '';
            const periodEnd = (selectedPayslip as any).period_end || '';
            const workDays = {
              work_monday: empSettings.work_monday ?? true, work_tuesday: empSettings.work_tuesday ?? true,
              work_wednesday: empSettings.work_wednesday ?? true, work_thursday: empSettings.work_thursday ?? true,
              work_friday: empSettings.work_friday ?? true, work_saturday: empSettings.work_saturday ?? false,
              work_sunday: empSettings.work_sunday ?? false,
            };

            const updatePeriod = (idx: number, field: string, value: any) => {
              const updated = proratePeriods.map((p, i) => i === idx ? { ...p, [field]: value } : p);
              setProratePeriods(updated);
              syncProrateToEarnings(updated, periodStart, periodEnd, workDays);
            };
            const addPeriod = () => {
              const updated = [...proratePeriods, defaultPeriod(8)];
              setProratePeriods(updated);
              syncProrateToEarnings(updated, periodStart, periodEnd, workDays);
            };
            const removePeriod = (idx: number) => {
              if (proratePeriods.length <= 2) return;
              const updated = proratePeriods.filter((_, i) => i !== idx);
              setProratePeriods(updated);
              syncProrateToEarnings(updated, periodStart, periodEnd, workDays);
            };

            // Compute each period
            const computed = proratePeriods.map((p, i) => {
              const start = i === 0 ? periodStart : p.startDate;
              const end = i < proratePeriods.length - 1
                ? (proratePeriods[i + 1].startDate ? (() => { const d = new Date(proratePeriods[i + 1].startDate); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0]; })() : '')
                : periodEnd;
              const valid = !!(start && end && start <= end);
              const schedDays = valid ? countWorkingDays(start, end, workDays) : 0;

              const dailyRate = (p.basicSalary * 12) / 261;
              const minuteRate = p.workHours > 0 ? dailyRate / p.workHours / 60 : 0;
              const otHourlyRate = p.workHours > 0 ? (dailyRate / p.workHours) * 1.30 : 0;
              const dailyAllow = (p.allowance * 12) / 261;
              const dailyProd = (p.productivity * 12) / 261;
              const dailyLang = (p.language * 12) / 261;

              const basicEarn = Math.round(dailyRate * p.daysWorked * 100) / 100;
              const allowEarn = Math.round(dailyAllow * p.daysWorked * 100) / 100;
              const prodEarn = Math.round(dailyProd * p.daysWorked * 100) / 100;
              const langEarn = Math.round(dailyLang * p.daysWorked * 100) / 100;
              const otPay = Math.round(otHourlyRate * p.otHours * 100) / 100;

              const totalEarn = basicEarn + allowEarn + prodEarn + langEarn + p.regularHoliday + p.regularHolidayOt + p.snwh + p.snwhOt + otPay;
              const absentDed = Math.round(dailyRate * p.daysAbsent * 100) / 100;
              const lateDed = Math.round(minuteRate * p.lateMinutes * 100) / 100;
              const totalDed = absentDed + lateDed;

              return { start, end, valid, schedDays, dailyRate, minuteRate, otHourlyRate, basicEarn, allowEarn, prodEarn, langEarn, otPay, totalEarn, absentDed, lateDed, totalDed };
            });

            const allValid = proratePeriods.every((p, i) => i === 0 || (p.startDate > periodStart && p.startDate <= periodEnd));
            const hasAnyRate = proratePeriods.some(p => p.basicSalary > 0);

            // Grand totals
            const grandBasic = computed.reduce((s, c) => s + c.basicEarn, 0);
            const grandAllow = computed.reduce((s, c) => s + c.allowEarn, 0);
            const grandProd = computed.reduce((s, c) => s + c.prodEarn, 0);
            const grandLang = computed.reduce((s, c) => s + c.langEarn, 0);
            const grandRegHol = proratePeriods.reduce((s, p) => s + p.regularHoliday, 0);
            const grandRegHolOt = proratePeriods.reduce((s, p) => s + p.regularHolidayOt, 0);
            const grandSnwh = proratePeriods.reduce((s, p) => s + p.snwh, 0);
            const grandSnwhOt = proratePeriods.reduce((s, p) => s + p.snwhOt, 0);
            const grandOt = computed.reduce((s, c) => s + c.otPay, 0);
            const grandTotalEarn = computed.reduce((s, c) => s + c.totalEarn, 0);
            const grandAbsent = computed.reduce((s, c) => s + c.absentDed, 0);
            const grandLate = computed.reduce((s, c) => s + c.lateDed, 0);
            const grandTotalDed = grandAbsent + grandLate;
            const grandDaysWorked = proratePeriods.reduce((s, p) => s + p.daysWorked, 0);
            const grandDaysAbsent = proratePeriods.reduce((s, p) => s + p.daysAbsent, 0);
            const grandLateMins = proratePeriods.reduce((s, p) => s + p.lateMinutes, 0);
            const grandOtHours = proratePeriods.reduce((s, p) => s + p.otHours, 0);
            return (
              <div className="bg-purple-50 border-2 border-purple-300 rounded-lg p-4 mb-4">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-bold text-purple-900 text-sm">Prorate Calculator — {proratePeriods.length} Periods</h4>
                  <div className="flex items-center gap-2">
                    <button onClick={addPeriod} className="text-xs px-2 py-1 bg-purple-200 text-purple-800 rounded hover:bg-purple-300 font-semibold">+ Add Period</button>
                    <button onClick={() => setShowProrate(false)} className="text-purple-400 hover:text-purple-600 text-lg font-bold">✕</button>
                  </div>
                </div>

                {/* Period Cards */}
                <div className="space-y-3">
                  {proratePeriods.map((period, idx) => {
                    const c = computed[idx];
                    return (
                      <div key={idx} className="bg-white rounded-lg border border-purple-200 overflow-hidden">
                        {/* Period header */}
                        <div className="bg-purple-100 px-3 py-2 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 bg-purple-600 text-white rounded text-xs font-bold flex items-center justify-center">{idx + 1}</span>
                            <span className="text-sm font-bold text-purple-900">Period {idx + 1}{idx === 0 ? ' (Original)' : ''}</span>
                            {c.valid && <span className="text-xs text-purple-600">({c.start} to {c.end})</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            {c.valid && <span className="text-xs bg-purple-200 text-purple-800 px-2 py-0.5 rounded font-semibold">{c.schedDays} sched. days</span>}
                            {idx > 0 && proratePeriods.length > 2 && (
                              <button onClick={() => removePeriod(idx)} className="text-red-400 hover:text-red-600 text-xs font-bold">Remove</button>
                            )}
                          </div>
                        </div>

                        <div className="p-3">
                          {/* Row 1: Date + Monthly rates */}
                          <div className="grid grid-cols-6 gap-2 mb-3">
                            {idx === 0 ? (
                              <div><label className="text-[10px] text-gray-500 block">Starts</label><p className="text-xs font-medium text-gray-700 py-1">{periodStart}</p></div>
                            ) : (
                              <div><label className="text-[10px] text-gray-500 block">Effective date</label>
                                <input type="date" min={periodStart} max={periodEnd} value={period.startDate}
                                  onChange={(e) => updatePeriod(idx, 'startDate', e.target.value)}
                                  className="w-full px-1 py-1 border border-purple-300 rounded text-xs" /></div>
                            )}
                            <div><label className="text-[10px] text-gray-500 block">Monthly Basic</label>
                              <input type="number" step="0.01" value={period.basicSalary || ''} onChange={(e) => updatePeriod(idx, 'basicSalary', parseFloat(e.target.value) || 0)}
                                className="w-full px-2 py-1 border rounded text-xs text-right" placeholder="0" /></div>
                            <div><label className="text-[10px] text-gray-500 block">Hrs/Day</label>
                              <select value={period.workHours} onChange={(e) => updatePeriod(idx, 'workHours', parseInt(e.target.value))}
                                className="w-full px-1 py-1 border rounded text-xs">
                                <option value={4}>4</option><option value={6}>6</option><option value={8}>8</option>
                              </select></div>
                            <div><label className="text-[10px] text-gray-500 block">Allowance</label>
                              <input type="number" step="0.01" value={period.allowance || ''} onChange={(e) => updatePeriod(idx, 'allowance', parseFloat(e.target.value) || 0)}
                                className="w-full px-2 py-1 border rounded text-xs text-right" placeholder="0" /></div>
                            <div><label className="text-[10px] text-gray-500 block">Productivity</label>
                              <input type="number" step="0.01" value={period.productivity || ''} onChange={(e) => updatePeriod(idx, 'productivity', parseFloat(e.target.value) || 0)}
                                className="w-full px-2 py-1 border rounded text-xs text-right" placeholder="0" /></div>
                            <div><label className="text-[10px] text-gray-500 block">Language</label>
                              <input type="number" step="0.01" value={period.language || ''} onChange={(e) => updatePeriod(idx, 'language', parseFloat(e.target.value) || 0)}
                                className="w-full px-2 py-1 border rounded text-xs text-right" placeholder="0" /></div>
                          </div>

                          {/* Row 2: Attendance */}
                          <div className="grid grid-cols-4 gap-2 mb-3">
                            <div><label className="text-[10px] text-gray-500 block">Days Worked</label>
                              <input type="number" step="1" min="0" value={period.daysWorked || ''} onChange={(e) => updatePeriod(idx, 'daysWorked', parseInt(e.target.value) || 0)}
                                className="w-full px-2 py-1 border rounded text-xs text-center font-bold text-green-700" placeholder="0" /></div>
                            <div><label className="text-[10px] text-gray-500 block">Days Absent</label>
                              <input type="number" step="1" min="0" value={period.daysAbsent || ''} onChange={(e) => updatePeriod(idx, 'daysAbsent', parseInt(e.target.value) || 0)}
                                className="w-full px-2 py-1 border rounded text-xs text-center font-bold text-red-600" placeholder="0" /></div>
                            <div><label className="text-[10px] text-gray-500 block">Late Mins</label>
                              <input type="number" step="1" min="0" value={period.lateMinutes || ''} onChange={(e) => updatePeriod(idx, 'lateMinutes', parseInt(e.target.value) || 0)}
                                className="w-full px-2 py-1 border rounded text-xs text-center font-bold text-orange-600" placeholder="0" /></div>
                            <div><label className="text-[10px] text-gray-500 block">OT Hours</label>
                              <input type="number" step="0.5" min="0" value={period.otHours || ''} onChange={(e) => updatePeriod(idx, 'otHours', parseFloat(e.target.value) || 0)}
                                className="w-full px-2 py-1 border rounded text-xs text-center font-bold text-blue-600" placeholder="0" /></div>
                          </div>

                          {/* Row 3: Holiday pay inputs */}
                          <div className="grid grid-cols-4 gap-2 mb-3">
                            <div><label className="text-[10px] text-gray-500 block">Reg Holiday</label>
                              <input type="number" step="0.01" value={period.regularHoliday || ''} onChange={(e) => updatePeriod(idx, 'regularHoliday', parseFloat(e.target.value) || 0)}
                                className="w-full px-2 py-1 border rounded text-xs text-right" placeholder="0" /></div>
                            <div><label className="text-[10px] text-gray-500 block">Reg Hol OT</label>
                              <input type="number" step="0.01" value={period.regularHolidayOt || ''} onChange={(e) => updatePeriod(idx, 'regularHolidayOt', parseFloat(e.target.value) || 0)}
                                className="w-full px-2 py-1 border rounded text-xs text-right" placeholder="0" /></div>
                            <div><label className="text-[10px] text-gray-500 block">SNWH</label>
                              <input type="number" step="0.01" value={period.snwh || ''} onChange={(e) => updatePeriod(idx, 'snwh', parseFloat(e.target.value) || 0)}
                                className="w-full px-2 py-1 border rounded text-xs text-right" placeholder="0" /></div>
                            <div><label className="text-[10px] text-gray-500 block">SNWH OT</label>
                              <input type="number" step="0.01" value={period.snwhOt || ''} onChange={(e) => updatePeriod(idx, 'snwhOt', parseFloat(e.target.value) || 0)}
                                className="w-full px-2 py-1 border rounded text-xs text-right" placeholder="0" /></div>
                          </div>

                          {/* Earnings breakdown — always visible */}
                          <div className="bg-green-50 rounded p-2 text-xs space-y-1 mb-2 border border-green-200">
                            <p className="font-bold text-green-800 text-[10px] uppercase">Earnings</p>
                            <div className="flex justify-between"><span className="text-gray-600">Basic (Semi)</span><span className="font-bold">{formatCurrency(c.basicEarn)}</span></div>
                            <div className="flex justify-between"><span className="text-gray-600">Allowance</span><span className="font-bold">{formatCurrency(c.allowEarn)}</span></div>
                            <div className="flex justify-between"><span className="text-gray-600">Productivity</span><span className="font-bold">{formatCurrency(c.prodEarn)}</span></div>
                            <div className="flex justify-between"><span className="text-gray-600">Language</span><span className="font-bold">{formatCurrency(c.langEarn)}</span></div>
                            {(period.regularHoliday > 0 || period.regularHolidayOt > 0 || period.snwh > 0 || period.snwhOt > 0 || c.otPay > 0) && (
                              <>
                                {period.regularHoliday > 0 && <div className="flex justify-between"><span className="text-gray-600">Reg Holiday</span><span className="font-bold">{formatCurrency(period.regularHoliday)}</span></div>}
                                {period.regularHolidayOt > 0 && <div className="flex justify-between"><span className="text-gray-600">Reg Hol OT</span><span className="font-bold">{formatCurrency(period.regularHolidayOt)}</span></div>}
                                {period.snwh > 0 && <div className="flex justify-between"><span className="text-gray-600">SNWH</span><span className="font-bold">{formatCurrency(period.snwh)}</span></div>}
                                {period.snwhOt > 0 && <div className="flex justify-between"><span className="text-gray-600">SNWH OT</span><span className="font-bold">{formatCurrency(period.snwhOt)}</span></div>}
                                {c.otPay > 0 && <div className="flex justify-between"><span className="text-gray-600">Overtime</span><span className="font-bold">{formatCurrency(c.otPay)}</span></div>}
                              </>
                            )}
                            <div className="flex justify-between font-bold text-green-900 border-t border-green-300 pt-1"><span>Total Earnings</span><span>{formatCurrency(c.totalEarn)}</span></div>
                          </div>

                          {/* Attendance deductions — always visible */}
                          <div className="bg-red-50 rounded p-2 text-xs space-y-1 mb-2 border border-red-200">
                            <p className="font-bold text-red-800 text-[10px] uppercase">Attendance Deductions</p>
                            <div className="flex justify-between items-center">
                              <span className="text-red-700">Absent: <strong>{period.daysAbsent}</strong> days × {formatCurrency(c.dailyRate)}/day</span>
                              <span className="font-bold text-red-600">-{formatCurrency(c.absentDed)}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-red-700">Late: <strong>{period.lateMinutes}</strong> mins × {formatCurrency(c.minuteRate)}/min</span>
                              <span className="font-bold text-red-600">-{formatCurrency(c.lateDed)}</span>
                            </div>
                            <div className="flex justify-between font-bold text-red-900 border-t border-red-300 pt-1"><span>Total Deductions</span><span>-{formatCurrency(c.totalDed)}</span></div>
                          </div>

                          {/* Period Net Total */}
                          <div className="bg-purple-100 rounded p-2 border border-purple-300">
                            <div className="flex justify-between text-sm font-bold text-purple-900">
                              <span>Period {idx + 1} Net</span>
                              <span>{formatCurrency(Math.round((c.totalEarn - c.totalDed) * 100) / 100)}</span>
                            </div>
                          </div>

                          {/* Rate reference (collapsible) */}
                          {period.basicSalary > 0 && (
                            <details className="mt-2 text-[10px] text-gray-500">
                              <summary className="cursor-pointer hover:text-gray-700">Rate formulas</summary>
                              <div className="mt-1 space-y-0.5 pl-2">
                                <p>Daily: {formatCurrency(period.basicSalary)} × 12 / 261 = <strong>{formatCurrency(c.dailyRate)}</strong></p>
                                <p>Minute: {formatCurrency(c.dailyRate)} / {period.workHours}hrs / 60 = <strong>{formatCurrency(c.minuteRate)}</strong></p>
                                <p>OT: {formatCurrency(c.dailyRate)} / {period.workHours}hrs × 130% = <strong>{formatCurrency(c.otHourlyRate)}/hr</strong></p>
                              </div>
                            </details>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Grand Total + Apply */}
                {allValid && hasAnyRate && (
                  <div className="mt-3 bg-purple-100 p-4 rounded-lg border border-purple-300">
                    <p className="text-sm font-bold text-purple-900 mb-3">Combined Totals ({proratePeriods.length} periods)</p>
                    <div className="grid grid-cols-2 gap-4">
                      {/* Earnings column */}
                      <div>
                        <p className="text-xs font-bold text-green-800 mb-1">Earnings</p>
                        <div className="space-y-0.5 text-xs">
                          <div className="flex justify-between"><span>Basic</span><strong>{formatCurrency(Math.round(grandBasic * 100) / 100)}</strong></div>
                          {grandAllow > 0 && <div className="flex justify-between"><span>Allowance</span><strong>{formatCurrency(Math.round(grandAllow * 100) / 100)}</strong></div>}
                          {grandProd > 0 && <div className="flex justify-between"><span>Productivity</span><strong>{formatCurrency(Math.round(grandProd * 100) / 100)}</strong></div>}
                          {grandLang > 0 && <div className="flex justify-between"><span>Language</span><strong>{formatCurrency(Math.round(grandLang * 100) / 100)}</strong></div>}
                          {grandRegHol > 0 && <div className="flex justify-between"><span>Reg Holiday</span><strong>{formatCurrency(grandRegHol)}</strong></div>}
                          {grandRegHolOt > 0 && <div className="flex justify-between"><span>Reg Hol OT</span><strong>{formatCurrency(grandRegHolOt)}</strong></div>}
                          {grandSnwh > 0 && <div className="flex justify-between"><span>SNWH</span><strong>{formatCurrency(grandSnwh)}</strong></div>}
                          {grandSnwhOt > 0 && <div className="flex justify-between"><span>SNWH OT</span><strong>{formatCurrency(grandSnwhOt)}</strong></div>}
                          {grandOt > 0 && <div className="flex justify-between"><span>Overtime</span><strong>{formatCurrency(Math.round(grandOt * 100) / 100)}</strong></div>}
                          <div className="flex justify-between font-bold text-green-900 border-t pt-1"><span>Total Earnings</span><span>{formatCurrency(Math.round(grandTotalEarn * 100) / 100)}</span></div>
                        </div>
                      </div>
                      {/* Deductions + Attendance column */}
                      <div>
                        <p className="text-xs font-bold text-red-800 mb-1">Attendance Deductions</p>
                        <div className="space-y-0.5 text-xs">
                          <div className="flex justify-between"><span>Absent ({grandDaysAbsent} days)</span><strong className="text-red-600">-{formatCurrency(Math.round(grandAbsent * 100) / 100)}</strong></div>
                          <div className="flex justify-between"><span>Late ({grandLateMins} mins)</span><strong className="text-red-600">-{formatCurrency(Math.round(grandLate * 100) / 100)}</strong></div>
                          <div className="flex justify-between font-bold text-red-900 border-t pt-1"><span>Total Deductions</span><span>-{formatCurrency(Math.round(grandTotalDed * 100) / 100)}</span></div>
                        </div>
                        <div className="mt-2 pt-2 border-t">
                          <p className="text-xs text-purple-700">Days Worked: <strong>{grandDaysWorked}</strong> | OT: <strong>{grandOtHours}hrs</strong></p>
                        </div>
                      </div>
                    </div>

                    {/* Combined Net Summary */}
                    <div className="mt-3 bg-white rounded-lg border-2 border-purple-400 p-4">
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                          <p className="text-[10px] text-gray-500 uppercase font-bold">Total Earnings</p>
                          <p className="text-lg font-bold text-green-700">{formatCurrency(Math.round(grandTotalEarn * 100) / 100)}</p>
                          <p className="text-[10px] text-gray-400">{computed.map((c, i) => `P${i+1}: ${formatCurrency(Math.round(c.totalEarn * 100) / 100)}`).join(' + ')}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-500 uppercase font-bold">Att. Deductions</p>
                          <p className="text-lg font-bold text-red-600">-{formatCurrency(Math.round(grandTotalDed * 100) / 100)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-500 uppercase font-bold">Period Net</p>
                          <p className="text-lg font-bold text-purple-800">{formatCurrency(Math.round((grandTotalEarn - grandTotalDed) * 100) / 100)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <button
                  onClick={() => setShowProrate(false)}
                  className="mt-3 w-full py-2 bg-purple-200 text-purple-800 text-sm font-bold rounded-lg hover:bg-purple-300 transition-colors"
                >
                  Switch to Manual Edit
                </button>
              </div>
            );
          })()}

          {/* Earnings & Deductions (hidden when prorate is open) */}
          {!(editMode && showProrate) && (
          <div className="grid md:grid-cols-2 gap-6">
            {/* Earnings */}
            <div>
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <span className="w-3 h-3 bg-green-500 rounded-full"></span>
                Earnings
                {editMode && !showProrate && (
                  <button
                    onClick={() => {
                      const empSettings = (selectedPayslip as any).employee_settings || {};
                      const periodStart = (selectedPayslip as any).period_start || '';
                      const periodEnd = (selectedPayslip as any).period_end || '';
                      const workDays = {
                        work_monday: empSettings.work_monday ?? true,
                        work_tuesday: empSettings.work_tuesday ?? true,
                        work_wednesday: empSettings.work_wednesday ?? true,
                        work_thursday: empSettings.work_thursday ?? true,
                        work_friday: empSettings.work_friday ?? true,
                        work_saturday: empSettings.work_saturday ?? false,
                        work_sunday: empSettings.work_sunday ?? false,
                      };
                      // Check if payslip already has saved prorate data — pre-fill
                      const savedProrate = selectedPayslip?.earnings?._prorate_info;
                      if (savedProrate && Array.isArray(savedProrate) && savedProrate.length >= 2) {
                        const restored: ProratePeriod[] = savedProrate.map((p: any, i: number) => ({
                          startDate: i === 0 ? '' : (p.startDate || ''),
                          basicSalary: p.monthlyBasic || 0,
                          workHours: p.workHours || 8,
                          allowance: p.monthlyAllowance || 0,
                          productivity: p.monthlyProductivity || 0,
                          language: p.monthlyLanguage || 0,
                          daysWorked: p.daysWorked || 0,
                          daysAbsent: p.daysAbsent || 0,
                          lateMinutes: p.lateMinutes || 0,
                          otHours: p.otHours || 0,
                          regularHoliday: p.regularHoliday || 0,
                          regularHolidayOt: p.regularHolidayOt || 0,
                          snwh: p.snwh || 0,
                          snwhOt: p.snwhOt || 0,
                        }));
                        setProratePeriods(restored);
                        syncProrateToEarnings(restored, periodStart, periodEnd, workDays);
                      } else {
                        const es = (selectedPayslip as any).employee_settings || {};
                        const last: ProratePeriod = {
                          ...defaultPeriod(es.work_hours_per_day || 8),
                          basicSalary: es.basic_salary || (editEarnings.basic_semi || 0) * 2,
                          allowance: es.allowance || editEarnings.allowance_semi || 0,
                          productivity: es.productivity_incentive || editEarnings.productivity_incentive_semi || 0,
                          language: es.language_incentive || editEarnings.language_incentive_semi || 0,
                        };
                        const initialPeriods = [defaultPeriod(4), last];
                        setProratePeriods(initialPeriods);
                        syncProrateToEarnings(initialPeriods, periodStart, periodEnd, workDays);
                      }
                      setShowProrate(true);
                    }}
                    className="ml-auto text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded hover:bg-purple-200 transition-colors font-semibold"
                  >
                    {selectedPayslip?.earnings?._prorate_info ? 'Edit Prorate' : 'Prorate'}
                  </button>
                )}
              </h3>
              <div className="space-y-2">
                {editMode ? (
                  <>
                    {/* Regular Earnings - Compact Grid */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600 text-sm">Basic (Semi)</span>
                        <input type="number" step="0.01" value={editEarnings.basic_semi || 0}
                          onChange={(e) => {
                            const newBasicSemi = parseFloat(e.target.value) || 0;
                            const dr = icanDailyRate(newBasicSemi * 2);
                            const hrs = editAttendance.work_hours_per_day || 8;
                            const otHours = editAttendance.overtime_hours ?? selectedPayslip?.overtime_hours ?? 0;
                            setEditEarnings({ ...editEarnings, basic_semi: newBasicSemi, overtime: computeOtPay(otHours, newBasicSemi, hrs) });
                            setEditDeductions({ ...editDeductions, absences_daily_rate_used: dr, late_minute_rate_used: icanMinuteRate(dr, hrs) });
                          }}
                          className="w-24 px-2 py-1 border border-gray-300 rounded text-right text-sm" />
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600 text-sm">Allowance</span>
                        <input type="number" step="0.01" value={editEarnings.allowance_semi || 0}
                          onChange={(e) => setEditEarnings({ ...editEarnings, allowance_semi: parseFloat(e.target.value) || 0 })}
                          className="w-24 px-2 py-1 border border-gray-300 rounded text-right text-sm" />
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600 text-sm">Productivity</span>
                        <input type="number" step="0.01" value={editEarnings.productivity_incentive_semi || 0}
                          onChange={(e) => setEditEarnings({ ...editEarnings, productivity_incentive_semi: parseFloat(e.target.value) || 0 })}
                          className="w-24 px-2 py-1 border border-gray-300 rounded text-right text-sm" />
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600 text-sm">Language</span>
                        <input type="number" step="0.01" value={editEarnings.language_incentive_semi || 0}
                          onChange={(e) => setEditEarnings({ ...editEarnings, language_incentive_semi: parseFloat(e.target.value) || 0 })}
                          className="w-24 px-2 py-1 border border-gray-300 rounded text-right text-sm" />
                      </div>
                    </div>

                    {/* Holiday & OT - Collapsible */}
                    <details className="bg-gray-50 rounded border">
                      <summary className="px-3 py-2 cursor-pointer text-sm font-medium text-gray-700 hover:bg-gray-100">
                        Holiday & Overtime Pay
                      </summary>
                      <div className="px-3 pb-3 grid grid-cols-2 gap-2">
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600 text-xs">Reg Holiday</span>
                          <input type="number" step="0.01" value={editEarnings.regular_holiday || 0}
                            onChange={(e) => setEditEarnings({ ...editEarnings, regular_holiday: parseFloat(e.target.value) || 0 })}
                            className="w-20 px-2 py-1 border border-gray-300 rounded text-right text-xs" />
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600 text-xs">Reg Hol OT</span>
                          <input type="number" step="0.01" value={editEarnings.regular_holiday_ot || 0}
                            onChange={(e) => setEditEarnings({ ...editEarnings, regular_holiday_ot: parseFloat(e.target.value) || 0 })}
                            className="w-20 px-2 py-1 border border-gray-300 rounded text-right text-xs" />
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600 text-xs">SNWH</span>
                          <input type="number" step="0.01" value={editEarnings.snwh || 0}
                            onChange={(e) => setEditEarnings({ ...editEarnings, snwh: parseFloat(e.target.value) || 0 })}
                            className="w-20 px-2 py-1 border border-gray-300 rounded text-right text-xs" />
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600 text-xs">SNWH OT</span>
                          <input type="number" step="0.01" value={editEarnings.snwh_ot || 0}
                            onChange={(e) => setEditEarnings({ ...editEarnings, snwh_ot: parseFloat(e.target.value) || 0 })}
                            className="w-20 px-2 py-1 border border-gray-300 rounded text-right text-xs" />
                        </div>
                        <div className="col-span-2 flex justify-between items-center pt-1 border-t">
                          <span className="text-gray-700 text-sm font-medium">Overtime Pay</span>
                          <input type="number" step="0.01" value={editEarnings.overtime || 0}
                            onChange={(e) => setEditEarnings({ ...editEarnings, overtime: parseFloat(e.target.value) || 0 })}
                            className="w-24 px-2 py-1 border border-gray-300 rounded text-right text-sm" />
                        </div>
                      </div>
                    </details>

                    {/* Attendance Deductions */}
                    <div className="bg-red-50 p-3 rounded border border-red-200">
                      <p className="text-xs font-semibold text-red-800 mb-3">Attendance Deductions</p>
                      <div className="space-y-3">
                        {/* Absent */}
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-red-700 font-medium">Absent:</span>
                            <span className="bg-white px-2 py-1 rounded border text-sm font-medium">{editAttendance.days_absent ?? selectedPayslip.days_absent ?? 0} days</span>
                            <span className="text-gray-500">×</span>
                            <div className="flex items-center bg-white rounded border border-red-300 overflow-hidden">
                              <span className="text-gray-500 pl-2 text-sm">₱</span>
                              <input type="number" step="0.01" min="0"
                                value={editDeductions.absences_daily_rate_used ?? selectedPayslip.deductions?.absences_daily_rate_used ?? 0}
                                onChange={(e) => {
                                  const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                                  setEditDeductions({ ...editDeductions, absences_daily_rate_used: isNaN(val) ? 0 : val });
                                }}
                                className="w-20 px-1 py-1.5 border-0 text-right text-sm focus:ring-0 focus:outline-none" />
                              <span className="text-xs text-white bg-red-400 py-1.5 px-2 font-medium">/day</span>
                            </div>
                          </div>
                          <span className="text-red-700 font-bold text-lg">
                            = -{formatCurrency((editAttendance.days_absent ?? selectedPayslip.days_absent ?? 0) * (editDeductions.absences_daily_rate_used ?? selectedPayslip.deductions?.absences_daily_rate_used ?? 0))}
                          </span>
                        </div>
                        {/* Late */}
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-orange-700 font-medium">Late:</span>
                            <span className="bg-white px-2 py-1 rounded border text-sm font-medium">{editAttendance.total_late_minutes ?? selectedPayslip.total_late_minutes ?? 0} mins</span>
                            <span className="text-gray-500">×</span>
                            <div className="flex items-center bg-white rounded border border-orange-300 overflow-hidden">
                              <span className="text-gray-500 pl-2 text-sm">₱</span>
                              <input type="number" step="0.01" min="0"
                                value={editDeductions.late_minute_rate_used ?? selectedPayslip.deductions?.late_minute_rate_used ?? 0}
                                onChange={(e) => {
                                  const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                                  setEditDeductions({ ...editDeductions, late_minute_rate_used: isNaN(val) ? 0 : val });
                                }}
                                className="w-20 px-1 py-1.5 border-0 text-right text-sm focus:ring-0 focus:outline-none" />
                              <span className="text-xs text-white bg-orange-400 py-1.5 px-2 font-medium">/min</span>
                            </div>
                          </div>
                          <span className="text-orange-700 font-bold text-lg">
                            = -{formatCurrency((editAttendance.total_late_minutes ?? selectedPayslip.total_late_minutes ?? 0) * (editDeductions.late_minute_rate_used ?? selectedPayslip.deductions?.late_minute_rate_used ?? 0))}
                          </span>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Basic (Semi)</span>
                      <span className="font-medium">{formatCurrency(selectedPayslip.earnings.basic_semi || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Allowance</span>
                      <span className="font-medium">{formatCurrency(selectedPayslip.earnings.allowance_semi || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Productivity</span>
                      <span className="font-medium">{formatCurrency(selectedPayslip.earnings.productivity_incentive_semi || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Language</span>
                      <span className="font-medium">{formatCurrency(selectedPayslip.earnings.language_incentive_semi || 0)}</span>
                    </div>
                    {(selectedPayslip.earnings.regular_holiday || 0) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Regular Holiday</span>
                        <span className="font-medium text-green-600">+{formatCurrency(selectedPayslip.earnings.regular_holiday)}</span>
                      </div>
                    )}
                    {(selectedPayslip.earnings.regular_holiday_ot || 0) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Regular Holiday OT</span>
                        <span className="font-medium text-green-600">+{formatCurrency(selectedPayslip.earnings.regular_holiday_ot)}</span>
                      </div>
                    )}
                    {(selectedPayslip.earnings.snwh || 0) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">SNWH</span>
                        <span className="font-medium text-green-600">+{formatCurrency(selectedPayslip.earnings.snwh)}</span>
                      </div>
                    )}
                    {(selectedPayslip.earnings.snwh_ot || 0) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">SNWH OT</span>
                        <span className="font-medium text-green-600">+{formatCurrency(selectedPayslip.earnings.snwh_ot)}</span>
                      </div>
                    )}
                    {(selectedPayslip.earnings.overtime || 0) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Overtime</span>
                        <span className="font-medium text-green-600">+{formatCurrency(selectedPayslip.earnings.overtime)}</span>
                      </div>
                    )}
                    {(selectedPayslip.deductions?.absences_amount || 0) > 0 && (
                      <div className="text-red-600">
                        <div className="flex justify-between">
                          <span>Absent Deduction</span>
                          <span className="font-medium">-{formatCurrency(selectedPayslip.deductions.absences_amount)}</span>
                        </div>
                        {(selectedPayslip.deductions?.absences_daily_rate_used || 0) > 0 && (
                          <div className="text-xs text-gray-500 text-right mt-1 space-y-0.5">
                            <p>Daily Rate: {formatCurrency(selectedPayslip.earnings?._calculation_info?.monthly_basic || (editEarnings.basic_semi || selectedPayslip.earnings?.basic_semi || 0) * 2)} × 12 ÷ 261 = {formatCurrency(selectedPayslip.deductions.absences_daily_rate_used || 0)}</p>
                            <p>{selectedPayslip.days_absent || 0} days × {formatCurrency(selectedPayslip.deductions.absences_daily_rate_used || 0)} = {formatCurrency((selectedPayslip.days_absent || 0) * (selectedPayslip.deductions.absences_daily_rate_used || 0))}</p>
                          </div>
                        )}
                      </div>
                    )}
                    {(selectedPayslip.deductions?.late_amount || 0) > 0 && (
                      <div className="text-red-600">
                        <div className="flex justify-between">
                          <span>Late Deduction</span>
                          <span className="font-medium">-{formatCurrency(selectedPayslip.deductions.late_amount)}</span>
                        </div>
                        {(selectedPayslip.deductions?.late_minute_rate_used || 0) > 0 && (
                          <div className="text-xs text-gray-500 text-right mt-1 space-y-0.5">
                            <p>Minute Rate: {formatCurrency(selectedPayslip.deductions.absences_daily_rate_used || 0)} ÷ {selectedPayslip.earnings?._calculation_info?.work_hours_per_day || 8}hrs ÷ 60 = {formatCurrency(selectedPayslip.deductions.late_minute_rate_used || 0)}</p>
                            <p>{selectedPayslip.total_late_minutes || 0} mins × {formatCurrency(selectedPayslip.deductions.late_minute_rate_used || 0)} = {formatCurrency((selectedPayslip.total_late_minutes || 0) * (selectedPayslip.deductions.late_minute_rate_used || 0))}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Prorate Breakdown (saved with payslip) */}
                    {selectedPayslip.earnings?._prorate_info && Array.isArray(selectedPayslip.earnings._prorate_info) && (
                      <div className="mt-3 bg-purple-50 border border-purple-200 rounded-lg p-3">
                        <p className="text-xs font-bold text-purple-800 mb-2">Prorated — {selectedPayslip.earnings._prorate_info.length} Periods</p>
                        <div className="space-y-2">
                          {(selectedPayslip.earnings._prorate_info as any[]).map((p: any, i: number) => {
                            const dateRange = [p.startDate, p.endDate].filter(Boolean).join(' to ');
                            return (
                              <div key={i} className="bg-white rounded p-2 border border-purple-100 text-xs">
                                <div className="flex justify-between items-center mb-1">
                                  <span className="font-bold text-purple-700">Period {p.period}{dateRange ? `: ${dateRange}` : ''}</span>
                                  <span className="text-purple-500 font-medium">{p.daysWorked}d worked | {p.workHours}hrs/day</span>
                                </div>
                                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-gray-600">
                                  <div className="flex justify-between"><span>Monthly Basic:</span><span className="font-medium">{formatCurrency(p.monthlyBasic)}</span></div>
                                  <div className="flex justify-between"><span>Daily Rate:</span><span className="font-medium">{formatCurrency(p.dailyRate)}</span></div>
                                  <div className="flex justify-between text-green-700"><span>Basic Earned:</span><span className="font-medium">{formatCurrency(p.basicEarned)}</span></div>
                                  {(p.allowanceEarned || 0) > 0 && <div className="flex justify-between text-green-700"><span>Allowance:</span><span className="font-medium">{formatCurrency(p.allowanceEarned)}</span></div>}
                                  {(p.productivityEarned || 0) > 0 && <div className="flex justify-between text-green-700"><span>Productivity:</span><span className="font-medium">{formatCurrency(p.productivityEarned)}</span></div>}
                                  {(p.languageEarned || 0) > 0 && <div className="flex justify-between text-green-700"><span>Language:</span><span className="font-medium">{formatCurrency(p.languageEarned)}</span></div>}
                                  {(p.otPay || 0) > 0 && <div className="flex justify-between text-green-700"><span>OT Pay:</span><span className="font-medium">{formatCurrency(p.otPay)}</span></div>}
                                  {(p.regularHoliday || 0) > 0 && <div className="flex justify-between text-green-700"><span>Holiday:</span><span className="font-medium">{formatCurrency(p.regularHoliday)}</span></div>}
                                  {(p.daysAbsent || 0) > 0 && <div className="flex justify-between text-red-600"><span>Absent ({p.daysAbsent}d):</span><span className="font-medium">-{formatCurrency(p.absentDeduction)}</span></div>}
                                  {(p.lateMinutes || 0) > 0 && <div className="flex justify-between text-red-600"><span>Late ({p.lateMinutes}m):</span><span className="font-medium">-{formatCurrency(p.lateDeduction)}</span></div>}
                                </div>
                                <div className="flex justify-between font-bold text-purple-800 border-t border-purple-100 pt-1 mt-1">
                                  <span>Period Total:</span><span>{formatCurrency(p.totalEarnings)}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
                <div className="border-t pt-2 flex justify-between font-semibold">
                  <span>Total Earnings</span>
                  <span>{formatCurrency(editMode ? liveEarnings : selectedPayslip.total_earnings)}</span>
                </div>
              </div>
            </div>

            {/* Deductions */}
            <div>
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <span className="w-3 h-3 bg-red-500 rounded-full"></span>
                Deductions
                <span className="text-xs font-normal text-gray-500">({getCutoffLabel(cutoff)})</span>
              </h3>
              <div className="space-y-2">
                {editMode ? (
                  <>
                    {cutoff === 2 && (
                      <>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600">SSS</span>
                          <input
                            type="number"
                            step="0.01"
                            value={editDeductions.sss ?? 0}
                            onChange={(e) => {
                              const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                              setEditDeductions({ ...editDeductions, sss: isNaN(val) ? 0 : val });
                            }}
                            className="w-28 px-2 py-1.5 border border-gray-300 rounded text-right text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600">PhilHealth</span>
                          <input
                            type="number"
                            step="0.01"
                            value={editDeductions.philhealth ?? 0}
                            onChange={(e) => {
                              const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                              setEditDeductions({ ...editDeductions, philhealth: isNaN(val) ? 0 : val });
                            }}
                            className="w-28 px-2 py-1.5 border border-gray-300 rounded text-right text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600">Pag-IBIG</span>
                          <input
                            type="number"
                            step="0.01"
                            value={editDeductions.pagibig ?? 0}
                            onChange={(e) => {
                              const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                              setEditDeductions({ ...editDeductions, pagibig: isNaN(val) ? 0 : val });
                            }}
                            className="w-28 px-2 py-1.5 border border-gray-300 rounded text-right text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                      </>
                    )}
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Withholding Tax</span>
                      <input
                        type="number"
                        step="0.01"
                        value={editDeductions.tax ?? 0}
                        onChange={(e) => {
                          const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                          setEditDeductions({ ...editDeductions, tax: isNaN(val) ? 0 : val });
                        }}
                        className="w-28 px-2 py-1.5 border border-gray-300 rounded text-right text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    {cutoff === 1 && (
                      <>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600">SSS Loan</span>
                          <input
                            type="number"
                            step="0.01"
                            value={editDeductions.sss_loan ?? 0}
                            onChange={(e) => {
                              const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                              setEditDeductions({ ...editDeductions, sss_loan: isNaN(val) ? 0 : val });
                            }}
                            className="w-28 px-2 py-1.5 border border-gray-300 rounded text-right text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600">Pag-IBIG Loan</span>
                          <input
                            type="number"
                            step="0.01"
                            value={editDeductions.pagibig_loan ?? 0}
                            onChange={(e) => {
                              const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                              setEditDeductions({ ...editDeductions, pagibig_loan: isNaN(val) ? 0 : val });
                            }}
                            className="w-28 px-2 py-1.5 border border-gray-300 rounded text-right text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600">Other Loans</span>
                          <input
                            type="number"
                            step="0.01"
                            value={editDeductions.other_loan ?? 0}
                            onChange={(e) => {
                              const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                              setEditDeductions({ ...editDeductions, other_loan: isNaN(val) ? 0 : val });
                            }}
                            className="w-28 px-2 py-1.5 border border-gray-300 rounded text-right text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                      </>
                    )}
                    {cutoff === 2 && (
                      <div className="p-2 bg-blue-50 rounded text-sm text-blue-700">
                        Loans deducted on 1st cutoff only
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {cutoff === 2 && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-gray-600">SSS</span>
                          <span className="font-medium">{formatCurrency(selectedPayslip.deductions.sss || 0)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">PhilHealth</span>
                          <span className="font-medium">{formatCurrency(selectedPayslip.deductions.philhealth || 0)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Pag-IBIG</span>
                          <span className="font-medium">{formatCurrency(selectedPayslip.deductions.pagibig || 0)}</span>
                        </div>
                      </>
                    )}
                    <div className="flex justify-between">
                      <span className="text-gray-600">Withholding Tax</span>
                      <span className="font-medium">{formatCurrency(selectedPayslip.deductions.tax || 0)}</span>
                    </div>
                    {cutoff === 1 && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-gray-600">SSS Loan</span>
                          <span className={`font-medium ${(selectedPayslip.deductions.sss_loan || 0) > 0 ? '' : 'text-gray-400'}`}>
                            {formatCurrency(selectedPayslip.deductions.sss_loan || 0)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Pag-IBIG Loan</span>
                          <span className={`font-medium ${(selectedPayslip.deductions.pagibig_loan || 0) > 0 ? '' : 'text-gray-400'}`}>
                            {formatCurrency(selectedPayslip.deductions.pagibig_loan || 0)}
                          </span>
                        </div>
                        {(selectedPayslip.deductions.other_loan || 0) > 0 && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">Other Loans</span>
                            <span className="font-medium">
                              {formatCurrency(selectedPayslip.deductions.other_loan || 0)}
                            </span>
                          </div>
                        )}
                        <div className="p-2 bg-blue-50 rounded text-sm text-blue-700 mt-2">
                          SSS, PhilHealth, Pag-IBIG deducted on 2nd cutoff only
                        </div>
                      </>
                    )}
                  </>
                )}
                <div className="border-t pt-2 flex justify-between font-semibold">
                  <span>Total Deductions</span>
                  <span className="text-red-600">{formatCurrency(editMode ? liveDeductions : selectedPayslip.total_deductions)}</span>
                </div>
              </div>
            </div>
          </div>
          )}

          {/* Gov't Deductions when prorate is open (earnings/attendance handled by prorate above) */}
          {editMode && showProrate && (
            <div className="mt-4">
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <span className="w-3 h-3 bg-red-500 rounded-full"></span>
                Government Deductions
                <span className="text-xs font-normal text-gray-500">({getCutoffLabel(cutoff)})</span>
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {cutoff === 1 ? (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 text-sm">Tax</span>
                      <input type="number" step="0.01" value={editDeductions.tax ?? selectedPayslip.deductions?.tax ?? 0}
                        onChange={(e) => setEditDeductions({ ...editDeductions, tax: parseFloat(e.target.value) || 0 })}
                        className="w-24 px-2 py-1 border border-gray-300 rounded text-right text-sm" />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 text-sm">SSS Loan</span>
                      <input type="number" step="0.01" value={editDeductions.sss_loan ?? selectedPayslip.deductions?.sss_loan ?? 0}
                        onChange={(e) => setEditDeductions({ ...editDeductions, sss_loan: parseFloat(e.target.value) || 0 })}
                        className="w-24 px-2 py-1 border border-gray-300 rounded text-right text-sm" />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 text-sm">HDMF Loan</span>
                      <input type="number" step="0.01" value={editDeductions.pagibig_loan ?? selectedPayslip.deductions?.pagibig_loan ?? 0}
                        onChange={(e) => setEditDeductions({ ...editDeductions, pagibig_loan: parseFloat(e.target.value) || 0 })}
                        className="w-24 px-2 py-1 border border-gray-300 rounded text-right text-sm" />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 text-sm">Other Loan</span>
                      <input type="number" step="0.01" value={editDeductions.other_loan ?? selectedPayslip.deductions?.other_loan ?? 0}
                        onChange={(e) => setEditDeductions({ ...editDeductions, other_loan: parseFloat(e.target.value) || 0 })}
                        className="w-24 px-2 py-1 border border-gray-300 rounded text-right text-sm" />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 text-sm">Tax</span>
                      <input type="number" step="0.01" value={editDeductions.tax ?? selectedPayslip.deductions?.tax ?? 0}
                        onChange={(e) => setEditDeductions({ ...editDeductions, tax: parseFloat(e.target.value) || 0 })}
                        className="w-24 px-2 py-1 border border-gray-300 rounded text-right text-sm" />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 text-sm">SSS</span>
                      <input type="number" step="0.01" value={editDeductions.sss ?? selectedPayslip.deductions?.sss ?? 0}
                        onChange={(e) => setEditDeductions({ ...editDeductions, sss: parseFloat(e.target.value) || 0 })}
                        className="w-24 px-2 py-1 border border-gray-300 rounded text-right text-sm" />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 text-sm">PhilHealth</span>
                      <input type="number" step="0.01" value={editDeductions.philhealth ?? selectedPayslip.deductions?.philhealth ?? 0}
                        onChange={(e) => setEditDeductions({ ...editDeductions, philhealth: parseFloat(e.target.value) || 0 })}
                        className="w-24 px-2 py-1 border border-gray-300 rounded text-right text-sm" />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 text-sm">Pag-IBIG</span>
                      <input type="number" step="0.01" value={editDeductions.pagibig ?? selectedPayslip.deductions?.pagibig ?? 0}
                        onChange={(e) => setEditDeductions({ ...editDeductions, pagibig: parseFloat(e.target.value) || 0 })}
                        className="w-24 px-2 py-1 border border-gray-300 rounded text-right text-sm" />
                    </div>
                  </>
                )}
              </div>
              {/* Net Pay Summary */}
              <div className="mt-4 p-3 bg-gray-100 rounded-lg">
                <div className="flex justify-between text-sm">
                  <span>Total Earnings (from prorate)</span>
                  <span className="font-bold text-green-700">{formatCurrency(liveEarnings)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Total Deductions</span>
                  <span className="font-bold text-red-600">-{formatCurrency(liveDeductions)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold border-t mt-2 pt-2">
                  <span>Net Pay</span>
                  <span className="text-blue-700">{formatCurrency(liveNetPay)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Flexible Schedule Toggle - Only in Edit Mode */}
          {editMode && (
            <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-blue-800">Schedule Override</h4>
                  <p className="text-xs text-gray-600">All settings come from Employee Management</p>
                </div>
                <button
                  onClick={() => setEditAttendance({ ...editAttendance, is_flexible: !editAttendance.is_flexible })}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    editAttendance.is_flexible
                      ? 'bg-green-500 text-white hover:bg-green-600'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {editAttendance.is_flexible ? '✓ Flexible Schedule' : 'Regular Schedule'}
                </button>
              </div>
              {editAttendance.is_flexible && (
                <p className="text-xs text-green-700 mt-2 bg-green-100 p-2 rounded">
                  Flexible schedule enabled - no late deductions will be applied for this payslip
                </p>
              )}
            </div>
          )}

          {/* Net Pay */}
          <div className="mt-4 p-4 bg-primary-50 rounded-lg">
            <div className="flex justify-between items-center">
              <span className="text-lg font-semibold text-gray-900">Net Pay</span>
              <span className="text-2xl font-bold text-primary-600">{formatCurrency(editMode ? liveNetPay : selectedPayslip.net_pay)}</span>
            </div>
            <p className="text-xs text-gray-600 text-right mt-2">
              = {formatCurrency(editMode ? liveEarnings : selectedPayslip.total_earnings)} (Earnings) - {formatCurrency(editMode ? liveDeductions : selectedPayslip.total_deductions)} (Deductions)
            </p>
          </div>

          {/* Additional (Internal Only - NOT printed on payslip) */}
          {editMode && (
            <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <h4 className="font-semibold text-amber-800 mb-3 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Additional (Internal Only)
                <span className="text-xs font-normal text-amber-600">Not printed on payslip</span>
              </h4>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Additional Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editAdditional.additional_amount ?? 0}
                    onChange={(e) => setEditAdditional({ ...editAdditional, additional_amount: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Additional Notes</label>
                  <textarea
                    value={editAdditional.additional_notes ?? ''}
                    onChange={(e) => setEditAdditional({ ...editAdditional, additional_notes: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                    rows={2}
                    placeholder="Internal notes (not printed)"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Show Additional info in view mode if it has values */}
          {!editMode && ((selectedPayslip as any).additional_amount > 0 || (selectedPayslip as any).additional_notes) && (
            <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <h4 className="font-semibold text-amber-800 mb-2 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Additional (Internal Only)
              </h4>
              {(selectedPayslip as any).additional_amount > 0 && (
                <p className="text-sm"><span className="text-gray-600">Amount:</span> <span className="font-medium">{formatCurrency((selectedPayslip as any).additional_amount)}</span></p>
              )}
              {(selectedPayslip as any).additional_notes && (
                <p className="text-sm mt-1"><span className="text-gray-600">Notes:</span> {(selectedPayslip as any).additional_notes}</p>
              )}
            </div>
          )}

          {/* Edit Mode Buttons */}
          {editMode && (
            <div className="mt-4 flex gap-2 justify-end">
              <button
                onClick={async () => {
                  try {
                    const result = await payrollApi.recalculatePayslip(selectedPayslip.id);
                    // Reload the payslip details
                    const detailResponse = await payrollApi.getPayslip(selectedPayslip.id);
                    setSelectedPayslip(detailResponse as PayslipData);
                    alert(`Recalculated totals from the current saved fields.\n\n` +
                      `Total Earnings: ₱${result.total_earnings.toLocaleString()}\n` +
                      `Total Deductions: ₱${result.total_deductions.toLocaleString()}\n` +
                      `Net Pay: ₱${result.net_pay.toLocaleString()}`);
                  } catch (error: any) {
                    alert(error.response?.data?.detail || 'Failed to recalculate payslip');
                  }
                }}
                className="btn-secondary flex items-center gap-2"
                disabled={saving}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Recalculate
              </button>
              <button onClick={handleCancelEdit} className="btn-secondary" disabled={saving}>
                Cancel
              </button>
              <button onClick={handleSavePayslip} className="btn-primary" disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Payslips List View
  if (selectedRun) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => { setSelectedRun(null); setPayslips([]); }}
              className="text-gray-600 hover:text-gray-900"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Payroll: {dayjs(selectedRun.period_start).format('MMM D')} - {dayjs(selectedRun.period_end).format('MMM D, YYYY')}
              </h1>
              <p className="text-gray-500">
                {getStatusBadge(selectedRun.status)}
                <span className="ml-2 text-blue-600 font-medium">{getCutoffLabel(selectedRun.cutoff)}</span>
                <span className="ml-2">- {payslipTotal || payslips.length} employees</span>
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {selectedRun.status !== 'draft' && payslips.length > 0 && (
              <>
                <button
                  onClick={async () => {
                    if (!confirm('Recalculate payroll totals from the current payslip rows?\n\nThis will not reset or overwrite individual payslips.')) return;
                    setRecalculating(selectedRun.id);
                    try {
                      const result = await payrollApi.recalculateRun(selectedRun.id);
                      alert(`Recalculated totals from ${result.updated_count} payslips.\n\nTotal Gross: ₱${result.total_gross.toLocaleString()}\nTotal Net: ₱${result.total_net.toLocaleString()}`);
                      loadPayrollRuns();
                      loadPayslips(selectedRun.id);
                    } catch (error: any) {
                      alert(error.response?.data?.detail || 'Failed to recalculate');
                    } finally {
                      setRecalculating(null);
                    }
                  }}
                  className="btn-secondary"
                  disabled={recalculating === selectedRun.id}
                  title="Recalculate totals from current payslip rows without changing payslips."
                >
                  {recalculating === selectedRun.id ? 'Recalculating...' : 'Recalculate'}
                </button>
              </>
            )}
            {selectedRun.status === 'review' && (
              <>
                <button
                  onClick={() => handleRelease(selectedRun.id)}
                  className="btn-secondary"
                >
                  Release to Employees
                </button>
                <button
                  onClick={() => handleLock(selectedRun.id)}
                  className="btn-primary"
                >
                  Lock Payroll
                </button>
              </>
            )}
          </div>
        </div>

        {/* Summary Cards */}
        <div className={`grid gap-4 ${showAdditions ? 'grid-cols-5' : 'grid-cols-4'}`}>
          <div className="card text-center">
            <p className="text-2xl font-bold text-blue-600">{formatCurrency(selectedRun.total_gross || 0)}</p>
            <p className="text-sm text-gray-500">Total Gross</p>
          </div>
          <div className="card text-center">
            <p className="text-2xl font-bold text-red-600">{formatCurrency(selectedRun.total_deductions || 0)}</p>
            <p className="text-sm text-gray-500">Total Deductions</p>
          </div>
          <div className="card text-center">
            <p className="text-2xl font-bold text-green-600">{formatCurrency(selectedRun.total_net || 0)}</p>
            <p className="text-sm text-gray-500">Total Net Pay</p>
          </div>
          {showAdditions && (
            <div className="card text-center bg-amber-50 border-amber-200">
              <p className="text-2xl font-bold text-amber-600">
                {formatCurrency(payslips.reduce((sum, p) => sum + ((p as any).additional_amount || 0), 0))}
              </p>
              <p className="text-sm text-amber-600">Total Additions</p>
              <p className="text-xs text-amber-500">(Internal Only)</p>
            </div>
          )}
          <div className="card text-center">
            <p className="text-2xl font-bold text-purple-600">{selectedRun.employee_count || 0}</p>
            <p className="text-sm text-gray-500">Employees</p>
          </div>
        </div>

        {/* Search and Actions */}
        <div className="card flex flex-wrap items-center gap-4">
          <input
            type="text"
            placeholder="Search by employee name or ID..."
            value={payslipSearch}
            onChange={(e) => setPayslipSearch(e.target.value)}
            className="form-input w-full md:w-96"
          />
          <div className="ml-auto flex gap-2">
            {/* Show Additions Toggle */}
            <button
              onClick={() => setShowAdditions(!showAdditions)}
              className={`px-3 py-2 text-sm rounded-lg font-medium transition-colors flex items-center gap-2 ${
                showAdditions
                  ? 'bg-amber-500 text-white hover:bg-amber-600'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              title={showAdditions ? 'Hide additions (internal only)' : 'Reveal additions (internal only)'}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {showAdditions ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                )}
              </svg>
              {showAdditions ? 'Hide Additions' : 'Show Additions'}
            </button>
            <button
              onClick={() => handleDownloadAllPayslipsPdf(selectedRun.id)}
              className="btn-secondary text-sm"
              title="Download all payslips as a single PDF (4 per page on A4)"
            >
              Download All PDF (4/page)
            </button>
          </div>
        </div>

        {/* Payslips Table */}
        <div className="card overflow-hidden">
          {loadingPayslips ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          ) : payslips.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p>No payslips generated yet.</p>
              {selectedRun.status === 'draft' && (
                <button
                  onClick={() => handleProcess(selectedRun.id)}
                  className="btn-primary mt-4"
                  disabled={processing === selectedRun.id}
                >
                  {processing === selectedRun.id ? 'Processing...' : 'Process Payroll Now'}
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              {/* Bulk Action Bar */}
              {selectedPayslipIds.size > 0 && (
                <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-3 flex-wrap">
                  <span className="text-sm font-bold text-blue-800">{selectedPayslipIds.size} selected</span>
                  <div className="h-4 w-px bg-blue-300" />
                  <button
                    disabled={bulkProcessing}
                    onClick={async () => {
                      if (!confirm(`Recalculate ${selectedPayslipIds.size} payslips using current employee rates?`)) return;
                      setBulkProcessing(true);
                      let success = 0, fail = 0;
                      for (const id of selectedPayslipIds) {
                        try { await payrollApi.recalculatePayslip(id); success++; } catch { fail++; }
                      }
                      setBulkProcessing(false);
                      alert(`Recalculated: ${success} success${fail > 0 ? `, ${fail} failed` : ''}`);
                      if (selectedRun) loadPayslips(selectedRun.id);
                    }}
                    className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 disabled:opacity-50"
                  >
                    {bulkProcessing ? 'Processing...' : 'Recalculate'}
                  </button>
                  <button
                    disabled={bulkProcessing}
                    onClick={async () => {
                      setBulkProcessing(true);
                      for (const id of selectedPayslipIds) {
                        try { await payrollApi.downloadPayslipPdf(id); } catch {}
                      }
                      setBulkProcessing(false);
                    }}
                    className="text-xs px-3 py-1.5 bg-gray-600 text-white rounded font-semibold hover:bg-gray-700 disabled:opacity-50"
                  >
                    Download PDFs
                  </button>
                  <button
                    onClick={() => {
                      setBulkFields(prev => {
                        const reset: Record<string, { enabled: boolean; value: number }> = {};
                        for (const k of Object.keys(prev)) reset[k] = { enabled: false, value: k === 'workHours' ? 8 : 0 };
                        return reset;
                      });
                      setShowBulkEdit(!showBulkEdit);
                    }}
                    className={`text-xs px-3 py-1.5 rounded font-semibold ${showBulkEdit ? 'bg-purple-600 text-white' : 'bg-purple-100 text-purple-700 hover:bg-purple-200'}`}
                  >
                    {showBulkEdit ? 'Close Editor' : 'Bulk Edit'}
                  </button>
                  <button
                    onClick={() => { setSelectedPayslipIds(new Set()); setShowBulkEdit(false); }}
                    className="text-xs px-3 py-1.5 bg-white text-gray-600 border border-gray-300 rounded font-semibold hover:bg-gray-50"
                  >
                    Clear
                  </button>
                </div>
              )}

              {/* Bulk Edit Panel */}
              {showBulkEdit && selectedPayslipIds.size > 0 && (() => {
                const cutoff = selectedRun?.cutoff || 1;
                const toggleField = (key: string) => setBulkFields(prev => ({ ...prev, [key]: { ...prev[key], enabled: !prev[key].enabled } }));
                const setFieldValue = (key: string, val: number) => setBulkFields(prev => ({ ...prev, [key]: { ...prev[key], value: val } }));

                // Auto-compute rates from bulk basic salary
                const bulkMonthly = bulkFields.basicSalary.value;
                const bulkDaily = bulkMonthly > 0 ? Math.round((bulkMonthly * 12 / 261) * 100) / 100 : 0;
                const bulkWorkHrs = bulkFields.workHours.value || 8;
                const bulkMinute = bulkDaily > 0 && bulkWorkHrs > 0 ? Math.round((bulkDaily / bulkWorkHrs / 60) * 10000) / 10000 : 0;
                const bulkOtRate = bulkDaily > 0 && bulkWorkHrs > 0 ? Math.round((bulkDaily / bulkWorkHrs * 1.30) * 100) / 100 : 0;

                const enabledCount = Object.values(bulkFields).filter(f => f.enabled).length;

                const renderField = (key: string, label: string, step = '0.01', prefix = '') => (
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={bulkFields[key].enabled} onChange={() => toggleField(key)}
                      className="w-4 h-4 text-purple-600 rounded border-gray-300 cursor-pointer" />
                    <span className={`text-sm w-28 ${bulkFields[key].enabled ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>{label}</span>
                    {prefix && <span className="text-gray-400 text-xs">{prefix}</span>}
                    <input type="number" step={step} value={bulkFields[key].value || ''}
                      disabled={!bulkFields[key].enabled}
                      onChange={(e) => setFieldValue(key, parseFloat(e.target.value) || 0)}
                      className={`w-28 px-2 py-1 border rounded text-sm text-right ${bulkFields[key].enabled ? 'border-purple-300 bg-white' : 'border-gray-200 bg-gray-50 text-gray-400'}`}
                      placeholder="0" />
                  </div>
                );

                return (
                  <div className="mb-4 bg-purple-50 border-2 border-purple-300 rounded-lg p-4">
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="font-bold text-purple-900 text-sm">Bulk Edit — Apply to {selectedPayslipIds.size} payslip{selectedPayslipIds.size !== 1 ? 's' : ''}</h4>
                      <p className="text-xs text-purple-600">Check fields to include, uncheck to skip</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Column 1: Earnings */}
                      <div className="bg-white p-3 rounded border border-purple-200">
                        <p className="text-xs font-bold text-green-800 uppercase mb-2">Earnings (Monthly)</p>
                        <div className="space-y-2">
                          {renderField('basicSalary', 'Basic Salary', '0.01', '₱')}
                          {renderField('allowance', 'Allowance', '0.01', '₱')}
                          {renderField('productivity', 'Productivity', '0.01', '₱')}
                          {renderField('language', 'Language', '0.01', '₱')}
                        </div>
                        {bulkFields.basicSalary.enabled && bulkMonthly > 0 && (
                          <div className="mt-2 pt-2 border-t text-[10px] text-gray-500 space-y-0.5">
                            <p>Semi: {formatCurrency(bulkMonthly / 2)}</p>
                            <p>Daily: {formatCurrency(bulkDaily)} | Minute: {formatCurrency(bulkMinute)}</p>
                            <p>OT/hr: {formatCurrency(bulkOtRate)}</p>
                          </div>
                        )}
                      </div>

                      {/* Column 2: Attendance */}
                      <div className="bg-white p-3 rounded border border-purple-200">
                        <p className="text-xs font-bold text-blue-800 uppercase mb-2">Attendance / Schedule</p>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <input type="checkbox" checked={bulkFields.workHours.enabled} onChange={() => toggleField('workHours')}
                              className="w-4 h-4 text-purple-600 rounded border-gray-300 cursor-pointer" />
                            <span className={`text-sm w-28 ${bulkFields.workHours.enabled ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>Work Hrs/Day</span>
                            <select value={bulkFields.workHours.value} disabled={!bulkFields.workHours.enabled}
                              onChange={(e) => setFieldValue('workHours', parseInt(e.target.value))}
                              className={`w-28 px-2 py-1 border rounded text-sm ${bulkFields.workHours.enabled ? 'border-purple-300 bg-white' : 'border-gray-200 bg-gray-50 text-gray-400'}`}>
                              <option value={4}>4 hrs</option><option value={6}>6 hrs</option><option value={8}>8 hrs</option>
                            </select>
                          </div>
                          {renderField('daysWorked', 'Days Worked', '1')}
                          {renderField('daysAbsent', 'Days Absent', '1')}
                          {renderField('lateMinutes', 'Late Minutes', '1')}
                          {renderField('otHours', 'OT Hours', '0.5')}
                        </div>
                      </div>

                      {/* Column 3: Deductions */}
                      <div className="bg-white p-3 rounded border border-purple-200">
                        <p className="text-xs font-bold text-red-800 uppercase mb-2">Deductions</p>
                        <div className="space-y-2">
                          {renderField('tax', 'Tax', '0.01', '₱')}
                          {cutoff === 1 ? (
                            <>
                              {renderField('sss_loan', 'SSS Loan', '0.01', '₱')}
                              {renderField('pagibig_loan', 'HDMF Loan', '0.01', '₱')}
                              {renderField('other_loan', 'Other Loan', '0.01', '₱')}
                            </>
                          ) : (
                            <>
                              {renderField('sss', 'SSS', '0.01', '₱')}
                              {renderField('philhealth', 'PhilHealth', '0.01', '₱')}
                              {renderField('pagibig', 'Pag-IBIG', '0.01', '₱')}
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Save to Employee toggle */}
                    <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-3">
                      <input type="checkbox" checked={bulkUpdateEmployee} onChange={(e) => setBulkUpdateEmployee(e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded border-gray-300 cursor-pointer" />
                      <div>
                        <span className="text-sm font-semibold text-blue-800">Also update Employee records</span>
                        <p className="text-[10px] text-blue-600">Salary, allowance, incentives, and work hours will be saved permanently so the next cutoff uses them</p>
                      </div>
                    </div>

                    {/* Apply Button */}
                    <div className="mt-3 flex items-center gap-3">
                      <button
                        disabled={bulkProcessing || enabledCount === 0}
                        onClick={async () => {
                          if (enabledCount === 0) return;
                          const fieldNames = Object.entries(bulkFields).filter(([, f]) => f.enabled).map(([k]) => k);
                          if (!confirm(`Apply ${fieldNames.length} field(s) to ${selectedPayslipIds.size} payslip(s)?\n\nFields: ${fieldNames.join(', ')}`)) return;

                          setBulkProcessing(true);
                          let success = 0, fail = 0;

                          for (const psId of selectedPayslipIds) {
                            try {
                              // Build earnings update
                              const earningsUpdate: Record<string, number> = {};
                              if (bulkFields.basicSalary.enabled) earningsUpdate.basic_semi = Math.round(bulkFields.basicSalary.value / 2 * 100) / 100;
                              if (bulkFields.allowance.enabled) earningsUpdate.allowance_semi = bulkFields.allowance.value;
                              if (bulkFields.productivity.enabled) earningsUpdate.productivity_incentive_semi = bulkFields.productivity.value;
                              if (bulkFields.language.enabled) earningsUpdate.language_incentive_semi = bulkFields.language.value;

                              // Build attendance update
                              const attendanceUpdate: Record<string, any> = {};
                              const wh = bulkFields.workHours.enabled ? bulkFields.workHours.value : 8;
                              if (bulkFields.workHours.enabled) attendanceUpdate.work_hours_per_day = wh;
                              if (bulkFields.daysWorked.enabled) attendanceUpdate.days_worked = bulkFields.daysWorked.value;
                              if (bulkFields.daysAbsent.enabled) attendanceUpdate.days_absent = bulkFields.daysAbsent.value;
                              if (bulkFields.lateMinutes.enabled) attendanceUpdate.total_late_minutes = bulkFields.lateMinutes.value;
                              if (bulkFields.otHours.enabled) attendanceUpdate.overtime_hours = bulkFields.otHours.value;
                              if (bulkFields.daysAbsent.enabled || bulkFields.lateMinutes.enabled || bulkFields.workHours.enabled) {
                                attendanceUpdate.recalculate_deductions = true;
                              }

                              // Build deductions update
                              const deductionsUpdate: Record<string, number> = {};
                              if (bulkFields.tax.enabled) deductionsUpdate.tax = bulkFields.tax.value;
                              if (bulkFields.sss.enabled) deductionsUpdate.sss = bulkFields.sss.value;
                              if (bulkFields.philhealth.enabled) deductionsUpdate.philhealth = bulkFields.philhealth.value;
                              if (bulkFields.pagibig.enabled) deductionsUpdate.pagibig = bulkFields.pagibig.value;
                              if (bulkFields.sss_loan.enabled) deductionsUpdate.sss_loan = bulkFields.sss_loan.value;
                              if (bulkFields.pagibig_loan.enabled) deductionsUpdate.pagibig_loan = bulkFields.pagibig_loan.value;
                              if (bulkFields.other_loan.enabled) deductionsUpdate.other_loan = bulkFields.other_loan.value;

                              // Add rates if basic salary changed
                              if (bulkFields.basicSalary.enabled) {
                                deductionsUpdate.absences_daily_rate_used = bulkDaily;
                                deductionsUpdate.late_minute_rate_used = bulkMinute;
                              }
                              if (bulkFields.workHours.enabled) {
                                deductionsUpdate.work_hours_per_day_used = wh;
                              }

                              // Auto-compute OT if both basic and OT hours are set
                              if (bulkFields.basicSalary.enabled && bulkFields.otHours.enabled) {
                                earningsUpdate.overtime = Math.round(bulkOtRate * bulkFields.otHours.value * 100) / 100;
                              }

                              // Send updates
                              if (Object.keys(attendanceUpdate).length > 0) {
                                await payrollApi.updatePayslipAttendance(psId, attendanceUpdate);
                              }
                              if (Object.keys(earningsUpdate).length > 0) {
                                await payrollApi.updatePayslipEarnings(psId, earningsUpdate);
                              }
                              if (Object.keys(deductionsUpdate).length > 0) {
                                await payrollApi.updatePayslipDeductions(psId, deductionsUpdate);
                              }

                              // Also update Employee record so next cutoff uses new rates
                              if (bulkUpdateEmployee) {
                                const ps = filteredPayslips.find(p => p.id === psId);
                                if (ps?.employee_id) {
                                  const empUpdate: Record<string, any> = {};
                                  if (bulkFields.basicSalary.enabled) {
                                    empUpdate.basic_salary = bulkFields.basicSalary.value;
                                    empUpdate.daily_rate = bulkDaily;
                                    empUpdate.hourly_rate = Math.round(bulkDaily / (bulkFields.workHours.enabled ? bulkFields.workHours.value : 8) * 100) / 100;
                                  }
                                  if (bulkFields.allowance.enabled) empUpdate.allowance = bulkFields.allowance.value;
                                  if (bulkFields.productivity.enabled) empUpdate.productivity_incentive = bulkFields.productivity.value;
                                  if (bulkFields.language.enabled) empUpdate.language_incentive = bulkFields.language.value;
                                  if (bulkFields.workHours.enabled) empUpdate.work_hours_per_day = bulkFields.workHours.value;
                                  if (Object.keys(empUpdate).length > 0) {
                                    try { await employeesApi.update(ps.employee_id, empUpdate); } catch {}
                                  }
                                }
                              }

                              success++;
                            } catch { fail++; }
                          }

                          setBulkProcessing(false);
                          alert(`Updated ${success} payslip(s)${fail > 0 ? `, ${fail} failed` : ''}${bulkUpdateEmployee ? '\nEmployee records also updated for next cutoff.' : ''}`);
                          if (selectedRun) loadPayslips(selectedRun.id);
                          setShowBulkEdit(false);
                        }}
                        className="px-5 py-2 bg-purple-600 text-white text-sm font-bold rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {bulkProcessing ? `Processing ${selectedPayslipIds.size} payslips...` : `Apply to ${selectedPayslipIds.size} Payslip${selectedPayslipIds.size !== 1 ? 's' : ''}`}
                      </button>
                      <span className="text-xs text-purple-600">{enabledCount} field{enabledCount !== 1 ? 's' : ''} selected</span>
                    </div>
                  </div>
                );
              })()}

              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={filteredPayslips.length > 0 && selectedPayslipIds.size === filteredPayslips.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedPayslipIds(new Set(filteredPayslips.map(p => p.id)));
                          } else {
                            setSelectedPayslipIds(new Set());
                          }
                        }}
                        className="w-4 h-4 text-blue-600 rounded border-gray-300 cursor-pointer"
                      />
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                      onClick={() => handlePayslipSort('employee_name')}
                    >
                      Employee
                      <SortIcon column="employee_name" currentSort={payslipSortBy} currentOrder={payslipSortOrder} />
                    </th>
                    <th
                      className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                      onClick={() => handlePayslipSort('total_earnings')}
                    >
                      Gross Pay
                      <SortIcon column="total_earnings" currentSort={payslipSortBy} currentOrder={payslipSortOrder} />
                    </th>
                    <th
                      className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                      onClick={() => handlePayslipSort('total_deductions')}
                    >
                      Deductions
                      <SortIcon column="total_deductions" currentSort={payslipSortBy} currentOrder={payslipSortOrder} />
                    </th>
                    <th
                      className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                      onClick={() => handlePayslipSort('net_pay')}
                    >
                      Net Pay
                      <SortIcon column="net_pay" currentSort={payslipSortBy} currentOrder={payslipSortOrder} />
                    </th>
                    {showAdditions && (
                      <th className="px-4 py-3 text-right text-xs font-medium text-amber-600 uppercase bg-amber-50">
                        Addition
                      </th>
                    )}
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredPayslips.map((payslip) => {
                    // Color coding based on payslip status
                    const deductions = payslip.deductions || {};
                    const hasLate = deductions.late_minutes > 0;
                    const hasAbsences = deductions.absences_days > 0;

                    let rowClass = 'hover:bg-gray-50';
                    if (payslip.is_released) {
                      rowClass = 'bg-green-50/50 hover:bg-green-100/50';
                    } else if (hasAbsences) {
                      rowClass = 'bg-red-50/50 hover:bg-red-100/50';
                    } else if (hasLate) {
                      rowClass = 'bg-amber-50/50 hover:bg-amber-100/50';
                    }

                    return (
                    <tr key={payslip.id} className={`${rowClass} ${selectedPayslipIds.has(payslip.id) ? '!bg-blue-50' : ''}`}>
                      <td className="px-2 py-3">
                        <input
                          type="checkbox"
                          checked={selectedPayslipIds.has(payslip.id)}
                          onChange={(e) => {
                            const next = new Set(selectedPayslipIds);
                            if (e.target.checked) next.add(payslip.id); else next.delete(payslip.id);
                            setSelectedPayslipIds(next);
                          }}
                          className="w-4 h-4 text-blue-600 rounded border-gray-300 cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{payslip.employee_name}</div>
                        <div className="text-sm text-gray-500">
                          {payslip.employee_no}
                          {(payslip as any).is_flexible ? (
                            <span className="ml-2 bg-green-100 text-green-700 px-1.5 py-0.5 rounded text-xs font-medium">Flex</span>
                          ) : (
                            <span className="ml-2 text-xs text-gray-400">
                              {formatTime12Hour((payslip as any).call_time || '08:00')} - {formatTime12Hour((payslip as any).time_out || '17:00')}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(payslip.total_earnings)}</td>
                      <td className="px-4 py-3 text-right text-red-600">{formatCurrency(payslip.total_deductions)}</td>
                      <td className="px-4 py-3 text-right font-bold text-green-600">{formatCurrency(payslip.net_pay)}</td>
                      {showAdditions && (
                        <td className="px-4 py-3 text-right bg-amber-50">
                          {(payslip as any).additional_amount > 0 ? (
                            <span className="font-bold text-amber-600">+{formatCurrency((payslip as any).additional_amount)}</span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                      )}
                      <td className="px-4 py-3 text-center">
                        {payslip.is_released ? (
                          <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">Released</span>
                        ) : (
                          <span className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">Pending</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={async () => {
                              try {
                                const fresh = await payrollApi.getPayslip(payslip.id) as PayslipData;
                                setSelectedPayslip(fresh);
                              } catch {
                                setSelectedPayslip(payslip);
                              }
                            }}
                            className="text-primary-600 hover:text-primary-800 text-sm font-medium"
                          >
                            View/Edit
                          </button>
                          <button
                            onClick={() => handleDownloadPayslipPdf(payslip.id)}
                            disabled={downloading === payslip.id}
                            className="text-gray-600 hover:text-gray-800 text-sm"
                            title="Download PDF"
                          >
                            {downloading === payslip.id ? '...' : 'PDF'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Pagination Controls */}
              {payslipTotal > 0 && (
                <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">Show</span>
                    <select
                      value={payslipPageSize}
                      onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                      className="form-select text-sm py-1 px-2 rounded border-gray-300"
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={75}>75</option>
                      <option value={100}>100</option>
                    </select>
                    <span className="text-sm text-gray-600">per page</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-600">
                      Showing {((payslipPage - 1) * payslipPageSize) + 1} - {Math.min(payslipPage * payslipPageSize, payslipTotal)} of {payslipTotal}
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => handlePageChange(1)}
                        disabled={payslipPage === 1}
                        className="px-2 py-1 text-sm border rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        «
                      </button>
                      <button
                        onClick={() => handlePageChange(payslipPage - 1)}
                        disabled={payslipPage === 1}
                        className="px-2 py-1 text-sm border rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        ‹
                      </button>
                      <span className="px-3 py-1 text-sm">
                        Page {payslipPage} of {Math.ceil(payslipTotal / payslipPageSize)}
                      </span>
                      <button
                        onClick={() => handlePageChange(payslipPage + 1)}
                        disabled={payslipPage >= Math.ceil(payslipTotal / payslipPageSize)}
                        className="px-2 py-1 text-sm border rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        ›
                      </button>
                      <button
                        onClick={() => handlePageChange(Math.ceil(payslipTotal / payslipPageSize))}
                        disabled={payslipPage >= Math.ceil(payslipTotal / payslipPageSize)}
                        className="px-2 py-1 text-sm border rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        »
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Main Payroll Runs List
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Payroll Management</h1>
        {activeTab === 'runs' && (
          <button onClick={() => setShowCreateModal(true)} className="btn-primary">
            New Payroll Run
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-4">
          <button
            onClick={() => setActiveTab('runs')}
            className={`py-2 px-4 border-b-2 font-medium text-sm ${
              activeTab === 'runs'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Payroll Runs
          </button>
          <button
            onClick={() => setActiveTab('import')}
            className={`py-2 px-4 border-b-2 font-medium text-sm ${
              activeTab === 'import'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Import Payroll
          </button>
          <button
            onClick={() => setActiveTab('13th-month')}
            className={`py-2 px-4 border-b-2 font-medium text-sm ${
              activeTab === '13th-month'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            13th Month Pay
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`py-2 px-4 border-b-2 font-medium text-sm ${
              activeTab === 'settings'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Settings
          </button>
          <button
            onClick={() => setActiveTab('trash')}
            className={`py-2 px-4 border-b-2 font-medium text-sm ${
              activeTab === 'trash'
                ? 'border-red-500 text-red-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Trash {trashItems.length > 0 && <span className="ml-1 px-1.5 py-0.5 text-xs bg-red-100 text-red-600 rounded-full">{trashItems.length}</span>}
          </button>
        </nav>
      </div>

      {/* Import Payroll Tab */}
      {activeTab === 'import' && (
        <div className="space-y-6">
          {/* Instructions Card */}
          <div className="card bg-blue-50 border-blue-200">
            <h3 className="font-semibold text-blue-800 mb-2">Import Payroll from Excel (I CAN Format)</h3>
            <p className="text-sm text-blue-700 mb-3">
              <strong>Just upload your payslip file!</strong> The system automatically:
            </p>
            <ul className="text-sm text-blue-700 list-disc list-inside mb-3 space-y-1">
              <li>Detects period from file (e.g., "Jan 11 - Jan 25, 2026")</li>
              <li>Reads all values: Basic, Allowance, SSS, PhilHealth, Tax, etc.</li>
              <li>Creates payslips with exact values from the file</li>
              <li>Creates employees automatically if not found</li>
              <li>Updates employee rates if missing</li>
            </ul>
            <p className="text-sm text-blue-600 font-medium">
              Admin just reviews for accuracy - no manual computation needed!
            </p>
          </div>

          {/* Upload Section */}
          <div className="card">
            <h3 className="font-semibold text-gray-800 mb-4">Upload Payroll File</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="form-label">Excel File (.xls or .xlsx)</label>
                <input
                  type="file"
                  accept=".xls,.xlsx"
                  onChange={handleImportFileChange}
                  className="form-input"
                />
                {importFile && (
                  <p className="text-sm text-gray-500 mt-1">{importFile.name}</p>
                )}
              </div>
              <div className="flex items-end">
                <button
                  onClick={handlePreviewImport}
                  disabled={!importFile || previewing}
                  className="btn-secondary"
                >
                  {previewing ? 'Previewing...' : 'Preview File'}
                </button>
              </div>
            </div>

            {/* Period Selection (Optional) */}
            {/* Info */}
            <div className="mb-4 p-3 bg-blue-50 rounded text-sm text-blue-700">
              Import will update employee salary and deduction info from the Payroll List sheet.
            </div>

            {/* Import Button */}
            <div className="flex gap-2">
              <button
                onClick={handleImportPayroll}
                disabled={!importFile || importing}
                className="btn-primary"
              >
                {importing ? 'Importing...' : 'Import & Create Payslips'}
              </button>
              {(importFile || importPreview || importResult) && (
                <button onClick={resetImport} className="btn-secondary">
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Preview Results */}
          {importPreview && (
            <div className="card">
              <h3 className="font-semibold text-gray-800 mb-4">Preview Results</h3>

              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="text-center p-3 bg-gray-50 rounded">
                  <p className="text-2xl font-bold text-gray-700">{importPreview.total_records}</p>
                  <p className="text-sm text-gray-500">Total Records</p>
                </div>
                <div className="text-center p-3 bg-green-50 rounded">
                  <p className="text-2xl font-bold text-green-600">{importPreview.matched}</p>
                  <p className="text-sm text-gray-500">Matched Employees</p>
                </div>
                <div className="text-center p-3 bg-red-50 rounded">
                  <p className="text-2xl font-bold text-red-600">{importPreview.not_matched}</p>
                  <p className="text-sm text-gray-500">Not Found</p>
                </div>
              </div>

              {importPreview.records.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left">Row</th>
                        <th className="px-3 py-2 text-left">Employee No</th>
                        <th className="px-3 py-2 text-left">Name (in file)</th>
                        <th className="px-3 py-2 text-right">Basic</th>
                        <th className="px-3 py-2 text-center">Status</th>
                        <th className="px-3 py-2 text-left">Matched To</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {importPreview.records.slice(0, 20).map((record: any) => (
                        <tr key={record.row_number} className={record.matched ? '' : 'bg-red-50'}>
                          <td className="px-3 py-2">{record.row_number}</td>
                          <td className="px-3 py-2">{record.employee_no}</td>
                          <td className="px-3 py-2">{record.employee_name}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(record.basic_salary)}</td>
                          <td className="px-3 py-2 text-center">
                            {record.matched ? (
                              <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">Found</span>
                            ) : (
                              <span className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded">Not Found</span>
                            )}
                          </td>
                          <td className="px-3 py-2">{record.matched_employee_name || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {importPreview.records.length > 20 && (
                    <p className="text-sm text-gray-500 mt-2">
                      Showing first 20 of {importPreview.records.length} records
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Import Results */}
          {importResult && (
            <div className={`card ${importResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <h3 className={`font-semibold mb-4 ${importResult.success ? 'text-green-800' : 'text-red-800'}`}>
                Import {importResult.success ? 'Successful' : 'Failed'}
              </h3>

              <p className="mb-4">{importResult.message}</p>

              {importResult.success && (
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="text-center p-3 bg-white rounded">
                    <p className="text-xl font-bold text-gray-600">{importResult.total || 0}</p>
                    <p className="text-sm text-gray-500">Total in File</p>
                  </div>
                  <div className="text-center p-3 bg-white rounded">
                    <p className="text-xl font-bold text-green-600">{importResult.imported || 0}</p>
                    <p className="text-sm text-gray-500">Employees Updated</p>
                  </div>
                  <div className="text-center p-3 bg-white rounded">
                    <p className="text-xl font-bold text-red-600">{importResult.not_found?.length || 0}</p>
                    <p className="text-sm text-gray-500">Not Found</p>
                  </div>
                </div>
              )}

              {importResult.not_found && importResult.not_found.length > 0 && (
                <div className="mt-4">
                  <p className="font-medium text-gray-700 mb-2">Employees Not Found ({importResult.not_found.length}):</p>
                  <ul className="text-sm text-gray-600 list-disc list-inside">
                    {importResult.not_found.slice(0, 10).map((name: string, idx: number) => (
                      <li key={idx}>{name}</li>
                    ))}
                    {importResult.not_found.length > 10 && (
                      <li>...and {importResult.not_found.length - 10} more</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Expected Columns */}
          <div className="card">
            <h3 className="font-semibold text-gray-800 mb-2">Expected Excel Columns</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-gray-600">
              <div>
                <p className="font-medium text-gray-700">Identification</p>
                <ul className="list-disc list-inside">
                  <li>Employee No *</li>
                  <li>Employee Name</li>
                </ul>
              </div>
              <div>
                <p className="font-medium text-gray-700">Earnings</p>
                <ul className="list-disc list-inside">
                  <li>Basic Salary</li>
                  <li>Allowance</li>
                  <li>Productivity</li>
                  <li>Language</li>
                  <li>Regular Holiday</li>
                  <li>SNWH</li>
                  <li>Overtime</li>
                </ul>
              </div>
              <div>
                <p className="font-medium text-gray-700">Deductions</p>
                <ul className="list-disc list-inside">
                  <li>SSS</li>
                  <li>PhilHealth</li>
                  <li>Pag-IBIG</li>
                  <li>Tax</li>
                  <li>Loans</li>
                  <li>Absences</li>
                  <li>Late</li>
                </ul>
              </div>
              <div>
                <p className="font-medium text-gray-700">Attendance</p>
                <ul className="list-disc list-inside">
                  <li>Days Worked</li>
                  <li>Days Absent</li>
                  <li>Late Count</li>
                  <li>OT Hours</li>
                </ul>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">* Employee No is required to match employees in the system</p>
          </div>
        </div>
      )}

      {/* 13th Month Pay Tab */}
      {activeTab === '13th-month' && (
        <div className="space-y-6">
          {/* Year selector and actions */}
          <div className="card">
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <label className="form-label">Year</label>
                <select
                  value={thirteenthMonthYear}
                  onChange={(e) => setThirteenthMonthYear(parseInt(e.target.value))}
                  className="form-input"
                >
                  {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 ml-auto">
                <button
                  onClick={handleCalculate13thMonth}
                  disabled={calculating13th}
                  className="btn-primary"
                >
                  {calculating13th ? 'Calculating...' : 'Calculate 13th Month'}
                </button>
                {thirteenthMonthRecords.length > 0 && !thirteenthMonthRecords.every(r => r.is_released) && (
                  <button
                    onClick={handleRelease13thMonth}
                    className="btn-secondary"
                  >
                    Release to Employees
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Summary */}
          {thirteenthMonthRecords.length > 0 && (
            <div className="grid grid-cols-3 gap-4">
              <div className="card text-center">
                <p className="text-2xl font-bold text-blue-600">{thirteenthMonthRecords.length}</p>
                <p className="text-sm text-gray-500">Employees</p>
              </div>
              <div className="card text-center">
                <p className="text-2xl font-bold text-green-600">
                  {formatCurrency(thirteenthMonthRecords.reduce((sum, r) => sum + r.amount, 0))}
                </p>
                <p className="text-sm text-gray-500">Total 13th Month Pay</p>
              </div>
              <div className="card text-center">
                <p className="text-2xl font-bold text-purple-600">
                  {thirteenthMonthRecords.filter(r => r.is_released).length} / {thirteenthMonthRecords.length}
                </p>
                <p className="text-sm text-gray-500">Released</p>
              </div>
            </div>
          )}

          {/* Records Table */}
          <div className="card overflow-hidden">
            {loading13thMonth ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
              </div>
            ) : thirteenthMonthRecords.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p className="mb-4">No 13th month pay records for {thirteenthMonthYear}.</p>
                <button onClick={handleCalculate13thMonth} className="btn-primary">
                  Calculate Now
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Basic Earned</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Months Worked</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">13th Month Pay</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {thirteenthMonthRecords.map((record) => (
                      <tr key={record.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{record.employee_name}</div>
                          <div className="text-sm text-gray-500">{record.employee_no}</div>
                        </td>
                        <td className="px-4 py-3 text-right">{formatCurrency(record.total_basic_earned)}</td>
                        <td className="px-4 py-3 text-right">{record.months_worked}</td>
                        <td className="px-4 py-3 text-right font-bold text-green-600">{formatCurrency(record.amount)}</td>
                        <td className="px-4 py-3 text-center">
                          {record.is_released ? (
                            <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">Released</span>
                          ) : (
                            <span className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">Pending</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => handleDownload13thMonthPdf(record.id)}
                            disabled={downloading === record.id}
                            className="text-primary-600 hover:text-primary-800 text-sm font-medium"
                          >
                            {downloading === record.id ? 'Downloading...' : 'Download PDF'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Info Box */}
          <div className="card bg-blue-50 border-blue-200">
            <h3 className="font-semibold text-blue-800 mb-2">About 13th Month Pay</h3>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• 13th Month Pay = Total Basic Salary Earned in Year ÷ 12</li>
              <li>• Required for all employees who worked at least 1 month</li>
              <li>• Must be paid on or before December 24 each year</li>
              <li>• First ₱90,000 is tax-exempt (Philippine law)</li>
            </ul>
          </div>
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Payroll Settings</h2>
          {loadingSettings ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Default Basic Salary */}
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-medium text-blue-900">Default Basic Salary</h3>
                  <button
                    onClick={() => setShowApplyToAllModal(true)}
                    className="px-3 py-1.5 bg-orange-500 text-white text-sm font-medium rounded hover:bg-orange-600 transition-colors"
                  >
                    Apply to All Employees
                  </button>
                </div>
                <div className="grid md:grid-cols-3 gap-4 items-end">
                  <div>
                    <label className="form-label">Monthly Basic Salary (PHP)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editSettings.default_basic_salary || 0}
                      onChange={(e) => setEditSettings({ ...editSettings, default_basic_salary: parseFloat(e.target.value) || 0 })}
                      className="form-input text-lg font-semibold"
                      placeholder="e.g., 20000"
                    />
                  </div>
                  <div className="bg-white p-3 rounded border">
                    <p className="text-xs text-gray-500">Daily Rate (ICAN Formula)</p>
                    <p className="text-lg font-bold text-green-600">
                      ₱{((editSettings.default_basic_salary || 0) * 12 / 261).toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-400">= Basic × 12 ÷ 261</p>
                  </div>
                  <div className="bg-white p-3 rounded border">
                    <p className="text-xs text-gray-500">Minute Rate</p>
                    <p className="text-lg font-bold text-orange-600">
                      ₱{((editSettings.default_basic_salary || 0) * 12 / 261 / (editSettings.work_hours_per_day || 8) / 60).toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-400">= Daily ÷ {editSettings.work_hours_per_day || 8}hrs ÷ 60</p>
                  </div>
                </div>
                <p className="text-xs text-blue-700 mt-2">This is used as the default for new employees. Each employee can have their own basic salary set in their profile.</p>
              </div>

              {/* Attendance-Based Deductions */}
              <div>
                <h3 className="font-medium text-gray-900 mb-3 border-b pb-2">Attendance-Based Deductions</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="form-label">Absent Rate per Day (PHP)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editSettings.absent_rate_per_day || 0}
                      onChange={(e) => setEditSettings({ ...editSettings, absent_rate_per_day: parseFloat(e.target.value) || 0 })}
                      className="form-input"
                      placeholder="e.g., 200"
                    />
                    <p className="text-xs text-gray-500 mt-1">Amount deducted per day of absence</p>
                  </div>
                  <div>
                    <label className="form-label">Late Rate per Minute (PHP)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editSettings.late_rate_per_minute || 0}
                      onChange={(e) => setEditSettings({ ...editSettings, late_rate_per_minute: parseFloat(e.target.value) || 0 })}
                      className="form-input"
                      placeholder="e.g., 5"
                    />
                    <p className="text-xs text-gray-500 mt-1">Amount deducted per minute late</p>
                  </div>
                  <div>
                    <label className="form-label">Late Rate per Incident (PHP)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editSettings.late_rate_per_incident || 0}
                      onChange={(e) => setEditSettings({ ...editSettings, late_rate_per_incident: parseFloat(e.target.value) || 0 })}
                      className="form-input"
                      placeholder="e.g., 50"
                    />
                    <p className="text-xs text-gray-500 mt-1">Flat deduction per late occurrence</p>
                  </div>
                  <div>
                    <label className="form-label">Undertime Rate per Minute (PHP)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editSettings.undertime_rate_per_minute || 0}
                      onChange={(e) => setEditSettings({ ...editSettings, undertime_rate_per_minute: parseFloat(e.target.value) || 0 })}
                      className="form-input"
                    />
                    <p className="text-xs text-gray-500 mt-1">Amount deducted per minute of undertime</p>
                  </div>
                </div>
              </div>

              {/* Default Government Contributions */}
              <div>
                <h3 className="font-medium text-gray-900 mb-3 border-b pb-2">Default Government Contributions</h3>
                <p className="text-sm text-gray-600 mb-3">
                  These are default values. Employee-specific values (set in employee profile) will override these.
                </p>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="form-label">Default SSS (PHP/month)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editSettings.default_sss || 0}
                      onChange={(e) => setEditSettings({ ...editSettings, default_sss: parseFloat(e.target.value) || 0 })}
                      className="form-input"
                    />
                    <p className="text-xs text-gray-500 mt-1">Leave 0 to auto-calculate based on salary</p>
                  </div>
                  <div>
                    <label className="form-label">Default PhilHealth (PHP/month)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editSettings.default_philhealth || 0}
                      onChange={(e) => setEditSettings({ ...editSettings, default_philhealth: parseFloat(e.target.value) || 0 })}
                      className="form-input"
                    />
                    <p className="text-xs text-gray-500 mt-1">Leave 0 to auto-calculate (5% of basic)</p>
                  </div>
                  <div>
                    <label className="form-label">Default Pag-IBIG (PHP/month)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editSettings.default_pagibig || 0}
                      onChange={(e) => setEditSettings({ ...editSettings, default_pagibig: parseFloat(e.target.value) || 0 })}
                      className="form-input"
                    />
                    <p className="text-xs text-gray-500 mt-1">Leave 0 to auto-calculate (2%, max 200)</p>
                  </div>
                  <div>
                    <label className="form-label">Default Tax (PHP/month)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editSettings.default_tax || 0}
                      onChange={(e) => setEditSettings({ ...editSettings, default_tax: parseFloat(e.target.value) || 0 })}
                      className="form-input"
                    />
                    <p className="text-xs text-gray-500 mt-1">Leave 0 to auto-calculate based on TRAIN Law</p>
                  </div>
                </div>
              </div>

              {/* Work Configuration */}
              <div>
                <h3 className="font-medium text-gray-900 mb-3 border-b pb-2">Work Configuration</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="form-label">Work Hours per Day</label>
                    <input
                      type="number"
                      step="0.5"
                      value={editSettings.work_hours_per_day || 8}
                      onChange={(e) => setEditSettings({ ...editSettings, work_hours_per_day: parseFloat(e.target.value) || 8 })}
                      className="form-input"
                    />
                  </div>
                  <div>
                    <label className="form-label">Work Days per Month</label>
                    <input
                      type="number"
                      value={editSettings.work_days_per_month || 22}
                      onChange={(e) => setEditSettings({ ...editSettings, work_days_per_month: parseInt(e.target.value) || 22 })}
                      className="form-input"
                    />
                  </div>
                </div>
              </div>

              {/* Overtime Rates */}
              <div>
                <h3 className="font-medium text-gray-900 mb-3 border-b pb-2">Overtime Rate Multipliers</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="form-label">Regular Overtime</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editSettings.overtime_rate || 1.30}
                      onChange={(e) => setEditSettings({ ...editSettings, overtime_rate: parseFloat(e.target.value) || 1.30 })}
                      className="form-input"
                    />
                    <p className="text-xs text-gray-500 mt-1">e.g., 1.30 = 130% of hourly rate</p>
                  </div>
                  <div>
                    <label className="form-label">Night Differential</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editSettings.night_diff_rate || 1.10}
                      onChange={(e) => setEditSettings({ ...editSettings, night_diff_rate: parseFloat(e.target.value) || 1.10 })}
                      className="form-input"
                    />
                  </div>
                  <div>
                    <label className="form-label">Regular Holiday</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editSettings.holiday_rate || 2.00}
                      onChange={(e) => setEditSettings({ ...editSettings, holiday_rate: parseFloat(e.target.value) || 2.00 })}
                      className="form-input"
                    />
                  </div>
                  <div>
                    <label className="form-label">Special Non-Working Holiday</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editSettings.special_holiday_rate || 1.30}
                      onChange={(e) => setEditSettings({ ...editSettings, special_holiday_rate: parseFloat(e.target.value) || 1.30 })}
                      className="form-input"
                    />
                  </div>
                </div>
              </div>

              {/* Save Button */}
              <div className="flex justify-end pt-4 border-t">
                <button
                  onClick={handleSaveSettings}
                  disabled={savingSettings}
                  className="btn-primary"
                >
                  {savingSettings ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Trash Tab */}
      {activeTab === 'trash' && (
        <div className="space-y-4">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">Deleted Payroll Runs</h3>
              <button onClick={loadTrash} className="btn-secondary" disabled={loadingTrash}>
                {loadingTrash ? 'Loading...' : 'Refresh'}
              </button>
            </div>

            {loadingTrash ? (
              <div className="text-center py-8 text-gray-500">Loading trash...</div>
            ) : trashItems.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p className="text-lg mb-2">Trash is empty</p>
                <p className="text-sm">Deleted payroll runs will appear here</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Period</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employees</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Deleted</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Deleted By</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {trashItems.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">
                            {dayjs(item.period_start).format('MMM D')} - {dayjs(item.period_end).format('MMM D, YYYY')}
                          </div>
                          <div className="text-sm text-gray-500">
                            {item.cutoff === 1 ? '1st Cutoff' : '2nd Cutoff'}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-600 uppercase">
                            {item.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{item.employee_count}</td>
                        <td className="px-4 py-3 text-gray-600 text-sm">
                          {dayjs(item.deleted_at).format('MMM D, YYYY h:mm A')}
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-sm">
                          {item.deleted_by?.email || 'Unknown'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => setSelectedTrashItem(item)}
                              className="text-blue-600 hover:text-blue-800 text-sm"
                            >
                              View Reason
                            </button>
                            <button
                              onClick={() => handleRestoreRun(item.id)}
                              disabled={restoringId === item.id}
                              className="text-green-600 hover:text-green-800 text-sm"
                            >
                              {restoringId === item.id ? 'Restoring...' : 'Restore'}
                            </button>
                            <button
                              onClick={() => handlePermanentDelete(item.id)}
                              disabled={permanentlyDeletingId === item.id}
                              className="text-red-600 hover:text-red-800 text-sm"
                            >
                              {permanentlyDeletingId === item.id ? 'Deleting...' : 'Delete Forever'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* View Reason Modal */}
          {selectedTrashItem && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
                <h2 className="text-lg font-semibold mb-4">Deletion Reason</h2>
                <div className="mb-4">
                  <p className="text-gray-600 text-sm mb-2">
                    <strong>Period:</strong> {dayjs(selectedTrashItem.period_start).format('MMM D')} - {dayjs(selectedTrashItem.period_end).format('MMM D, YYYY')}
                  </p>
                  <p className="text-gray-600 text-sm mb-2">
                    <strong>Deleted:</strong> {dayjs(selectedTrashItem.deleted_at).format('MMM D, YYYY h:mm A')}
                  </p>
                  <p className="text-gray-600 text-sm mb-4">
                    <strong>Deleted By:</strong> {selectedTrashItem.deleted_by?.email || 'Unknown'}
                  </p>
                </div>
                <div className="bg-gray-50 border rounded-md p-4 mb-4">
                  <h3 className="font-medium text-gray-800 mb-2">Reason:</h3>
                  <p className="text-gray-700 whitespace-pre-wrap text-sm leading-relaxed">
                    {selectedTrashItem.deletion_reason || 'No reason provided'}
                  </p>
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setSelectedTrashItem(null)}
                    className="btn-secondary"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => { handleRestoreRun(selectedTrashItem.id); setSelectedTrashItem(null); }}
                    className="btn-primary"
                  >
                    Restore This Run
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Payroll Runs Tab */}
      {activeTab === 'runs' && (
        <>
          {/* Search and Filter */}
          <div className="card">
            <div className="flex flex-wrap gap-4">
              <input
                type="text"
                placeholder="Search by period..."
                value={runSearch}
                onChange={(e) => setRunSearch(e.target.value)}
                className="form-input w-full md:w-64"
              />
              <select
                value={runStatusFilter}
                onChange={(e) => setRunStatusFilter(e.target.value)}
                className="form-input w-full md:w-48"
              >
                <option value="">All Statuses</option>
                <option value="draft">Draft</option>
                <option value="processing">Processing</option>
                <option value="review">Review</option>
                <option value="approved">Approved</option>
                <option value="locked">Locked</option>
              </select>
            </div>
          </div>

          {/* Payroll Runs Table */}
          <div className="card overflow-hidden">
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
              </div>
            ) : filteredRuns.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                {payrollRuns.length === 0
                  ? 'No payroll runs found. Create your first payroll run to get started.'
                  : 'No payroll runs match your filters.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                        onClick={() => handleRunSort('period_start')}
                      >
                        Period
                        <SortIcon column="period_start" currentSort={runSortBy} currentOrder={runSortOrder} />
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cutoff</th>
                      <th
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                        onClick={() => handleRunSort('status')}
                      >
                        Status
                        <SortIcon column="status" currentSort={runSortBy} currentOrder={runSortOrder} />
                      </th>
                      <th
                        className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                        onClick={() => handleRunSort('employee_count')}
                      >
                        Employees
                        <SortIcon column="employee_count" currentSort={runSortBy} currentOrder={runSortOrder} />
                      </th>
                      <th
                        className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                        onClick={() => handleRunSort('total_net')}
                      >
                        Total Net
                        <SortIcon column="total_net" currentSort={runSortBy} currentOrder={runSortOrder} />
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Processed</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredRuns.map((run) => (
                  <tr key={run.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-medium">{dayjs(run.period_start).format('MMM D')} - {dayjs(run.period_end).format('MMM D, YYYY')}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded ${run.cutoff === 1 ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}>
                        {run.cutoff === 1 ? '1st' : '2nd'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(run.status)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">{run.employee_count || 0}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right font-medium text-green-600">
                      {formatCurrency(run.total_net || 0)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                      {run.run_at ? dayjs(run.run_at).format('MMM D, YYYY h:mm A') : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex gap-2">
                        {run.status === 'draft' && (
                          <button
                            onClick={() => handleProcess(run.id)}
                            disabled={processing === run.id}
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                          >
                            {processing === run.id ? 'Processing...' : 'Process'}
                          </button>
                        )}
                        {run.status === 'review' && (
                          <button
                            onClick={async () => {
                              if (!confirm('Recalculate payroll totals from the current payslip rows?\n\nThis will not reset or overwrite individual payslips.')) return;
                              setRecalculating(run.id);
                              try {
                                const result = await payrollApi.recalculateRun(run.id);
                                alert(`Recalculated totals from ${result.updated_count} payslips.`);
                                loadPayrollRuns();
                              } catch (error: any) {
                                alert(error.response?.data?.detail || 'Failed to recalculate');
                              } finally {
                                setRecalculating(null);
                              }
                            }}
                            disabled={recalculating === run.id}
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                          >
                            {recalculating === run.id ? 'Processing...' : 'Recalculate Totals'}
                          </button>
                        )}
                        <button
                          onClick={() => handleViewRun(run)}
                          className="text-primary-600 hover:text-primary-800 text-sm font-medium"
                        >
                          View
                        </button>
                        <button
                          onClick={() => handleEditRun(run)}
                          className="text-yellow-600 hover:text-yellow-800 text-sm font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteRun(run)}
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
        )}
      </div>
      </>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">Create Payroll Run</h2>
            <form onSubmit={handleCreateRun} className="space-y-4">
              <div>
                <label className="form-label">Cutoff Period *</label>
                <select
                  value={newPeriod.cutoff}
                  onChange={(e) => setNewPeriod({ ...newPeriod, cutoff: parseInt(e.target.value) })}
                  className="form-input"
                >
                  <option value={1}>1st Cutoff (1-15) - Loans, Tax only</option>
                  <option value={2}>2nd Cutoff (16-end) - SSS, PhilHealth, Pag-IBIG, Tax</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  {newPeriod.cutoff === 1
                    ? 'Deductions: Loans, Withholding Tax'
                    : 'Deductions: SSS, PhilHealth, Pag-IBIG, Withholding Tax'}
                </p>
              </div>
              <div>
                <label className="form-label">Period Start *</label>
                <input
                  type="date"
                  value={newPeriod.start}
                  onChange={(e) => setNewPeriod({ ...newPeriod, start: e.target.value })}
                  className="form-input"
                  required
                />
              </div>
              <div>
                <label className="form-label">Period End *</label>
                <input
                  type="date"
                  value={newPeriod.end}
                  onChange={(e) => setNewPeriod({ ...newPeriod, end: e.target.value })}
                  className="form-input"
                  required
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" disabled={creating} className="btn-primary">
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">Edit Payroll Run</h2>
            {editingRunStatus !== 'draft' && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 mb-4">
                <p className="text-yellow-800 text-sm">
                  <strong>Warning:</strong> This payroll run is <span className="uppercase font-semibold">{editingRunStatus}</span>.
                  Editing it requires a reason and will be logged for audit purposes.
                </p>
              </div>
            )}
            <form onSubmit={handleUpdateRun} className="space-y-4">
              <div>
                <label className="form-label">Cutoff Period *</label>
                <select
                  value={newPeriod.cutoff}
                  onChange={(e) => setNewPeriod({ ...newPeriod, cutoff: parseInt(e.target.value) })}
                  className="form-input"
                >
                  <option value={1}>1st Cutoff (1-15) - Loans, Tax only</option>
                  <option value={2}>2nd Cutoff (16-end) - SSS, PhilHealth, Pag-IBIG, Tax</option>
                </select>
              </div>
              <div>
                <label className="form-label">Period Start *</label>
                <input
                  type="date"
                  value={newPeriod.start}
                  onChange={(e) => setNewPeriod({ ...newPeriod, start: e.target.value })}
                  className="form-input"
                  required
                />
              </div>
              <div>
                <label className="form-label">Period End *</label>
                <input
                  type="date"
                  value={newPeriod.end}
                  onChange={(e) => setNewPeriod({ ...newPeriod, end: e.target.value })}
                  className="form-input"
                  required
                />
              </div>
              {editingRunStatus !== 'draft' && (
                <div>
                  <label className="form-label">Reason for Edit *</label>
                  <textarea
                    value={confirmReason}
                    onChange={(e) => setConfirmReason(e.target.value)}
                    className="form-input"
                    rows={2}
                    placeholder="Explain why you need to edit this payroll run..."
                    required
                  />
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => { setShowEditModal(false); setEditingRunId(null); setEditingRunStatus('draft'); setConfirmReason(''); }}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" disabled={creating} className="btn-primary">
                  {creating ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal (for non-DRAFT runs) */}
      {showConfirmModal && showConfirmModal.type === 'delete' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4 text-red-600">Delete Payroll Run</h2>
            <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-4">
              <p className="text-red-800 text-sm">
                <strong>Warning:</strong> This payroll run is <span className="uppercase font-semibold">{showConfirmModal.run.status}</span>
                {showConfirmModal.run.employee_count && showConfirmModal.run.employee_count > 0 &&
                  ` with ${showConfirmModal.run.employee_count} payslips`
                }. This will move the payroll run to trash.
              </p>
            </div>
            <div className="mb-4">
              <p className="text-gray-700">
                Period: <strong>{dayjs(showConfirmModal.run.period_start).format('MMM D')} - {dayjs(showConfirmModal.run.period_end).format('MMM D, YYYY')}</strong>
              </p>
            </div>

            <div className="mb-4">
              <label className="form-label">Reason for Deletion *</label>
              <textarea
                value={confirmReason}
                onChange={(e) => setConfirmReason(e.target.value)}
                className="form-input"
                rows={3}
                placeholder="Enter reason for deletion..."
              />
            </div>

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => { setShowConfirmModal(null); setConfirmReason(''); }}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={!confirmReason.trim()}
                className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Move to Trash
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Edit Modal (for non-DRAFT runs) */}
      {showConfirmModal && showConfirmModal.type === 'edit' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4 text-yellow-600">Edit Payroll Run</h2>
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 mb-4">
              <p className="text-yellow-800 text-sm">
                <strong>Warning:</strong> This payroll run is <span className="uppercase font-semibold">{showConfirmModal.run.status}</span>.
                Are you sure you want to edit it? This action will be logged.
              </p>
            </div>
            <div className="mb-4">
              <p className="text-gray-700">
                Period: <strong>{dayjs(showConfirmModal.run.period_start).format('MMM D')} - {dayjs(showConfirmModal.run.period_end).format('MMM D, YYYY')}</strong>
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => { setShowConfirmModal(null); }}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmEdit}
                className="bg-yellow-600 text-white px-4 py-2 rounded-md hover:bg-yellow-700"
              >
                Continue to Edit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Apply to All Employees Modal */}
      {showApplyToAllModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 overflow-hidden">
            <div className="bg-red-600 px-6 py-4">
              <h3 className="text-lg font-bold text-white">⚠️ Apply Settings to ALL Employees</h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-yellow-800 font-medium">Warning!</p>
                <p className="text-yellow-700 text-sm mt-1">
                  This will overwrite the individual settings for ALL active employees.
                  Any custom values they have will be replaced with these default values.
                </p>
              </div>

              <div className="space-y-3">
                <p className="font-medium text-gray-900">Select what to apply:</p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyToAllOptions.apply_basic_salary}
                    onChange={(e) => setApplyToAllOptions({ ...applyToAllOptions, apply_basic_salary: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span>Basic Salary: <strong>₱{(editSettings.default_basic_salary || 0).toLocaleString()}</strong></span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyToAllOptions.apply_sss}
                    onChange={(e) => setApplyToAllOptions({ ...applyToAllOptions, apply_sss: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span>SSS: <strong>₱{(editSettings.default_sss || 0).toLocaleString()}</strong></span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyToAllOptions.apply_philhealth}
                    onChange={(e) => setApplyToAllOptions({ ...applyToAllOptions, apply_philhealth: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span>PhilHealth: <strong>₱{(editSettings.default_philhealth || 0).toLocaleString()}</strong></span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyToAllOptions.apply_pagibig}
                    onChange={(e) => setApplyToAllOptions({ ...applyToAllOptions, apply_pagibig: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span>Pag-IBIG: <strong>₱{(editSettings.default_pagibig || 0).toLocaleString()}</strong></span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyToAllOptions.apply_tax}
                    onChange={(e) => setApplyToAllOptions({ ...applyToAllOptions, apply_tax: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span>Tax: <strong>₱{(editSettings.default_tax || 0).toLocaleString()}</strong></span>
                </label>
              </div>

              <div className="border-t pt-4">
                <p className="text-sm text-gray-700 mb-2">
                  To confirm, type <strong className="text-red-600">WeCanInICAN!</strong> below:
                </p>
                <input
                  type="text"
                  value={applyToAllConfirmation}
                  onChange={(e) => setApplyToAllConfirmation(e.target.value)}
                  placeholder="Type confirmation code here..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                />
                {applyToAllConfirmation && applyToAllConfirmation !== 'WeCanInICAN!' && (
                  <p className="text-red-500 text-xs mt-1">Confirmation code doesn't match</p>
                )}
                {applyToAllConfirmation === 'WeCanInICAN!' && (
                  <p className="text-green-600 text-xs mt-1">✓ Confirmation code correct</p>
                )}
              </div>
            </div>
            <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowApplyToAllModal(false);
                  setApplyToAllConfirmation('');
                }}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                disabled={applyingToAll}
              >
                Cancel
              </button>
              <button
                onClick={handleApplyToAll}
                disabled={applyToAllConfirmation !== 'WeCanInICAN!' || applyingToAll || (!applyToAllOptions.apply_basic_salary && !applyToAllOptions.apply_sss && !applyToAllOptions.apply_philhealth && !applyToAllOptions.apply_pagibig && !applyToAllOptions.apply_tax)}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {applyingToAll ? 'Applying...' : 'Apply to All Employees'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
