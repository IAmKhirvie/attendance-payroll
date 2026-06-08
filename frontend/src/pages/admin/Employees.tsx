import { useState, useEffect, useCallback, memo, useRef } from 'react';
import { employeesApi } from '../../api/client';
import type { Employee, Department, EmployeeStatus } from '../../types';
import api from '../../api/client';
import { CreatableSelect } from '../../components/CreatableSelect';
import { formatTime12Hour } from '../../utils/format';
import { findNotionEmployeeAsset, getNotionEmployeeBirthday, getNotionEmployeePhotoUrl } from '../../data/notionEmployeeAssets';

interface EmployeePhotoData {
  url: string;
  x: number;
  y: number;
  scale: number;
}

const defaultEmployeePhoto: EmployeePhotoData = {
  url: '',
  x: 0,
  y: 0,
  scale: 1,
};

const employeePhotoKey = (employeeNo: string) => `ican_employee_photo_${employeeNo}`;

const getStoredEmployeePhoto = (employeeNo?: string | null): EmployeePhotoData => {
  if (!employeeNo) return defaultEmployeePhoto;

  try {
    const stored = localStorage.getItem(employeePhotoKey(employeeNo));
    if (!stored) return defaultEmployeePhoto;
    const parsed = JSON.parse(stored);
    return {
      url: typeof parsed.url === 'string' ? parsed.url : '',
      x: Number.isFinite(Number(parsed.x)) ? Number(parsed.x) : 0,
      y: Number.isFinite(Number(parsed.y)) ? Number(parsed.y) : 0,
      scale: Number.isFinite(Number(parsed.scale)) ? Number(parsed.scale) : 1,
    };
  } catch {
    return defaultEmployeePhoto;
  }
};

const storeEmployeePhoto = (employeeNo: string, photo: EmployeePhotoData) => {
  if (!employeeNo) return;

  try {
    if (!photo.url) {
      localStorage.removeItem(employeePhotoKey(employeeNo));
      return;
    }
    localStorage.setItem(employeePhotoKey(employeeNo), JSON.stringify(photo));
  } catch {
    // Local profile photos are optional UI data.
  }
};

// Helper function to convert 12-hour time to 24-hour format (specific signature for TimePicker)
const convertTo24Hour = (hour: string, minute: string, ampm: string): string => {
  let h = parseInt(hour, 10);
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return `${h.toString().padStart(2, '0')}:${minute}`;
};

// Helper function to validate hour and minute ranges
const validateTimeComponents = (hour: number, minute: number, is24Hour: boolean): { hour: number; minute: number; valid: boolean } => {
  // Validate minute (0-59)
  const validMinute = Math.max(0, Math.min(59, isNaN(minute) ? 0 : minute));

  // Validate hour based on format
  let validHour: number;
  if (is24Hour) {
    validHour = Math.max(0, Math.min(23, isNaN(hour) ? 8 : hour));
  } else {
    validHour = Math.max(1, Math.min(12, isNaN(hour) ? 8 : hour));
  }

  return { hour: validHour, minute: validMinute, valid: true };
};

// Helper function to parse time into components (handles both 24-hour and 12-hour formats)
const parseTime = (timeStr: string): { hour: string; minute: string; ampm: string } => {
  if (!timeStr) return { hour: '08', minute: '00', ampm: 'AM' };

  // Normalize the string - trim and handle various formats
  const normalized = timeStr.trim().toUpperCase();

  // Check if it's in 12-hour format (e.g., "01:00 PM", "5:30 AM", "08:00 AM", "5:00PM")
  const match12 = normalized.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (match12) {
    let hour = parseInt(match12[1], 10);
    const minuteNum = parseInt(match12[2], 10);
    const ampm = match12[3];

    // Validate ranges
    const validated = validateTimeComponents(hour, minuteNum, false);

    // Ensure hour is in 1-12 range for 12-hour display
    if (validated.hour === 0) validated.hour = 12;
    if (validated.hour > 12) validated.hour = validated.hour - 12;

    return {
      hour: validated.hour.toString().padStart(2, '0'),
      minute: validated.minute.toString().padStart(2, '0'),
      ampm
    };
  }

  // Check for format without space (e.g., "05:00PM")
  const matchNoSpace = normalized.match(/^(\d{1,2}):(\d{2})(AM|PM)$/);
  if (matchNoSpace) {
    let hour = parseInt(matchNoSpace[1], 10);
    const minuteNum = parseInt(matchNoSpace[2], 10);
    const ampm = matchNoSpace[3];

    // Validate ranges
    const validated = validateTimeComponents(hour, minuteNum, false);

    if (validated.hour === 0) validated.hour = 12;
    if (validated.hour > 12) validated.hour = validated.hour - 12;

    return {
      hour: validated.hour.toString().padStart(2, '0'),
      minute: validated.minute.toString().padStart(2, '0'),
      ampm
    };
  }

  // Otherwise, assume 24-hour format (e.g., "08:00", "17:00", "13:30")
  const parts = timeStr.split(':');
  if (parts.length >= 2) {
    const hour24 = parseInt(parts[0], 10);
    const minuteNum = parseInt(parts[1].replace(/\s*(AM|PM)/i, '').substring(0, 2), 10);

    // Validate ranges
    const validated = validateTimeComponents(hour24, minuteNum, true);

    if (!isNaN(hour24)) {
      const ampm = validated.hour >= 12 ? 'PM' : 'AM';
      let hour12 = validated.hour % 12;
      if (hour12 === 0) hour12 = 12;

      return {
        hour: hour12.toString().padStart(2, '0'),
        minute: validated.minute.toString().padStart(2, '0'),
        ampm
      };
    }
  }

  // Default fallback
  return { hour: '08', minute: '00', ampm: 'AM' };
};

// Custom 12-hour time picker component
const TimePicker12Hour = ({
  value,
  onChange,
  className = ''
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) => {
  const parsed = parseTime(value);

  // Ensure we have valid values that match our options
  const hour = parsed.hour || '08';
  const minute = parsed.minute || '00';
  const ampm = parsed.ampm || 'AM';

  const handleChange = (newHour: string, newMinute: string, newAmpm: string) => {
    onChange(convertTo24Hour(newHour, newMinute, newAmpm));
  };

  // Generate hour options (01-12)
  const hourOptions = Array.from({ length: 12 }, (_, i) => {
    const h = (i + 1).toString().padStart(2, '0');
    return { value: h, label: h };
  });

  // Generate minute options (00-59)
  const minuteOptions = Array.from({ length: 60 }, (_, i) => {
    const m = i.toString().padStart(2, '0');
    return { value: m, label: m };
  });

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <select
        value={hour}
        onChange={(e) => handleChange(e.target.value, minute, ampm)}
        className="form-input w-14 text-center text-sm px-1"
      >
        {hourOptions.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <span className="text-gray-400">:</span>
      <select
        value={minute}
        onChange={(e) => handleChange(hour, e.target.value, ampm)}
        className="form-input w-14 text-center text-sm px-1"
      >
        {minuteOptions.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <select
        value={ampm}
        onChange={(e) => handleChange(hour, minute, e.target.value)}
        className="form-input w-16 text-center text-sm px-1"
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
};

interface EmployeeFormData {
  employee_no: string;
  photo: EmployeePhotoData;
  first_name: string;
  middle_name: string;
  last_name: string;
  email: string;
  phone: string;
  birth_date: string;
  department_id: string;
  position: string;
  employment_type: string;
  hire_date: string;
  end_date: string;  // Contract end date or resignation date
  basic_salary: string;
  daily_rate: string;
  hourly_rate: string;
  allowance: string;
  productivity_incentive: string;
  language_incentive: string;
  biometric_id: string;
  // Government contributions
  sss_contribution: string;
  philhealth_contribution: string;
  pagibig_contribution: string;
  tax_amount: string;
  // Schedule settings
  call_time: string;
  time_out: string;
  work_hours_per_day: string;
  buffer_minutes: string;
  is_flexible: boolean;
  adjusted_call_time: string;
  // Working days
  work_monday: boolean;
  work_tuesday: boolean;
  work_wednesday: boolean;
  work_thursday: boolean;
  work_friday: boolean;
  work_saturday: boolean;
  work_sunday: boolean;
}

const emptyForm: EmployeeFormData = {
  employee_no: '',
  photo: defaultEmployeePhoto,
  first_name: '',
  middle_name: '',
  last_name: '',
  email: '',
  phone: '',
  birth_date: '',
  department_id: '',
  position: '',
  employment_type: 'Fixed Term - Full Time',
  hire_date: '',
  end_date: '',  // Contract end date or resignation date
  basic_salary: '',
  daily_rate: '',
  hourly_rate: '',
  allowance: '',
  productivity_incentive: '',
  language_incentive: '',
  biometric_id: '',
  sss_contribution: '',
  philhealth_contribution: '',
  pagibig_contribution: '',
  tax_amount: '',
  // Schedule settings
  call_time: '08:00',
  time_out: '17:00',
  work_hours_per_day: '8',
  buffer_minutes: '10',
  is_flexible: false,
  adjusted_call_time: '',
  // Working days
  work_monday: true,
  work_tuesday: true,
  work_wednesday: true,
  work_thursday: true,
  work_friday: true,
  work_saturday: false,
  work_sunday: false,
};

// Props for EmployeeForm component
interface EmployeeFormProps {
  formData: EmployeeFormData;
  setFormData: React.Dispatch<React.SetStateAction<EmployeeFormData>>;
  departments: Department[];
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  onCreateDepartment: (name: string) => Promise<{ id: number; name: string } | null>;
  submitText: string;
  saving: boolean;
  error: string;
}

// ICAN Formula Constants
// Daily Rate = Basic Monthly × 12 / 261 days
// Hourly Rate = Daily Rate / Work Hours per Day
const WORKING_DAYS_PER_YEAR = 261; // ICAN standard

// Employee Form Component - defined OUTSIDE of EmployeesPage to prevent re-mounting
const EmployeeForm = memo(function EmployeeForm({
  formData,
  setFormData,
  departments,
  onSubmit,
  onCancel,
  onCreateDepartment,
  submitText,
  saving,
  error,
}: EmployeeFormProps) {
  // Use callback for field updates to prevent unnecessary re-renders
  const handleFieldChange = useCallback((field: keyof EmployeeFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, [setFormData]);

  // Get current work hours for calculations
  const getWorkHours = useCallback(() => {
    return parseFloat(formData.work_hours_per_day) || 8;
  }, [formData.work_hours_per_day]);

  // ICAN Formula: Daily Rate = Basic Monthly × 12 / 261
  const handleBasicSalaryChange = useCallback((value: string) => {
    const basicSalary = parseFloat(value) || 0;
    const workHours = getWorkHours();
    // Daily Rate = (Basic Monthly × 12) / 261
    const dailyRate = basicSalary > 0 ? ((basicSalary * 12) / WORKING_DAYS_PER_YEAR).toFixed(2) : '';
    // Hourly Rate = Daily Rate / Work Hours per Day
    const hourlyRate = dailyRate ? (parseFloat(dailyRate) / workHours).toFixed(2) : '';

    setFormData(prev => ({
      ...prev,
      basic_salary: value,
      daily_rate: dailyRate,
      hourly_rate: hourlyRate,
    }));
  }, [setFormData, getWorkHours]);

  // Reverse: Basic Salary = Daily Rate × 261 / 12
  const handleDailyRateChange = useCallback((value: string) => {
    const dailyRate = parseFloat(value) || 0;
    const workHours = getWorkHours();
    const basicSalary = dailyRate > 0 ? ((dailyRate * WORKING_DAYS_PER_YEAR) / 12).toFixed(2) : '';
    const hourlyRate = dailyRate > 0 ? (dailyRate / workHours).toFixed(2) : '';

    setFormData(prev => ({
      ...prev,
      basic_salary: basicSalary,
      daily_rate: value,
      hourly_rate: hourlyRate,
    }));
  }, [setFormData, getWorkHours]);

  // Reverse: Daily Rate = Hourly Rate × Work Hours
  const handleHourlyRateChange = useCallback((value: string) => {
    const hourlyRate = parseFloat(value) || 0;
    const workHours = getWorkHours();
    const dailyRate = hourlyRate > 0 ? (hourlyRate * workHours).toFixed(2) : '';
    const basicSalary = dailyRate ? ((parseFloat(dailyRate) * WORKING_DAYS_PER_YEAR) / 12).toFixed(2) : '';

    setFormData(prev => ({
      ...prev,
      basic_salary: basicSalary,
      daily_rate: dailyRate,
      hourly_rate: value,
    }));
  }, [setFormData, getWorkHours]);

  // Recalculate hourly rate when work hours per day changes
  const handleWorkHoursChange = useCallback((value: string) => {
    const workHours = parseFloat(value) || 8;
    const dailyRate = parseFloat(formData.daily_rate) || 0;
    // Hourly Rate = Daily Rate / Work Hours
    const newHourlyRate = dailyRate > 0 ? (dailyRate / workHours).toFixed(2) : '';

    setFormData(prev => ({
      ...prev,
      work_hours_per_day: value,
      hourly_rate: newHourlyRate,
    }));
  }, [setFormData, formData.daily_rate]);

  const initials = `${formData.first_name?.[0] || ''}${formData.last_name?.[0] || ''}`.toUpperCase() || 'IC';
  const [photoEditorOpen, setPhotoEditorOpen] = useState(false);
  const [photoDraft, setPhotoDraft] = useState<EmployeePhotoData>(formData.photo || defaultEmployeePhoto);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragStartRef = useRef<{ pointerId: number; startX: number; startY: number; photoX: number; photoY: number } | null>(null);

  useEffect(() => {
    setPhotoDraft(formData.photo || defaultEmployeePhoto);
  }, [formData.photo]);

  const photoTransform = (photo: EmployeePhotoData) => ({
    transform: `translate(${photo.x}px, ${photo.y}px) scale(${photo.scale})`,
  });

  const handlePhotoFile = useCallback((file?: File) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const url = typeof reader.result === 'string' ? reader.result : '';
      if (!url) return;
      setPhotoDraft({ url, x: 0, y: 0, scale: 1 });
    };
    reader.readAsDataURL(file);
  }, []);

  const savePhotoDraft = useCallback(() => {
    setFormData(prev => ({ ...prev, photo: photoDraft }));
    storeEmployeePhoto(formData.employee_no, photoDraft);
    setPhotoEditorOpen(false);
  }, [formData.employee_no, photoDraft, setFormData]);

  const removePhoto = useCallback(() => {
    setPhotoDraft(defaultEmployeePhoto);
    setFormData(prev => ({ ...prev, photo: defaultEmployeePhoto }));
    storeEmployeePhoto(formData.employee_no, defaultEmployeePhoto);
    setPhotoEditorOpen(false);
  }, [formData.employee_no, setFormData]);

  return (
    <form onSubmit={onSubmit} className="flex h-[calc(100vh-8.25rem)] min-h-0 flex-col">
      {error && (
        <div className="mb-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-gray-200">
        <div className="grid h-full min-h-0 grid-cols-1 xl:grid-cols-[20%_1fr]">
          <aside className="min-w-[220px] border-r border-gray-200 bg-white p-2.5">
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  setPhotoDraft(formData.photo || defaultEmployeePhoto);
                  setPhotoEditorOpen(true);
                }}
                className="group relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50"
                aria-label="Edit employee profile photo"
              >
                {formData.photo?.url ? (
                  <img
                    src={formData.photo.url}
                    alt=""
                    className="h-full w-full object-cover"
                    style={photoTransform(formData.photo)}
                  />
                ) : (
                  <span className="text-3xl font-semibold text-primary-700">{initials}</span>
                )}
                <span className="absolute inset-x-0 bottom-0 bg-black/45 px-2 py-1 text-[11px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                  Edit photo
                </span>
              </button>
              <div className="grid grid-cols-1 gap-2">
                <div>
                  <label className="form-label">First Name *</label>
                  <input type="text" value={formData.first_name} onChange={(e) => handleFieldChange('first_name', e.target.value)} className="form-input" required />
                </div>
                <div>
                  <label className="form-label">Middle Name</label>
                  <input type="text" value={formData.middle_name} onChange={(e) => handleFieldChange('middle_name', e.target.value)} className="form-input" />
                </div>
                <div>
                  <label className="form-label">Last Name *</label>
                  <input type="text" value={formData.last_name} onChange={(e) => handleFieldChange('last_name', e.target.value)} className="form-input" required />
                </div>
                <div>
                  <label className="form-label">Employee No *</label>
                  <input type="text" value={formData.employee_no} onChange={(e) => handleFieldChange('employee_no', e.target.value)} className="form-input" required />
                </div>
                <div>
                  <label className="form-label">Biometric ID</label>
                  <input type="text" value={formData.biometric_id} onChange={(e) => handleFieldChange('biometric_id', e.target.value)} className="form-input" />
                </div>
                <div>
                  <label className="form-label">Email</label>
                  <input type="email" value={formData.email} onChange={(e) => handleFieldChange('email', e.target.value)} className="form-input" />
                </div>
              </div>
            </div>
          </aside>

          {photoEditorOpen && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
              <div className="w-full max-w-md overflow-hidden rounded-lg bg-white shadow-xl">
                <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                  <h3 className="text-base font-semibold text-gray-900">Profile Photo</h3>
                  <button
                    type="button"
                    onClick={() => setPhotoEditorOpen(false)}
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                    aria-label="Close photo editor"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="space-y-4 p-4">
                  <div
                    className="mx-auto flex h-72 w-72 touch-none items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50"
                    onPointerDown={(e) => {
                      if (!photoDraft.url) return;
                      dragStartRef.current = {
                        pointerId: e.pointerId,
                        startX: e.clientX,
                        startY: e.clientY,
                        photoX: photoDraft.x,
                        photoY: photoDraft.y,
                      };
                      e.currentTarget.setPointerCapture(e.pointerId);
                    }}
                    onPointerMove={(e) => {
                      const drag = dragStartRef.current;
                      if (!drag || drag.pointerId !== e.pointerId) return;
                      setPhotoDraft(prev => ({
                        ...prev,
                        x: drag.photoX + e.clientX - drag.startX,
                        y: drag.photoY + e.clientY - drag.startY,
                      }));
                    }}
                    onPointerUp={(e) => {
                      if (dragStartRef.current?.pointerId === e.pointerId) {
                        dragStartRef.current = null;
                      }
                    }}
                  >
                    {photoDraft.url ? (
                      <img
                        src={photoDraft.url}
                        alt=""
                        className="h-full w-full cursor-move object-cover"
                        style={photoTransform(photoDraft)}
                        draggable={false}
                      />
                    ) : (
                      <span className="text-5xl font-semibold text-primary-700">{initials}</span>
                    )}
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handlePhotoFile(e.target.files?.[0])}
                  />

                  <div>
                    <label className="form-label">Zoom</label>
                    <input
                      type="range"
                      min="1"
                      max="2.4"
                      step="0.05"
                      value={photoDraft.scale}
                      onChange={(e) => setPhotoDraft(prev => ({ ...prev, scale: Number(e.target.value) }))}
                      className="w-full accent-primary-600"
                      disabled={!photoDraft.url}
                    />
                  </div>

                  <div className="flex flex-wrap justify-between gap-2">
                    <div className="flex gap-2">
                      <button type="button" className="btn-secondary" onClick={() => fileInputRef.current?.click()}>
                        {photoDraft.url ? 'Select New Photo' : 'Select Photo'}
                      </button>
                      {photoDraft.url && (
                        <button type="button" className="btn-secondary" onClick={removePhoto}>
                          Remove
                        </button>
                      )}
                    </div>
                    <button type="button" className="btn-primary" onClick={savePhotoDraft}>
                      Save Photo
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="min-h-0 overflow-hidden bg-white">
            <section className="border-b border-gray-200 bg-gray-50/40 p-2.5">
              <h4 className="mb-2 border-b border-gray-200 pb-1.5 text-sm font-semibold text-gray-800">Employee Details</h4>
              <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
                <div>
                  <label className="form-label">Birth Date</label>
                  <input type="date" value={formData.birth_date} onChange={(e) => handleFieldChange('birth_date', e.target.value)} className="form-input" />
                </div>
                <div>
                  <label className="form-label">Phone</label>
                  <input type="text" value={formData.phone} onChange={(e) => handleFieldChange('phone', e.target.value)} className="form-input" />
                </div>
                <div>
                  <label className="form-label">Department</label>
                  <CreatableSelect
                    options={departments.map((dept) => ({ id: dept.id, name: dept.name }))}
                    value={formData.department_id}
                    onChange={(value) => handleFieldChange('department_id', value)}
                    onCreateNew={onCreateDepartment}
                    placeholder="Select..."
                  />
                </div>
                <div>
                  <label className="form-label">Position</label>
                  <input type="text" value={formData.position} onChange={(e) => handleFieldChange('position', e.target.value)} className="form-input" />
                </div>
                <div>
                  <label className="form-label">Employment Type</label>
                  <select value={formData.employment_type} onChange={(e) => handleFieldChange('employment_type', e.target.value)} className="form-input">
                    <option value="Regular - Full Time">Regular - Full Time</option>
                    <option value="Regular - Part Time">Regular - Part Time</option>
                    <option value="Fixed Term - Full Time">Fixed Term - Full Time</option>
                    <option value="Fixed Term - Part Time">Fixed Term - Part Time</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Hire Date</label>
                  <input type="date" value={formData.hire_date} onChange={(e) => handleFieldChange('hire_date', e.target.value)} className="form-input" />
                </div>
                <div>
                  <label className="form-label">End Date</label>
                  <input type="date" value={formData.end_date} onChange={(e) => handleFieldChange('end_date', e.target.value)} className="form-input" />
                </div>
              </div>
            </section>

            <section className="border-b border-gray-200 bg-gray-50/40 p-2.5">
              <h4 className="mb-2 border-b border-gray-200 pb-1.5 text-sm font-semibold text-gray-800">Schedule</h4>
              <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
                <div>
                  <label className="form-label">Call Time</label>
                  <TimePicker12Hour value={formData.call_time} onChange={(value) => handleFieldChange('call_time', value)} />
                </div>
                <div>
                  <label className="form-label">Time Out</label>
                  <TimePicker12Hour value={formData.time_out} onChange={(value) => handleFieldChange('time_out', value)} />
                </div>
                <div>
                  <label className="form-label">Buffer (mins)</label>
                  <input type="number" min="0" max="60" value={formData.buffer_minutes} onChange={(e) => handleFieldChange('buffer_minutes', e.target.value)} className="form-input w-24" placeholder="10" />
                </div>
                <div>
                  <label className="form-label">Schedule Type</label>
                  <div className="flex h-8 items-center gap-2">
                    <button type="button" onClick={() => setFormData(prev => ({ ...prev, is_flexible: false }))} className={`rounded px-3 py-1.5 text-sm font-medium ${!formData.is_flexible ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>Regular</button>
                    <button type="button" onClick={() => setFormData(prev => ({ ...prev, is_flexible: true }))} className={`rounded px-3 py-1.5 text-sm font-medium ${formData.is_flexible ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>Flexible</button>
                  </div>
                </div>
                {formData.is_flexible && (
                  <div>
                    <label className="form-label">Adjusted Call Time</label>
                    <TimePicker12Hour value={formData.adjusted_call_time} onChange={(value) => setFormData(prev => ({ ...prev, adjusted_call_time: value }))} />
                  </div>
                )}
                <div className="xl:col-span-3">
                  <h5 className="form-label">Working Days</h5>
                  <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
                    {[
                      { key: 'work_monday', label: 'Mon' },
                      { key: 'work_tuesday', label: 'Tue' },
                      { key: 'work_wednesday', label: 'Wed' },
                      { key: 'work_thursday', label: 'Thu' },
                      { key: 'work_friday', label: 'Fri' },
                      { key: 'work_saturday', label: 'Sat' },
                      { key: 'work_sunday', label: 'Sun' },
                    ].map(day => (
                      <label key={day.key} className="flex items-center justify-center gap-1 rounded border border-gray-200 px-2 py-1 hover:bg-gray-50">
                        <input type="checkbox" checked={formData[day.key as keyof EmployeeFormData] as boolean} onChange={(e) => setFormData(prev => ({ ...prev, [day.key]: e.target.checked }))} className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                        <span className="whitespace-nowrap text-xs text-gray-600">{day.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="border-b border-gray-200 bg-gray-50/40 p-2.5">
              <h4 className="mb-2 border-b border-gray-200 pb-1.5 text-sm font-semibold text-gray-800">Salary Rates</h4>
              <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
          <div>
            <label className="form-label">Basic Salary (Monthly)</label>
            <input
              type="number"
              step="0.01"
              value={formData.basic_salary}
              onChange={(e) => handleBasicSalaryChange(e.target.value)}
              className="form-input"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="form-label">Daily Rate</label>
            <input
              type="number"
              step="0.01"
              value={formData.daily_rate}
              onChange={(e) => handleDailyRateChange(e.target.value)}
              className="form-input"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="form-label">Hourly Rate</label>
            <input
              type="number"
              step="0.01"
              value={formData.hourly_rate}
              onChange={(e) => handleHourlyRateChange(e.target.value)}
              className="form-input"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="form-label">Work Hours/Day</label>
            <select
              value={formData.work_hours_per_day}
              onChange={(e) => handleWorkHoursChange(e.target.value)}
              className="form-input"
            >
              <option value="4">4 hours</option>
              <option value="6">6 hours</option>
              <option value="8">8 hours</option>
            </select>
          </div>
                <div>
          <label className="form-label">Allowance (Monthly)</label>
          <input
            type="number"
            step="0.01"
            value={formData.allowance}
            onChange={(e) => handleFieldChange('allowance', e.target.value)}
            className="form-input"
            placeholder="0.00"
          />
        </div>
                <div>
          <label className="form-label">Productivity Incentive</label>
          <input
            type="number"
            step="0.01"
            value={formData.productivity_incentive}
            onChange={(e) => handleFieldChange('productivity_incentive', e.target.value)}
            className="form-input"
            placeholder="0.00"
          />
        </div>
                <div>
          <label className="form-label">Language Incentive</label>
          <input
            type="number"
            step="0.01"
            value={formData.language_incentive}
            onChange={(e) => handleFieldChange('language_incentive', e.target.value)}
            className="form-input"
            placeholder="0.00"
          />
        </div>
              </div>
            </section>

            <section className="bg-gray-50/40 p-2.5">
              <h4 className="mb-2 border-b border-gray-200 pb-1.5 text-sm font-semibold text-gray-800">Gov't Deductions</h4>
              <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
          <div>
            <label className="form-label">SSS</label>
            <input
              type="number"
              step="0.01"
              value={formData.sss_contribution}
              onChange={(e) => handleFieldChange('sss_contribution', e.target.value)}
              className="form-input"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="form-label">PhilHealth</label>
            <input
              type="number"
              step="0.01"
              value={formData.philhealth_contribution}
              onChange={(e) => handleFieldChange('philhealth_contribution', e.target.value)}
              className="form-input"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="form-label">Pag-IBIG</label>
            <input
              type="number"
              step="0.01"
              value={formData.pagibig_contribution}
              onChange={(e) => handleFieldChange('pagibig_contribution', e.target.value)}
              className="form-input"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="form-label">Tax</label>
            <input
              type="number"
              step="0.01"
              value={formData.tax_amount}
              onChange={(e) => handleFieldChange('tax_amount', e.target.value)}
              className="form-input"
              placeholder="0.00"
            />
          </div>
              </div>
            </section>
          </div>
        </div>
      </div>

      <div className="mt-2 flex shrink-0 justify-end gap-2 border-t border-gray-200 bg-white pt-2">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving...' : submitText}</button>
      </div>
    </form>
  );
});

export function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Pagination state - load from localStorage or default to 50
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => {
    const saved = localStorage.getItem('employees_page_size');
    return saved ? parseInt(saved, 10) : 50;
  });
  const [total, setTotal] = useState(0);

  // Save page size to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('employees_page_size', pageSize.toString());
  }, [pageSize]);

  // Sorting state
  const [sortBy, setSortBy] = useState<string>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [actionMenuId, setActionMenuId] = useState<number | null>(null);

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [formData, setFormData] = useState<EmployeeFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadDepartments();
  }, []);

  // Auto-search with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      loadEmployees();
    }, 300); // 300ms delay

    return () => clearTimeout(timer);
  }, [statusFilter, page, sortBy, sortOrder, search]);

  const loadEmployees = async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = {
        page,
        page_size: pageSize,
        sort_by: sortBy,
        sort_order: sortOrder,
      };
      if (search) params.search = search;
      if (statusFilter !== 'all') {
        params.status = statusFilter;
        // inactive employees have is_active=false
        if (statusFilter === 'inactive') {
          params.is_active = false;
        }
      }

      const response = await employeesApi.list(params);
      setEmployees(response.items);
      setTotal(response.total);
    } catch (error) {
      console.error('Failed to load employees:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
    setPage(1); // Reset to first page when sorting
  };

  const totalPages = Math.ceil(total / pageSize);

  const loadDepartments = async () => {
    try {
      const response = await api.get('/employees/departments');
      setDepartments(response.data);
    } catch (error) {
      console.error('Failed to load departments:', error);
    }
  };

  const createDepartment = async (name: string): Promise<{ id: number; name: string } | null> => {
    try {
      // Generate a simple code from name
      const code = name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
      const response = await api.post('/employees/departments', { name, code });
      // Refresh departments list
      await loadDepartments();
      return { id: response.data.id, name: response.data.name };
    } catch (error: any) {
      console.error('Failed to create department:', error);
      alert(error.response?.data?.detail || 'Failed to create department');
      return null;
    }
  };

  const handleAddEmployee = () => {
    setFormData(emptyForm);
    setError('');
    setShowAddModal(true);
  };

  const handleViewEmployee = (emp: Employee) => {
    setSelectedEmployee(emp);
    setShowViewModal(true);
  };

  const handleEditEmployee = (emp: Employee) => {
    const notionAsset = findNotionEmployeeAsset(emp);
    const storedPhoto = getStoredEmployeePhoto(emp.employee_no);

    setSelectedEmployee(emp);
    setFormData({
      employee_no: emp.employee_no || '',
      photo: storedPhoto.url
        ? storedPhoto
        : notionAsset?.photoUrl
          ? { url: notionAsset.photoUrl, x: 0, y: 0, scale: 1 }
          : defaultEmployeePhoto,
      first_name: emp.first_name || '',
      middle_name: emp.middle_name || '',
      last_name: emp.last_name || '',
      email: emp.email || '',
      phone: emp.phone || '',
      birth_date: emp.birth_date || '',
      department_id: emp.department_id?.toString() || '',
      position: emp.position || '',
      employment_type: emp.employment_type || 'regular',
      hire_date: emp.hire_date || '',
      end_date: emp.end_date || '',
      basic_salary: emp.basic_salary || '',
      daily_rate: emp.daily_rate || '',
      hourly_rate: emp.hourly_rate || '',
      allowance: emp.allowance || '',
      productivity_incentive: emp.productivity_incentive || '',
      language_incentive: emp.language_incentive || '',
      biometric_id: emp.biometric_id || '',
      sss_contribution: emp.sss_contribution || '',
      philhealth_contribution: emp.philhealth_contribution || '',
      pagibig_contribution: emp.pagibig_contribution || '',
      tax_amount: emp.tax_amount || '',
      // Schedule settings
      call_time: emp.call_time || '08:00',
      time_out: emp.time_out || '17:00',
      work_hours_per_day: emp.work_hours_per_day?.toString() || '8',
      buffer_minutes: emp.buffer_minutes?.toString() || '10',
      is_flexible: emp.is_flexible === true,  // Explicit boolean check
      adjusted_call_time: emp.adjusted_call_time || '',
      // Working days
      work_monday: emp.work_monday ?? true,
      work_tuesday: emp.work_tuesday ?? true,
      work_wednesday: emp.work_wednesday ?? true,
      work_thursday: emp.work_thursday ?? true,
      work_friday: emp.work_friday ?? true,
      work_saturday: emp.work_saturday ?? false,
      work_sunday: emp.work_sunday ?? false,
    });
    setError('');
    setShowEditModal(true);
  };

  const handleVerifyEmployee = async (emp: Employee) => {
    try {
      await employeesApi.verify(emp.id);
      loadEmployees();
    } catch (error: any) {
      console.error('Failed to verify employee:', error);
      alert(error.response?.data?.detail || 'Failed to verify employee');
    }
  };

  const handleVerifyAll = async () => {
    if (!confirm('Are you sure you want to verify all pending employees?')) return;

    try {
      const result = await employeesApi.verifyAll();
      alert(result.message);
      loadEmployees();
    } catch (error: any) {
      console.error('Failed to verify all:', error);
      alert(error.response?.data?.detail || 'Failed to verify employees');
    }
  };

  // Bulk selection handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(employees.map(e => e.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (id: number, checked: boolean) => {
    const newSelected = new Set(selectedIds);
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedIds(newSelected);
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  // Bulk action: Verify selected
  const handleBulkVerify = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Verify ${selectedIds.size} selected employee(s)?`)) return;

    setBulkActionLoading(true);
    try {
      let successCount = 0;
      for (const id of selectedIds) {
        try {
          await employeesApi.verify(id);
          successCount++;
        } catch (e) {
          console.error(`Failed to verify employee ${id}:`, e);
        }
      }
      alert(`Verified ${successCount} of ${selectedIds.size} employees`);
      clearSelection();
      loadEmployees();
    } finally {
      setBulkActionLoading(false);
    }
  };

  // Bulk action: Delete (deactivate) selected
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete (deactivate) ${selectedIds.size} selected employee(s)?\n\nThis will mark them as inactive.`)) return;

    setBulkActionLoading(true);
    try {
      let successCount = 0;
      for (const id of selectedIds) {
        try {
          await api.delete(`/employees/${id}`);
          successCount++;
        } catch (e) {
          console.error(`Failed to delete employee ${id}:`, e);
        }
      }
      alert(`Deleted ${successCount} of ${selectedIds.size} employees`);
      clearSelection();
      loadEmployees();
    } finally {
      setBulkActionLoading(false);
    }
  };

  // Bulk action: Reactivate selected (for terminated/inactive)
  const handleBulkReactivate = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Reactivate ${selectedIds.size} selected employee(s)?\n\nThis will set them back to active status.`)) return;

    setBulkActionLoading(true);
    try {
      const ids = Array.from(selectedIds).join(',');
      const response = await api.post(`/employees/bulk-action?action=reactivate&employee_ids=${ids}`);
      alert(response.data.message);
      clearSelection();
      loadEmployees();
    } catch (e: any) {
      console.error('Failed to reactivate employees:', e);
      alert(e.response?.data?.detail || 'Failed to reactivate employees');
    } finally {
      setBulkActionLoading(false);
    }
  };

  // Bulk action: Move to inactive
  const handleBulkMoveToInactive = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Move ${selectedIds.size} selected employee(s) to inactive?\n\nThis will permanently deactivate them.`)) return;

    setBulkActionLoading(true);
    try {
      const ids = Array.from(selectedIds).join(',');
      const response = await api.post(`/employees/bulk-action?action=move_to_inactive&employee_ids=${ids}`);
      alert(response.data.message);
      clearSelection();
      loadEmployees();
    } catch (e: any) {
      console.error('Failed to move employees to inactive:', e);
      alert(e.response?.data?.detail || 'Failed to move employees to inactive');
    } finally {
      setBulkActionLoading(false);
    }
  };

  // Set individual employee status
  const handleSetStatus = async (employeeId: number, newStatus: string) => {
    if (!newStatus) return;
    try {
      await api.post(`/employees/${employeeId}/set-status?new_status=${newStatus}`);
      loadEmployees();
    } catch (e: any) {
      console.error('Failed to set status:', e);
      alert(e.response?.data?.detail || 'Failed to set status');
    }
  };

  const isAllSelected = employees.length > 0 && selectedIds.size === employees.length;
  const isSomeSelected = selectedIds.size > 0 && selectedIds.size < employees.length;

  const handleSubmitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      await employeesApi.create({
        employee_no: formData.employee_no,
        first_name: formData.first_name,
        middle_name: formData.middle_name || undefined,
        last_name: formData.last_name,
        email: formData.email || undefined,
        phone: formData.phone || undefined,
        birth_date: formData.birth_date || undefined,
        department_id: formData.department_id ? parseInt(formData.department_id) : undefined,
        position: formData.position || undefined,
        employment_type: formData.employment_type as any,
        hire_date: formData.hire_date || undefined,
        end_date: formData.end_date || undefined,
        basic_salary: formData.basic_salary || undefined,
        daily_rate: formData.daily_rate || undefined,
        hourly_rate: formData.hourly_rate || undefined,
        allowance: formData.allowance || undefined,
        productivity_incentive: formData.productivity_incentive || undefined,
        language_incentive: formData.language_incentive || undefined,
        biometric_id: formData.biometric_id || undefined,
        sss_contribution: formData.sss_contribution || undefined,
        philhealth_contribution: formData.philhealth_contribution || undefined,
        pagibig_contribution: formData.pagibig_contribution || undefined,
        tax_amount: formData.tax_amount || undefined,
        // Schedule settings
        call_time: formData.call_time || undefined,
        time_out: formData.time_out || undefined,
        work_hours_per_day: formData.work_hours_per_day ? parseFloat(formData.work_hours_per_day) : undefined,
        buffer_minutes: formData.buffer_minutes ? parseInt(formData.buffer_minutes) : undefined,
        is_flexible: formData.is_flexible,
        adjusted_call_time: formData.adjusted_call_time || undefined,
        // Working days
        work_monday: formData.work_monday,
        work_tuesday: formData.work_tuesday,
        work_wednesday: formData.work_wednesday,
        work_thursday: formData.work_thursday,
        work_friday: formData.work_friday,
        work_saturday: formData.work_saturday,
        work_sunday: formData.work_sunday,
      } as any);
      storeEmployeePhoto(formData.employee_no, formData.photo);
      setShowAddModal(false);
      loadEmployees();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create employee');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee) return;

    setSaving(true);
    setError('');

    try {
      console.log('[DEBUG] Saving employee - is_flexible:', formData.is_flexible);
      await employeesApi.update(selectedEmployee.id, {
        employee_no: formData.employee_no,
        first_name: formData.first_name,
        middle_name: formData.middle_name || undefined,
        last_name: formData.last_name,
        email: formData.email || undefined,
        phone: formData.phone || undefined,
        birth_date: formData.birth_date || undefined,
        department_id: formData.department_id ? parseInt(formData.department_id) : undefined,
        position: formData.position || undefined,
        employment_type: formData.employment_type as any,
        hire_date: formData.hire_date || undefined,
        end_date: formData.end_date || undefined,
        basic_salary: formData.basic_salary || undefined,
        daily_rate: formData.daily_rate || undefined,
        hourly_rate: formData.hourly_rate || undefined,
        allowance: formData.allowance || undefined,
        productivity_incentive: formData.productivity_incentive || undefined,
        language_incentive: formData.language_incentive || undefined,
        biometric_id: formData.biometric_id || undefined,
        sss_contribution: formData.sss_contribution || undefined,
        philhealth_contribution: formData.philhealth_contribution || undefined,
        pagibig_contribution: formData.pagibig_contribution || undefined,
        tax_amount: formData.tax_amount || undefined,
        // Schedule settings
        call_time: formData.call_time || undefined,
        time_out: formData.time_out || undefined,
        work_hours_per_day: formData.work_hours_per_day ? parseFloat(formData.work_hours_per_day) : undefined,
        buffer_minutes: formData.buffer_minutes ? parseInt(formData.buffer_minutes) : undefined,
        is_flexible: formData.is_flexible,
        adjusted_call_time: formData.adjusted_call_time || undefined,
        // Working days
        work_monday: formData.work_monday,
        work_tuesday: formData.work_tuesday,
        work_wednesday: formData.work_wednesday,
        work_thursday: formData.work_thursday,
        work_friday: formData.work_friday,
        work_saturday: formData.work_saturday,
        work_sunday: formData.work_sunday,
      } as any);
      storeEmployeePhoto(formData.employee_no, formData.photo);
      setShowEditModal(false);
      await loadEmployees();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update employee');
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (amount: string | undefined) => {
    if (!amount) return '-';
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
    }).format(parseFloat(amount));
  };

  const getStatusBadge = (status: EmployeeStatus | undefined, isActive: boolean) => {
    if (status === 'inactive' || !isActive) {
      return <span className="px-2 py-1 text-xs font-medium rounded bg-gray-100 text-gray-800">Inactive</span>;
    }
    if (status === 'pending') {
      return <span className="px-2 py-1 text-xs font-medium rounded bg-yellow-100 text-yellow-800">Pending</span>;
    }
    if (status === 'terminated') {
      return <span className="px-2 py-1 text-xs font-medium rounded bg-red-100 text-red-800">Terminated</span>;
    }
    return <span className="px-2 py-1 text-xs font-medium rounded bg-green-100 text-green-800">Active</span>;
  };

  const getInitials = (emp: Employee) =>
    `${emp.first_name?.[0] || ''}${emp.last_name?.[0] || ''}`.toUpperCase() || 'IC';

  const getEmployeePhoto = (emp: Employee) => {
    const storedPhoto = getStoredEmployeePhoto(emp.employee_no);
    if (storedPhoto.url) return storedPhoto;

    const notionPhotoUrl = getNotionEmployeePhotoUrl(emp);
    return notionPhotoUrl ? { url: notionPhotoUrl, x: 0, y: 0, scale: 1 } : defaultEmployeePhoto;
  };

  const getEmployeeBirthday = (emp: Employee) => getNotionEmployeeBirthday(emp);

  const getRowTint = (emp: Employee) => {
    if (emp.status === 'pending') return 'bg-amber-50';
    if (emp.status === 'terminated') return 'bg-red-50';
    if (emp.status === 'inactive' || !emp.is_active) return 'bg-gray-50';
    return 'bg-white';
  };

  const getStatusSelectClass = (emp: Employee) => {
    const base = 'w-28 rounded border px-2 py-1 text-xs font-medium capitalize focus:border-primary-500 focus:ring-1 focus:ring-primary-500';
    if (emp.status === 'pending') return `${base} border-amber-200 bg-amber-50 text-amber-800`;
    if (emp.status === 'terminated') return `${base} border-red-200 bg-red-50 text-red-700`;
    if (emp.status === 'inactive' || !emp.is_active) return `${base} border-gray-200 bg-gray-50 text-gray-600`;
    return `${base} border-emerald-200 bg-emerald-50 text-emerald-700`;
  };

  const pendingCount = employees.filter(e => e.status === 'pending').length;

  // Memoized cancel handler for Add modal
  const handleCancelAdd = useCallback(() => {
    setShowAddModal(false);
  }, []);

  // Memoized cancel handler for Edit modal
  const handleCancelEdit = useCallback(() => {
    setShowEditModal(false);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Employee Management</h1>
        {statusFilter === 'pending' && pendingCount > 0 && (
          <button onClick={handleVerifyAll} className="btn-secondary">
            Verify All ({pendingCount})
          </button>
        )}
      </div>

      {/* Status Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {[
            { key: 'all', label: 'All' },
            { key: 'pending', label: 'Pending' },
            { key: 'active', label: 'Active' },
            { key: 'terminated', label: 'Terminated' },
            { key: 'inactive', label: 'Inactive' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                statusFilter === tab.key
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50'
              }`}
            >
              {tab.label}
              {tab.key === 'pending' && pendingCount > 0 && (
                <span className="ml-2 rounded-full bg-yellow-400 px-2 py-0.5 text-xs text-yellow-900">
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>
        <button onClick={handleAddEmployee} className="btn-primary">Add Employee</button>
      </div>

      {/* Info Banner for Pending */}
      {statusFilter === 'pending' && pendingCount > 0 && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-yellow-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="font-medium text-yellow-800">
                {pendingCount} employee{pendingCount > 1 ? 's' : ''} pending verification
              </p>
              <p className="text-sm text-yellow-700 mt-1">
                These employees were auto-created from attendance imports. Please verify their information and set their salary rates before processing payroll.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-lg">
        <input
          type="text"
          placeholder="Search employees..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1); // Reset to first page when searching
          }}
          className="w-full px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-primary-200 bg-primary-50 p-4">
          <div className="flex items-center gap-2">
            <span className="font-medium text-primary-700">
              {selectedIds.size} employee{selectedIds.size > 1 ? 's' : ''} selected
            </span>
            <button
              onClick={clearSelection}
              className="text-primary-600 hover:text-primary-800 text-sm underline"
            >
              Clear selection
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => alert('Mass update dialog will be connected after the layout rebuild.')}
              disabled={bulkActionLoading}
              className="rounded border border-primary-200 bg-white px-3 py-1.5 text-sm font-medium text-primary-700 hover:bg-primary-50 disabled:opacity-50"
            >
              Mass Update
            </button>
            <select
              value=""
              onChange={async (e) => {
                if (e.target.value) {
                  setBulkActionLoading(true);
                  try {
                    await Promise.all(Array.from(selectedIds).map((id) => api.post(`/employees/${id}/set-status?new_status=${e.target.value}`)));
                    await loadEmployees();
                  } catch (err: any) {
                    console.error('Failed to update selected statuses:', err);
                    alert(err.response?.data?.detail || 'Failed to update selected statuses');
                  } finally {
                    setBulkActionLoading(false);
                  }
                  clearSelection();
                }
              }}
              disabled={bulkActionLoading}
              className="rounded border border-primary-200 bg-white px-3 py-1.5 text-sm font-medium text-primary-700 disabled:opacity-50"
            >
              <option value="">Mark as...</option>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="terminated">Terminated</option>
              <option value="inactive">Inactive</option>
            </select>
            {statusFilter === 'pending' && (
              <button
                onClick={handleBulkVerify}
                disabled={bulkActionLoading}
                className="px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 text-sm font-medium"
              >
                {bulkActionLoading ? 'Processing...' : 'Verify Selected'}
              </button>
            )}
            {(statusFilter === 'terminated' || statusFilter === 'inactive') && (
              <button
                onClick={handleBulkReactivate}
                disabled={bulkActionLoading}
                className="px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 text-sm font-medium"
              >
                {bulkActionLoading ? 'Processing...' : 'Reactivate Selected'}
              </button>
            )}
            {statusFilter === 'terminated' && (
              <button
                onClick={handleBulkMoveToInactive}
                disabled={bulkActionLoading}
                className="px-3 py-1.5 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50 text-sm font-medium"
              >
                {bulkActionLoading ? 'Processing...' : 'Move to Inactive'}
              </button>
            )}
            <button
              onClick={handleBulkDelete}
              disabled={bulkActionLoading}
              className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {bulkActionLoading ? 'Processing...' : 'Delete'}
            </button>
          </div>
        </div>
      )}

      {/* Employees Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : employees.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            {statusFilter === 'pending'
              ? 'No pending employees. Import attendance data to auto-create employees.'
              : statusFilter === 'terminated'
              ? 'No terminated employees.'
              : statusFilter === 'inactive'
              ? 'No inactive employees.'
              : 'No employees found. Add your first employee or import attendance data.'}
          </div>
        ) : (
          <>
          <div className="overflow-x-auto">
            <table className="min-w-full table-fixed divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="w-10 px-2 py-3 text-center">
                    <span className="sr-only">Actions</span>
                    <span className="inline-flex h-5 w-5 items-center justify-center text-gray-400">...</span>
                  </th>
                  <th className="w-10 px-2 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      ref={(input) => {
                        if (input) input.indeterminate = isSomeSelected;
                      }}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                  </th>
                  <th
                    className="w-28 cursor-pointer select-none px-3 py-3 text-left text-xs font-medium uppercase text-gray-500 hover:bg-gray-100"
                    onClick={() => handleSort('first_name')}
                  >
                    <div className="flex items-center gap-1">
                      First Name
                      {sortBy === 'first_name' && (
                        <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th
                    className="w-28 cursor-pointer select-none px-3 py-3 text-left text-xs font-medium uppercase text-gray-500 hover:bg-gray-100"
                    onClick={() => handleSort('last_name')}
                  >
                    <div className="flex items-center gap-1">
                      Last Name
                      {sortBy === 'last_name' && (
                        <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th className="w-16 px-3 py-3 text-left text-xs font-medium uppercase text-gray-500">Photo</th>
                  <th
                    className="w-28 cursor-pointer select-none px-3 py-3 text-left text-xs font-medium uppercase text-gray-500 hover:bg-gray-100"
                    onClick={() => handleSort('employee_no')}
                  >
                    <div className="flex items-center gap-1">
                      Employee #
                      {sortBy === 'employee_no' && (
                        <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th
                    className="w-24 cursor-pointer select-none px-3 py-3 text-left text-xs font-medium uppercase text-gray-500 hover:bg-gray-100"
                    onClick={() => handleSort('biometric_id')}
                  >
                    <div className="flex items-center gap-1">
                      Biometric ID
                      {sortBy === 'biometric_id' && (
                        <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th
                    className="w-40 cursor-pointer select-none px-3 py-3 text-left text-xs font-medium uppercase text-gray-500 hover:bg-gray-100"
                    onClick={() => handleSort('department')}
                  >
                    <div className="flex items-center gap-1">
                      Department
                      {sortBy === 'department' && (
                        <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th
                    className="w-44 cursor-pointer select-none px-3 py-3 text-left text-xs font-medium uppercase text-gray-500 hover:bg-gray-100"
                    onClick={() => handleSort('position')}
                  >
                    <div className="flex items-center gap-1">
                      Position
                      {sortBy === 'position' && (
                        <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th className="w-32 px-3 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {employees.map((emp, index) => {
                  const openMenuUpward = employees.length - index <= 3;

                  return (
                  <tr
                    key={emp.id}
                    className={`${getRowTint(emp)} hover:bg-emerald-50/50 ${
                      selectedIds.has(emp.id) ? 'ring-2 ring-primary-500 ring-inset' : ''
                    }`}>
                    <td className="relative px-2 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => setActionMenuId(actionMenuId === emp.id ? null : emp.id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded hover:bg-gray-100"
                        aria-label={`Actions for ${emp.first_name} ${emp.last_name}`}
                      >
                        <svg className="h-4 w-4 text-gray-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                          <path d="M10 6a1.5 1.5 0 110-3 1.5 1.5 0 010 3zM10 11.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zM10 17a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" />
                        </svg>
                      </button>
                      {actionMenuId === emp.id && (
                        <div
                          className={`absolute left-2 z-50 w-32 rounded-md border border-gray-200 bg-white py-1 text-left shadow-lg ${
                            openMenuUpward ? 'bottom-10' : 'top-10'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setActionMenuId(null);
                              handleViewEmployee(emp);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-gray-50"
                          >
                            View
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setActionMenuId(null);
                              handleEditEmployee(emp);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-gray-50"
                          >
                            Edit
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(emp.id)}
                        onChange={(e) => handleSelectOne(emp.id, e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                    </td>
                    <td className="truncate px-3 py-3 font-medium text-gray-900">{emp.first_name || '-'}</td>
                    <td className="truncate px-3 py-3 text-gray-700">{emp.last_name || '-'}</td>
                    <td className="px-3 py-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700">
                        {getEmployeePhoto(emp).url ? (
                          <img
                            src={getEmployeePhoto(emp).url}
                            alt=""
                            className="h-full w-full rounded-full object-cover"
                            style={{
                              transform: `translate(${getEmployeePhoto(emp).x * 0.12}px, ${getEmployeePhoto(emp).y * 0.12}px) scale(${getEmployeePhoto(emp).scale})`,
                            }}
                          />
                        ) : (
                          getInitials(emp)
                        )}
                      </div>
                    </td>
                    <td className="truncate px-3 py-3 font-medium text-gray-700">{emp.employee_no}</td>
                    <td className="truncate px-3 py-3 text-gray-500">{emp.biometric_id || '-'}</td>
                    <td className="truncate px-3 py-3 text-gray-500" title={emp.department?.name || '-'}>
                      {emp.department?.name || '-'}
                    </td>
                    <td className="truncate px-3 py-3 text-gray-500" title={emp.position || '-'}>
                      {emp.position || '-'}
                    </td>
                    <td className="px-3 py-3">
                      <select
                        className={getStatusSelectClass(emp)}
                        value={emp.status || 'active'}
                        onChange={(e) => handleSetStatus(emp.id, e.target.value)}
                      >
                        <option value="active">Active</option>
                        <option value="pending">Pending</option>
                        <option value="terminated">Terminated</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {total > 0 && (
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
              <div className="text-sm text-gray-500 flex items-center gap-4">
                <span>Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, total)} of {total} employees</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="border border-gray-300 rounded px-2 py-1 text-sm"
                >
                  <option value={10}>10 per page</option>
                  <option value={20}>20 per page</option>
                  <option value={30}>30 per page</option>
                  <option value={50}>50 per page</option>
                  <option value={100}>100 per page</option>
                </select>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(1)}
                    disabled={page === 1}
                    className="px-3 py-1 text-sm border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    First
                  </button>
                  <button
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1}
                    className="px-3 py-1 text-sm border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Prev
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (page <= 3) {
                        pageNum = i + 1;
                      } else if (page >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = page - 2 + i;
                      }
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setPage(pageNum)}
                          className={`px-3 py-1 text-sm border rounded ${
                            page === pageNum
                              ? 'bg-primary-600 text-white border-primary-600'
                              : 'hover:bg-gray-50'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => setPage(page + 1)}
                    disabled={page === totalPages}
                    className="px-3 py-1 text-sm border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                  <button
                    onClick={() => setPage(totalPages)}
                    disabled={page === totalPages}
                    className="px-3 py-1 text-sm border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Last
                  </button>
                </div>
              )}
            </div>
          )}
          </>
        )}
      </div>

      {/* Add Employee Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-5">
          <div className="flex max-h-[92vh] w-[min(98vw,96rem)] flex-col overflow-hidden rounded-lg bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between border-b border-gray-200 pb-3">
              <h2 className="text-lg font-semibold text-gray-900">Add New Employee</h2>
              <button
                type="button"
                onClick={handleCancelAdd}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Close"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <EmployeeForm
              formData={formData}
              setFormData={setFormData}
              departments={departments}
              onSubmit={handleSubmitAdd}
              onCancel={handleCancelAdd}
              onCreateDepartment={createDepartment}
              submitText="Create Employee"
              saving={saving}
              error={error}
            />
          </div>
        </div>
      )}

      {/* Edit Employee Modal */}
      {showEditModal && selectedEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-5">
          <div className="flex max-h-[92vh] w-[min(98vw,96rem)] flex-col overflow-hidden rounded-lg bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between border-b border-gray-200 pb-3">
              <h2 className="text-lg font-semibold text-gray-900">Edit Employee</h2>
              <button
                type="button"
                onClick={handleCancelEdit}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Close"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <EmployeeForm
              formData={formData}
              setFormData={setFormData}
              departments={departments}
              onSubmit={handleSubmitEdit}
              onCancel={handleCancelEdit}
              onCreateDepartment={createDepartment}
              submitText="Save Changes"
              saving={saving}
              error={error}
            />
          </div>
        </div>
      )}

      {/* View Employee Modal */}
      {showViewModal && selectedEmployee && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-lg font-semibold">Employee Details</h2>
              <button
                onClick={() => setShowViewModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-center gap-4 pb-4 border-b">
                <div className="w-16 h-16 overflow-hidden bg-primary-100 rounded-full flex items-center justify-center">
                  {getEmployeePhoto(selectedEmployee).url ? (
                    <img
                      src={getEmployeePhoto(selectedEmployee).url}
                      alt=""
                      className="h-full w-full object-cover"
                      style={{
                        transform: `translate(${getEmployeePhoto(selectedEmployee).x * 0.25}px, ${getEmployeePhoto(selectedEmployee).y * 0.25}px) scale(${getEmployeePhoto(selectedEmployee).scale})`,
                      }}
                    />
                  ) : (
                    <span className="text-primary-700 font-bold text-xl">
                      {selectedEmployee.first_name[0]}{selectedEmployee.last_name[0]}
                    </span>
                  )}
                </div>
                <div>
                  <h3 className="text-xl font-bold">
                    {selectedEmployee.full_name || `${selectedEmployee.first_name} ${selectedEmployee.middle_name ? selectedEmployee.middle_name + ' ' : ''}${selectedEmployee.last_name}`}
                  </h3>
                  <p className="text-gray-500">{selectedEmployee.employee_no}</p>
                  {getStatusBadge(selectedEmployee.status, selectedEmployee.is_active)}
                </div>
              </div>

              {/* Pending Warning */}
              {selectedEmployee.status === 'pending' && (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-800">
                    This employee was auto-created from attendance import. Please verify their information and set salary rates, then click "Verify" to activate.
                  </p>
                </div>
              )}

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Department</p>
                  <p className="font-medium">{selectedEmployee.department?.name || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Position</p>
                  <p className="font-medium">{selectedEmployee.position || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Employment Type</p>
                  <p className="font-medium capitalize">{selectedEmployee.employment_type?.replace('_', ' ') || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Hire Date</p>
                  <p className="font-medium">{selectedEmployee.hire_date || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Email</p>
                  <p className="font-medium">{selectedEmployee.email || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Phone</p>
                  <p className="font-medium">{selectedEmployee.phone || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Birth Date</p>
                  <p className="font-medium">{getEmployeeBirthday(selectedEmployee) || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Biometric ID</p>
                  <p className="font-medium">{selectedEmployee.biometric_id || '-'}</p>
                </div>
              </div>

              {/* Schedule Settings */}
              <div className="pt-4 border-t">
                <h4 className="font-semibold mb-3">Schedule Settings</h4>
                <div className="grid grid-cols-4 gap-4">
                  <div className="p-3 bg-gray-50 rounded">
                    <p className="text-sm text-gray-500">Call Time</p>
                    <p className="font-medium">{formatTime12Hour((selectedEmployee as any).call_time || '08:00')}</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded">
                    <p className="text-sm text-gray-500">Time Out</p>
                    <p className="font-medium">{formatTime12Hour((selectedEmployee as any).time_out || '17:00')}</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded">
                    <p className="text-sm text-gray-500">Work Hours/Day</p>
                    <p className="font-medium">{(selectedEmployee as any).work_hours_per_day || 8} hours</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded">
                    <p className="text-sm text-gray-500">Buffer</p>
                    <p className="font-medium">{(selectedEmployee as any).buffer_minutes ?? 10} mins</p>
                  </div>
                </div>
                {(selectedEmployee as any).is_flexible && (
                  <div className="mt-3 p-2 bg-green-50 text-green-700 rounded inline-block text-sm">
                    Flexible Schedule (no late deductions)
                  </div>
                )}
              </div>

              {/* Salary Info */}
              <div className="pt-4 border-t">
                <h4 className="font-semibold mb-3">Compensation</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-3 bg-gray-50 rounded">
                    <p className="text-sm text-gray-500">Basic Salary (Monthly)</p>
                    <p className="font-bold text-lg">{formatCurrency(selectedEmployee.basic_salary)}</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded">
                    <p className="text-sm text-gray-500">Daily Rate</p>
                    <p className="font-bold text-lg">{formatCurrency(selectedEmployee.daily_rate)}</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded">
                    <p className="text-sm text-gray-500">Hourly Rate</p>
                    <p className="font-bold text-lg">{formatCurrency(selectedEmployee.hourly_rate)}</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 mt-4">
                  <div className="p-3 bg-blue-50 rounded">
                    <p className="text-sm text-gray-500">Allowance (Monthly)</p>
                    <p className="font-bold text-lg">{formatCurrency(selectedEmployee.allowance)}</p>
                  </div>
                  <div className="p-3 bg-green-50 rounded">
                    <p className="text-sm text-gray-500">Productivity Incentive</p>
                    <p className="font-bold text-lg">{formatCurrency(selectedEmployee.productivity_incentive)}</p>
                  </div>
                  <div className="p-3 bg-green-50 rounded">
                    <p className="text-sm text-gray-500">Language Incentive</p>
                    <p className="font-bold text-lg">{formatCurrency(selectedEmployee.language_incentive)}</p>
                  </div>
                </div>
              </div>

              {/* Government Contributions */}
              <div className="pt-4 border-t">
                <h4 className="font-semibold mb-3">Government Contributions (Monthly)</h4>
                <div className="grid grid-cols-4 gap-4">
                  <div className="p-3 bg-red-50 rounded">
                    <p className="text-sm text-gray-500">SSS</p>
                    <p className="font-bold text-lg">{formatCurrency(selectedEmployee.sss_contribution)}</p>
                  </div>
                  <div className="p-3 bg-orange-50 rounded">
                    <p className="text-sm text-gray-500">PhilHealth</p>
                    <p className="font-bold text-lg">{formatCurrency(selectedEmployee.philhealth_contribution)}</p>
                  </div>
                  <div className="p-3 bg-yellow-50 rounded">
                    <p className="text-sm text-gray-500">Pag-IBIG</p>
                    <p className="font-bold text-lg">{formatCurrency(selectedEmployee.pagibig_contribution)}</p>
                  </div>
                  <div className="p-3 bg-green-50 rounded">
                    <p className="text-sm text-gray-500">Tax</p>
                    <p className="font-bold text-lg">{formatCurrency(selectedEmployee.tax_amount)}</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-4">
                {selectedEmployee.status === 'pending' && (
                  <button
                    onClick={() => {
                      handleVerifyEmployee(selectedEmployee);
                      setShowViewModal(false);
                    }}
                    className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                  >
                    Verify Employee
                  </button>
                )}
                <button
                  onClick={() => {
                    setShowViewModal(false);
                    handleEditEmployee(selectedEmployee);
                  }}
                  className="btn-secondary"
                >
                  Edit Employee
                </button>
                <button
                  onClick={() => setShowViewModal(false)}
                  className="btn-primary"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
