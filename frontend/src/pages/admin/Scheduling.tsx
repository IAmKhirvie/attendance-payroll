import { useState, useEffect } from 'react';
import { employeesApi } from '../../api/client';
import type { Employee } from '../../types';

const DAYS = [
  { key: 'work_monday', short: 'Mon', full: 'Monday' },
  { key: 'work_tuesday', short: 'Tue', full: 'Tuesday' },
  { key: 'work_wednesday', short: 'Wed', full: 'Wednesday' },
  { key: 'work_thursday', short: 'Thu', full: 'Thursday' },
  { key: 'work_friday', short: 'Fri', full: 'Friday' },
  { key: 'work_saturday', short: 'Sat', full: 'Saturday' },
  { key: 'work_sunday', short: 'Sun', full: 'Sunday' },
];

export default function SchedulingPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [search, setSearch] = useState('');
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  // Bulk schedule state
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkSchedule, setBulkSchedule] = useState({
    call_time: '08:00',
    time_out: '17:00',
    buffer_minutes: 10,
    work_monday: true,
    work_tuesday: true,
    work_wednesday: true,
    work_thursday: true,
    work_friday: true,
    work_saturday: false,
    work_sunday: false,
  });
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    loadEmployees();
  }, []);

  const loadEmployees = async () => {
    setLoading(true);
    try {
      const data = await employeesApi.list({ page_size: 1000, status: 'active' });
      // Sort by last name
      const sorted = data.items.sort((a: Employee, b: Employee) =>
        a.last_name.localeCompare(b.last_name)
      );
      setEmployees(sorted);
    } catch (error) {
      console.error('Failed to load employees:', error);
      setMessage({ type: 'error', text: 'Failed to load employees' });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSchedule = async (employee: Employee) => {
    setSaving(employee.id);
    try {
      await employeesApi.update(employee.id, {
        call_time: employee.call_time,
        time_out: employee.time_out,
        buffer_minutes: employee.buffer_minutes,
        is_flexible: employee.is_flexible,
        adjusted_call_time: employee.adjusted_call_time || undefined,
        work_monday: employee.work_monday,
        work_tuesday: employee.work_tuesday,
        work_wednesday: employee.work_wednesday,
        work_thursday: employee.work_thursday,
        work_friday: employee.work_friday,
        work_saturday: employee.work_saturday,
        work_sunday: employee.work_sunday,
      });
      setMessage({ type: 'success', text: `Schedule saved for ${employee.first_name} ${employee.last_name}` });
      setEditingEmployee(null);
      loadEmployees();
    } catch (error) {
      console.error('Failed to save schedule:', error);
      setMessage({ type: 'error', text: 'Failed to save schedule' });
    } finally {
      setSaving(null);
    }
  };

  const handleBulkSave = async () => {
    if (selectedEmployeeIds.size === 0) {
      setMessage({ type: 'error', text: 'Please select employees to update' });
      return;
    }

    setSaving(-1);
    try {
      for (const empId of selectedEmployeeIds) {
        await employeesApi.update(empId, {
          call_time: bulkSchedule.call_time,
          time_out: bulkSchedule.time_out,
          buffer_minutes: bulkSchedule.buffer_minutes,
          work_monday: bulkSchedule.work_monday,
          work_tuesday: bulkSchedule.work_tuesday,
          work_wednesday: bulkSchedule.work_wednesday,
          work_thursday: bulkSchedule.work_thursday,
          work_friday: bulkSchedule.work_friday,
          work_saturday: bulkSchedule.work_saturday,
          work_sunday: bulkSchedule.work_sunday,
        });
      }
      setMessage({ type: 'success', text: `Updated schedule for ${selectedEmployeeIds.size} employees` });
      setShowBulkModal(false);
      setSelectedEmployeeIds(new Set());
      loadEmployees();
    } catch (error) {
      console.error('Failed to bulk update:', error);
      setMessage({ type: 'error', text: 'Failed to update some employees' });
    } finally {
      setSaving(null);
    }
  };

  const toggleSelectAll = () => {
    if (selectedEmployeeIds.size === filteredEmployees.length) {
      setSelectedEmployeeIds(new Set());
    } else {
      setSelectedEmployeeIds(new Set(filteredEmployees.map(e => e.id)));
    }
  };

  const filteredEmployees = employees.filter(emp =>
    `${emp.first_name} ${emp.last_name} ${emp.employee_no}`.toLowerCase().includes(search.toLowerCase())
  );

  const countWorkDays = (emp: Employee) => {
    let count = 0;
    if (emp.work_monday) count++;
    if (emp.work_tuesday) count++;
    if (emp.work_wednesday) count++;
    if (emp.work_thursday) count++;
    if (emp.work_friday) count++;
    if (emp.work_saturday) count++;
    if (emp.work_sunday) count++;
    return count;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Employee Scheduling</h1>
          <p className="text-gray-500">Manage working days and call times for each employee</p>
        </div>
        <button
          onClick={() => setShowBulkModal(true)}
          className="btn-primary"
          disabled={selectedEmployeeIds.size === 0}
        >
          Bulk Update ({selectedEmployeeIds.size})
        </button>
      </div>

      {/* Messages */}
      {message && (
        <div className={`p-4 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {message.text}
          <button onClick={() => setMessage(null)} className="ml-4 text-sm underline">Dismiss</button>
        </div>
      )}

      {/* Search */}
      <div className="flex gap-4">
        <input
          type="text"
          placeholder="Search employees..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="form-input flex-1"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">Loading...</div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedEmployeeIds.size === filteredEmployees.length && filteredEmployees.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Call Time</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Time Out</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Buffer</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Flexible</th>
                {DAYS.map(day => (
                  <th key={day.key} className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase">{day.short}</th>
                ))}
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Days/Wk</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredEmployees.map((emp) => (
                <tr key={emp.id} className={editingEmployee?.id === emp.id ? 'bg-blue-50' : 'hover:bg-gray-50'}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedEmployeeIds.has(emp.id)}
                      onChange={(e) => {
                        const newSet = new Set(selectedEmployeeIds);
                        if (e.target.checked) {
                          newSet.add(emp.id);
                        } else {
                          newSet.delete(emp.id);
                        }
                        setSelectedEmployeeIds(newSet);
                      }}
                      className="rounded"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{emp.first_name} {emp.last_name}</div>
                    <div className="text-xs text-gray-500">{emp.employee_no}</div>
                  </td>
                  {editingEmployee?.id === emp.id ? (
                    <>
                      <td className="px-4 py-3 text-center">
                        <input
                          type="time"
                          value={editingEmployee.call_time || '08:00'}
                          onChange={(e) => setEditingEmployee({ ...editingEmployee, call_time: e.target.value })}
                          className="form-input w-24 text-sm"
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <input
                          type="time"
                          value={editingEmployee.time_out || '17:00'}
                          onChange={(e) => setEditingEmployee({ ...editingEmployee, time_out: e.target.value })}
                          className="form-input w-24 text-sm"
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <input
                          type="number"
                          min="0"
                          max="60"
                          value={editingEmployee.buffer_minutes || 10}
                          onChange={(e) => setEditingEmployee({ ...editingEmployee, buffer_minutes: parseInt(e.target.value) || 0 })}
                          className="form-input w-16 text-sm text-center"
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={editingEmployee.is_flexible || false}
                          onChange={(e) => setEditingEmployee({ ...editingEmployee, is_flexible: e.target.checked })}
                          className="rounded"
                        />
                      </td>
                      {DAYS.map(day => (
                        <td key={day.key} className="px-2 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={(editingEmployee as any)[day.key] || false}
                            onChange={(e) => setEditingEmployee({ ...editingEmployee, [day.key]: e.target.checked })}
                            className="rounded"
                          />
                        </td>
                      ))}
                      <td className="px-4 py-3 text-center font-medium">
                        {countWorkDays(editingEmployee)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex gap-2 justify-center">
                          <button
                            onClick={() => handleSaveSchedule(editingEmployee)}
                            disabled={saving === emp.id}
                            className="text-green-600 hover:text-green-800 text-sm font-medium"
                          >
                            {saving === emp.id ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            onClick={() => setEditingEmployee(null)}
                            className="text-gray-600 hover:text-gray-800 text-sm"
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 text-center text-sm">{emp.call_time || '08:00'}</td>
                      <td className="px-4 py-3 text-center text-sm">{emp.time_out || '17:00'}</td>
                      <td className="px-4 py-3 text-center text-sm">{emp.buffer_minutes ?? 10}m</td>
                      <td className="px-4 py-3 text-center">
                        {emp.is_flexible ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                            Flex
                          </span>
                        ) : '-'}
                      </td>
                      {DAYS.map(day => (
                        <td key={day.key} className="px-2 py-3 text-center">
                          {(emp as any)[day.key] ? (
                            <span className="text-green-600">✓</span>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-center font-medium">{countWorkDays(emp)}</td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => setEditingEmployee({ ...emp })}
                          className="text-primary-600 hover:text-primary-800 text-sm font-medium"
                        >
                          Edit
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Bulk Update Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-bold mb-4">Bulk Update Schedule</h2>
            <p className="text-gray-600 mb-4">Update schedule for {selectedEmployeeIds.size} selected employees</p>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Call Time</label>
                  <input
                    type="time"
                    value={bulkSchedule.call_time}
                    onChange={(e) => setBulkSchedule({ ...bulkSchedule, call_time: e.target.value })}
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Time Out</label>
                  <input
                    type="time"
                    value={bulkSchedule.time_out}
                    onChange={(e) => setBulkSchedule({ ...bulkSchedule, time_out: e.target.value })}
                    className="form-input"
                  />
                </div>
              </div>

              <div>
                <label className="form-label">Buffer Minutes</label>
                <input
                  type="number"
                  min="0"
                  max="60"
                  value={bulkSchedule.buffer_minutes}
                  onChange={(e) => setBulkSchedule({ ...bulkSchedule, buffer_minutes: parseInt(e.target.value) || 0 })}
                  className="form-input w-24"
                />
              </div>

              <div>
                <label className="form-label">Working Days</label>
                <div className="grid grid-cols-7 gap-2 mt-2">
                  {DAYS.map(day => (
                    <label key={day.key} className="flex flex-col items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={(bulkSchedule as any)[day.key]}
                        onChange={(e) => setBulkSchedule({ ...bulkSchedule, [day.key]: e.target.checked })}
                        className="rounded"
                      />
                      <span className="text-xs">{day.short}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowBulkModal(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkSave}
                disabled={saving === -1}
                className="btn-primary"
              >
                {saving === -1 ? 'Updating...' : 'Update All'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
