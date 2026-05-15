/**
 * Shared formatting utilities
 * Consolidates duplicate formatting functions from across the codebase
 */

/**
 * Format a number as Philippine Peso currency
 */
export const formatCurrency = (amount: number | null | undefined): string => {
  if (amount === null || amount === undefined) return '₱0.00';
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

/**
 * Convert 24-hour time format to 12-hour format
 * @param time24 - Time in "HH:MM" format or already in "H:MM AM/PM" format
 * @returns Time in "H:MM AM/PM" format
 */
export const formatTime12Hour = (time24: string): string => {
  if (!time24) return '';

  // If already in 12-hour format (contains AM or PM), return as-is but normalize
  if (/AM|PM/i.test(time24)) {
    const match = time24.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (match) {
      return `${parseInt(match[1], 10)}:${match[2]} ${match[3].toUpperCase()}`;
    }
    return time24;
  }

  // Convert from 24-hour format
  const [hours, minutes] = time24.split(':');
  const hour = parseInt(hours, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
};

/**
 * Convert 12-hour time format to 24-hour format
 * @param time12 - Time in "H:MM AM/PM" format
 * @returns Time in "HH:MM" format
 */
export const convertTo24Hour = (time12: string): string => {
  if (!time12) return '';
  const match = time12.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return time12;

  let hour = parseInt(match[1], 10);
  const minutes = match[2];
  const period = match[3].toUpperCase();

  if (period === 'PM' && hour !== 12) hour += 12;
  if (period === 'AM' && hour === 12) hour = 0;

  return `${hour.toString().padStart(2, '0')}:${minutes}`;
};

/**
 * Parse time string to components
 * @param timeStr - Time string in various formats
 * @returns Object with hour, minute, and period
 */
export const parseTime = (timeStr: string): { hour: number; minute: number; period: 'AM' | 'PM' } => {
  if (!timeStr) return { hour: 8, minute: 0, period: 'AM' };

  // Try 12-hour format first (e.g., "8:00 AM")
  const match12 = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (match12) {
    return {
      hour: parseInt(match12[1], 10),
      minute: parseInt(match12[2], 10),
      period: match12[3].toUpperCase() as 'AM' | 'PM'
    };
  }

  // Try 24-hour format (e.g., "08:00")
  const match24 = timeStr.match(/(\d{1,2}):(\d{2})/);
  if (match24) {
    const hour24 = parseInt(match24[1], 10);
    const minute = parseInt(match24[2], 10);
    const isPM = hour24 >= 12;
    const hour12 = hour24 % 12 || 12;
    return {
      hour: hour12,
      minute,
      period: isPM ? 'PM' : 'AM'
    };
  }

  return { hour: 8, minute: 0, period: 'AM' };
};

/**
 * Format a date string for display
 */
export const formatDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

/**
 * Format a datetime string for display
 */
export const formatDateTime = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
};
