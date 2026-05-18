import { useState, useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { attendanceApi } from '../../api/client';
import type { AttendanceRecord } from '../../types';
import dayjs from 'dayjs';

export function EmployeeAttendancePage() {
  const { user } = useAuthStore();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(dayjs().format('YYYY-MM'));

  useEffect(() => {
    if (user?.employee_id) {
      loadAttendance();
    } else {
      setLoading(false);
    }
  }, [selectedMonth, user?.employee_id]);

  const loadAttendance = async () => {
    if (!user?.employee_id) return;

    setLoading(true);
    try {
      const startDate = dayjs(selectedMonth).startOf('month').format('YYYY-MM-DD');
      const endDate = dayjs(selectedMonth).endOf('month').format('YYYY-MM-DD');

      const response = await attendanceApi.list({
        employee_id: user.employee_id,
        date_from: startDate,
        date_to: endDate,
      });
      setRecords(response.items);
    } catch (error) {
      console.error('Failed to load attendance:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      present: 'bg-green-100 text-green-800',
      absent: 'bg-red-100 text-red-800',
      late: 'bg-yellow-100 text-yellow-800',
      half_day: 'bg-orange-100 text-orange-800',
      leave: 'bg-blue-100 text-blue-800',
      holiday: 'bg-purple-100 text-purple-800',
    };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded ${colors[status] || 'bg-gray-100'}`}>
        {status.replace('_', ' ')}
      </span>
    );
  };

  if (!user?.employee_id) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">My Attendance</h1>
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
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">My Attendance</h1>
        <input
          type="month"
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="form-input w-auto"
        />
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : records.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No attendance records for {dayjs(selectedMonth).format('MMMM YYYY')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Time In
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Time Out
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Late/OT
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {records.map((record) => (
                  <tr key={record.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      {dayjs(record.date).format('ddd, MMM D')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {record.time_in || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {record.time_out || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(record.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {record.late_minutes ? (
                        <span className="text-red-600">Late: {record.late_minutes}m</span>
                      ) : null}
                      {record.overtime_minutes ? (
                        <span className="text-green-600 ml-2">OT: {record.overtime_minutes}m</span>
                      ) : null}
                      {!record.late_minutes && !record.overtime_minutes ? '-' : null}
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
