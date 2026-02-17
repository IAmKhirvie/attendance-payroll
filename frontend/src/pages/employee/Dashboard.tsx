import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { attendanceApi } from '../../api/client';
import dayjs from 'dayjs';

export function EmployeeDashboard() {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [attendanceSummary, setAttendanceSummary] = useState<{
    total_days: number;
    present_days: number;
    absent_days: number;
    late_count: number;
  } | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      if (user?.employee_id) {
        const currentMonth = dayjs().month() + 1;
        const currentYear = dayjs().year();

        const summary = await attendanceApi.getSummary(
          user.employee_id,
          currentMonth,
          currentYear
        );
        setAttendanceSummary(summary);
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome, {user?.first_name}!
        </h1>
        <p className="text-gray-600">Employee Dashboard</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      ) : (
        <>
          {/* Profile Summary */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Profile Summary</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-sm text-gray-500">Name</span>
                <p className="font-medium">{user?.first_name} {user?.last_name}</p>
              </div>
              <div>
                <span className="text-sm text-gray-500">Email</span>
                <p className="font-medium">{user?.email}</p>
              </div>
              <div>
                <span className="text-sm text-gray-500">Status</span>
                <p className="font-medium capitalize">{user?.status}</p>
              </div>
              <div>
                <span className="text-sm text-gray-500">Employee ID</span>
                <p className="font-medium">{user?.employee_id || 'Not assigned'}</p>
              </div>
            </div>
          </div>

          {/* Attendance Summary for Current Month */}
          {attendanceSummary ? (
            <div className="card">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-gray-900">
                  Attendance - {dayjs().format('MMMM YYYY')}
                </h2>
                <Link to="/employee/attendance" className="text-primary-600 hover:text-primary-500 text-sm">
                  View Details
                </Link>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <p className="text-2xl font-bold text-blue-600">{attendanceSummary.total_days}</p>
                  <p className="text-sm text-gray-600">Working Days</p>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <p className="text-2xl font-bold text-green-600">{attendanceSummary.present_days}</p>
                  <p className="text-sm text-gray-600">Present</p>
                </div>
                <div className="text-center p-4 bg-red-50 rounded-lg">
                  <p className="text-2xl font-bold text-red-600">{attendanceSummary.absent_days}</p>
                  <p className="text-sm text-gray-600">Absent</p>
                </div>
                <div className="text-center p-4 bg-yellow-50 rounded-lg">
                  <p className="text-2xl font-bold text-yellow-600">{attendanceSummary.late_count}</p>
                  <p className="text-sm text-gray-600">Late</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="card">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Attendance</h2>
              <p className="text-gray-500">
                {user?.employee_id
                  ? 'No attendance records for this month.'
                  : 'Your account is not yet linked to an employee record. Please contact HR.'}
              </p>
            </div>
          )}

          {/* Quick Links */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Links</h2>
            <div className="grid grid-cols-2 gap-4">
              <Link to="/employee/attendance" className="btn-secondary text-center">
                View Attendance
              </Link>
              <Link to="/employee/payslips" className="btn-secondary text-center">
                View Payslips
              </Link>
            </div>
          </div>

          {/* Notice */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-medium text-blue-800">Information</h3>
            <p className="text-sm text-blue-700 mt-1">
              For any concerns about your attendance or payroll, please contact the HR department.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
