import { useState, useEffect, useCallback } from 'react';
import { leaveApi } from '../../api/client';
import { useAuthStore } from '../../stores/authStore';

interface LeaveType {
  id: number;
  code: string;
  name: string;
  default_days_per_year: number;
  is_paid: boolean;
  requires_document: boolean;
  max_consecutive_days: number | null;
  min_notice_days: number;
}

interface LeaveBalance {
  id: number;
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
  reviewer_name: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
}

export function EmployeeLeavePage() {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Data
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);

  // Year selection
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);

  // Modal
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [newRequest, setNewRequest] = useState({
    leave_type_id: 0,
    start_date: '',
    end_date: '',
    is_half_day: false,
    half_day_period: '',
    reason: '',
    contact_number: '',
  });

  // Get employee ID from user
  const employeeId = user?.employee_id;

  // Fetch data
  const fetchBalances = useCallback(async () => {
    if (!employeeId) return;
    try {
      const data = await leaveApi.getEmployeeBalances(employeeId, selectedYear);
      setBalances(data.balances);
    } catch (err) {
      console.error('Failed to fetch balances:', err);
    }
  }, [employeeId, selectedYear]);

  const fetchRequests = useCallback(async () => {
    if (!employeeId) return;
    try {
      const data = await leaveApi.listRequests({ employee_id: employeeId });
      setRequests(data.items);
    } catch (err) {
      console.error('Failed to fetch requests:', err);
    }
  }, [employeeId]);

  const fetchLeaveTypes = useCallback(async () => {
    try {
      const data = await leaveApi.listTypes();
      setLeaveTypes(data.items);
    } catch (err) {
      console.error('Failed to fetch leave types:', err);
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        await Promise.all([
          fetchBalances(),
          fetchRequests(),
          fetchLeaveTypes(),
        ]);
      } catch (err) {
        setError('Failed to load data');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [fetchBalances, fetchRequests, fetchLeaveTypes]);

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

  // Create request
  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId) {
      setError('Employee not linked to user account');
      return;
    }
    try {
      setLoading(true);
      await leaveApi.createRequest({
        ...newRequest,
        employee_id: employeeId,
      });
      setSuccess('Leave request submitted successfully');
      setShowRequestModal(false);
      setNewRequest({
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
      setError(err.response?.data?.detail || 'Failed to submit request');
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

  const totalEntitled = balances.reduce((sum, b) => sum + b.entitled_days + b.carried_over_days, 0);
  const totalUsed = balances.reduce((sum, b) => sum + b.used_days, 0);
  const totalPending = balances.reduce((sum, b) => sum + b.pending_days, 0);
  const totalRemaining = balances.reduce((sum, b) => sum + b.remaining_days, 0);

  if (!employeeId) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-600">Your account is not linked to an employee record.</p>
        <p className="text-sm text-gray-500 mt-2">Please contact your administrator.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Leave</h1>
          <p className="text-gray-600">View your leave balances and submit requests</p>
        </div>
        <button
          onClick={() => setShowRequestModal(true)}
          className="btn btn-primary"
        >
          + Request Leave
        </button>
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

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">Total Entitled</div>
          <div className="text-2xl font-bold text-blue-600">{totalEntitled}</div>
          <div className="text-xs text-gray-400">days for {selectedYear}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">Used</div>
          <div className="text-2xl font-bold text-gray-700">{totalUsed}</div>
          <div className="text-xs text-gray-400">days</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">Pending</div>
          <div className="text-2xl font-bold text-yellow-600">{totalPending}</div>
          <div className="text-xs text-gray-400">awaiting approval</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">Remaining</div>
          <div className={`text-2xl font-bold ${totalRemaining > 0 ? 'text-green-600' : 'text-red-600'}`}>
            {totalRemaining}
          </div>
          <div className="text-xs text-gray-400">days available</div>
        </div>
      </div>

      {/* Leave Balances */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-medium text-gray-900">Leave Balances</h2>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className="border border-gray-300 rounded-md px-3 py-1 text-sm"
          >
            {[currentYear - 1, currentYear, currentYear + 1].map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>
        <div className="p-6">
          {loading ? (
            <div className="text-center py-4 text-gray-500">Loading...</div>
          ) : balances.length === 0 ? (
            <div className="text-center py-4 text-gray-500">
              No leave balances found for {selectedYear}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {balances.map(balance => (
                <div
                  key={balance.id}
                  className="border rounded-lg p-4 hover:border-blue-300 transition-colors"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                        {balance.leave_type_code}
                      </span>
                      <h3 className="font-medium text-gray-900 mt-1">
                        {balance.leave_type_name}
                      </h3>
                    </div>
                    <span className={`text-lg font-bold ${
                      balance.remaining_days > 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {balance.remaining_days}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 space-y-1">
                    <div className="flex justify-between">
                      <span>Entitled:</span>
                      <span>{balance.entitled_days}</span>
                    </div>
                    {balance.carried_over_days > 0 && (
                      <div className="flex justify-between">
                        <span>Carried over:</span>
                        <span>{balance.carried_over_days}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>Used:</span>
                      <span>{balance.used_days}</span>
                    </div>
                    {balance.pending_days > 0 && (
                      <div className="flex justify-between text-yellow-600">
                        <span>Pending:</span>
                        <span>{balance.pending_days}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Leave Requests */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">My Leave Requests</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
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
                  <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                    Loading...
                  </td>
                </tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                    No leave requests found
                  </td>
                </tr>
              ) : (
                requests.map(request => (
                  <tr key={request.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {request.leave_type_name}
                      </div>
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
                      {request.reviewer_name && request.status !== 'pending' && (
                        <div className="text-xs text-gray-500 mt-1">
                          by {request.reviewer_name}
                        </div>
                      )}
                      {request.review_notes && (
                        <div className="text-xs text-gray-500 mt-1 italic">
                          "{request.review_notes}"
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {request.status === 'pending' && (
                        <button
                          onClick={() => handleCancelRequest(request.id)}
                          className="text-red-600 hover:text-red-800"
                        >
                          Cancel
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

      {/* Request Modal */}
      {showRequestModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">Request Leave</h2>

            <form onSubmit={handleCreateRequest} className="space-y-4">
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
                  {leaveTypes.map(type => {
                    const balance = balances.find(b => b.leave_type_id === type.id);
                    return (
                      <option key={type.id} value={type.id}>
                        {type.name} ({type.code}) - {balance?.remaining_days || 0} days remaining
                      </option>
                    );
                  })}
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
                    min={new Date().toISOString().split('T')[0]}
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
                    min={newRequest.start_date || new Date().toISOString().split('T')[0]}
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
                    required={newRequest.is_half_day}
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
                  placeholder="Briefly describe the reason for your leave..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Emergency Contact Number
                </label>
                <input
                  type="tel"
                  value={newRequest.contact_number}
                  onChange={(e) => setNewRequest({ ...newRequest, contact_number: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  placeholder="Where you can be reached during leave"
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
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
