import { useState, useRef, useEffect } from 'react';

interface Option {
  id: number | string;
  name: string;
}

interface CreatableSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string, isNew?: boolean, newName?: string) => void;
  onCreateNew?: (name: string) => Promise<Option | null>;
  placeholder?: string;
  className?: string;
}

export function CreatableSelect({
  options,
  value,
  onChange,
  onCreateNew,
  placeholder = 'Select or type to create...',
  className = '',
}: CreatableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Get display value for selected option
  const selectedOption = options.find((opt) => opt.id.toString() === value);
  const displayValue = selectedOption?.name || '';

  // Filter options based on input
  const filteredOptions = options.filter((opt) =>
    opt.name.toLowerCase().includes(inputValue.toLowerCase())
  );

  // Check if input matches any existing option
  const exactMatch = options.find(
    (opt) => opt.name.toLowerCase() === inputValue.toLowerCase()
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setInputValue('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    if (!isOpen) setIsOpen(true);
  };

  const handleSelectOption = (opt: Option) => {
    onChange(opt.id.toString());
    setInputValue('');
    setIsOpen(false);
  };

  const handleCreateNew = async () => {
    if (!inputValue.trim() || !onCreateNew) return;

    setIsCreating(true);
    try {
      const newOption = await onCreateNew(inputValue.trim());
      if (newOption) {
        onChange(newOption.id.toString());
        setInputValue('');
        setIsOpen(false);
      }
    } catch (error) {
      console.error('Failed to create new option:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (inputValue && !exactMatch && onCreateNew) {
        handleCreateNew();
      } else if (filteredOptions.length === 1) {
        handleSelectOption(filteredOptions[0]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setInputValue('');
    }
  };

  const handleClear = () => {
    onChange('');
    setInputValue('');
    inputRef.current?.focus();
  };

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={isOpen ? inputValue : displayValue}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 pr-8"
        />
        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleSelectOption(opt)}
                className={`w-full px-3 py-2 text-left hover:bg-gray-100 ${
                  opt.id.toString() === value ? 'bg-primary-50 text-primary-700' : ''
                }`}
              >
                {opt.name}
              </button>
            ))
          ) : inputValue ? (
            <div className="px-3 py-2 text-gray-500 text-sm">No matches found</div>
          ) : (
            <div className="px-3 py-2 text-gray-500 text-sm">Type to search or create new</div>
          )}

          {/* Create new option */}
          {inputValue && !exactMatch && onCreateNew && (
            <button
              type="button"
              onClick={handleCreateNew}
              disabled={isCreating}
              className="w-full px-3 py-2 text-left bg-green-50 hover:bg-green-100 text-green-700 border-t flex items-center gap-2"
            >
              {isCreating ? (
                <>
                  <div className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin"></div>
                  Creating...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Create "{inputValue}"
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
