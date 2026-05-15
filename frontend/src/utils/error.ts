/**
 * Shared error handling utilities
 * Consolidates duplicate error handling patterns from across the codebase
 */

/**
 * Extract error message from API error response
 * Handles various error response formats from the backend
 */
export const getErrorMessage = (error: any, fallbackMessage: string = 'An error occurred'): string => {
  if (!error) return fallbackMessage;

  // Check for axios response error
  const detail = error.response?.data?.detail;

  if (typeof detail === 'string') {
    return detail;
  }

  if (Array.isArray(detail)) {
    return detail
      .map((e: any) => e.msg || e.message || JSON.stringify(e))
      .join(', ');
  }

  if (detail && typeof detail === 'object') {
    return detail.message || detail.msg || JSON.stringify(detail);
  }

  // Check for standard error message
  if (error.message) {
    return error.message;
  }

  return fallbackMessage;
};

/**
 * Show error alert with extracted message
 */
export const showErrorAlert = (error: any, fallbackMessage: string = 'An error occurred'): void => {
  alert(getErrorMessage(error, fallbackMessage));
};

/**
 * Handle API error with optional callback
 */
export const handleApiError = (
  error: any,
  fallbackMessage: string = 'An error occurred',
  onError?: (message: string) => void
): void => {
  const message = getErrorMessage(error, fallbackMessage);
  if (onError) {
    onError(message);
  } else {
    alert(message);
  }
};
