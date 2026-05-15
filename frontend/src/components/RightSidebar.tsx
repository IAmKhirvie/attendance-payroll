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

  return (
    <div className="flex-shrink-0" style={{ width: '256px' }}>
      <div className="space-y-3">
        {/* Calendar Card - 256x256 */}
        <div
          className="rounded-xl overflow-hidden flex flex-col"
          style={{
            width: '256px',
            height: '256px',
            background: 'linear-gradient(135deg, #166534 0%, #15803d 50%, #16a34a 100%)',
            boxShadow: '0 4px 20px rgba(22, 101, 52, 0.25)',
          }}
        >
          {/* View Toggle */}
          <div className="flex justify-center gap-2 px-3 pt-3">
            <button
              onClick={() => setViewMode('date')}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                viewMode === 'date'
                  ? 'bg-white text-green-800'
                  : 'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                viewMode === 'calendar'
                  ? 'bg-white text-green-800'
                  : 'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              Calendar
            </button>
          </div>

          {viewMode === 'date' ? (
            /* Date View - Centered */
            <div className="flex-1 flex flex-col items-center justify-center text-white p-4">
              <p className="text-white/80 text-sm font-medium">{dayName}</p>
              <p className="text-7xl font-bold my-2 text-white" style={{ textShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
                {dateNumber}
              </p>
              <p className="text-white text-base font-semibold">{monthName} {year}</p>
            </div>
          ) : (
            /* Calendar Grid View */
            <div className="flex-1 flex flex-col p-3 text-white">
              <div className="text-center mb-2">
                <span className="text-sm font-bold">{monthName} {year}</span>
              </div>
              <div className="grid grid-cols-7 gap-0.5 mb-1">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                  <div key={i} className="text-center text-[10px] font-semibold text-white/60">
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-0.5 relative">
                {calendarDays.map((day, i) => {
                  const holiday = day ? holidayMap.get(day) : null;
                  const isToday = day === dateNumber;

                  return (
                    <div
                      key={i}
                      className={`
                        h-5 w-5 flex items-center justify-center text-[11px] rounded-full mx-auto relative cursor-default
                        ${isToday
                          ? 'bg-white text-green-800 font-bold'
                          : holiday
                          ? `${getHolidayColor(holiday.holiday_type)} text-white font-semibold`
                          : day !== null
                          ? 'text-white/90'
                          : ''
                        }
                      `}
                      onMouseEnter={() => holiday && setHoveredHoliday(holiday)}
                      onMouseLeave={() => setHoveredHoliday(null)}
                    >
                      {day}
                    </div>
                  );
                })}

                {/* Tooltip */}
                {hoveredHoliday && (
                  <div
                    className="absolute z-50 bg-gray-900 text-white text-[10px] px-2 py-1 rounded shadow-lg whitespace-nowrap"
                    style={{
                      bottom: '100%',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      marginBottom: '4px'
                    }}
                  >
                    {hoveredHoliday.name}
                  </div>
                )}
              </div>

              {/* Legend */}
              <div className="mt-2 pt-2 border-t border-white/20">
                <div className="flex items-center justify-center gap-3 text-[9px]">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-red-500"></div>
                    <span className="text-white/70">Regular</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                    <span className="text-white/70">SNWH</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                    <span className="text-white/70">SWH</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Today's holiday status */}
          {holidaysData?.is_holiday_today && (
            <div
              className="px-3 py-2 text-center"
              style={{
                background: 'rgba(255, 255, 255, 0.15)',
                borderTop: '1px solid rgba(255, 255, 255, 0.2)',
              }}
            >
              <p className="text-yellow-300 font-bold text-xs">Holiday: {holidaysData.today_holiday?.name}</p>
            </div>
          )}
        </div>

        {/* Upcoming Holidays Card */}
        <div
          className="rounded-xl overflow-hidden flex flex-col"
          style={{
            background: '#ffffff',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-sm)',
            minHeight: '320px',
          }}
        >
          <div
            className="px-3 py-2 flex items-center justify-between"
            style={{
              background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
              borderBottom: '1px solid #86efac',
            }}
          >
            <h4 className="font-bold text-green-800 text-sm flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Upcoming
            </h4>
            <span className="text-[10px] bg-green-500 text-white px-1.5 py-0.5 rounded-full font-semibold">
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
                    <div key={holiday.id} className="px-3 py-3 flex items-center gap-3">
                      {/* Date badge */}
                      <div
                        className={`flex-shrink-0 w-12 h-12 rounded-lg flex flex-col items-center justify-center text-white ${
                          getHolidayColor(holiday.holiday_type)
                        }`}
                      >
                        <span className="text-[10px] font-medium uppercase leading-none">{month}</span>
                        <span className="text-lg font-bold leading-none">{day}</span>
                      </div>
                      {/* Holiday details */}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm truncate">{holiday.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{daysUntil}</p>
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
              className="block px-3 py-2 text-center text-xs font-semibold text-primary-600 hover:bg-primary-50 transition-colors"
              style={{ borderTop: '1px solid var(--border)' }}
            >
              View All
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
