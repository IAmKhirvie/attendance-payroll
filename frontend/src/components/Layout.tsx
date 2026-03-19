import { useState } from 'react';
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useImportStore } from '../stores/importStore';

// Icons (using simple SVG)
const MenuIcon = () => (
  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

const XIcon = () => (
  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const HomeIcon = () => (
  <svg className="h-5 w-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  </svg>
);

const UsersIcon = () => (
  <svg className="h-5 w-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
);

const ClockIcon = () => (
  <svg className="h-5 w-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const CurrencyIcon = () => (
  <svg className="h-5 w-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const LogoutIcon = () => (
  <svg className="h-5 w-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
  </svg>
);

const CalendarIcon = () => (
  <svg className="h-5 w-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

const BanknotesIcon = () => (
  <svg className="h-5 w-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
  </svg>
);

const LeaveIcon = () => (
  <svg className="h-5 w-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
  </svg>
);

const ReportsIcon = () => (
  <svg className="h-5 w-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const ScheduleIcon = () => (
  <svg className="h-5 w-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 12v4m0 0l-2-2m2 2l2-2" />
  </svg>
);

const SettingsIcon = () => (
  <svg className="h-5 w-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType;
}

const adminNavItems: NavItem[] = [
  { name: 'Dashboard', href: '/admin', icon: HomeIcon },
  { name: 'Attendance', href: '/admin/attendance', icon: ClockIcon },
  { name: 'Payroll', href: '/admin/payroll', icon: CurrencyIcon },
  { name: 'Employees', href: '/admin/employees', icon: UsersIcon },
  { name: 'Scheduling', href: '/admin/scheduling', icon: ScheduleIcon },
  { name: 'Leave', href: '/admin/leave', icon: LeaveIcon },
  { name: 'Loans', href: '/admin/loans', icon: BanknotesIcon },
  { name: 'Holidays', href: '/admin/holidays', icon: CalendarIcon },
  { name: 'Reports', href: '/admin/reports', icon: ReportsIcon },
  { name: 'Settings', href: '/admin/settings', icon: SettingsIcon },
];

const employeeNavItems: NavItem[] = [
  { name: 'Dashboard', href: '/employee', icon: HomeIcon },
  { name: 'My Attendance', href: '/employee/attendance', icon: ClockIcon },
  { name: 'My Payslips', href: '/employee/payslips', icon: CurrencyIcon },
  { name: 'My Leave', href: '/employee/leave', icon: LeaveIcon },
];

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout } = useAuthStore();
  const { isUploading, uploadProgress, importResult } = useImportStore();
  const location = useLocation();
  const navigate = useNavigate();

  const navItems = user?.role === 'admin' ? adminNavItems : employeeNavItems;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 lg:hidden modal-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Maximalist Light Design */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-72 transform transition-all duration-300 ease-in-out lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{
          background: 'linear-gradient(180deg, #ffffff 0%, #faf9f6 100%)',
          borderRight: '2px solid var(--border)',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        <div className="flex flex-col h-screen overflow-hidden">
          {/* Logo/Brand - Premium Header */}
          <div
            className="flex items-center justify-between px-6 py-5"
            style={{
              background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #a855f7 100%)',
            }}
          >
            <div className="flex items-center gap-4">
              <div
                className="h-12 w-12 rounded-xl flex items-center justify-center shadow-lg"
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  backdropFilter: 'blur(10px)',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                }}
              >
                <img src="/logo.png" alt="ICAN" className="h-8 w-8 object-contain" />
              </div>
              <div>
                <span className="text-xl font-bold text-white tracking-tight">ICAN</span>
                <p className="text-xs text-white/80 font-medium">Attendance & Payroll</p>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            >
              <XIcon />
            </button>
          </div>

          {/* Decorative divider */}
          <div className="h-1" style={{ background: 'linear-gradient(90deg, #4f46e5, #a855f7, #4f46e5)' }}></div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
            <p className="px-4 text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">
              Navigation
            </p>
            {navItems.map((item) => {
              const isActive = location.pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={`sidebar-link ${isActive ? 'active' : ''}`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <Icon />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/* User info and logout - Premium footer */}
          <div
            className="p-5"
            style={{
              borderTop: '2px solid var(--border)',
              background: 'linear-gradient(180deg, #faf9f6 0%, #f0efe9 100%)',
            }}
          >
            <div className="flex items-center mb-4">
              <div className="avatar-ring">
                <div
                  className="w-11 h-11 rounded-full flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' }}
                >
                  <span className="text-white font-bold text-sm">
                    {user?.first_name?.charAt(0)}{user?.last_name?.charAt(0)}
                  </span>
                </div>
              </div>
              <div className="ml-3">
                <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                  {user?.first_name} {user?.last_name}
                </p>
                <p
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--primary)' }}
                >
                  {user?.role}
                </p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center px-4 py-3 rounded-xl font-semibold transition-all duration-300"
              style={{
                background: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
                color: '#991b1b',
                border: '2px solid #f87171',
              }}
            >
              <LogoutIcon />
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* Main content - offset for fixed sidebar on desktop */}
      <div className="flex-1 flex flex-col min-h-screen lg:ml-72">
        {/* Top bar - Maximalist Header */}
        <header
          className="h-20 flex items-center justify-between px-6 lg:px-10 sticky top-0 z-10"
          style={{
            background: 'linear-gradient(180deg, #ffffff 0%, #faf9f6 100%)',
            borderBottom: '2px solid var(--border)',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          <div className="flex items-center">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-3 rounded-xl transition-all duration-300"
              style={{
                background: 'var(--bg-accent)',
                border: '2px solid var(--border)',
                color: 'var(--text-primary)',
              }}
            >
              <MenuIcon />
            </button>
            <div className="ml-4 lg:ml-0">
              <h1
                className="text-2xl font-bold"
                style={{ color: 'var(--text-primary)' }}
              >
                {navItems.find((item) => item.href === location.pathname)?.name || 'Dashboard'}
              </h1>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Welcome back, {user?.first_name}
              </p>
            </div>
          </div>

          {/* Global Import Progress Indicator */}
          {isUploading && (
            <Link
              to="/admin/attendance"
              className="flex items-center gap-3 px-5 py-3 rounded-xl text-sm font-bold text-white transition-all uppercase tracking-wide"
              style={{
                background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                boxShadow: 'var(--shadow-md), 0 4px 20px rgba(79, 70, 229, 0.3)',
              }}
            >
              <div className="animate-spin rounded-full h-5 w-5 border-3 border-white border-t-transparent"></div>
              <span>{uploadProgress || 'Importing...'}</span>
            </Link>
          )}

          {/* Import Complete Notification */}
          {!isUploading && importResult && location.pathname !== '/admin/attendance' && (
            <Link
              to="/admin/attendance"
              className="flex items-center gap-3 px-5 py-3 rounded-xl text-sm font-bold text-white transition-all uppercase tracking-wide"
              style={{
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                boxShadow: 'var(--shadow-md), 0 4px 20px rgba(16, 185, 129, 0.3)',
              }}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
              <span>Import complete - {importResult.summary.imported} records</span>
            </Link>
          )}
        </header>

        {/* Page content */}
        <main className="flex-1 p-6 lg:p-10">
          <Outlet />
        </main>

        {/* Footer */}
        <footer
          className="py-4 px-6 text-center"
          style={{
            borderTop: '1px solid var(--border)',
            background: 'var(--bg-accent)',
          }}
        >
          <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
            ICAN Language Center - Attendance & Payroll System
          </p>
        </footer>
      </div>
    </div>
  );
}
