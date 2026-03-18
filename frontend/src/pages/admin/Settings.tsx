import { useState, useEffect } from 'react';
import { settingsApi, backupsApi } from '../../api/client';
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

  useEffect(() => {
    loadSettings();
    loadBackups();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await settingsApi.get();
      setSettings(data);
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadBackups = async () => {
    try {
      const [statusData, listData] = await Promise.all([
        backupsApi.getStatus(),
        backupsApi.list()
      ]);
      setBackupStatus(statusData);
      setBackups(listData.backups);
    } catch (error) {
      console.error('Failed to load backups:', error);
    } finally {
      setBackupLoading(false);
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
