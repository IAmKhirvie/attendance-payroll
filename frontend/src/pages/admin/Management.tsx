import { useState, useEffect } from 'react';
import { Tab } from '@headlessui/react';
import { PlusIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import { departmentsApi, shiftsApi, deductionsApi } from '../../api/client';

interface Department {
  id: number;
  name: string;
  code: string;
  description?: string;
  is_active: boolean;
  created_at: string;
}

interface Shift {
  id: number;
  name: string;
  code: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  grace_minutes: number;
  overtime_threshold_minutes: number;
  is_active: boolean;
  created_at: string;
}

interface DeductionConfig {
  id: number;
  code: string;
  name: string;
  deduction_type: string;
  is_percentage: boolean;
  rate?: number;
  max_contribution?: number;
  min_contribution?: number;
  employee_share_percent?: number;
  is_enabled: boolean;
  created_at: string;
}

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}

export function ManagementPage() {
  const [selectedTab, setSelectedTab] = useState(0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">System Management</h1>

      <Tab.Group selectedIndex={selectedTab} onChange={setSelectedTab}>
        <Tab.List className="flex space-x-1 rounded-xl bg-gray-100 p-1">
          {['Departments', 'Shifts', 'Deductions'].map((tab) => (
            <Tab
              key={tab}
              className={({ selected }) =>
                classNames(
                  'w-full rounded-lg py-2.5 text-sm font-medium leading-5',
                  'ring-white ring-opacity-60 ring-offset-2 ring-offset-primary-400 focus:outline-none focus:ring-2',
                  selected
                    ? 'bg-white text-primary-700 shadow'
                    : 'text-gray-600 hover:bg-white/[0.5] hover:text-gray-900'
                )
              }
            >
              {tab}
            </Tab>
          ))}
        </Tab.List>

        <Tab.Panels className="mt-4">
          <Tab.Panel><DepartmentsTab /></Tab.Panel>
          <Tab.Panel><ShiftsTab /></Tab.Panel>
          <Tab.Panel><DeductionsTab /></Tab.Panel>
        </Tab.Panels>
      </Tab.Group>
    </div>
  );
}

// === Departments Tab ===
function DepartmentsTab() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<Department | null>(null);
  const [formData, setFormData] = useState({ name: '', code: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const data = await departmentsApi.list();
      setDepartments(data);
    } catch (error) {
      console.error('Failed to load departments:', error);
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingItem(null);
    setFormData({ name: '', code: '', description: '' });
    setShowModal(true);
  };

  const openEdit = (item: Department) => {
    setEditingItem(item);
    setFormData({ name: item.name, code: item.code, description: item.description || '' });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      if (editingItem) {
        await departmentsApi.update(editingItem.id, formData);
        setMessage({ type: 'success', text: 'Department updated' });
      } else {
        await departmentsApi.create(formData);
        setMessage({ type: 'success', text: 'Department created' });
      }
      setShowModal(false);
      loadData();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.detail || 'Failed to save' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: Department) => {
    if (!confirm(`Delete department "${item.name}"?`)) return;

    try {
      await departmentsApi.delete(item.id);
      setMessage({ type: 'success', text: 'Department deleted' });
      loadData();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.detail || 'Failed to delete' });
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>;
  }

  return (
    <div className="space-y-4">
      {message && (
        <div className={`p-3 rounded-md ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {message.text}
        </div>
      )}

      <div className="flex justify-end">
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <PlusIcon className="h-5 w-5" /> Add Department
        </button>
      </div>

      <div className="card overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {departments.map((dept) => (
              <tr key={dept.id}>
                <td className="px-4 py-3 text-sm font-medium text-gray-900">{dept.code}</td>
                <td className="px-4 py-3 text-sm text-gray-900">{dept.name}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{dept.description || '-'}</td>
                <td className="px-4 py-3 text-sm">
                  <span className={`px-2 py-1 rounded-full text-xs ${dept.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                    {dept.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button onClick={() => openEdit(dept)} className="text-primary-600 hover:text-primary-900"><PencilIcon className="h-5 w-5 inline" /></button>
                  <button onClick={() => handleDelete(dept)} className="text-red-600 hover:text-red-900"><TrashIcon className="h-5 w-5 inline" /></button>
                </td>
              </tr>
            ))}
            {departments.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No departments found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">{editingItem ? 'Edit Department' : 'Add Department'}</h3>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="form-label">Code *</label>
                <input type="text" required value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} className="form-input" placeholder="e.g., SALES" />
              </div>
              <div>
                <label className="form-label">Name *</label>
                <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="form-input" placeholder="e.g., Sales Department" />
              </div>
              <div>
                <label className="form-label">Description</label>
                <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="form-input" rows={2} />
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving...' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// === Shifts Tab ===
function ShiftsTab() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<Shift | null>(null);
  const [formData, setFormData] = useState({
    name: '', code: '', start_time: '09:00', end_time: '18:00',
    break_minutes: 60, grace_minutes: 15, overtime_threshold_minutes: 30
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const data = await shiftsApi.list();
      setShifts(data);
    } catch (error) {
      console.error('Failed to load shifts:', error);
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingItem(null);
    setFormData({ name: '', code: '', start_time: '09:00', end_time: '18:00', break_minutes: 60, grace_minutes: 15, overtime_threshold_minutes: 30 });
    setShowModal(true);
  };

  const openEdit = (item: Shift) => {
    setEditingItem(item);
    setFormData({
      name: item.name, code: item.code, start_time: item.start_time, end_time: item.end_time,
      break_minutes: item.break_minutes, grace_minutes: item.grace_minutes, overtime_threshold_minutes: item.overtime_threshold_minutes
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      if (editingItem) {
        await shiftsApi.update(editingItem.id, formData);
        setMessage({ type: 'success', text: 'Shift updated' });
      } else {
        await shiftsApi.create(formData);
        setMessage({ type: 'success', text: 'Shift created' });
      }
      setShowModal(false);
      loadData();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.detail || 'Failed to save' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: Shift) => {
    if (!confirm(`Delete shift "${item.name}"?`)) return;

    try {
      await shiftsApi.delete(item.id);
      setMessage({ type: 'success', text: 'Shift deleted' });
      loadData();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.detail || 'Failed to delete' });
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>;
  }

  return (
    <div className="space-y-4">
      {message && (
        <div className={`p-3 rounded-md ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {message.text}
        </div>
      )}

      <div className="flex justify-end">
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <PlusIcon className="h-5 w-5" /> Add Shift
        </button>
      </div>

      <div className="card overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Schedule</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Break</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Grace</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {shifts.map((shift) => (
              <tr key={shift.id}>
                <td className="px-4 py-3 text-sm font-medium text-gray-900">{shift.code}</td>
                <td className="px-4 py-3 text-sm text-gray-900">{shift.name}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{shift.start_time} - {shift.end_time}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{shift.break_minutes} min</td>
                <td className="px-4 py-3 text-sm text-gray-500">{shift.grace_minutes} min</td>
                <td className="px-4 py-3 text-sm">
                  <span className={`px-2 py-1 rounded-full text-xs ${shift.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                    {shift.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button onClick={() => openEdit(shift)} className="text-primary-600 hover:text-primary-900"><PencilIcon className="h-5 w-5 inline" /></button>
                  <button onClick={() => handleDelete(shift)} className="text-red-600 hover:text-red-900"><TrashIcon className="h-5 w-5 inline" /></button>
                </td>
              </tr>
            ))}
            {shifts.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No shifts found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">{editingItem ? 'Edit Shift' : 'Add Shift'}</h3>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Code *</label>
                  <input type="text" required value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} className="form-input" placeholder="e.g., DAY" />
                </div>
                <div>
                  <label className="form-label">Name *</label>
                  <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="form-input" placeholder="e.g., Day Shift" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Start Time *</label>
                  <input type="time" required value={formData.start_time} onChange={(e) => setFormData({ ...formData, start_time: e.target.value })} className="form-input" />
                </div>
                <div>
                  <label className="form-label">End Time *</label>
                  <input type="time" required value={formData.end_time} onChange={(e) => setFormData({ ...formData, end_time: e.target.value })} className="form-input" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="form-label">Break (min)</label>
                  <input type="number" min="0" value={formData.break_minutes} onChange={(e) => setFormData({ ...formData, break_minutes: parseInt(e.target.value) })} className="form-input" />
                </div>
                <div>
                  <label className="form-label">Grace (min)</label>
                  <input type="number" min="0" value={formData.grace_minutes} onChange={(e) => setFormData({ ...formData, grace_minutes: parseInt(e.target.value) })} className="form-input" />
                </div>
                <div>
                  <label className="form-label">OT Threshold</label>
                  <input type="number" min="0" value={formData.overtime_threshold_minutes} onChange={(e) => setFormData({ ...formData, overtime_threshold_minutes: parseInt(e.target.value) })} className="form-input" />
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving...' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// === Deductions Tab ===
function DeductionsTab() {
  const [deductions, setDeductions] = useState<DeductionConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<DeductionConfig | null>(null);
  const [formData, setFormData] = useState({
    code: '', name: '', deduction_type: 'government',
    is_percentage: false, rate: 0, max_contribution: 0, employee_share_percent: 50
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const data = await deductionsApi.list(true);
      setDeductions(data);
    } catch (error) {
      console.error('Failed to load deductions:', error);
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingItem(null);
    setFormData({ code: '', name: '', deduction_type: 'government', is_percentage: false, rate: 0, max_contribution: 0, employee_share_percent: 50 });
    setShowModal(true);
  };

  const openEdit = (item: DeductionConfig) => {
    setEditingItem(item);
    setFormData({
      code: item.code, name: item.name, deduction_type: item.deduction_type,
      is_percentage: item.is_percentage, rate: item.rate || 0,
      max_contribution: item.max_contribution || 0, employee_share_percent: item.employee_share_percent || 50
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      if (editingItem) {
        await deductionsApi.update(editingItem.id, formData);
        setMessage({ type: 'success', text: 'Deduction updated' });
      } else {
        await deductionsApi.create(formData);
        setMessage({ type: 'success', text: 'Deduction created' });
      }
      setShowModal(false);
      loadData();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.detail || 'Failed to save' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: DeductionConfig) => {
    if (!confirm(`Delete deduction "${item.name}"?`)) return;

    try {
      await deductionsApi.delete(item.id);
      setMessage({ type: 'success', text: 'Deduction deleted' });
      loadData();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.detail || 'Failed to delete' });
    }
  };

  const formatCurrency = (value: number) => `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

  if (loading) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>;
  }

  return (
    <div className="space-y-4">
      {message && (
        <div className={`p-3 rounded-md ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {message.text}
        </div>
      )}

      <div className="flex justify-end">
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <PlusIcon className="h-5 w-5" /> Add Deduction
        </button>
      </div>

      <div className="card overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rate</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Max</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {deductions.map((item) => (
              <tr key={item.id}>
                <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.code}</td>
                <td className="px-4 py-3 text-sm text-gray-900">{item.name}</td>
                <td className="px-4 py-3 text-sm text-gray-500 capitalize">{item.deduction_type}</td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {item.is_percentage ? `${item.rate}%` : (item.rate ? formatCurrency(item.rate) : 'Bracket-based')}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {item.max_contribution ? formatCurrency(item.max_contribution) : '-'}
                </td>
                <td className="px-4 py-3 text-sm">
                  <span className={`px-2 py-1 rounded-full text-xs ${item.is_enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                    {item.is_enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button onClick={() => openEdit(item)} className="text-primary-600 hover:text-primary-900"><PencilIcon className="h-5 w-5 inline" /></button>
                  <button onClick={() => handleDelete(item)} className="text-red-600 hover:text-red-900"><TrashIcon className="h-5 w-5 inline" /></button>
                </td>
              </tr>
            ))}
            {deductions.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No deductions found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">{editingItem ? 'Edit Deduction' : 'Add Deduction'}</h3>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Code *</label>
                  <input type="text" required value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} className="form-input" placeholder="e.g., SSS" />
                </div>
                <div>
                  <label className="form-label">Name *</label>
                  <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="form-input" placeholder="e.g., SSS Contribution" />
                </div>
              </div>
              <div>
                <label className="form-label">Type *</label>
                <select value={formData.deduction_type} onChange={(e) => setFormData({ ...formData, deduction_type: e.target.value })} className="form-input">
                  <option value="government">Government</option>
                  <option value="loan">Loan</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center">
                  <input type="checkbox" checked={formData.is_percentage} onChange={(e) => setFormData({ ...formData, is_percentage: e.target.checked })} className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                  <span className="ml-2 text-gray-700">Percentage-based</span>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">{formData.is_percentage ? 'Rate (%)' : 'Rate (Fixed)'}</label>
                  <input type="number" step="0.01" min="0" value={formData.rate} onChange={(e) => setFormData({ ...formData, rate: parseFloat(e.target.value) })} className="form-input" />
                </div>
                <div>
                  <label className="form-label">Max Contribution</label>
                  <input type="number" step="0.01" min="0" value={formData.max_contribution} onChange={(e) => setFormData({ ...formData, max_contribution: parseFloat(e.target.value) })} className="form-input" />
                </div>
              </div>
              <div>
                <label className="form-label">Employee Share (%)</label>
                <input type="number" step="1" min="0" max="100" value={formData.employee_share_percent} onChange={(e) => setFormData({ ...formData, employee_share_percent: parseInt(e.target.value) })} className="form-input" />
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving...' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
