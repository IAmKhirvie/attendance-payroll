import { useState, useEffect } from 'react';
import { settingsApi, backupsApi, authApi } from '../../api/client';
import api from '../../api/client';
import type { SystemSettings } from '../../types';

interface BackupInfo {
  filename: string;
  size: number;
  size_mb: number;
  created_at: string;
  compressed: boolean;
}

interface BackupStatus {
  backup_directory: string;
  database_path: string;
  total_backups: number;
  total_size_mb: number;
  latest_backup: BackupInfo | null;
  retention_days: number;
}

interface SessionItem {
  id: number;
  user_id: number | null;
  user_email: string | null;
  action: string;
  details: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

interface AuditLogItem {
  id: number;
  user_id: number | null;
  user_email: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  old_value: Record<string, any> | null;
  new_value: Record<string, any> | null;
  reason: string | null;
  extra_data: Record<string, any> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export function SettingsPage() {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Backup state
  const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [backupLoading, setBackupLoading] = useState(true);
  const [backupAction, setBackupAction] = useState<string | null>(null);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  // Change Password state
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [changingPassword, setChangingPassword] = useState(false);

  // Sessions state
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsPage, setSessionsPage] = useState(1);
  const [sessionsTotal, setSessionsTotal] = useState(0);

  // Audit Log state
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditFilter, setAuditFilter] = useState('');

  // Notion Sync state
  const [notionApiKey, setNotionApiKey] = useState('');
  const [notionSyncing, setNotionSyncing] = useState(false);
  const [notionPreview, setNotionPreview] = useState<any>(null);
  const [notionResult, setNotionResult] = useState<any>(null);
  const [showNotionApiKey, setShowNotionApiKey] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    const loadInitialData = async () => {
      // Load settings
      try {
        const data = await settingsApi.get();
        if (!controller.signal.aborted) {
          setSettings(data);
        }
      } catch (error: any) {
        if (error.name !== 'CanceledError' && error.code !== 'ERR_CANCELED') {
          console.error('Failed to load settings:', error);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }

      // Load backups
      try {
        const [statusData, listData] = await Promise.all([
          backupsApi.getStatus(),
          backupsApi.list()
        ]);
        if (!controller.signal.aborted) {
          setBackupStatus(statusData);
          setBackups(listData.backups);
        }
      } catch (error: any) {
        if (error.name !== 'CanceledError' && error.code !== 'ERR_CANCELED') {
          console.error('Failed to load backups:', error);
        }
      } finally {
        if (!controller.signal.aborted) {
          setBackupLoading(false);
        }
      }
    };

    loadInitialData();

    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    const fetchSessions = async () => {
      setSessionsLoading(true);
      try {
        const response = await api.get('/settings/sessions', {
          params: { page: sessionsPage, page_size: 10 },
          signal: controller.signal
        });
        if (!controller.signal.aborted) {
          setSessions(response.data.items);
          setSessionsTotal(response.data.total);
        }
      } catch (error: any) {
        if (error.name !== 'CanceledError' && error.code !== 'ERR_CANCELED') {
          console.error('Failed to load sessions:', error);
        }
      } finally {
        if (!controller.signal.aborted) {
          setSessionsLoading(false);
        }
      }
    };

    fetchSessions();

    return () => {
      controller.abort();
    };
  }, [sessionsPage]);

  useEffect(() => {
    const controller = new AbortController();

    const fetchAuditLogs = async () => {
      setAuditLoading(true);
      try {
        const response = await api.get('/settings/audit-logs', {
          params: {
            page: auditPage,
            page_size: 20,
            action: auditFilter || undefined
          },
          signal: controller.signal
        });
        if (!controller.signal.aborted) {
          setAuditLogs(response.data.items);
          setAuditTotal(response.data.total);
        }
      } catch (error: any) {
        if (error.name !== 'CanceledError' && error.code !== 'ERR_CANCELED') {
          console.error('Failed to load audit logs:', error);
        }
      } finally {
        if (!controller.signal.aborted) {
          setAuditLoading(false);
        }
      }
    };

    fetchAuditLogs();

    return () => {
      controller.abort();
    };
  }, [auditPage, auditFilter]);

  const loadBackups = async () => {
    try {
      const [statusData, listData] = await Promise.all([
        backupsApi.getStatus(),
        backupsApi.list()
      ]);
      setBackupStatus(statusData);
      setBackups(listData.backups);
    } catch (error: any) {
      if (error.name !== 'CanceledError' && error.code !== 'ERR_CANCELED') {
        console.error('Failed to load backups:', error);
      }
    } finally {
      setBackupLoading(false);
    }
  };

  const loadAuditLogs = async () => {
    setAuditLoading(true);
    try {
      const response = await api.get('/settings/audit-logs', {
        params: {
          page: auditPage,
          page_size: 20,
          action: auditFilter || undefined
        }
      });
      setAuditLogs(response.data.items);
      setAuditTotal(response.data.total);
    } catch (error: any) {
      if (error.name !== 'CanceledError' && error.code !== 'ERR_CANCELED') {
        console.error('Failed to load audit logs:', error);
      }
    } finally {
      setAuditLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setMessage({ type: 'error', text: 'New passwords do not match' });
      return;
    }

    if (passwordData.newPassword.length < (settings?.password_min_length || 8)) {
      setMessage({ type: 'error', text: `Password must be at least ${settings?.password_min_length || 8} characters` });
      return;
    }

    setChangingPassword(true);
    try {
      await authApi.changePassword(passwordData.currentPassword, passwordData.newPassword);
      setMessage({ type: 'success', text: 'Password changed successfully' });
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || 'Failed to change password';
      setMessage({ type: 'error', text: errorMessage });
    } finally {
      setChangingPassword(false);
    }
  };

  const handleCreateBackup = async () => {
    setBackupAction('creating');
    try {
      await backupsApi.create(true);
      setMessage({ type: 'success', text: 'Backup created successfully' });
      loadBackups();
    } catch (error) {
      console.error('Failed to create backup:', error);
      setMessage({ type: 'error', text: 'Failed to create backup' });
    } finally {
      setBackupAction(null);
    }
  };

  const handleRestoreBackup = async (filename: string) => {
    setBackupAction('restoring');
    setShowRestoreConfirm(null);
    try {
      await backupsApi.restore(filename);
      setMessage({ type: 'success', text: `Database restored from ${filename}. Please refresh the page.` });
    } catch (error) {
      console.error('Failed to restore backup:', error);
      setMessage({ type: 'error', text: 'Failed to restore backup' });
    } finally {
      setBackupAction(null);
    }
  };

  const handleDeleteBackup = async (filename: string) => {
    setBackupAction('deleting');
    setShowDeleteConfirm(null);
    try {
      await backupsApi.delete(filename);
      setMessage({ type: 'success', text: `Backup ${filename} deleted` });
      loadBackups();
    } catch (error) {
      console.error('Failed to delete backup:', error);
      setMessage({ type: 'error', text: 'Failed to delete backup' });
    } finally {
      setBackupAction(null);
    }
  };

  const handleCleanup = async () => {
    setBackupAction('cleanup');
    try {
      const result = await backupsApi.cleanup(30);
      setMessage({ type: 'success', text: `Cleaned up ${result.deleted_count} old backups` });
      loadBackups();
    } catch (error) {
      console.error('Failed to cleanup backups:', error);
      setMessage({ type: 'error', text: 'Failed to cleanup backups' });
    } finally {
      setBackupAction(null);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;

    setSaving(true);
    setMessage(null);
    try {
      await settingsApi.updateCompany({
        company_name: settings.company_name,
        company_address: settings.company_address,
      });
      setMessage({ type: 'success', text: 'Company settings saved' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save company settings' });
    } finally {
      setSaving(false);
    }
  };

  const handleSavePasswordPolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;

    setSaving(true);
    setMessage(null);
    try {
      await settingsApi.updatePasswordPolicy({
        password_min_length: settings.password_min_length,
        password_require_uppercase: settings.password_require_uppercase,
        password_require_numbers: settings.password_require_numbers,
        password_require_special: settings.password_require_special,
        password_expiry_days: settings.password_expiry_days,
        max_failed_login_attempts: settings.max_failed_login_attempts,
        lockout_duration_minutes: settings.lockout_duration_minutes,
      });
      setMessage({ type: 'success', text: 'Password policy saved' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save password policy' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;

    setSaving(true);
    setMessage(null);
    try {
      await settingsApi.updateRegistration({
        allow_self_registration: settings.allow_self_registration,
        require_approval_for_registration: settings.require_approval_for_registration,
      });
      setMessage({ type: 'success', text: 'Registration settings saved' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save registration settings' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="text-center py-12 text-gray-500">
        Failed to load settings
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">System Settings</h1>

      {message && (
        <div
          className={`p-3 rounded-md ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700'
              : 'bg-red-50 text-red-700'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Company Settings */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Company Information</h2>
        <form onSubmit={handleSaveCompany} className="space-y-4">
          <div>
            <label className="form-label">Company Name</label>
            <input
              type="text"
              value={settings.company_name}
              onChange={(e) => setSettings({ ...settings, company_name: e.target.value })}
              className="form-input max-w-md"
            />
          </div>
          <div>
            <label className="form-label">Company Address</label>
            <textarea
              value={settings.company_address || ''}
              onChange={(e) => setSettings({ ...settings, company_address: e.target.value })}
              className="form-input max-w-md"
              rows={3}
            />
          </div>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Saving...' : 'Save Company Settings'}
          </button>
        </form>
      </div>

      {/* Password Policy */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Password Policy</h2>
        <form onSubmit={handleSavePasswordPolicy} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="form-label">Minimum Length</label>
              <input
                type="number"
                min="6"
                max="32"
                value={settings.password_min_length}
                onChange={(e) => setSettings({ ...settings, password_min_length: parseInt(e.target.value) })}
                className="form-input"
              />
            </div>
            <div>
              <label className="form-label">Password Expiry (days, 0 = never)</label>
              <input
                type="number"
                min="0"
                value={settings.password_expiry_days}
                onChange={(e) => setSettings({ ...settings, password_expiry_days: parseInt(e.target.value) })}
                className="form-input"
              />
            </div>
            <div>
              <label className="form-label">Max Failed Login Attempts</label>
              <input
                type="number"
                min="1"
                value={settings.max_failed_login_attempts}
                onChange={(e) => setSettings({ ...settings, max_failed_login_attempts: parseInt(e.target.value) })}
                className="form-input"
              />
            </div>
            <div>
              <label className="form-label">Lockout Duration (minutes)</label>
              <input
                type="number"
                min="1"
                value={settings.lockout_duration_minutes}
                onChange={(e) => setSettings({ ...settings, lockout_duration_minutes: parseInt(e.target.value) })}
                className="form-input"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={settings.password_require_uppercase}
                onChange={(e) => setSettings({ ...settings, password_require_uppercase: e.target.checked })}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="ml-2 text-gray-700">Require uppercase letter</span>
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={settings.password_require_numbers}
                onChange={(e) => setSettings({ ...settings, password_require_numbers: e.target.checked })}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="ml-2 text-gray-700">Require number</span>
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={settings.password_require_special}
                onChange={(e) => setSettings({ ...settings, password_require_special: e.target.checked })}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="ml-2 text-gray-700">Require special character</span>
            </label>
          </div>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Saving...' : 'Save Password Policy'}
          </button>
        </form>
      </div>

      {/* Registration Settings */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Registration Settings</h2>
        <form onSubmit={handleSaveRegistration} className="space-y-4">
          <div className="space-y-2">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={settings.allow_self_registration}
                onChange={(e) => setSettings({ ...settings, allow_self_registration: e.target.checked })}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="ml-2 text-gray-700">Allow self-registration</span>
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={settings.require_approval_for_registration}
                onChange={(e) => setSettings({ ...settings, require_approval_for_registration: e.target.checked })}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="ml-2 text-gray-700">Require HR approval for new registrations</span>
            </label>
          </div>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Saving...' : 'Save Registration Settings'}
          </button>
        </form>
      </div>

      {/* Change Password */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Change Password</h2>
        <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
          <div>
            <label className="form-label">Current Password</label>
            <input
              type="password"
              value={passwordData.currentPassword}
              onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
              className="form-input"
              required
            />
          </div>
          <div>
            <label className="form-label">New Password</label>
            <input
              type="password"
              value={passwordData.newPassword}
              onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
              className="form-input"
              required
              minLength={settings?.password_min_length || 8}
            />
            <p className="text-xs text-gray-500 mt-1">
              Minimum {settings?.password_min_length || 8} characters
              {settings?.password_require_uppercase && ', 1 uppercase'}
              {settings?.password_require_numbers && ', 1 number'}
              {settings?.password_require_special && ', 1 special character'}
            </p>
          </div>
          <div>
            <label className="form-label">Confirm New Password</label>
            <input
              type="password"
              value={passwordData.confirmPassword}
              onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
              className="form-input"
              required
            />
          </div>
          <button type="submit" disabled={changingPassword} className="btn-primary">
            {changingPassword ? 'Changing...' : 'Change Password'}
          </button>
        </form>
      </div>

      {/* Session Tracker */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Login Sessions</h2>
        <p className="text-sm text-gray-500 mb-4">Recent login activity for all users</p>

        {sessionsLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : (
          <>
            <div className="border rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Action</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">IP Address</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {sessions.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                        No login sessions recorded
                      </td>
                    </tr>
                  ) : (
                    sessions.map((session) => (
                      <tr key={session.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm">
                          {session.user_email || `User #${session.user_id}` || 'Unknown'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs px-2 py-1 rounded font-medium ${
                            session.action === 'LOGIN' ? 'bg-green-100 text-green-700' :
                            session.action === 'LOGOUT' ? 'bg-gray-100 text-gray-700' :
                            session.action === 'LOGIN_FAILED' ? 'bg-red-100 text-red-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>
                            {session.action}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                          {session.ip_address || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {formatDate(session.created_at)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {sessionsTotal > 10 && (
              <div className="flex justify-between items-center mt-4">
                <p className="text-sm text-gray-500">
                  Showing {(sessionsPage - 1) * 10 + 1} - {Math.min(sessionsPage * 10, sessionsTotal)} of {sessionsTotal}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSessionsPage(p => Math.max(1, p - 1))}
                    disabled={sessionsPage === 1}
                    className="btn-secondary text-sm"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setSessionsPage(p => p + 1)}
                    disabled={sessionsPage * 10 >= sessionsTotal}
                    className="btn-secondary text-sm"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Audit Log */}
      <div className="card">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Activity Log</h2>
            <p className="text-sm text-gray-500">Track all system activities and changes (cannot be deleted)</p>
          </div>
          <div className="flex gap-2">
            <select
              value={auditFilter}
              onChange={(e) => { setAuditFilter(e.target.value); setAuditPage(1); }}
              className="form-input w-48"
            >
              <option value="">All Activities</option>
              <option value="LOGIN">Login</option>
              <option value="LOGOUT">Logout</option>
              <option value="LOGIN_FAILED">Login Failed</option>
              <option value="PASSWORD_CHANGE">Password Change</option>
              <option value="EMPLOYEE_CREATE">Employee Create</option>
              <option value="EMPLOYEE_UPDATE">Employee Update</option>
              <option value="EMPLOYEE_DELETE">Employee Delete</option>
              <option value="PAYROLL_RUN">Payroll Run</option>
              <option value="PAYSLIP_EDIT">Payslip Edit</option>
              <option value="PAYSLIP_RESTORE">Payslip Restore</option>
              <option value="PAYSLIP_RELEASE">Payslip Release</option>
              <option value="ATTENDANCE_IMPORT">Attendance Import</option>
              <option value="ATTENDANCE_EDIT">Attendance Edit</option>
              <option value="LOAN_CREATE">Loan Create</option>
              <option value="LOAN_CANCEL">Loan Cancel</option>
              <option value="LEAVE_REQUEST">Leave Request</option>
              <option value="LEAVE_APPROVE">Leave Approve</option>
              <option value="SETTINGS_UPDATE">Settings Update</option>
              <option value="BACKUP_CREATE">Backup Create</option>
              <option value="BACKUP_RESTORE">Backup Restore</option>
            </select>
            <button
              onClick={() => {
                const params = new URLSearchParams();
                if (auditFilter) params.append('action', auditFilter);
                window.open(`/api/v1/settings/audit-logs/export?${params.toString()}`, '_blank');
              }}
              className="btn-secondary text-sm whitespace-nowrap"
            >
              Export CSV
            </button>
          </div>
        </div>

        {auditLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : (
          <>
            <div className="border rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Action</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">IP</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                        No activity logs found
                      </td>
                    </tr>
                  ) : (
                    auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                          {formatDate(log.created_at)}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {log.user_email || `User #${log.user_id}` || 'System'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs px-2 py-1 rounded font-medium ${
                            log.action.includes('LOGIN') && !log.action.includes('FAILED') ? 'bg-green-100 text-green-700' :
                            log.action.includes('FAILED') ? 'bg-red-100 text-red-700' :
                            log.action.includes('CREATE') ? 'bg-blue-100 text-blue-700' :
                            log.action.includes('UPDATE') ? 'bg-yellow-100 text-yellow-700' :
                            log.action.includes('DELETE') ? 'bg-red-100 text-red-700' :
                            log.action.includes('BACKUP') ? 'bg-green-100 text-green-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {log.action.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 max-w-md">
                          <div className="space-y-1">
                            {log.extra_data?.employee_name && (
                              <div className="font-medium text-gray-800">{log.extra_data.employee_name}</div>
                            )}
                            {log.resource_type && log.resource_id && (
                              <div className="text-xs text-gray-400">{log.resource_type} #{log.resource_id}</div>
                            )}
                            {log.old_value && log.new_value && Object.keys(log.new_value).length > 0 && (
                              <div className="text-xs">
                                {Object.keys(log.new_value).slice(0, 3).map(key => (
                                  <div key={key} className="flex gap-1">
                                    <span className="text-gray-500">{key.replace(/_/g, ' ')}:</span>
                                    <span className="text-red-500 line-through">{String(log.old_value?.[key] ?? '-')}</span>
                                    <span className="text-green-600">→ {String(log.new_value?.[key] ?? '-')}</span>
                                  </div>
                                ))}
                                {Object.keys(log.new_value).length > 3 && (
                                  <div className="text-gray-400">+{Object.keys(log.new_value).length - 3} more changes</div>
                                )}
                              </div>
                            )}
                            {log.reason && (
                              <div className="text-xs text-gray-500 italic">Reason: {log.reason}</div>
                            )}
                            {!log.old_value && !log.new_value && !log.extra_data && '-'}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                          {log.ip_address || '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {auditTotal > 20 && (
              <div className="flex justify-between items-center mt-4">
                <p className="text-sm text-gray-500">
                  Showing {(auditPage - 1) * 20 + 1} - {Math.min(auditPage * 20, auditTotal)} of {auditTotal}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setAuditPage(p => Math.max(1, p - 1))}
                    disabled={auditPage === 1}
                    className="btn-secondary text-sm"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setAuditPage(p => p + 1)}
                    disabled={auditPage * 20 >= auditTotal}
                    className="btn-secondary text-sm"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Notion Integration */}
      <div className="card">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Notion Integration</h2>
            <p className="text-sm text-gray-500">Sync employee data from Notion Teacher's Database (read-only)</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* API Key Input */}
          <div>
            <label className="form-label">Notion API Key</label>
            <div className="flex gap-2">
              <div className="relative flex-1 max-w-md">
                <input
                  type={showNotionApiKey ? "text" : "password"}
                  value={notionApiKey}
                  onChange={(e) => setNotionApiKey(e.target.value)}
                  placeholder="ntn_xxxxx or secret_xxxxx"
                  className="form-input pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNotionApiKey(!showNotionApiKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showNotionApiKey ? '🙈' : '👁️'}
                </button>
              </div>
              <button
                onClick={async () => {
                  if (!notionApiKey) {
                    setMessage({ type: 'error', text: 'Please enter Notion API key' });
                    return;
                  }
                  setNotionSyncing(true);
                  setNotionPreview(null);
                  setNotionResult(null);
                  try {
                    const response = await api.post('/notion/preview', { api_key: notionApiKey });
                    setNotionPreview(response.data);
                  } catch (error: any) {
                    setMessage({ type: 'error', text: error.response?.data?.detail || 'Failed to preview sync' });
                  } finally {
                    setNotionSyncing(false);
                  }
                }}
                disabled={notionSyncing || !notionApiKey}
                className="btn-secondary"
              >
                {notionSyncing ? 'Loading...' : 'Preview'}
              </button>
              <button
                onClick={async () => {
                  if (!notionApiKey) {
                    setMessage({ type: 'error', text: 'Please enter Notion API key' });
                    return;
                  }
                  if (!confirm('This will update employees in A&P based on Notion data. Continue?')) {
                    return;
                  }
                  setNotionSyncing(true);
                  setNotionResult(null);
                  try {
                    const response = await api.post('/notion/sync', { api_key: notionApiKey });
                    setNotionResult(response.data);
                    setMessage({ type: 'success', text: `Synced ${response.data.synced} employees from Notion` });
                    loadAuditLogs(); // Refresh audit log to show sync entries
                  } catch (error: any) {
                    setMessage({ type: 'error', text: error.response?.data?.detail || 'Failed to sync from Notion' });
                  } finally {
                    setNotionSyncing(false);
                  }
                }}
                disabled={notionSyncing || !notionApiKey}
                className="btn-primary"
              >
                {notionSyncing ? 'Syncing...' : 'Sync Now'}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Your API key is only used for this sync and is not stored.
            </p>
          </div>

          {/* Preview Results */}
          {notionPreview && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-800 mb-3">Sync Preview</h4>
              <div className="grid grid-cols-4 gap-4 mb-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-blue-600">{notionPreview.total_teachers}</p>
                  <p className="text-xs text-gray-500">Total in Notion</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">{notionPreview.would_sync}</p>
                  <p className="text-xs text-gray-500">Would Update</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-500">{notionPreview.would_skip}</p>
                  <p className="text-xs text-gray-500">No Changes</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-500">{notionPreview.not_found}</p>
                  <p className="text-xs text-gray-500">Not in A&P</p>
                </div>
              </div>

              {/* Preview details */}
              {notionPreview.teachers && notionPreview.teachers.length > 0 && (
                <div className="max-h-60 overflow-y-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-blue-100">
                      <tr>
                        <th className="px-2 py-1 text-left">Teacher</th>
                        <th className="px-2 py-1 text-left">Status</th>
                        <th className="px-2 py-1 text-left">Match</th>
                        <th className="px-2 py-1 text-left">Changes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-blue-100">
                      {notionPreview.teachers.slice(0, 20).map((t: any, i: number) => (
                        <tr key={i} className={t.matched_employee ? '' : 'bg-red-50'}>
                          <td className="px-2 py-1">
                            <div>{t.name}</div>
                            <div className="text-xs text-gray-400">{t.teacher_id}</div>
                          </td>
                          <td className="px-2 py-1">
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              t.status === 'Active' ? 'bg-green-100 text-green-700' :
                              t.status === 'Inactive' ? 'bg-red-100 text-red-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {t.status || '-'}
                            </span>
                          </td>
                          <td className="px-2 py-1">
                            {t.matched_employee ? (
                              <span className="text-xs text-green-600">{t.match_method}</span>
                            ) : (
                              <span className="text-xs text-red-600">Not found</span>
                            )}
                          </td>
                          <td className="px-2 py-1">
                            {t.would_change && t.would_change.length > 0 ? (
                              <div className="text-xs">
                                {t.would_change.map((c: string, j: number) => (
                                  <div key={j} className="text-amber-600">{c}</div>
                                ))}
                              </div>
                            ) : t.matched_employee ? (
                              <span className="text-xs text-gray-400">No changes</span>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {notionPreview.teachers.length > 20 && (
                    <p className="text-xs text-gray-500 mt-2 text-center">
                      Showing 20 of {notionPreview.teachers.length} teachers
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Sync Results */}
          {notionResult && (
            <div className={`border rounded-lg p-4 ${notionResult.errors?.length > 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'}`}>
              <h4 className={`font-medium mb-3 ${notionResult.errors?.length > 0 ? 'text-yellow-800' : 'text-green-800'}`}>
                Sync Complete
              </h4>
              <div className="grid grid-cols-4 gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">{notionResult.synced}</p>
                  <p className="text-xs text-gray-500">Updated</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-500">{notionResult.skipped}</p>
                  <p className="text-xs text-gray-500">Skipped</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-500">{notionResult.not_found}</p>
                  <p className="text-xs text-gray-500">Not Found</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-600">{notionResult.errors?.length || 0}</p>
                  <p className="text-xs text-gray-500">Errors</p>
                </div>
              </div>
              {notionResult.errors && notionResult.errors.length > 0 && (
                <div className="mt-3 text-sm text-red-600">
                  {notionResult.errors.map((e: string, i: number) => (
                    <div key={i}>{e}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Info */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h4 className="font-medium text-gray-800 mb-2">What gets synced?</h4>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• <strong>Status:</strong> Active/Inactive/Break → updates employee status</li>
              <li>• <strong>Schedule:</strong> Start Time/End Time → updates call_time/time_out</li>
              <li>• <strong>Contact:</strong> Email/Phone → fills in if empty in A&P</li>
              <li>• <strong>Position:</strong> Teacher/Administrative → updates position</li>
            </ul>
            <p className="text-xs text-gray-500 mt-2">
              Matching: By email → by name → by Teacher ID (ICN-XXX). Only updates existing employees.
            </p>
          </div>

          {/* Important reminder about syncing before import */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <h4 className="font-medium text-amber-800 mb-2">When to Sync from Notion</h4>
            <p className="text-sm text-amber-700">
              <strong>Sync from Notion BEFORE importing attendance</strong> if employee schedules or statuses have changed.
              This ensures late/early calculations are accurate based on the correct schedule.
            </p>
            <p className="text-xs text-amber-600 mt-2">
              When schedules change, the system automatically recalculates late minutes for all affected attendance records.
            </p>
          </div>
        </div>
      </div>

      {/* Backup Management - 3-2-1 Strategy */}
      <div className="card">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Database Backup (3-2-1)</h2>
            <p className="text-sm text-gray-500 mt-1">
              Keep 3 copies, on 2 different media, with 1 offsite
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCleanup}
              disabled={backupAction !== null}
              className="btn-secondary text-sm"
            >
              {backupAction === 'cleanup' ? 'Cleaning...' : 'Cleanup Old'}
            </button>
            <button
              onClick={handleCreateBackup}
              disabled={backupAction !== null}
              className="btn-primary"
            >
              {backupAction === 'creating' ? 'Creating...' : 'Create Backup'}
            </button>
          </div>
        </div>

        {/* 3-2-1 Strategy Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
          <h3 className="font-medium text-blue-800 mb-2">3-2-1 Backup Strategy</h3>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="flex items-start gap-2">
              <span className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">3</span>
              <div>
                <p className="font-medium text-blue-900">3 Copies</p>
                <p className="text-blue-700">Keep at least 3 backup copies</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">2</span>
              <div>
                <p className="font-medium text-blue-900">2 Media Types</p>
                <p className="text-blue-700">Local + USB/External drive</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">1</span>
              <div>
                <p className="font-medium text-blue-900">1 Offsite</p>
                <p className="text-blue-700">Cloud or different location</p>
              </div>
            </div>
          </div>
        </div>

        {/* Backup Status */}
        {backupLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : backupStatus && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm text-gray-500">Total Backups</p>
                <p className="text-2xl font-bold text-gray-900">{backupStatus.total_backups}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm text-gray-500">Total Size</p>
                <p className="text-2xl font-bold text-gray-900">{backupStatus.total_size_mb} MB</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm text-gray-500">Retention</p>
                <p className="text-2xl font-bold text-gray-900">{backupStatus.retention_days} days</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm text-gray-500">Last Backup</p>
                <p className="text-sm font-medium text-gray-900">
                  {backupStatus.latest_backup
                    ? formatDate(backupStatus.latest_backup.created_at)
                    : 'Never'}
                </p>
              </div>
            </div>

            {/* Backup Directory */}
            <div className="mb-4 p-3 bg-gray-100 rounded-lg">
              <p className="text-xs text-gray-500 mb-1">Backup Directory</p>
              <code className="text-sm text-gray-700 break-all">{backupStatus.backup_directory}</code>
            </div>

            {/* Backup List */}
            <div className="border rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Filename</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Size</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Created</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {backups.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                        No backups yet. Create your first backup above.
                      </td>
                    </tr>
                  ) : (
                    backups.map((backup) => (
                      <tr key={backup.filename} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-mono">{backup.filename}</span>
                            {backup.compressed && (
                              <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                                compressed
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-gray-600">
                          {backup.size_mb} MB
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-gray-600">
                          {formatDate(backup.created_at)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex justify-center gap-2">
                            {showRestoreConfirm === backup.filename ? (
                              <>
                                <button
                                  onClick={() => handleRestoreBackup(backup.filename)}
                                  className="text-xs text-white bg-orange-500 px-2 py-1 rounded hover:bg-orange-600"
                                >
                                  Confirm
                                </button>
                                <button
                                  onClick={() => setShowRestoreConfirm(null)}
                                  className="text-xs text-gray-600 px-2 py-1 rounded hover:bg-gray-200"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : showDeleteConfirm === backup.filename ? (
                              <>
                                <button
                                  onClick={() => handleDeleteBackup(backup.filename)}
                                  className="text-xs text-white bg-red-500 px-2 py-1 rounded hover:bg-red-600"
                                >
                                  Delete
                                </button>
                                <button
                                  onClick={() => setShowDeleteConfirm(null)}
                                  className="text-xs text-gray-600 px-2 py-1 rounded hover:bg-gray-200"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => backupsApi.download(backup.filename)}
                                  disabled={backupAction !== null}
                                  className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                                >
                                  Download
                                </button>
                                <button
                                  onClick={() => setShowRestoreConfirm(backup.filename)}
                                  disabled={backupAction !== null}
                                  className="text-xs text-orange-600 hover:text-orange-800 font-medium"
                                >
                                  Restore
                                </button>
                                <button
                                  onClick={() => setShowDeleteConfirm(backup.filename)}
                                  disabled={backupAction !== null}
                                  className="text-xs text-red-600 hover:text-red-800 font-medium"
                                >
                                  Delete
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Backup Instructions */}
            <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <h4 className="font-medium text-yellow-800 mb-2">Important: Manual Steps for 3-2-1</h4>
              <ol className="text-sm text-yellow-700 list-decimal list-inside space-y-1">
                <li>Copy backups to USB drive or external hard drive (2nd media)</li>
                <li>Upload to Google Drive, Dropbox, or send to email (offsite copy)</li>
                <li>Create backups before major changes (import, payroll runs)</li>
                <li>Test restores periodically to ensure backups work</li>
              </ol>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
