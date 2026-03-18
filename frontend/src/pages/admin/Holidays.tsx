import { useState, useEffect } from 'react';
import { PlusIcon, PencilIcon, TrashIcon, CalendarDaysIcon } from '@heroicons/react/24/outline';
import { holidaysApi } from '../../api/client';

interface Holiday {
  id: number;
  date: string;
  name: string;
  holiday_type: string;
  description: string | null;
  year: number;
  is_recurring: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
}

const HOLIDAY_TYPES = [
  { value: 'regular', label: 'Regular Holiday', color: 'bg-red-100 text-red-800' },
  { value: 'special', label: 'Special Non-Working', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'special_working', label: 'Special Working', color: 'bg-blue-100 text-blue-800' },
];

export function HolidaysPage() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<Holiday | null>(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [formData, setFormData] = useState({
    date: '',
    name: '',
    holiday_type: 'regular',
    description: '',
    is_recurring: false,
    is_active: true,
  });
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadData();
  }, [selectedYear]);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await holidaysApi.list({ year: selectedYear, include_inactive: true });
      setHolidays(data.items);
    } catch (error) {
      console.error('Failed to load holidays:', error);
      setMessage({ type: 'error', text: 'Failed to load holidays' });
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingItem(null);
    setFormData({
      date: `${selectedYear}-01-01`,
      name: '',
      holiday_type: 'regular',
      description: '',
      is_recurring: false,
      is_active: true,
    });
    setShowModal(true);
  };

  const openEdit = (item: Holiday) => {
    setEditingItem(item);
    setFormData({
      date: item.date,
      name: item.name,
      holiday_type: item.holiday_type,
      description: item.description || '',
      is_recurring: item.is_recurring,
      is_active: item.is_active,
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      if (editingItem) {
        await holidaysApi.update(editingItem.id, formData);
        setMessage({ type: 'success', text: 'Holiday updated' });
      } else {
        await holidaysApi.create(formData);
        setMessage({ type: 'success', text: 'Holiday created' });
      }
      setShowModal(false);
      loadData();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.detail || 'Failed to save' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: Holiday, permanent: boolean = false) => {
    const action = permanent ? 'permanently delete' : 'deactivate';
    if (!confirm(`${permanent ? 'Permanently delete' : 'Deactivate'} holiday "${item.name}"?`)) return;

    try {
      await holidaysApi.delete(item.id, permanent);
      setMessage({ type: 'success', text: `Holiday ${permanent ? 'deleted' : 'deactivated'}` });
      loadData();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.detail || `Failed to ${action}` });
    }
  };

  const handleSeedHolidays = async () => {
    if (!confirm(`Seed Philippine holidays for ${selectedYear}? This will add standard holidays for this year.`)) return;

    setSeeding(true);
    setMessage(null);
    try {
      const result = await holidaysApi.seed(selectedYear);
      setMessage({ type: 'success', text: result.message });
      loadData();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.detail || 'Failed to seed holidays' });
    } finally {
      setSeeding(false);
    }
  };

  const getTypeStyle = (type: string) => {
    const found = HOLIDAY_TYPES.find((t) => t.value === type);
    return found?.color || 'bg-gray-100 text-gray-800';
  };

  const getTypeLabel = (type: string) => {
    const found = HOLIDAY_TYPES.find((t) => t.value === type);
    return found?.label || type;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  // Generate year options (current year +/- 5 years)
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 11 }, (_, i) => currentYear - 5 + i);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Holiday Calendar</h1>
        <div className="flex gap-3">
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className="form-input w-32"
          >
            {yearOptions.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
          <button
            onClick={handleSeedHolidays}
            disabled={seeding}
            className="btn-secondary flex items-center gap-2"
          >
            <CalendarDaysIcon className="h-5 w-5" />
            {seeding ? 'Seeding...' : 'Seed PH Holidays'}
          </button>
          <button onClick={openCreate} className="btn-primary flex items-center gap-2">
            <PlusIcon className="h-5 w-5" /> Add Holiday
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`p-3 rounded-md ${
            message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Holiday Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card bg-white">
          <div className="text-sm text-gray-500">Total Holidays</div>
          <div className="text-2xl font-bold text-gray-900">{holidays.length}</div>
        </div>
        <div className="card bg-red-50">
          <div className="text-sm text-red-600">Regular Holidays</div>
          <div className="text-2xl font-bold text-red-700">
            {holidays.filter((h) => h.holiday_type === 'regular' && h.is_active).length}
          </div>
        </div>
        <div className="card bg-yellow-50">
          <div className="text-sm text-yellow-600">Special Non-Working</div>
          <div className="text-2xl font-bold text-yellow-700">
            {holidays.filter((h) => h.holiday_type === 'special' && h.is_active).length}
          </div>
        </div>
        <div className="card bg-blue-50">
          <div className="text-sm text-blue-600">Special Working</div>
          <div className="text-2xl font-bold text-blue-700">
            {holidays.filter((h) => h.holiday_type === 'special_working' && h.is_active).length}
          </div>
        </div>
      </div>

      {/* Holidays Table */}
      <div className="card overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Date
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Holiday Name
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Type
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Description
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {holidays
              .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
              .map((holiday) => (
                <tr key={holiday.id} className={!holiday.is_active ? 'bg-gray-50 opacity-60' : ''}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {formatDate(holiday.date)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">{holiday.name}</td>
                  <td className="px-4 py-3 text-sm">
                    <span
                      className={`px-2 py-1 rounded-full text-xs ${getTypeStyle(holiday.holiday_type)}`}
                    >
                      {getTypeLabel(holiday.holiday_type)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {holiday.description || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span
                      className={`px-2 py-1 rounded-full text-xs ${
                        holiday.is_active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {holiday.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button
                      onClick={() => openEdit(holiday)}
                      className="text-primary-600 hover:text-primary-900"
                    >
                      <PencilIcon className="h-5 w-5 inline" />
                    </button>
                    <button
                      onClick={() => handleDelete(holiday, false)}
                      className="text-red-600 hover:text-red-900"
                      title="Deactivate"
                    >
                      <TrashIcon className="h-5 w-5 inline" />
                    </button>
                  </td>
                </tr>
              ))}
            {holidays.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  No holidays found for {selectedYear}. Click "Seed PH Holidays" to add standard
                  Philippine holidays.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">
              {editingItem ? 'Edit Holiday' : 'Add Holiday'}
            </h3>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="form-label">Date *</label>
                <input
                  type="date"
                  required
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="form-input"
                />
              </div>
              <div>
                <label className="form-label">Holiday Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="form-input"
                  placeholder="e.g., New Year's Day"
                />
              </div>
              <div>
                <label className="form-label">Type *</label>
                <select
                  value={formData.holiday_type}
                  onChange={(e) => setFormData({ ...formData, holiday_type: e.target.value })}
                  className="form-input"
                >
                  {HOLIDAY_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="form-input"
                  rows={2}
                  placeholder="Optional description"
                />
              </div>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.is_recurring}
                    onChange={(e) => setFormData({ ...formData, is_recurring: e.target.checked })}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="ml-2 text-gray-700">Recurring (same date every year)</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="ml-2 text-gray-700">Active</span>
                </label>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
