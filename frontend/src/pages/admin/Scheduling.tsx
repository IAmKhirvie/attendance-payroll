import { useState, useEffect } from 'react';
import { employeesApi } from '../../api/client';
import type { Employee } from '../../types';

// Helper function to convert 24-hour time to 12-hour format
const formatTime12Hour = (time24: string): string => {
  if (!time24) return '';
  const [hours, minutes] = time24.split(':');
  const hour = parseInt(hours, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
};

// Helper function to convert 12-hour time to 24-hour format
const convertTo24Hour = (hour: string, minute: string, ampm: string): string => {
  let h = parseInt(hour, 10);
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return `${h.toString().padStart(2, '0')}:${minute}`;
};

// Helper function to parse 24-hour time into components
const parseTime = (time24: string): { hour: string; minute: string; ampm: string } => {
  if (!time24) return { hour: '08', minute: '00', ampm: 'AM' };
  const [hours, minutes] = time24.split(':');
  const hour = parseInt(hours, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return { hour: hour12.toString().padStart(2, '0'), minute: minutes || '00', ampm };
};

// Custom 12-hour time picker component
const TimePicker12Hour = ({
  value,
  onChange,
  className = ''
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) => {
  const { hour, minute, ampm } = parseTime(value);

  const handleChange = (newHour: string, newMinute: string, newAmpm: string) => {
    onChange(convertTo24Hour(newHour, newMinute, newAmpm));
  };

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <select
        value={hour}
        onChange={(e) => handleChange(e.target.value, minute, ampm)}
        className="form-input w-14 text-center px-1 text-sm"
      >
        {Array.from({ length: 12 }, (_, i) => {
          const h = (i + 1).toString().padStart(2, '0');
          return <option key={h} value={h}>{h}</option>;
        })}
      </select>
      <span className="text-gray-500">:</span>
      <select
        value={minute}
        onChange={(e) => handleChange(hour, e.target.value, ampm)}
        className="form-input w-14 text-center px-1 text-sm"
      >
        {Array.from({ length: 60 }, (_, i) => {
          const m = i.toString().padStart(2, '0');
          return <option key={m} value={m}>{m}</option>;
        })}
      </select>
      <select
        value={ampm}
        onChange={(e) => handleChange(hour, minute, e.target.value)}
        className="form-input w-14 text-center px-1 text-sm"
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
};

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
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Employee Scheduling</h1>
          <p style={{ color: 'var(--text-muted)' }}>Manage working days and call times for each employee</p>
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
        <div
          className="p-4 rounded-xl font-medium"
          style={{
            background: message.type === 'success'
              ? 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)'
              : 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
            border: message.type === 'success' ? '2px solid #6ee7b7' : '2px solid #f87171',
            color: message.type === 'success' ? '#065f46' : '#991b1b',
          }}
        >
          {message.text}
          <button
            onClick={() => setMessage(null)}
            className="ml-4 text-sm underline font-bold"
          >
            Dismiss
          </button>
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
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
            <p className="mt-2" style={{ color: 'var(--text-muted)' }}>Loading...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedEmployeeIds.size === filteredEmployees.length && filteredEmployees.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-2"
                      style={{ borderColor: 'var(--border)' }}
                    />
                  </th>
                  <th className="px-4 py-3 text-left">Employee</th>
                  <th className="px-4 py-3 text-center">Call Time</th>
                  <th className="px-4 py-3 text-center">Time Out</th>
                  <th className="px-4 py-3 text-center">Buffer</th>
                  <th className="px-4 py-3 text-center">Flexible</th>
                  {DAYS.map(day => (
                    <th key={day.key} className="px-2 py-3 text-center">{day.short}</th>
                  ))}
                  <th className="px-4 py-3 text-center">Days/Wk</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((emp) => (
                  <tr
                    key={emp.id}
                    style={{
                      background: editingEmployee?.id === emp.id
                        ? 'linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)'
                        : undefined
                    }}
                  >
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
                        className="rounded border-2"
                        style={{ borderColor: 'var(--border)' }}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold" style={{ color: 'var(--text-primary)' }}>{emp.first_name} {emp.last_name}</div>
                      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{emp.employee_no}</div>
                    </td>
                    {editingEmployee?.id === emp.id ? (
                      <>
                        <td className="px-4 py-3 text-center">
                          <TimePicker12Hour
                            value={editingEmployee.call_time || '08:00'}
                            onChange={(value) => setEditingEmployee({ ...editingEmployee, call_time: value })}
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <TimePicker12Hour
                            value={editingEmployee.time_out || '17:00'}
                            onChange={(value) => setEditingEmployee({ ...editingEmployee, time_out: value })}
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
                            className="rounded border-2"
                            style={{ borderColor: 'var(--border)' }}
                          />
                        </td>
                        {DAYS.map(day => (
                          <td key={day.key} className="px-2 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={(editingEmployee as any)[day.key] || false}
                              onChange={(e) => setEditingEmployee({ ...editingEmployee, [day.key]: e.target.checked })}
                              className="rounded border-2"
                              style={{ borderColor: 'var(--border)' }}
                            />
                          </td>
                        ))}
                        <td className="px-4 py-3 text-center font-bold" style={{ color: 'var(--text-primary)' }}>
                          {countWorkDays(editingEmployee)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex gap-2 justify-center">
                            <button
                              onClick={() => handleSaveSchedule(editingEmployee)}
                              disabled={saving === emp.id}
                              className="text-sm font-bold px-3 py-1 rounded-lg"
                              style={{ background: '#d1fae5', color: '#065f46', border: '2px solid #6ee7b7' }}
                            >
                              {saving === emp.id ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              onClick={() => setEditingEmployee(null)}
                              className="text-sm font-medium px-3 py-1 rounded-lg"
                              style={{ background: 'var(--bg-accent)', color: 'var(--text-secondary)', border: '2px solid var(--border)' }}
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-center text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{formatTime12Hour(emp.call_time || '08:00')}</td>
                        <td className="px-4 py-3 text-center text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{formatTime12Hour(emp.time_out || '17:00')}</td>
                        <td className="px-4 py-3 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>{emp.buffer_minutes ?? 10}m</td>
                        <td className="px-4 py-3 text-center">
                          {emp.is_flexible ? (
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-bold"
                              style={{ background: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)', color: '#15803d', border: '2px solid #86efac' }}
                            >
                              Flex
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>-</span>
                          )}
                        </td>
                        {DAYS.map(day => (
                          <td key={day.key} className="px-2 py-3 text-center">
                            {(emp as any)[day.key] ? (
                              <span className="font-bold" style={{ color: '#059669' }}>✓</span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>-</span>
                            )}
                          </td>
                        ))}
                        <td className="px-4 py-3 text-center font-bold" style={{ color: 'var(--text-primary)' }}>{countWorkDays(emp)}</td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => setEditingEmployee({ ...emp })}
                            className="text-sm font-bold"
                            style={{ color: 'var(--primary)' }}
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
          </div>
        )}
      </div>

      {/* Bulk Update Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0, 0, 0, 0.5)' }}>
          <div
            className="w-full max-w-md rounded-2xl p-6"
            style={{
              background: 'var(--bg-card)',
              border: '2px solid var(--border)',
              boxShadow: 'var(--shadow-xl)',
            }}
          >
            <h2 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Bulk Update Schedule</h2>
            <p className="mb-4" style={{ color: 'var(--text-muted)' }}>Update schedule for {selectedEmployeeIds.size} selected employees</p>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Call Time</label>
                  <TimePicker12Hour
                    value={bulkSchedule.call_time}
                    onChange={(value) => setBulkSchedule({ ...bulkSchedule, call_time: value })}
                  />
                </div>
                <div>
                  <label className="form-label">Time Out</label>
                  <TimePicker12Hour
                    value={bulkSchedule.time_out}
                    onChange={(value) => setBulkSchedule({ ...bulkSchedule, time_out: value })}
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
                        className="rounded border-2"
                        style={{ borderColor: 'var(--border)' }}
                      />
                      <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{day.short}</span>
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
