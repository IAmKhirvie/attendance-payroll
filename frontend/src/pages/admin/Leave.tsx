import { useState, useEffect, useCallback } from 'react';
import { leaveApi, employeesApi } from '../../api/client';

interface LeaveType {
  id: number;
  code: string;
  name: string;
  description: string | null;
  default_days_per_year: number;
  is_paid: boolean;
  requires_document: boolean;
  max_consecutive_days: number | null;
  min_notice_days: number;
  is_accrued: boolean;
  accrual_rate_per_month: number | null;
  can_carry_over: boolean;
  max_carry_over_days: number | null;
  is_active: boolean;
}

interface LeaveBalance {
  id: number;
  employee_id: number;
  employee_name: string | null;
  employee_no: string | null;
  leave_type_id: number;
  leave_type_code: string | null;
  leave_type_name: string | null;
  year: number;
  entitled_days: number;
  used_days: number;
  pending_days: number;
  carried_over_days: number;
  remaining_days: number;
}

interface LeaveRequest {
  id: number;
  employee_id: number;
  employee_name: string | null;
  employee_no: string | null;
  leave_type_id: number;
  leave_type_code: string | null;
  leave_type_name: string | null;
  start_date: string;
  end_date: string;
  total_days: number;
  is_half_day: boolean;
  half_day_period: string | null;
  reason: string | null;
  contact_number: string | null;
  status: string;
  reviewed_by: number | null;
  reviewer_name: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
}

interface Employee {
  id: number;
  employee_no: string;
  first_name: string;
  last_name: string;
}

type TabType = 'requests' | 'balances' | 'types';
type RequestFilter = 'pending' | 'approved' | 'rejected' | 'all';

export default function LeavePage() {
  const [activeTab, setActiveTab] = useState<TabType>('requests');
  const [requestFilter, setRequestFilter] = useState<RequestFilter>('pending');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Bulk selection state
  const [selectedRequestIds, setSelectedRequestIds] = useState<Set<number>>(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

  // Data
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  // Year selection for balances
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);

  // Modal states
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showBalanceModal, setShowBalanceModal] = useState(false);
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null);

  // Form states
  const [reviewNotes, setReviewNotes] = useState('');
  const [newRequest, setNewRequest] = useState({
    employee_id: 0,
    leave_type_id: 0,
    start_date: '',
    end_date: '',
    is_half_day: false,
    half_day_period: '',
    reason: '',
    contact_number: '',
  });
  const [newBalance, setNewBalance] = useState({
    employee_id: 0,
    leave_type_id: 0,
    year: currentYear,
    entitled_days: 0,
    carried_over_days: 0,
  });
  const [newType, setNewType] = useState({
    code: '',
    name: '',
    description: '',
    default_days_per_year: 0,
    is_paid: true,
    requires_document: false,
    max_consecutive_days: null as number | null,
    min_notice_days: 0,
    is_accrued: false,
    accrual_rate_per_month: null as number | null,
    can_carry_over: false,
    max_carry_over_days: null as number | null,
    is_active: true,
  });
  const [editingType, setEditingType] = useState<LeaveType | null>(null);

  // Fetch data
  const fetchRequests = useCallback(async () => {
    try {
      const statusParam = requestFilter === 'all' ? undefined : requestFilter;
      const data = await leaveApi.listRequests({ status: statusParam });
      setRequests(data.items);
    } catch (err) {
      console.error('Failed to fetch requests:', err);
    }
  }, [requestFilter]);

  const fetchBalances = useCallback(async () => {
    try {
      const data = await leaveApi.listBalances({ year: selectedYear });
      setBalances(data.items);
    } catch (err) {
      console.error('Failed to fetch balances:', err);
    }
  }, [selectedYear]);

  const fetchLeaveTypes = useCallback(async () => {
    try {
      const data = await leaveApi.listTypes({ include_inactive: true });
      setLeaveTypes(data.items);
    } catch (err) {
      console.error('Failed to fetch leave types:', err);
    }
  }, []);

  const fetchEmployees = useCallback(async () => {
    try {
      const data = await employeesApi.list({ page_size: 1000, status: 'active' });
      setEmployees(data.items);
    } catch (err) {
      console.error('Failed to fetch employees:', err);
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        await Promise.all([
          fetchRequests(),
          fetchBalances(),
          fetchLeaveTypes(),
          fetchEmployees(),
        ]);
      } catch (err) {
        setError('Failed to load data');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [fetchRequests, fetchBalances, fetchLeaveTypes, fetchEmployees]);

  // Auto-clear messages
  useEffect(() => {
    if (success || error) {
      const timer = setTimeout(() => {
        setSuccess(null);
        setError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [success, error]);

  // Seed leave types
  const handleSeedTypes = async () => {
    try {
      setLoading(true);
      const result = await leaveApi.seedTypes();
      setSuccess(`Seeded ${result.seeded} leave types`);
      await fetchLeaveTypes();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to seed leave types');
    } finally {
      setLoading(false);
    }
  };

  // Review request
  const handleReview = async (status: 'approved' | 'rejected') => {
    if (!selectedRequest) return;
    try {
      setLoading(true);
      await leaveApi.reviewRequest(selectedRequest.id, { status, review_notes: reviewNotes || undefined });
      setSuccess(`Leave request ${status}`);
      setShowReviewModal(false);
      setSelectedRequest(null);
      setReviewNotes('');
      await fetchRequests();
      await fetchBalances();
    } catch (err: any) {
      setError(err.response?.data?.detail || `Failed to ${status} request`);
    } finally {
      setLoading(false);
    }
  };

  // Bulk selection handlers
  const handleSelectAllRequests = (checked: boolean) => {
    if (checked) {
      // Only select pending requests
      const pendingIds = requests.filter(r => r.status === 'pending').map(r => r.id);
      setSelectedRequestIds(new Set(pendingIds));
    } else {
      setSelectedRequestIds(new Set());
    }
  };

  const handleSelectOneRequest = (id: number, checked: boolean) => {
    const newSelected = new Set(selectedRequestIds);
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedRequestIds(newSelected);
  };

  const clearRequestSelection = () => {
    setSelectedRequestIds(new Set());
  };

  const handleBulkReview = async (status: 'approved' | 'rejected') => {
    if (selectedRequestIds.size === 0) return;
    if (!confirm(`${status === 'approved' ? 'Approve' : 'Reject'} ${selectedRequestIds.size} selected leave request(s)?`)) return;

    setBulkActionLoading(true);
    try {
      let successCount = 0;
      for (const id of selectedRequestIds) {
        try {
          await leaveApi.reviewRequest(id, { status });
          successCount++;
        } catch (e) {
          console.error(`Failed to ${status} request ${id}:`, e);
        }
      }
      setSuccess(`${status === 'approved' ? 'Approved' : 'Rejected'} ${successCount} of ${selectedRequestIds.size} requests`);
      clearRequestSelection();
      await fetchRequests();
      await fetchBalances();
    } finally {
      setBulkActionLoading(false);
    }
  };

  const pendingRequestsCount = requests.filter(r => r.status === 'pending').length;
  const isAllPendingSelected = pendingRequestsCount > 0 &&
    requests.filter(r => r.status === 'pending').every(r => selectedRequestIds.has(r.id));
  const isSomePendingSelected = selectedRequestIds.size > 0 && !isAllPendingSelected;

  // Create request
  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      await leaveApi.createRequest(newRequest);
      setSuccess('Leave request created');
      setShowRequestModal(false);
      setNewRequest({
        employee_id: 0,
        leave_type_id: 0,
        start_date: '',
        end_date: '',
        is_half_day: false,
        half_day_period: '',
        reason: '',
        contact_number: '',
      });
      await fetchRequests();
      await fetchBalances();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create request');
    } finally {
      setLoading(false);
    }
  };

  // Create balance
  const handleCreateBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      await leaveApi.createBalance(newBalance);
      setSuccess('Leave balance created');
      setShowBalanceModal(false);
      setNewBalance({
        employee_id: 0,
        leave_type_id: 0,
        year: currentYear,
        entitled_days: 0,
        carried_over_days: 0,
      });
      await fetchBalances();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create balance');
    } finally {
      setLoading(false);
    }
  };

  // Initialize balances for all employees
  const handleInitializeBalances = async () => {
    try {
      setLoading(true);
      const employeeIds = employees.map(e => e.id);
      const result = await leaveApi.initializeBalances({
        employee_ids: employeeIds,
        year: selectedYear,
        use_defaults: true,
      });
      setSuccess(`Initialized balances: ${result.created} created, ${result.skipped} skipped`);
      await fetchBalances();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to initialize balances');
    } finally {
      setLoading(false);
    }
  };

  // Create/Update leave type
  const handleSaveType = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      if (editingType) {
        await leaveApi.updateType(editingType.id, newType);
        setSuccess('Leave type updated');
      } else {
        await leaveApi.createType(newType);
        setSuccess('Leave type created');
      }
      setShowTypeModal(false);
      setEditingType(null);
      setNewType({
        code: '',
        name: '',
        description: '',
        default_days_per_year: 0,
        is_paid: true,
        requires_document: false,
        max_consecutive_days: null,
        min_notice_days: 0,
        is_accrued: false,
        accrual_rate_per_month: null,
        can_carry_over: false,
        max_carry_over_days: null,
        is_active: true,
      });
      await fetchLeaveTypes();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save leave type');
    } finally {
      setLoading(false);
    }
  };

  // Delete leave type
  const handleDeleteType = async (id: number) => {
    if (!confirm('Delete this leave type?')) return;
    try {
      setLoading(true);
      await leaveApi.deleteType(id);
      setSuccess('Leave type deleted');
      await fetchLeaveTypes();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete leave type');
    } finally {
      setLoading(false);
    }
  };

  // Cancel request
  const handleCancelRequest = async (id: number) => {
    if (!confirm('Cancel this leave request?')) return;
    try {
      setLoading(true);
      await leaveApi.cancelRequest(id);
      setSuccess('Leave request cancelled');
      await fetchRequests();
      await fetchBalances();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to cancel request');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'approved': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      case 'cancelled': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leave Management</h1>
          <p className="text-gray-600">Manage employee leave requests and balances</p>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
          {success}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          <button
            onClick={() => setActiveTab('requests')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'requests'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Leave Requests
            {pendingCount > 0 && (
              <span className="ml-2 bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded-full">
                {pendingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('balances')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'balances'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Leave Balances
          </button>
          <button
            onClick={() => setActiveTab('types')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'types'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Leave Types
          </button>
        </nav>
      </div>

      {/* Leave Requests Tab */}
      {activeTab === 'requests' && (
        <div className="space-y-4">
          {/* Filter and Actions */}
          <div className="flex justify-between items-center">
            <div className="flex space-x-2">
              {(['pending', 'approved', 'rejected', 'all'] as const).map(filter => (
                <button
                  key={filter}
                  onClick={() => setRequestFilter(filter)}
                  className={`px-3 py-1 text-sm rounded-full ${
                    requestFilter === filter
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {filter.charAt(0).toUpperCase() + filter.slice(1)}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowRequestModal(true)}
              className="btn btn-primary"
            >
              + New Request
            </button>
          </div>

          {/* Bulk Action Bar */}
          {selectedRequestIds.size > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-medium text-blue-700">
                  {selectedRequestIds.size} request{selectedRequestIds.size > 1 ? 's' : ''} selected
                </span>
                <button
                  onClick={clearRequestSelection}
                  className="text-blue-600 hover:text-blue-800 text-sm underline"
                >
                  Clear selection
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleBulkReview('approved')}
                  disabled={bulkActionLoading}
                  className="px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 text-sm font-medium"
                >
                  {bulkActionLoading ? 'Processing...' : 'Approve Selected'}
                </button>
                <button
                  onClick={() => handleBulkReview('rejected')}
                  disabled={bulkActionLoading}
                  className="px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 text-sm font-medium"
                >
                  {bulkActionLoading ? 'Processing...' : 'Reject Selected'}
                </button>
              </div>
            </div>
          )}

          {/* Requests Table */}
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {requestFilter === 'pending' && (
                    <th className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={isAllPendingSelected}
                        ref={(input) => {
                          if (input) input.indeterminate = isSomePendingSelected;
                        }}
                        onChange={(e) => handleSelectAllRequests(e.target.checked)}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                    </th>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Leave Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Period</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Days</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={requestFilter === 'pending' ? 7 : 6} className="px-6 py-4 text-center text-gray-500">
                      Loading...
                    </td>
                  </tr>
                ) : requests.length === 0 ? (
                  <tr>
                    <td colSpan={requestFilter === 'pending' ? 7 : 6} className="px-6 py-4 text-center text-gray-500">
                      No leave requests found
                    </td>
                  </tr>
                ) : (
                  requests.map(request => (
                    <tr key={request.id} className={`hover:bg-gray-50 ${selectedRequestIds.has(request.id) ? 'bg-blue-50' : ''}`}>
                      {requestFilter === 'pending' && (
                        <td className="px-3 py-4">
                          {request.status === 'pending' && (
                            <input
                              type="checkbox"
                              checked={selectedRequestIds.has(request.id)}
                              onChange={(e) => handleSelectOneRequest(request.id, e.target.checked)}
                              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                          )}
                        </td>
                      )}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {request.employee_name}
                        </div>
                        <div className="text-sm text-gray-500">{request.employee_no}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{request.leave_type_name}</div>
                        <div className="text-xs text-gray-500">{request.leave_type_code}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {formatDate(request.start_date)}
                          {request.start_date !== request.end_date && (
                            <> - {formatDate(request.end_date)}</>
                          )}
                        </div>
                        {request.is_half_day && (
                          <div className="text-xs text-gray-500">
                            Half day ({request.half_day_period})
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {request.total_days}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(request.status)}`}>
                          {request.status}
                        </span>
                        {request.reviewer_name && (
                          <div className="text-xs text-gray-500 mt-1">
                            by {request.reviewer_name}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {request.status === 'pending' && (
                          <div className="flex space-x-2">
                            <button
                              onClick={() => {
                                setSelectedRequest(request);
                                setShowReviewModal(true);
                              }}
                              className="text-blue-600 hover:text-blue-800"
                            >
                              Review
                            </button>
                            <button
                              onClick={() => handleCancelRequest(request.id)}
                              className="text-red-600 hover:text-red-800"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                        {request.reason && (
                          <button
                            onClick={() => alert(request.reason)}
                            className="text-gray-500 hover:text-gray-700"
                            title="View reason"
                          >
                            View
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Leave Balances Tab */}
      {activeTab === 'balances' && (
        <div className="space-y-4">
          {/* Year and Actions */}
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <label className="text-sm font-medium text-gray-700">Year:</label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                className="border border-gray-300 rounded-md px-3 py-1"
              >
                {[currentYear - 1, currentYear, currentYear + 1].map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={handleInitializeBalances}
                className="btn btn-secondary"
                disabled={loading}
              >
                Initialize All Balances
              </button>
              <button
                onClick={() => setShowBalanceModal(true)}
                className="btn btn-primary"
              >
                + Add Balance
              </button>
            </div>
          </div>

          {/* Balances Table */}
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Leave Type</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Entitled</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Carried Over</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Used</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Pending</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Remaining</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                      Loading...
                    </td>
                  </tr>
                ) : balances.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                      No leave balances found for {selectedYear}
                    </td>
                  </tr>
                ) : (
                  balances.map(balance => (
                    <tr key={balance.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {balance.employee_name}
                        </div>
                        <div className="text-sm text-gray-500">{balance.employee_no}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{balance.leave_type_name}</div>
                        <div className="text-xs text-gray-500">{balance.leave_type_code}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                        {balance.entitled_days}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                        {balance.carried_over_days > 0 ? balance.carried_over_days : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                        {balance.used_days > 0 ? balance.used_days : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-yellow-600">
                        {balance.pending_days > 0 ? balance.pending_days : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <span className={`text-sm font-medium ${
                          balance.remaining_days > 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {balance.remaining_days}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Leave Types Tab */}
      {activeTab === 'types' && (
        <div className="space-y-4">
          {/* Actions */}
          <div className="flex justify-end space-x-2">
            <button
              onClick={handleSeedTypes}
              className="btn btn-secondary"
              disabled={loading}
            >
              Seed PH Leave Types
            </button>
            <button
              onClick={() => {
                setEditingType(null);
                setNewType({
                  code: '',
                  name: '',
                  description: '',
                  default_days_per_year: 0,
                  is_paid: true,
                  requires_document: false,
                  max_consecutive_days: null,
                  min_notice_days: 0,
                  is_accrued: false,
                  accrual_rate_per_month: null,
                  can_carry_over: false,
                  max_carry_over_days: null,
                  is_active: true,
                });
                setShowTypeModal(true);
              }}
              className="btn btn-primary"
            >
              + Add Leave Type
            </button>
          </div>

          {/* Types Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {loading ? (
              <div className="col-span-full text-center py-8 text-gray-500">Loading...</div>
            ) : leaveTypes.length === 0 ? (
              <div className="col-span-full text-center py-8 text-gray-500">
                No leave types found. Click "Seed PH Leave Types" to add standard Philippine leave types.
              </div>
            ) : (
              leaveTypes.map(type => (
                <div
                  key={type.id}
                  className={`bg-white rounded-lg shadow p-4 ${
                    !type.is_active ? 'opacity-60' : ''
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <span className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded mb-1">
                        {type.code}
                      </span>
                      <h3 className="font-medium text-gray-900">{type.name}</h3>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded ${
                      type.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {type.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  {type.description && (
                    <p className="text-sm text-gray-600 mb-2">{type.description}</p>
                  )}
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Default Days:</span>
                      <span className="font-medium">{type.default_days_per_year}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Paid:</span>
                      <span className={type.is_paid ? 'text-green-600' : 'text-red-600'}>
                        {type.is_paid ? 'Yes' : 'No'}
                      </span>
                    </div>
                    {type.requires_document && (
                      <div className="text-yellow-600 text-xs">Requires document</div>
                    )}
                    {type.can_carry_over && (
                      <div className="text-blue-600 text-xs">
                        Can carry over (max {type.max_carry_over_days} days)
                      </div>
                    )}
                  </div>
                  <div className="mt-3 pt-3 border-t flex justify-end space-x-2">
                    <button
                      onClick={() => {
                        setEditingType(type);
                        setNewType({
                          code: type.code,
                          name: type.name,
                          description: type.description || '',
                          default_days_per_year: type.default_days_per_year,
                          is_paid: type.is_paid,
                          requires_document: type.requires_document,
                          max_consecutive_days: type.max_consecutive_days,
                          min_notice_days: type.min_notice_days,
                          is_accrued: type.is_accrued,
                          accrual_rate_per_month: type.accrual_rate_per_month,
                          can_carry_over: type.can_carry_over,
                          max_carry_over_days: type.max_carry_over_days,
                          is_active: type.is_active,
                        });
                        setShowTypeModal(true);
                      }}
                      className="text-blue-600 hover:text-blue-800 text-sm"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteType(type.id)}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Review Modal */}
      {showReviewModal && selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-lg font-semibold mb-4">Review Leave Request</h2>

            <div className="space-y-3 mb-4">
              <div>
                <span className="text-gray-500">Employee:</span>
                <span className="ml-2 font-medium">{selectedRequest.employee_name}</span>
              </div>
              <div>
                <span className="text-gray-500">Leave Type:</span>
                <span className="ml-2 font-medium">{selectedRequest.leave_type_name}</span>
              </div>
              <div>
                <span className="text-gray-500">Period:</span>
                <span className="ml-2 font-medium">
                  {formatDate(selectedRequest.start_date)} - {formatDate(selectedRequest.end_date)}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Days:</span>
                <span className="ml-2 font-medium">{selectedRequest.total_days}</span>
              </div>
              {selectedRequest.reason && (
                <div>
                  <span className="text-gray-500">Reason:</span>
                  <p className="text-sm text-gray-700 mt-1">{selectedRequest.reason}</p>
                </div>
              )}
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Review Notes (Optional)
              </label>
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                rows={3}
                placeholder="Add any notes..."
              />
            </div>

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowReviewModal(false);
                  setSelectedRequest(null);
                  setReviewNotes('');
                }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => handleReview('rejected')}
                className="btn bg-red-600 text-white hover:bg-red-700"
                disabled={loading}
              >
                Reject
              </button>
              <button
                onClick={() => handleReview('approved')}
                className="btn btn-primary"
                disabled={loading}
              >
                Approve
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Request Modal */}
      {showRequestModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">New Leave Request</h2>

            <form onSubmit={handleCreateRequest} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Employee
                </label>
                <select
                  value={newRequest.employee_id}
                  onChange={(e) => setNewRequest({ ...newRequest, employee_id: parseInt(e.target.value) })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  required
                >
                  <option value={0}>Select employee</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.first_name} {emp.last_name} ({emp.employee_no})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Leave Type
                </label>
                <select
                  value={newRequest.leave_type_id}
                  onChange={(e) => setNewRequest({ ...newRequest, leave_type_id: parseInt(e.target.value) })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  required
                >
                  <option value={0}>Select leave type</option>
                  {leaveTypes.filter(t => t.is_active).map(type => (
                    <option key={type.id} value={type.id}>
                      {type.name} ({type.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={newRequest.start_date}
                    onChange={(e) => setNewRequest({ ...newRequest, start_date: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={newRequest.end_date}
                    onChange={(e) => setNewRequest({ ...newRequest, end_date: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center space-x-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={newRequest.is_half_day}
                    onChange={(e) => setNewRequest({ ...newRequest, is_half_day: e.target.checked })}
                    className="mr-2"
                  />
                  <span className="text-sm">Half day</span>
                </label>
                {newRequest.is_half_day && (
                  <select
                    value={newRequest.half_day_period}
                    onChange={(e) => setNewRequest({ ...newRequest, half_day_period: e.target.value })}
                    className="border border-gray-300 rounded-md px-3 py-1 text-sm"
                  >
                    <option value="">Select period</option>
                    <option value="morning">Morning</option>
                    <option value="afternoon">Afternoon</option>
                  </select>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason
                </label>
                <textarea
                  value={newRequest.reason}
                  onChange={(e) => setNewRequest({ ...newRequest, reason: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contact Number
                </label>
                <input
                  type="tel"
                  value={newRequest.contact_number}
                  onChange={(e) => setNewRequest({ ...newRequest, contact_number: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  placeholder="Emergency contact"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowRequestModal(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading}
                >
                  Create Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Balance Modal */}
      {showBalanceModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-lg font-semibold mb-4">Add Leave Balance</h2>

            <form onSubmit={handleCreateBalance} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Employee
                </label>
                <select
                  value={newBalance.employee_id}
                  onChange={(e) => setNewBalance({ ...newBalance, employee_id: parseInt(e.target.value) })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  required
                >
                  <option value={0}>Select employee</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.first_name} {emp.last_name} ({emp.employee_no})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Leave Type
                </label>
                <select
                  value={newBalance.leave_type_id}
                  onChange={(e) => setNewBalance({ ...newBalance, leave_type_id: parseInt(e.target.value) })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  required
                >
                  <option value={0}>Select leave type</option>
                  {leaveTypes.filter(t => t.is_active).map(type => (
                    <option key={type.id} value={type.id}>
                      {type.name} ({type.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Year
                </label>
                <select
                  value={newBalance.year}
                  onChange={(e) => setNewBalance({ ...newBalance, year: parseInt(e.target.value) })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  {[currentYear - 1, currentYear, currentYear + 1].map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Entitled Days
                  </label>
                  <input
                    type="number"
                    value={newBalance.entitled_days}
                    onChange={(e) => setNewBalance({ ...newBalance, entitled_days: parseFloat(e.target.value) })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                    min="0"
                    step="0.5"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Carried Over
                  </label>
                  <input
                    type="number"
                    value={newBalance.carried_over_days}
                    onChange={(e) => setNewBalance({ ...newBalance, carried_over_days: parseFloat(e.target.value) })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                    min="0"
                    step="0.5"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowBalanceModal(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading}
                >
                  Add Balance
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Leave Type Modal */}
      {showTypeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">
              {editingType ? 'Edit Leave Type' : 'Add Leave Type'}
            </h2>

            <form onSubmit={handleSaveType} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Code
                  </label>
                  <input
                    type="text"
                    value={newType.code}
                    onChange={(e) => setNewType({ ...newType, code: e.target.value.toUpperCase() })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                    placeholder="e.g., VL"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    value={newType.name}
                    onChange={(e) => setNewType({ ...newType, name: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                    placeholder="e.g., Vacation Leave"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={newType.description}
                  onChange={(e) => setNewType({ ...newType, description: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Default Days/Year
                  </label>
                  <input
                    type="number"
                    value={newType.default_days_per_year}
                    onChange={(e) => setNewType({ ...newType, default_days_per_year: parseFloat(e.target.value) })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                    min="0"
                    step="0.5"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Min Notice Days
                  </label>
                  <input
                    type="number"
                    value={newType.min_notice_days}
                    onChange={(e) => setNewType({ ...newType, min_notice_days: parseInt(e.target.value) })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                    min="0"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Consecutive Days
                  </label>
                  <input
                    type="number"
                    value={newType.max_consecutive_days || ''}
                    onChange={(e) => setNewType({ ...newType, max_consecutive_days: e.target.value ? parseInt(e.target.value) : null })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                    min="1"
                    placeholder="No limit"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Carry Over Days
                  </label>
                  <input
                    type="number"
                    value={newType.max_carry_over_days || ''}
                    onChange={(e) => setNewType({ ...newType, max_carry_over_days: e.target.value ? parseFloat(e.target.value) : null })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                    min="0"
                    step="0.5"
                    placeholder="No carry over"
                    disabled={!newType.can_carry_over}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={newType.is_paid}
                    onChange={(e) => setNewType({ ...newType, is_paid: e.target.checked })}
                    className="mr-2"
                  />
                  <span className="text-sm">Paid Leave</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={newType.requires_document}
                    onChange={(e) => setNewType({ ...newType, requires_document: e.target.checked })}
                    className="mr-2"
                  />
                  <span className="text-sm">Requires Document</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={newType.can_carry_over}
                    onChange={(e) => setNewType({ ...newType, can_carry_over: e.target.checked })}
                    className="mr-2"
                  />
                  <span className="text-sm">Can Carry Over</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={newType.is_active}
                    onChange={(e) => setNewType({ ...newType, is_active: e.target.checked })}
                    className="mr-2"
                  />
                  <span className="text-sm">Active</span>
                </label>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowTypeModal(false);
                    setEditingType(null);
                  }}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading}
                >
                  {editingType ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
