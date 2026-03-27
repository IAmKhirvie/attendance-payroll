import { useState, useEffect } from 'react';
import { employeesApi } from '../api/client';

interface EndDateNotification {
  id: number;
  employee_no: string;
  full_name: string;
  position: string | null;
  end_date: string;
  days_past: number;
}

interface Props {
  onClose: () => void;
}

export function EndDateNotificationModal({ onClose }: Props) {
  const [notifications, setNotifications] = useState<EndDateNotification[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [newEndDate, setNewEndDate] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    try {
      const response = await employeesApi.getEndDateNotifications();
      setNotifications(response.items);
      if (response.items.length === 0) {
        onClose();
      }
    } catch (err) {
      console.error('Failed to load end date notifications:', err);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const currentNotification = notifications[currentIndex];

  const handleAction = async (action: 'confirm' | 'reactivate' | 'reschedule') => {
    if (!currentNotification) return;

    if (action === 'reschedule' && !showReschedule) {
      setShowReschedule(true);
      return;
    }

    if (action === 'reschedule' && !newEndDate) {
      setError('Please select a new end date');
      return;
    }

    setProcessing(true);
    setError('');

    try {
      await employeesApi.handleEndDateAction(
        currentNotification.id,
        action,
        action === 'reschedule' ? newEndDate : undefined
      );

      // Move to next notification or close if done
      if (currentIndex < notifications.length - 1) {
        setCurrentIndex(currentIndex + 1);
        setShowReschedule(false);
        setNewEndDate('');
      } else {
        onClose();
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to process action');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
        </div>
      </div>
    );
  }

  if (!currentNotification) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="bg-orange-50 border-b border-orange-100 px-6 py-4 rounded-t-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-orange-800">Employee End Date Reached</h2>
              <p className="text-sm text-orange-600">
                {notifications.length > 1
                  ? `${currentIndex + 1} of ${notifications.length} employees`
                  : '1 employee requires attention'}
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-2xl font-bold text-gray-600">
                {currentNotification.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </span>
            </div>
            <h3 className="text-xl font-bold text-gray-900">{currentNotification.full_name}</h3>
            <p className="text-gray-500">{currentNotification.employee_no}</p>
            {currentNotification.position && (
              <p className="text-gray-400 text-sm">{currentNotification.position}</p>
            )}
          </div>

          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">End Date:</span>
              <span className="font-semibold">{currentNotification.end_date}</span>
            </div>
            <div className="flex justify-between items-center mt-2">
              <span className="text-gray-600">Days Past:</span>
              <span className={`font-semibold ${currentNotification.days_past > 0 ? 'text-red-600' : 'text-orange-600'}`}>
                {currentNotification.days_past === 0
                  ? 'Today'
                  : `${currentNotification.days_past} day${currentNotification.days_past > 1 ? 's' : ''} ago`}
              </span>
            </div>
          </div>

          <p className="text-gray-600 text-sm mb-4">
            This employee's contract/end date has been reached. What would you like to do?
          </p>

          {error && (
            <div className="p-3 bg-red-50 text-red-700 rounded mb-4 text-sm">{error}</div>
          )}

          {showReschedule && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">New End Date</label>
              <input
                type="date"
                value={newEndDate}
                onChange={(e) => setNewEndDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 space-y-2">
          {!showReschedule ? (
            <>
              <button
                onClick={() => handleAction('confirm')}
                disabled={processing}
                className="w-full px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium"
              >
                Confirm Termination
              </button>
              <button
                onClick={() => handleAction('reactivate')}
                disabled={processing}
                className="w-full px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
              >
                Register Again (Clear End Date)
              </button>
              <button
                onClick={() => handleAction('reschedule')}
                disabled={processing}
                className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
              >
                Extend Contract (New End Date)
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => handleAction('reschedule')}
                disabled={processing || !newEndDate}
                className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
              >
                {processing ? 'Saving...' : 'Save New End Date'}
              </button>
              <button
                onClick={() => {
                  setShowReschedule(false);
                  setNewEndDate('');
                  setError('');
                }}
                disabled={processing}
                className="w-full px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Back
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
