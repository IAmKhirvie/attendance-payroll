import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { usersApi, employeesApi } from '../../api/client';

interface DashboardStats {
  totalEmployees: number;
  pendingUsers: number;
  activeUsers: number;
}

export function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalEmployees: 0,
    pendingUsers: 0,
    activeUsers: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const [usersData, employeesData] = await Promise.all([
        usersApi.list({ page: 1 }),
        employeesApi.list({ page: 1 }),
      ]);

      setStats({
        totalEmployees: employeesData.total,
        pendingUsers: usersData.items.filter(u => u.status === 'pending').length,
        activeUsers: usersData.items.filter(u => u.status === 'active').length,
      });
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const StatCard = ({ title, value, link, color }: {
    title: string;
    value: number | string;
    link: string;
    color: string;
  }) => (
    <Link to={link} className="card hover:shadow-lg transition-shadow">
      <div className="flex items-center">
        <div className={`w-12 h-12 rounded-lg ${color} flex items-center justify-center`}>
          <span className="text-2xl font-bold text-white">{value}</span>
        </div>
        <div className="ml-4">
          <h3 className="text-sm font-medium text-gray-500">{title}</h3>
          <p className="text-lg font-semibold text-gray-900">View All</p>
        </div>
      </div>
    </Link>
  );

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-6 lg:p-8 text-white">
        <div className="relative z-10">
          <h1 className="text-2xl lg:text-3xl font-bold mb-2">Welcome to ICAN A&P System</h1>
          <p className="text-blue-100 max-w-xl">
            Manage employee attendance, process payroll, and generate reports all in one place.
          </p>
        </div>
        {/* Decorative elements */}
        <div className="absolute right-0 top-0 -mt-4 -mr-4 opacity-20">
          <svg width="200" height="200" viewBox="0 0 200 200" fill="currentColor">
            <circle cx="100" cy="100" r="80" />
            <circle cx="160" cy="40" r="40" />
            <circle cx="40" cy="160" r="30" />
          </svg>
        </div>
        <div className="absolute -right-10 -bottom-10 opacity-10">
          <svg width="180" height="180" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      ) : (
        <>
          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatCard
              title="Total Employees"
              value={stats.totalEmployees}
              link="/admin/employees"
              color="bg-blue-500"
            />
            <StatCard
              title="Pending Approvals"
              value={stats.pendingUsers}
              link="/admin/users?status=pending"
              color="bg-yellow-500"
            />
            <StatCard
              title="Active Users"
              value={stats.activeUsers}
              link="/admin/users"
              color="bg-green-500"
            />
          </div>

          {/* Quick Actions */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Link to="/admin/users" className="btn-secondary text-center">
                Manage Users
              </Link>
              <Link to="/admin/employees" className="btn-secondary text-center">
                Manage Employees
              </Link>
              <Link to="/admin/attendance" className="btn-secondary text-center">
                Import Attendance
              </Link>
              <Link to="/admin/payroll" className="btn-secondary text-center">
                Process Payroll
              </Link>
            </div>
          </div>

          {/* Recent Activity Placeholder */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">System Status</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b">
                <span className="text-gray-600">Server Status</span>
                <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded">
                  Online (localhost)
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b">
                <span className="text-gray-600">Database</span>
                <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded">
                  Connected
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-gray-600">Current Payroll Period</span>
                <span className="text-gray-900 font-medium">Not Set</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
