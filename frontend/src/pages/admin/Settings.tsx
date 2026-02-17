import { useState, useEffect } from 'react';
import { settingsApi } from '../../api/client';
import type { SystemSettings } from '../../types';

export function SettingsPage() {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadSettings();
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
    </div>
  );
}
