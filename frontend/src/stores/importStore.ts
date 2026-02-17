import { create } from 'zustand';

interface ImportedRecord {
  employee_name: string;
  employee_biometric_id: string;
  date: string;
  day_name: string;
  time_in: string | null;
  time_out: string | null;
  worked_minutes: number;
  daily_total_hours: number;
  note: string | null;
  status: string;
  exceptions: string[];
  has_exception: boolean;
}

interface ImportResult {
  message: string;
  filename: string;
  batch_id: string;
  summary: {
    total_records: number;
    imported: number;
    updated: number;
    skipped: number;
    employees_found: number;
  };
  records: ImportedRecord[];
}

interface ImportState {
  isUploading: boolean;
  uploadProgress: string;
  importResult: ImportResult | null;
  error: string | null;

  // Actions
  startUpload: (file: File) => Promise<void>;
  clearResult: () => void;
}

export const useImportStore = create<ImportState>((set) => ({
  isUploading: false,
  uploadProgress: '',
  importResult: null,
  error: null,

  startUpload: async (file: File) => {
    set({ isUploading: true, uploadProgress: 'Uploading file...', error: null });

    try {
      // Dynamic import to avoid circular dependency
      const { default: api } = await import('../api/client');

      set({ uploadProgress: 'Processing attendance data...' });

      const formData = new FormData();
      formData.append('file', file);
      formData.append('create_employees', 'true');

      const response = await api.post('/attendance/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      set({
        isUploading: false,
        uploadProgress: '',
        importResult: response.data,
        error: null
      });
    } catch (error: any) {
      set({
        isUploading: false,
        uploadProgress: '',
        error: error.response?.data?.detail || 'Failed to import attendance'
      });
    }
  },

  clearResult: () => {
    set({ importResult: null, error: null });
  }
}));
