import { useState, useEffect } from 'react';
import { Tab } from '@headlessui/react';
import { PlusIcon, PencilIcon, TrashIcon, EyeIcon, BanknotesIcon } from '@heroicons/react/24/outline';
import { loansApi, employeesApi } from '../../api/client';

interface LoanType {
  id: number;
  code: string;
  name: string;
  description: string | null;
  default_interest_rate: number;
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
}

interface Loan {
  id: number;
  employee_id: number;
  employee_name: string | null;
  employee_no: string | null;
  loan_type_id: number;
  loan_type_code: string | null;
  loan_type_name: string | null;
  reference_no: string | null;
  principal_amount: number;
  interest_rate: number;
  total_amount: number;
  term_months: number;
  monthly_deduction: number;
  start_date: string;
  end_date: string | null;
  actual_end_date: string | null;
  remaining_balance: number;
  total_paid: number;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
}

interface Employee {
  id: number;
  employee_no: string;
  first_name: string;
  last_name: string;
}

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}

const formatCurrency = (value: number) => `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('en-PH');

const LOAN_STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  paid: 'bg-blue-100 text-blue-800',
  cancelled: 'bg-gray-100 text-gray-800',
};

export function LoansPage() {
  const [selectedTab, setSelectedTab] = useState(0);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Loan Management</h1>
      </div>

      <Tab.Group selectedIndex={selectedTab} onChange={setSelectedTab}>
        <Tab.List className="flex space-x-1 rounded-xl bg-primary-900/20 p-1">
          {['Active Loans', 'All Loans', 'Loan Types'].map((tab) => (
            <Tab
              key={tab}
              className={({ selected }) =>
                classNames(
                  'w-full rounded-lg py-2.5 text-sm font-medium leading-5',
                  'ring-white ring-opacity-60 ring-offset-2 ring-offset-primary-400 focus:outline-none focus:ring-2',
                  selected
                    ? 'bg-white text-primary-700 shadow'
                    : 'text-primary-100 hover:bg-white/[0.12] hover:text-white'
                )
              }
            >
              {tab}
            </Tab>
          ))}
        </Tab.List>

        <Tab.Panels className="mt-4">
          <Tab.Panel><LoansTab showPaid={false} /></Tab.Panel>
          <Tab.Panel><LoansTab showPaid={true} /></Tab.Panel>
          <Tab.Panel><LoanTypesTab /></Tab.Panel>
        </Tab.Panels>
      </Tab.Group>
    </div>
  );
}

// === Loans Tab ===
function LoansTab({ showPaid }: { showPaid: boolean }) {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loanTypes, setLoanTypes] = useState<LoanType[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [editingItem, setEditingItem] = useState<Loan | null>(null);
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [formData, setFormData] = useState({
    employee_id: 0,
    loan_type_id: 0,
    reference_no: '',
    principal_amount: 0,
    interest_rate: 0,
    term_months: 12,
    monthly_deduction: 0,
    start_date: new Date().toISOString().split('T')[0],
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [filterEmployee, setFilterEmployee] = useState<number | ''>('');

  useEffect(() => {
    loadData();
  }, [showPaid, filterEmployee]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [loansData, typesData, employeesData] = await Promise.all([
        loansApi.list({
          include_paid: showPaid,
          employee_id: filterEmployee || undefined,
        }),
        loansApi.listTypes(),
        employeesApi.list({ page_size: 1000 }),
      ]);
      setLoans(loansData.items);
      setLoanTypes(typesData.items);
      setEmployees(employeesData.items);
    } catch (error) {
      console.error('Failed to load loans:', error);
      setMessage({ type: 'error', text: 'Failed to load loans' });
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingItem(null);
    const today = new Date().toISOString().split('T')[0];
    setFormData({
      employee_id: 0,
      loan_type_id: loanTypes[0]?.id || 0,
      reference_no: '',
      principal_amount: 0,
      interest_rate: loanTypes[0]?.default_interest_rate || 0,
      term_months: 12,
      monthly_deduction: 0,
      start_date: today,
      notes: '',
    });
    setShowModal(true);
  };

  const openEdit = (loan: Loan) => {
    setEditingItem(loan);
    setFormData({
      employee_id: loan.employee_id,
      loan_type_id: loan.loan_type_id,
      reference_no: loan.reference_no || '',
      principal_amount: loan.principal_amount,
      interest_rate: loan.interest_rate,
      term_months: loan.term_months,
      monthly_deduction: loan.monthly_deduction,
      start_date: loan.start_date,
      notes: loan.notes || '',
    });
    setShowModal(true);
  };

  const openDetails = (loan: Loan) => {
    setSelectedLoan(loan);
    setShowDetailsModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      if (editingItem) {
        await loansApi.update(editingItem.id, {
          reference_no: formData.reference_no || undefined,
          interest_rate: formData.interest_rate,
          term_months: formData.term_months,
          monthly_deduction: formData.monthly_deduction,
          start_date: formData.start_date,
          notes: formData.notes || undefined,
        });
        setMessage({ type: 'success', text: 'Loan updated' });
      } else {
        await loansApi.create(formData);
        setMessage({ type: 'success', text: 'Loan created' });
      }
      setShowModal(false);
      loadData();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.detail || 'Failed to save' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (loan: Loan) => {
    if (!confirm(`Cancel loan for ${loan.employee_name}?`)) return;

    try {
      await loansApi.delete(loan.id);
      setMessage({ type: 'success', text: 'Loan cancelled' });
      loadData();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.detail || 'Failed to cancel loan' });
    }
  };

  const handleLoanTypeChange = (typeId: number) => {
    const loanType = loanTypes.find((t) => t.id === typeId);
    setFormData({
      ...formData,
      loan_type_id: typeId,
      interest_rate: loanType?.default_interest_rate || 0,
    });
  };

  const calculateMonthlyDeduction = () => {
    const principal = formData.principal_amount;
    const rate = formData.interest_rate;
    const months = formData.term_months;

    if (principal > 0 && months > 0) {
      const interest = principal * (rate / 100) * (months / 12);
      const total = principal + interest;
      const monthly = total / months;
      setFormData({ ...formData, monthly_deduction: Math.ceil(monthly * 100) / 100 });
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {message && (
        <div className={`p-3 rounded-md ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {message.text}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card bg-white">
          <div className="text-sm text-gray-500">Total Loans</div>
          <div className="text-2xl font-bold text-gray-900">{loans.length}</div>
        </div>
        <div className="card bg-green-50">
          <div className="text-sm text-green-600">Active</div>
          <div className="text-2xl font-bold text-green-700">
            {loans.filter((l) => l.status === 'active').length}
          </div>
        </div>
        <div className="card bg-yellow-50">
          <div className="text-sm text-yellow-600">Total Principal</div>
          <div className="text-2xl font-bold text-yellow-700">
            {formatCurrency(loans.reduce((sum, l) => sum + l.principal_amount, 0))}
          </div>
        </div>
        <div className="card bg-blue-50">
          <div className="text-sm text-blue-600">Total Remaining</div>
          <div className="text-2xl font-bold text-blue-700">
            {formatCurrency(loans.filter((l) => l.status === 'active').reduce((sum, l) => sum + l.remaining_balance, 0))}
          </div>
        </div>
      </div>

      {/* Filters and Actions */}
      <div className="flex flex-wrap gap-3 justify-between items-center">
        <div className="flex gap-3">
          <select
            value={filterEmployee}
            onChange={(e) => setFilterEmployee(e.target.value ? parseInt(e.target.value) : '')}
            className="form-input w-64"
          >
            <option value="">All Employees</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.first_name} {emp.last_name} ({emp.employee_no})
              </option>
            ))}
          </select>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <PlusIcon className="h-5 w-5" /> Add Loan
        </button>
      </div>

      {/* Loans Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Principal</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Monthly</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loans.map((loan) => (
                <tr key={loan.id} className={loan.status !== 'active' ? 'bg-gray-50' : ''}>
                  <td className="px-4 py-3 text-sm">
                    <div className="font-medium text-gray-900">{loan.employee_name}</div>
                    <div className="text-gray-500 text-xs">{loan.employee_no}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">{loan.loan_type_name}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{loan.reference_no || '-'}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">
                    {formatCurrency(loan.principal_amount)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-900">
                    {formatCurrency(loan.monthly_deduction)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-medium text-primary-600">
                    {formatCurrency(loan.remaining_balance)}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`px-2 py-1 rounded-full text-xs capitalize ${LOAN_STATUS_STYLES[loan.status] || 'bg-gray-100 text-gray-800'}`}>
                      {loan.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button onClick={() => openDetails(loan)} className="text-gray-600 hover:text-gray-900" title="View Details">
                      <EyeIcon className="h-5 w-5 inline" />
                    </button>
                    {loan.status === 'active' && (
                      <>
                        <button onClick={() => openEdit(loan)} className="text-primary-600 hover:text-primary-900">
                          <PencilIcon className="h-5 w-5 inline" />
                        </button>
                        <button onClick={() => handleDelete(loan)} className="text-red-600 hover:text-red-900">
                          <TrashIcon className="h-5 w-5 inline" />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {loans.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                    No loans found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">
              {editingItem ? 'Edit Loan' : 'Add New Loan'}
            </h3>
            <form onSubmit={handleSave} className="space-y-4">
              {!editingItem && (
                <div>
                  <label className="form-label">Employee *</label>
                  <select
                    required
                    value={formData.employee_id}
                    onChange={(e) => setFormData({ ...formData, employee_id: parseInt(e.target.value) })}
                    className="form-input"
                  >
                    <option value={0}>Select Employee</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.first_name} {emp.last_name} ({emp.employee_no})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Loan Type *</label>
                  <select
                    required
                    value={formData.loan_type_id}
                    onChange={(e) => handleLoanTypeChange(parseInt(e.target.value))}
                    className="form-input"
                    disabled={!!editingItem}
                  >
                    <option value={0}>Select Type</option>
                    {loanTypes.filter((t) => t.is_active).map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label">Reference No.</label>
                  <input
                    type="text"
                    value={formData.reference_no}
                    onChange={(e) => setFormData({ ...formData, reference_no: e.target.value })}
                    className="form-input"
                    placeholder="SSS/Pag-IBIG ref"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Principal Amount *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    step="0.01"
                    value={formData.principal_amount}
                    onChange={(e) => setFormData({ ...formData, principal_amount: parseFloat(e.target.value) || 0 })}
                    className="form-input"
                    disabled={!!editingItem}
                  />
                </div>
                <div>
                  <label className="form-label">Interest Rate (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={formData.interest_rate}
                    onChange={(e) => setFormData({ ...formData, interest_rate: parseFloat(e.target.value) || 0 })}
                    className="form-input"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Term (Months) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    max="120"
                    value={formData.term_months}
                    onChange={(e) => setFormData({ ...formData, term_months: parseInt(e.target.value) || 12 })}
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Monthly Deduction *</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      required
                      min="1"
                      step="0.01"
                      value={formData.monthly_deduction}
                      onChange={(e) => setFormData({ ...formData, monthly_deduction: parseFloat(e.target.value) || 0 })}
                      className="form-input flex-1"
                    />
                    <button
                      type="button"
                      onClick={calculateMonthlyDeduction}
                      className="btn-secondary text-xs px-2"
                      title="Calculate"
                    >
                      Calc
                    </button>
                  </div>
                </div>
              </div>
              <div>
                <label className="form-label">Start Date *</label>
                <input
                  type="date"
                  required
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  className="form-input max-w-xs"
                />
              </div>
              <div>
                <label className="form-label">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="form-input"
                  rows={2}
                />
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">
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

      {/* Details Modal */}
      {showDetailsModal && selectedLoan && (
        <LoanDetailsModal loan={selectedLoan} onClose={() => setShowDetailsModal(false)} onUpdate={loadData} />
      )}
    </div>
  );
}

// === Loan Details Modal ===
function LoanDetailsModal({ loan, onClose, onUpdate }: { loan: Loan; onClose: () => void; onUpdate: () => void }) {
  const [deductions, setDeductions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDeduction, setShowAddDeduction] = useState(false);
  const [deductionAmount, setDeductionAmount] = useState(loan.monthly_deduction);
  const [deductionDate, setDeductionDate] = useState(new Date().toISOString().split('T')[0]);
  const [deductionNotes, setDeductionNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadDeductions();
  }, [loan.id]);

  const loadDeductions = async () => {
    try {
      const data = await loansApi.listDeductions(loan.id);
      setDeductions(data.items);
    } catch (error) {
      console.error('Failed to load deductions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddDeduction = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      await loansApi.createDeduction(loan.id, {
        amount: deductionAmount,
        deduction_date: deductionDate,
        notes: deductionNotes || undefined,
      });
      setMessage({ type: 'success', text: 'Payment recorded' });
      setShowAddDeduction(false);
      setDeductionNotes('');
      loadDeductions();
      onUpdate();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.detail || 'Failed to record payment' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDeduction = async (deductionId: number) => {
    if (!confirm('Delete this payment? This will reverse the balance.')) return;

    try {
      await loansApi.deleteDeduction(loan.id, deductionId);
      setMessage({ type: 'success', text: 'Payment deleted' });
      loadDeductions();
      onUpdate();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.detail || 'Failed to delete payment' });
    }
  };

  const progressPercent = loan.total_amount > 0
    ? Math.round((loan.total_paid / loan.total_amount) * 100)
    : 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-semibold">{loan.loan_type_name}</h3>
            <p className="text-sm text-gray-500">{loan.employee_name} ({loan.employee_no})</p>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm capitalize ${LOAN_STATUS_STYLES[loan.status]}`}>
            {loan.status}
          </span>
        </div>

        {message && (
          <div className={`p-3 rounded-md mb-4 ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {message.text}
          </div>
        )}

        {/* Loan Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div>
            <p className="text-xs text-gray-500">Principal</p>
            <p className="font-semibold">{formatCurrency(loan.principal_amount)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Total Amount</p>
            <p className="font-semibold">{formatCurrency(loan.total_amount)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Total Paid</p>
            <p className="font-semibold text-green-600">{formatCurrency(loan.total_paid)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Remaining</p>
            <p className="font-semibold text-primary-600">{formatCurrency(loan.remaining_balance)}</p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-6">
          <div className="flex justify-between text-sm mb-1">
            <span>Payment Progress</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className="bg-primary-600 h-3 rounded-full transition-all"
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>
        </div>

        {/* Loan Details */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6 text-sm">
          <div>
            <p className="text-gray-500">Reference No.</p>
            <p>{loan.reference_no || '-'}</p>
          </div>
          <div>
            <p className="text-gray-500">Interest Rate</p>
            <p>{loan.interest_rate}%</p>
          </div>
          <div>
            <p className="text-gray-500">Term</p>
            <p>{loan.term_months} months</p>
          </div>
          <div>
            <p className="text-gray-500">Monthly Deduction</p>
            <p>{formatCurrency(loan.monthly_deduction)}</p>
          </div>
          <div>
            <p className="text-gray-500">Start Date</p>
            <p>{formatDate(loan.start_date)}</p>
          </div>
          <div>
            <p className="text-gray-500">End Date</p>
            <p>{loan.end_date ? formatDate(loan.end_date) : '-'}</p>
          </div>
        </div>

        {/* Payment History */}
        <div className="border-t pt-4">
          <div className="flex justify-between items-center mb-3">
            <h4 className="font-semibold">Payment History</h4>
            {loan.status === 'active' && (
              <button
                onClick={() => setShowAddDeduction(true)}
                className="btn-primary text-sm flex items-center gap-1"
              >
                <BanknotesIcon className="h-4 w-4" /> Record Payment
              </button>
            )}
          </div>

          {showAddDeduction && (
            <form onSubmit={handleAddDeduction} className="bg-gray-50 p-4 rounded-lg mb-4 space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="form-label text-xs">Amount</label>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    max={loan.remaining_balance}
                    value={deductionAmount}
                    onChange={(e) => setDeductionAmount(parseFloat(e.target.value) || 0)}
                    className="form-input text-sm"
                  />
                </div>
                <div>
                  <label className="form-label text-xs">Date</label>
                  <input
                    type="date"
                    required
                    value={deductionDate}
                    onChange={(e) => setDeductionDate(e.target.value)}
                    className="form-input text-sm"
                  />
                </div>
                <div>
                  <label className="form-label text-xs">Notes</label>
                  <input
                    type="text"
                    value={deductionNotes}
                    onChange={(e) => setDeductionNotes(e.target.value)}
                    className="form-input text-sm"
                    placeholder="Optional"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowAddDeduction(false)} className="btn-secondary text-sm">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="btn-primary text-sm">
                  {saving ? 'Saving...' : 'Save Payment'}
                </button>
              </div>
            </form>
          )}

          {loading ? (
            <div className="text-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600 mx-auto"></div>
            </div>
          ) : deductions.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-4">No payments recorded yet</p>
          ) : (
            <div className="max-h-48 overflow-y-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Date</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Amount</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Balance After</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Notes</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {deductions.map((d) => (
                    <tr key={d.id}>
                      <td className="px-3 py-2">{formatDate(d.deduction_date)}</td>
                      <td className="px-3 py-2 text-right font-medium">{formatCurrency(d.amount)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(d.balance_after)}</td>
                      <td className="px-3 py-2 text-gray-500">{d.notes || '-'}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => handleDeleteDeduction(d.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex justify-end mt-6">
          <button onClick={onClose} className="btn-secondary">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// === Loan Types Tab ===
function LoanTypesTab() {
  const [loanTypes, setLoanTypes] = useState<LoanType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<LoanType | null>(null);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: '',
    default_interest_rate: 0,
    is_active: true,
  });
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const data = await loansApi.listTypes({ include_inactive: true });
      setLoanTypes(data.items);
    } catch (error) {
      console.error('Failed to load loan types:', error);
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingItem(null);
    setFormData({ code: '', name: '', description: '', default_interest_rate: 0, is_active: true });
    setShowModal(true);
  };

  const openEdit = (item: LoanType) => {
    setEditingItem(item);
    setFormData({
      code: item.code,
      name: item.name,
      description: item.description || '',
      default_interest_rate: item.default_interest_rate,
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
        await loansApi.updateType(editingItem.id, formData);
        setMessage({ type: 'success', text: 'Loan type updated' });
      } else {
        await loansApi.createType(formData);
        setMessage({ type: 'success', text: 'Loan type created' });
      }
      setShowModal(false);
      loadData();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.detail || 'Failed to save' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: LoanType) => {
    if (!confirm(`Delete loan type "${item.name}"?`)) return;

    try {
      await loansApi.deleteType(item.id);
      setMessage({ type: 'success', text: 'Loan type deleted' });
      loadData();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.detail || 'Failed to delete' });
    }
  };

  const handleSeedTypes = async () => {
    if (!confirm('Seed default loan types (SSS, Pag-IBIG, Company, etc.)?')) return;

    setSeeding(true);
    setMessage(null);
    try {
      const result = await loansApi.seedTypes();
      setMessage({ type: 'success', text: result.message });
      loadData();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.detail || 'Failed to seed' });
    } finally {
      setSeeding(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {message && (
        <div className={`p-3 rounded-md ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {message.text}
        </div>
      )}

      <div className="flex justify-end gap-3">
        <button onClick={handleSeedTypes} disabled={seeding} className="btn-secondary">
          {seeding ? 'Seeding...' : 'Seed Default Types'}
        </button>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <PlusIcon className="h-5 w-5" /> Add Loan Type
        </button>
      </div>

      <div className="card overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Default Rate</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loanTypes.map((type) => (
              <tr key={type.id} className={!type.is_active ? 'bg-gray-50' : ''}>
                <td className="px-4 py-3 text-sm font-medium text-gray-900">{type.code}</td>
                <td className="px-4 py-3 text-sm text-gray-900">{type.name}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{type.description || '-'}</td>
                <td className="px-4 py-3 text-sm text-right">{type.default_interest_rate}%</td>
                <td className="px-4 py-3 text-sm">
                  <span className={`px-2 py-1 rounded-full text-xs ${type.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                    {type.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button onClick={() => openEdit(type)} className="text-primary-600 hover:text-primary-900">
                    <PencilIcon className="h-5 w-5 inline" />
                  </button>
                  <button onClick={() => handleDelete(type)} className="text-red-600 hover:text-red-900">
                    <TrashIcon className="h-5 w-5 inline" />
                  </button>
                </td>
              </tr>
            ))}
            {loanTypes.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  No loan types found. Click "Seed Default Types" to add standard types.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">
              {editingItem ? 'Edit Loan Type' : 'Add Loan Type'}
            </h3>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Code *</label>
                  <input
                    type="text"
                    required
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    className="form-input"
                    placeholder="e.g., SSS"
                  />
                </div>
                <div>
                  <label className="form-label">Default Rate (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={formData.default_interest_rate}
                    onChange={(e) => setFormData({ ...formData, default_interest_rate: parseFloat(e.target.value) || 0 })}
                    className="form-input"
                  />
                </div>
              </div>
              <div>
                <label className="form-label">Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="form-input"
                  placeholder="e.g., SSS Salary Loan"
                />
              </div>
              <div>
                <label className="form-label">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="form-input"
                  rows={2}
                />
              </div>
              <div>
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
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">
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
