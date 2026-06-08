import { useState, useEffect } from 'react';
import { holidaysApi } from '../api/client';

interface Holiday {
  id: number;
  date: string;
  name: string;
  holiday_type: string;
  description: string | null;
}

interface UpcomingHolidaysData {
  today: string;
  is_holiday_today: boolean;
  today_holiday: Holiday | null;
  upcoming: Holiday[];
  total: number;
}

export function RightSidebar() {
  const [holidaysData, setHolidaysData] = useState<UpcomingHolidaysData | null>(null);
  const [monthlyHolidays, setMonthlyHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'date' | 'calendar'>('date');
  const [hoveredHoliday, setHoveredHoliday] = useState<Holiday | null>(null);

  // Current date info
  const now = new Date();
  const monthName = now.toLocaleString('default', { month: 'long' });
  const dayName = now.toLocaleString('default', { weekday: 'long' });
  const dateNumber = now.getDate();
  const year = now.getFullYear();
  const currentMonth = now.getMonth();

  // Get days in current month
  const daysInMonth = new Date(year, currentMonth + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, currentMonth, 1).getDay();

  // Generate calendar grid
  const calendarDays: (number | null)[] = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    calendarDays.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    calendarDays.push(i);
  }

  // Create a map of day -> holiday for the current month
  const holidayMap = new Map<number, Holiday>();
  monthlyHolidays.forEach(holiday => {
    const holidayDate = new Date(holiday.date);
    if (holidayDate.getMonth() === currentMonth && holidayDate.getFullYear() === year) {
      holidayMap.set(holidayDate.getDate(), holiday);
    }
  });

  useEffect(() => {
    const controller = new AbortController();

    const fetchHolidays = async () => {
      try {
        // Fetch upcoming holidays
        const upcomingData = await holidaysApi.getUpcoming(5);
        if (!controller.signal.aborted) {
          setHolidaysData(upcomingData);
        }

        // Fetch all holidays for the current year to show in calendar
        const yearData = await holidaysApi.list({ year });
        if (!controller.signal.aborted) {
          setMonthlyHolidays(yearData.items || []);
        }
      } catch (error: any) {
        if (error.name !== 'CanceledError' && error.code !== 'ERR_CANCELED') {
          console.error('Failed to fetch holidays:', error);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchHolidays();

    return () => {
      controller.abort();
    };
  }, [year]);

  const formatHolidayDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const month = date.toLocaleString('default', { month: 'short' });
    const day = date.getDate();
    return { month, day };
  };

  const getDaysUntil = (dateStr: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const holidayDate = new Date(dateStr);
    holidayDate.setHours(0, 0, 0, 0);
    const diffTime = holidayDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    return `in ${diffDays}d`;
  };

  // Get holiday color based on type
  const getHolidayColor = (type: string) => {
    switch (type) {
      case 'regular':
        return 'bg-red-500';
      case 'special':
        return 'bg-blue-500';
      case 'special_working':
        return 'bg-amber-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getHolidayMarkerColor = (type: string) => {
    switch (type) {
      case 'regular':
        return '#ef4444';
      case 'special':
        return '#3b82f6';
      case 'special_working':
        return '#f59e0b';
      default:
        return '#6b7280';
    }
  };

  const getMarkerBackground = (colors: string[]) => {
    if (colors.length === 0) return undefined;
    if (colors.length === 1) return colors[0];

    const maxIndex = colors.length - 1;
    const stops = colors.map((color, index) => `${color} ${Math.round((index / maxIndex) * 100)}%`);
    return `linear-gradient(45deg, ${stops.join(', ')})`;
  };

  return (
    <div className="w-full flex-shrink-0">
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setViewMode(viewMode === 'date' ? 'calendar' : 'date')}
          className="group block aspect-square w-full [perspective:1200px]"
          aria-label="Toggle calendar card"
        >
          <div
            className={`relative h-full w-full rounded-lg transition-transform duration-500 [transform-style:preserve-3d] ${
              viewMode === 'calendar' ? '[transform:rotateY(180deg)]' : ''
            }`}
          >
            <div className="absolute inset-0 overflow-hidden rounded-lg border border-gray-200 bg-white text-left shadow-sm [backface-visibility:hidden]">
              <div className="bg-[#2f6f63] px-5 py-4">
                <p className="text-sm font-bold text-white">Today</p>
              </div>
              <div className="flex h-[calc(100%-52px)] flex-col items-center justify-center">
                <p className="text-sm font-semibold text-gray-500">{dayName}</p>
                <p className="my-1 text-6xl font-bold leading-none text-gray-900">{dateNumber}</p>
                <p className="text-base font-medium text-gray-600">{monthName} {year}</p>
              </div>
            </div>

            <div className="absolute inset-0 overflow-hidden rounded-lg border border-gray-200 bg-white text-left shadow-sm [backface-visibility:hidden] [transform:rotateY(180deg)]">
              <div className="flex h-full flex-col p-2.5">
              <div className="mb-1.5 flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#087568]">Calendar</h3>
                <span className="text-xs font-bold text-gray-900">{monthName} {year}</span>
              </div>
              <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-semibold text-gray-400">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                  <div key={i}>{day}</div>
                ))}
              </div>
              <div className="relative mt-1 grid grid-cols-7 gap-0.5 text-center text-[11px] text-gray-600">
                {calendarDays.map((day, i) => {
                  const holiday = day ? holidayMap.get(day) : null;
                  const isToday = day === dateNumber;
                  const isCutoffStart = day === 11 || day === 26;
                  const isCutoffEnd = day === 10 || day === 25;
                  const isPayday = day === 15 || day === 26;
                  const markers = [
                    ...(holiday ? [{ label: holiday.name, color: getHolidayMarkerColor(holiday.holiday_type) }] : []),
                    ...(isCutoffStart ? [{ label: 'Cutoff start', color: '#8b5cf6' }] : []),
                    ...(isCutoffEnd ? [{ label: 'Cutoff end', color: '#6d28d9' }] : []),
                    ...(isPayday ? [{ label: 'Payday', color: '#059669' }] : []),
                  ];
                  const markerBackground = getMarkerBackground(markers.map((marker) => marker.color));

                  return (
                    <div
                      key={i}
                      className={`
                        mx-auto flex h-[23px] w-[25px] items-center justify-center rounded-md border text-[11px] transition-transform hover:scale-110
                        ${isToday && !markerBackground ? 'border-teal-500 bg-teal-100 text-[#087568] font-bold' : ''}
                        ${markerBackground ? 'border-white font-bold text-white shadow-sm' : 'border-transparent'}
                        ${isToday && markerBackground ? 'ring-2 ring-teal-300 ring-offset-1' : ''}
                      `}
                      style={markerBackground ? { background: markerBackground } : undefined}
                      title={markers.map((marker) => marker.label).join(' / ')}
                      onMouseEnter={() => holiday && setHoveredHoliday(holiday)}
                      onMouseLeave={() => setHoveredHoliday(null)}
                    >
                      {day}
                    </div>
                  );
                })}
                {hoveredHoliday && (
                  <div className="absolute left-1/2 top-0 z-50 -translate-x-1/2 -translate-y-full rounded bg-gray-900 px-2 py-1 text-xs text-white shadow">
                    {hoveredHoliday.name}
                  </div>
                )}
              </div>
              <div className="mt-auto border-t border-gray-200 pt-1.5">
                <div className="mb-1 grid grid-cols-2 gap-1.5 text-[9px] font-bold uppercase tracking-wide text-gray-400">
                  <span>Holidays</span>
                  <span>Payroll</span>
                </div>
                <div className="grid grid-cols-2 gap-x-1.5 gap-y-1 text-[9px] font-medium leading-none text-gray-600">
                  <span className="flex min-w-0 items-center gap-1 rounded bg-gray-50 px-1.5 py-1"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />Regular</span>
                  <span className="flex min-w-0 items-center gap-1 rounded bg-gray-50 px-1.5 py-1"><span className="h-1.5 w-1.5 shrink-0 rounded-full border border-violet-500" />Start</span>
                  <span className="flex min-w-0 items-center gap-1 rounded bg-gray-50 px-1.5 py-1"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />SNWH</span>
                  <span className="flex min-w-0 items-center gap-1 rounded bg-gray-50 px-1.5 py-1"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-violet-600" />End</span>
                  <span className="flex min-w-0 items-center gap-1 rounded bg-gray-50 px-1.5 py-1"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />SWH</span>
                  <span className="flex min-w-0 items-center gap-1 rounded bg-gray-50 px-1.5 py-1"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-600" />Payday</span>
                </div>
              </div>
            </div>
            </div>
          </div>
        </button>

        <div className="flex min-h-[285px] flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <h4 className="flex items-center gap-2 text-base font-bold text-gray-900">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Upcoming
            </h4>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-sm font-bold text-[#087568]">
              {holidaysData?.total || 0}
            </span>
          </div>

          <div className="flex-1 flex flex-col">
            {loading ? (
              <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">Loading...</div>
            ) : holidaysData?.upcoming && holidaysData.upcoming.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {holidaysData.upcoming.slice(0, 5).map((holiday) => {
                  const { month, day } = formatHolidayDate(holiday.date);
                  const daysUntil = getDaysUntil(holiday.date);

                  return (
                    <div key={holiday.id} className="flex items-center gap-3 px-4 py-3">
                      <div
                        className={`flex h-12 w-12 flex-shrink-0 flex-col items-center justify-center rounded-lg text-white ${
                          getHolidayColor(holiday.holiday_type)
                        }`}
                      >
                        <span className="text-[10px] font-medium uppercase leading-none">{month}</span>
                        <span className="text-2xl font-bold leading-none">{day}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-bold text-gray-900">{holiday.name}</p>
                        <p className="mt-1 text-xs text-gray-500">{daysUntil}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center p-4">
                <p className="text-gray-400 text-sm text-center">No upcoming holidays</p>
              </div>
            )}
          </div>

          {/* View all link */}
          {holidaysData?.upcoming && holidaysData.upcoming.length > 0 && (
            <a
              href="/admin/holidays"
              className="block border-t border-gray-200 px-3 py-3 text-center text-lg font-bold text-blue-600 transition-colors hover:bg-blue-50"
            >
              View All
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
