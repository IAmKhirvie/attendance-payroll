import { useState, useEffect } from 'react';
import { payrollApi, payrollRunsApi } from '../../api/client';
import type { PayrollRun } from '../../types';
import dayjs from 'dayjs';

interface PayrollSettings {
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
}

interface PayslipData {
  id: number;
  payroll_run_id: number;
  employee_id: number;
  employee_name: string;
  employee_no: string;
  period_start: string;
  period_end: string;
  earnings: {
    basic_semi: number;
    allowance_semi: number;
    productivity_incentive_semi: number;
    language_incentive_semi: number;
    regular_holiday: number;
    regular_holiday_ot: number;
    snwh: number;
    snwh_ot: number;
    overtime: number;
    absent_deduction: number;
    late_deduction: number;
    [key: string]: number;
  };
  deductions: {
    sss: number;
    philhealth: number;
    pagibig: number;
    tax: number;
    loans: number;
    [key: string]: number;
  };
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
  const [importPeriodStart, setImportPeriodStart] = useState('');
  const [importPeriodEnd, setImportPeriodEnd] = useState('');
  const [importCutoff, setImportCutoff] = useState(1);
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
    payslips_created: number;
    not_found: Array<any>;
    totals: { gross: number; deductions: number; net: number };
  } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);

  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState<{ type: 'edit' | 'delete'; run: PayrollRun } | null>(null);
  const [confirmReason, setConfirmReason] = useState('');
  const [reasonValidation, setReasonValidation] = useState<{
    is_valid: boolean;
    valid_words: number;
    invalid_words: number;
    invalid_word_list: string[];
  } | null>(null);
  const [validatingReason, setValidatingReason] = useState(false);
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

  // Edit mode
  const [editMode, setEditMode] = useState(false);
  const [editEarnings, setEditEarnings] = useState<Record<string, number>>({});
  const [editDeductions, setEditDeductions] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  // Payroll Settings
  const [settings, setSettings] = useState<PayrollSettings | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [editSettings, setEditSettings] = useState<Partial<PayrollSettings>>({});

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

  const validateReasonText = async (text: string) => {
    if (!text || text.length < 100) {
      setReasonValidation(null);
      return;
    }
    setValidatingReason(true);
    try {
      const result = await payrollRunsApi.validateReason(text);
      setReasonValidation({
        is_valid: result.is_valid,
        valid_words: result.stats.valid_words,
        invalid_words: result.stats.invalid_words,
        invalid_word_list: result.stats.invalid_word_list || [],
      });
    } catch (error) {
      console.error('Failed to validate reason:', error);
    } finally {
      setValidatingReason(false);
    }
  };

  // Debounce reason validation
  useEffect(() => {
    if (showConfirmModal?.type === 'delete' && confirmReason) {
      const timer = setTimeout(() => {
        validateReasonText(confirmReason);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [confirmReason, showConfirmModal]);

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

  const handleDownloadAllPayslipsPng = async (runId: number) => {
    try {
      const { pages } = await payrollApi.getPayslipsPageCount(runId);
      if (pages === 0) {
        alert('No payslips to download');
        return;
      }

      // Download all pages
      for (let page = 1; page <= pages; page++) {
        await payrollApi.downloadPayslipsSheet(runId, page);
        // Small delay between downloads
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      alert(`Downloaded ${pages} sheet(s) with 6 payslips each`);
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to download payslips');
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

    const periodMsg = importPeriodStart && importPeriodEnd
      ? `Period: ${importPeriodStart} to ${importPeriodEnd}`
      : 'Period will be auto-detected from file';

    if (!confirm(`This will create payslips for all matched employees.\n${periodMsg}\n\nContinue?`)) {
      return;
    }

    setImporting(true);
    try {
      const result = await payrollApi.importPayroll(
        importFile,
        importPeriodStart || undefined,
        importPeriodEnd || undefined,
        importCutoff || undefined,
        true // auto-create employees
      );
      setImportResult(result);
      setImportPreview(null);

      if (result.success) {
        alert(`${result.message}\n\nTotal Net Pay: ${formatCurrency(result.totals.net)}`);
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
    setImportPeriodStart('');
    setImportPeriodEnd('');
    setImportCutoff(1);
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

  const loadPayslips = async (runId: number) => {
    setLoadingPayslips(true);
    try {
      const response = await payrollApi.listPayslips({ payroll_run_id: runId });
      setPayslips(response.items as unknown as PayslipData[]);
    } catch (error) {
      console.error('Failed to load payslips:', error);
    } finally {
      setLoadingPayslips(false);
    }
  };

  const handleViewRun = async (run: PayrollRun) => {
    setSelectedRun(run);
    await loadPayslips(run.id);
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

  const handleProcess = async (runId: number) => {
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
    // All deletions now require 100-word reason and go through the confirmation modal
    setShowConfirmModal({ type: 'delete', run });
    setConfirmReason('');
    setReasonValidation(null);
  };

  const handleConfirmDelete = async () => {
    if (!showConfirmModal || showConfirmModal.type !== 'delete') return;
    if (!reasonValidation?.is_valid) {
      alert('Please provide a valid deletion reason (minimum 100 English words).');
      return;
    }
    await executeDeleteRun(showConfirmModal.run.id, true, confirmReason);
    setShowConfirmModal(null);
    setConfirmReason('');
    setReasonValidation(null);
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
    setEditEarnings({ ...selectedPayslip.earnings });
    setEditDeductions({ ...selectedPayslip.deductions });
    setEditMode(true);
  };

  const handleSavePayslip = async () => {
    if (!selectedPayslip) return;
    setSaving(true);
    try {
      // Update earnings
      const earningsResult = await payrollApi.updatePayslipEarnings(selectedPayslip.id, editEarnings);

      // Update deductions
      const deductionsResult = await payrollApi.updatePayslipDeductions(selectedPayslip.id, editDeductions);

      // Update local state
      setSelectedPayslip({
        ...selectedPayslip,
        earnings: editEarnings as any,
        deductions: editDeductions as any,
        total_earnings: earningsResult.total_earnings,
        total_deductions: deductionsResult.total_deductions,
        net_pay: deductionsResult.net_pay,
      });

      // Reload payslips list
      if (selectedRun) {
        loadPayslips(selectedRun.id);
      }

      setEditMode(false);
      alert('Payslip updated successfully!');
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

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => { setSelectedPayslip(null); setEditMode(false); }}
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
            {selectedRun?.status === 'review' && !editMode && (
              <button onClick={handleEditPayslip} className="btn-secondary">
                Edit Payslip
              </button>
            )}
          </div>
        </div>

        <div className="card">
          {/* Header */}
          <div className="border-b pb-4 mb-4">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-xl font-bold">{selectedPayslip.employee_name}</h2>
                <p className="text-gray-500">{selectedPayslip.employee_no}</p>
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
          <div className="grid grid-cols-5 gap-4 mb-6">
            <div className="text-center p-3 bg-gray-50 rounded">
              <p className="text-2xl font-bold text-blue-600">{selectedPayslip.days_worked}</p>
              <p className="text-xs text-gray-500">Days Worked</p>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded">
              <p className="text-2xl font-bold text-red-600">{selectedPayslip.days_absent}</p>
              <p className="text-xs text-gray-500">Days Absent</p>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded">
              <p className="text-2xl font-bold text-orange-600">{selectedPayslip.late_count}</p>
              <p className="text-xs text-gray-500">Late Count</p>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded">
              <p className="text-2xl font-bold text-orange-600">{selectedPayslip.total_late_minutes}</p>
              <p className="text-xs text-gray-500">Late Mins</p>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded">
              <p className="text-2xl font-bold text-green-600">{selectedPayslip.overtime_hours}</p>
              <p className="text-xs text-gray-500">OT Hours</p>
            </div>
          </div>

          {/* Earnings & Deductions */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Earnings */}
            <div>
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <span className="w-3 h-3 bg-green-500 rounded-full"></span>
                Earnings
              </h3>
              <div className="space-y-2">
                {editMode ? (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Basic (Semi)</span>
                      <input
                        type="number"
                        step="0.01"
                        value={editEarnings.basic_semi || 0}
                        onChange={(e) => setEditEarnings({ ...editEarnings, basic_semi: parseFloat(e.target.value) || 0 })}
                        className="w-32 form-input text-right"
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Allowance (Semi)</span>
                      <input
                        type="number"
                        step="0.01"
                        value={editEarnings.allowance_semi || 0}
                        onChange={(e) => setEditEarnings({ ...editEarnings, allowance_semi: parseFloat(e.target.value) || 0 })}
                        className="w-32 form-input text-right"
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Productivity (Semi)</span>
                      <input
                        type="number"
                        step="0.01"
                        value={editEarnings.productivity_incentive_semi || 0}
                        onChange={(e) => setEditEarnings({ ...editEarnings, productivity_incentive_semi: parseFloat(e.target.value) || 0 })}
                        className="w-32 form-input text-right"
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Language (Semi)</span>
                      <input
                        type="number"
                        step="0.01"
                        value={editEarnings.language_incentive_semi || 0}
                        onChange={(e) => setEditEarnings({ ...editEarnings, language_incentive_semi: parseFloat(e.target.value) || 0 })}
                        className="w-32 form-input text-right"
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Regular Holiday</span>
                      <input
                        type="number"
                        step="0.01"
                        value={editEarnings.regular_holiday || 0}
                        onChange={(e) => setEditEarnings({ ...editEarnings, regular_holiday: parseFloat(e.target.value) || 0 })}
                        className="w-32 form-input text-right"
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Regular Holiday OT</span>
                      <input
                        type="number"
                        step="0.01"
                        value={editEarnings.regular_holiday_ot || 0}
                        onChange={(e) => setEditEarnings({ ...editEarnings, regular_holiday_ot: parseFloat(e.target.value) || 0 })}
                        className="w-32 form-input text-right"
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">SNWH</span>
                      <input
                        type="number"
                        step="0.01"
                        value={editEarnings.snwh || 0}
                        onChange={(e) => setEditEarnings({ ...editEarnings, snwh: parseFloat(e.target.value) || 0 })}
                        className="w-32 form-input text-right"
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">SNWH OT</span>
                      <input
                        type="number"
                        step="0.01"
                        value={editEarnings.snwh_ot || 0}
                        onChange={(e) => setEditEarnings({ ...editEarnings, snwh_ot: parseFloat(e.target.value) || 0 })}
                        className="w-32 form-input text-right"
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Overtime</span>
                      <input
                        type="number"
                        step="0.01"
                        value={editEarnings.overtime || 0}
                        onChange={(e) => setEditEarnings({ ...editEarnings, overtime: parseFloat(e.target.value) || 0 })}
                        className="w-32 form-input text-right"
                      />
                    </div>
                    <div className="flex justify-between items-center text-red-600">
                      <span>Absent Deduction</span>
                      <input
                        type="number"
                        step="0.01"
                        value={editEarnings.absent_deduction || 0}
                        onChange={(e) => setEditEarnings({ ...editEarnings, absent_deduction: parseFloat(e.target.value) || 0 })}
                        className="w-32 form-input text-right"
                      />
                    </div>
                    <div className="flex justify-between items-center text-red-600">
                      <span>Late Deduction</span>
                      <input
                        type="number"
                        step="0.01"
                        value={editEarnings.late_deduction || 0}
                        onChange={(e) => setEditEarnings({ ...editEarnings, late_deduction: parseFloat(e.target.value) || 0 })}
                        className="w-32 form-input text-right"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Basic (Semi)</span>
                      <span className="font-medium">{formatCurrency(selectedPayslip.earnings.basic_semi || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Allowance (Semi)</span>
                      <span className="font-medium">{formatCurrency(selectedPayslip.earnings.allowance_semi || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Productivity (Semi)</span>
                      <span className="font-medium">{formatCurrency(selectedPayslip.earnings.productivity_incentive_semi || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Language (Semi)</span>
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
                    {(selectedPayslip.earnings.absent_deduction || 0) > 0 && (
                      <div className="flex justify-between text-red-600">
                        <span>Absent Deduction</span>
                        <span className="font-medium">-{formatCurrency(selectedPayslip.earnings.absent_deduction)}</span>
                      </div>
                    )}
                    {(selectedPayslip.earnings.late_deduction || 0) > 0 && (
                      <div className="flex justify-between text-red-600">
                        <span>Late Deduction</span>
                        <span className="font-medium">-{formatCurrency(selectedPayslip.earnings.late_deduction)}</span>
                      </div>
                    )}
                  </>
                )}
                <div className="border-t pt-2 flex justify-between font-semibold">
                  <span>Total Earnings</span>
                  <span>{formatCurrency(selectedPayslip.total_earnings)}</span>
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
                            value={editDeductions.sss || 0}
                            onChange={(e) => setEditDeductions({ ...editDeductions, sss: parseFloat(e.target.value) || 0 })}
                            className="w-32 form-input text-right"
                          />
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600">PhilHealth</span>
                          <input
                            type="number"
                            step="0.01"
                            value={editDeductions.philhealth || 0}
                            onChange={(e) => setEditDeductions({ ...editDeductions, philhealth: parseFloat(e.target.value) || 0 })}
                            className="w-32 form-input text-right"
                          />
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600">Pag-IBIG</span>
                          <input
                            type="number"
                            step="0.01"
                            value={editDeductions.pagibig || 0}
                            onChange={(e) => setEditDeductions({ ...editDeductions, pagibig: parseFloat(e.target.value) || 0 })}
                            className="w-32 form-input text-right"
                          />
                        </div>
                      </>
                    )}
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Withholding Tax</span>
                      <input
                        type="number"
                        step="0.01"
                        value={editDeductions.tax || 0}
                        onChange={(e) => setEditDeductions({ ...editDeductions, tax: parseFloat(e.target.value) || 0 })}
                        className="w-32 form-input text-right"
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Loans</span>
                      <input
                        type="number"
                        step="0.01"
                        value={editDeductions.loans || 0}
                        onChange={(e) => setEditDeductions({ ...editDeductions, loans: parseFloat(e.target.value) || 0 })}
                        className="w-32 form-input text-right"
                      />
                    </div>
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
                    {(selectedPayslip.deductions.loans || 0) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Loans</span>
                        <span className="font-medium">{formatCurrency(selectedPayslip.deductions.loans)}</span>
                      </div>
                    )}
                    {cutoff === 1 && (
                      <div className="p-2 bg-blue-50 rounded text-sm text-blue-700 mt-2">
                        SSS, PhilHealth, Pag-IBIG deducted on 2nd cutoff only
                      </div>
                    )}
                  </>
                )}
                <div className="border-t pt-2 flex justify-between font-semibold">
                  <span>Total Deductions</span>
                  <span className="text-red-600">{formatCurrency(selectedPayslip.total_deductions)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Net Pay */}
          <div className="mt-6 p-4 bg-primary-50 rounded-lg">
            <div className="flex justify-between items-center">
              <span className="text-lg font-semibold text-gray-900">Net Pay</span>
              <span className="text-2xl font-bold text-primary-600">{formatCurrency(selectedPayslip.net_pay)}</span>
            </div>
          </div>

          {/* Edit Mode Buttons */}
          {editMode && (
            <div className="mt-6 flex gap-2 justify-end">
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
                <span className="ml-2">- {payslips.length} employees</span>
              </p>
            </div>
          </div>
          <div className="flex gap-2">
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
        <div className="grid grid-cols-4 gap-4">
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
            <button
              onClick={() => handleDownloadAllPayslipsPng(selectedRun.id)}
              className="btn-secondary text-sm"
              title="Download all payslips as PNG images (4 per page, I CAN format)"
            >
              Download All PNG (4/page)
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
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                      onClick={() => handlePayslipSort('employee_name')}
                    >
                      Employee
                      <SortIcon column="employee_name" currentSort={payslipSortBy} currentOrder={payslipSortOrder} />
                    </th>
                    <th
                      className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                      onClick={() => handlePayslipSort('days_worked')}
                    >
                      Days Worked
                      <SortIcon column="days_worked" currentSort={payslipSortBy} currentOrder={payslipSortOrder} />
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
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredPayslips.map((payslip) => (
                    <tr key={payslip.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{payslip.employee_name}</div>
                        <div className="text-sm text-gray-500">{payslip.employee_no}</div>
                      </td>
                      <td className="px-4 py-3 text-right">{payslip.days_worked}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(payslip.total_earnings)}</td>
                      <td className="px-4 py-3 text-right text-red-600">{formatCurrency(payslip.total_deductions)}</td>
                      <td className="px-4 py-3 text-right font-bold text-green-600">{formatCurrency(payslip.net_pay)}</td>
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
                            onClick={() => setSelectedPayslip(payslip)}
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
                  ))}
                </tbody>
              </table>
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
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-medium text-gray-700">Period (Optional)</span>
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Auto-detected from file</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="form-label text-gray-500">Period Start</label>
                  <input
                    type="date"
                    value={importPeriodStart}
                    onChange={(e) => setImportPeriodStart(e.target.value)}
                    className="form-input"
                    placeholder="Auto-detect"
                  />
                </div>
                <div>
                  <label className="form-label text-gray-500">Period End</label>
                  <input
                    type="date"
                    value={importPeriodEnd}
                    onChange={(e) => setImportPeriodEnd(e.target.value)}
                    className="form-input"
                    placeholder="Auto-detect"
                  />
                </div>
                <div>
                  <label className="form-label text-gray-500">Cutoff</label>
                  <select
                    value={importCutoff}
                    onChange={(e) => setImportCutoff(parseInt(e.target.value))}
                    className="form-input"
                  >
                    <option value={0}>Auto-detect</option>
                    <option value={1}>1st Cutoff (1-15)</option>
                    <option value={2}>2nd Cutoff (16-End)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Options */}
            <div className="mb-4 p-3 bg-gray-50 rounded">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={true}
                  className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  readOnly
                />
                <span className="text-sm text-gray-700">Auto-create employees if not found in system</span>
              </label>
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
                    <p className="text-xl font-bold text-green-600">{formatCurrency(importResult.totals.gross)}</p>
                    <p className="text-sm text-gray-500">Total Gross</p>
                  </div>
                  <div className="text-center p-3 bg-white rounded">
                    <p className="text-xl font-bold text-red-600">{formatCurrency(importResult.totals.deductions)}</p>
                    <p className="text-sm text-gray-500">Total Deductions</p>
                  </div>
                  <div className="text-center p-3 bg-white rounded">
                    <p className="text-xl font-bold text-blue-600">{formatCurrency(importResult.totals.net)}</p>
                    <p className="text-sm text-gray-500">Total Net Pay</p>
                  </div>
                </div>
              )}

              {importResult.not_found && importResult.not_found.length > 0 && (
                <div className="mt-4">
                  <p className="font-medium text-gray-700 mb-2">Employees Not Found ({importResult.not_found.length}):</p>
                  <ul className="text-sm text-gray-600 list-disc list-inside">
                    {importResult.not_found.slice(0, 10).map((nf: any, idx: number) => (
                      <li key={idx}>Row {nf.row}: {nf.employee_no || nf.employee_name}</li>
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
                    <label className="form-label">Late Grace Period (minutes)</label>
                    <input
                      type="number"
                      value={editSettings.late_grace_minutes || 15}
                      onChange={(e) => setEditSettings({ ...editSettings, late_grace_minutes: parseInt(e.target.value) || 0 })}
                      className="form-input"
                    />
                    <p className="text-xs text-gray-500 mt-1">Minutes before late deduction applies</p>
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
                      value={editSettings.overtime_rate || 1.25}
                      onChange={(e) => setEditSettings({ ...editSettings, overtime_rate: parseFloat(e.target.value) || 1.25 })}
                      className="form-input"
                    />
                    <p className="text-xs text-gray-500 mt-1">e.g., 1.25 = 125% of hourly rate</p>
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
                            onClick={() => handleProcess(run.id)}
                            disabled={processing === run.id}
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                          >
                            Reprocess
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

            {/* Word count requirements */}
            <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-4">
              <p className="text-blue-800 text-sm font-medium mb-2">Deletion Reason Requirements:</p>
              <ul className="text-blue-700 text-sm list-disc list-inside space-y-1">
                <li>Minimum <strong>100 valid English words</strong></li>
                <li>Words must be <strong>4 or more letters</strong></li>
                <li>Words must be <strong>recognizable English words</strong></li>
              </ul>
            </div>

            <div className="mb-4">
              <label className="form-label">Reason for Deletion *</label>
              <textarea
                value={confirmReason}
                onChange={(e) => setConfirmReason(e.target.value)}
                className="form-input"
                rows={8}
                placeholder="Please provide a detailed explanation (minimum 100 words) explaining why this payroll run needs to be deleted. Include information such as:&#10;&#10;- What error occurred&#10;- Why it cannot be corrected&#10;- What impact this has&#10;- What corrective action will be taken&#10;&#10;Example: This payroll run was created in error during the testing phase of the new payroll system..."
              />

              {/* Word count display */}
              <div className="mt-2 flex items-center justify-between text-sm">
                <div>
                  {validatingReason ? (
                    <span className="text-gray-500">Validating...</span>
                  ) : reasonValidation ? (
                    <span className={reasonValidation.is_valid ? 'text-green-600' : 'text-red-600'}>
                      {reasonValidation.is_valid ? '✓' : '✗'} {reasonValidation.valid_words}/100 valid words
                      {reasonValidation.invalid_words > 0 && (
                        <span className="text-gray-500 ml-2">
                          ({reasonValidation.invalid_words} unrecognized)
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-gray-500">Type at least 100 characters to validate...</span>
                  )}
                </div>
                <span className="text-gray-400">{confirmReason.length} characters</span>
              </div>

              {/* Invalid words display */}
              {reasonValidation && reasonValidation.invalid_word_list.length > 0 && (
                <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs">
                  <span className="text-yellow-700">Unrecognized words: </span>
                  <span className="text-yellow-600 italic">
                    {reasonValidation.invalid_word_list.slice(0, 10).join(', ')}
                    {reasonValidation.invalid_word_list.length > 10 && ` and ${reasonValidation.invalid_word_list.length - 10} more...`}
                  </span>
                </div>
              )}
            </div>

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => { setShowConfirmModal(null); setConfirmReason(''); setReasonValidation(null); }}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={!reasonValidation?.is_valid || validatingReason}
                className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {validatingReason ? 'Validating...' : 'Move to Trash'}
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
    </div>
  );
}
