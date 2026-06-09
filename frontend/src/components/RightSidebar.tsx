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
  const [calendarOffset, setCalendarOffset] = useState(0);
  const [hoveredCalendarCell, setHoveredCalendarCell] = useState<number | null>(null);

  // Current date info
  const now = new Date();
  const visibleDate = new Date(now.getFullYear(), now.getMonth() + calendarOffset, 1);
  const monthName = now.toLocaleString('default', { month: 'long' });
  const dayName = now.toLocaleString('default', { weekday: 'long' });
  const dateNumber = now.getDate();
  const todayYear = now.getFullYear();
  const todayMonth = now.getMonth();
  const year = visibleDate.getFullYear();
  const currentMonth = visibleDate.getMonth();
  const calendarMonthName = visibleDate.toLocaleString('default', { month: 'long' });

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

  const mixWithWhite = (hex: string, percent = 82) => `color-mix(in srgb, ${hex} ${100 - percent}%, white ${percent}%)`;

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
                <p className="text-base font-medium text-gray-600">{monthName} {todayYear}</p>
              </div>
            </div>

            <div className="absolute inset-0 overflow-visible rounded-lg border border-gray-200 bg-white text-left shadow-sm [backface-visibility:hidden] [transform:rotateY(180deg)]">
              <div className="flex h-full flex-col p-2.5">
              <div className="mb-1.5 flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#087568]">Calendar</h3>
                <span className="flex items-center gap-1 text-xs font-bold text-gray-900">
                  <span
                    role="button"
                    tabIndex={0}
                    className="rounded px-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                    onClick={(event) => {
                      event.stopPropagation();
                      setCalendarOffset((offset) => offset - 1);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        event.stopPropagation();
                        setCalendarOffset((offset) => offset - 1);
                      }
                    }}
                    aria-label="Previous month"
                  >
                    ‹
                  </span>
                  {calendarMonthName} {year}
                  <span
                    role="button"
                    tabIndex={0}
                    className="rounded px-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                    onClick={(event) => {
                      event.stopPropagation();
                      setCalendarOffset((offset) => offset + 1);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        event.stopPropagation();
                        setCalendarOffset((offset) => offset + 1);
                      }
                    }}
                    aria-label="Next month"
                  >
                    ›
                  </span>
                </span>
              </div>
              <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-semibold text-gray-400">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                  <div key={i}>{day}</div>
                ))}
              </div>
              <div className="relative mt-1 grid flex-1 grid-cols-7 auto-rows-fr gap-x-0 gap-y-0.5 text-center text-[11px] text-gray-600">
	                {calendarDays.map((day, i) => {
	                  const holiday = day ? holidayMap.get(day) : null;
	                  const dayOfWeek = day ? new Date(year, currentMonth, day).getDay() : -1;
	                  const thursdayHoliday = day
	                    ? dayOfWeek === 5
	                      ? holidayMap.get(day - 1)
	                      : dayOfWeek === 6
	                        ? holidayMap.get(day - 2)
	                        : dayOfWeek === 0
	                          ? holidayMap.get(day - 3)
	                          : null
	                    : null;
	                  const fridayHoliday = day
	                    ? dayOfWeek === 6
	                      ? holidayMap.get(day - 1)
	                      : dayOfWeek === 0
	                        ? holidayMap.get(day - 2)
	                        : null
	                    : null;
	                  const mondayHoliday = day ? holidayMap.get(day + 1) || holidayMap.get(day + 2) : null;
	                  const longWeekendHoliday = !holiday && dayOfWeek === 6
	                    ? fridayHoliday || thursdayHoliday || mondayHoliday || null
	                    : !holiday && dayOfWeek === 0
	                      ? fridayHoliday || thursdayHoliday || mondayHoliday || null
	                      : !holiday && dayOfWeek === 5
	                        ? thursdayHoliday || null
	                      : null;
                  const holidayMarker = holiday || longWeekendHoliday;
                  const isToday = day === dateNumber && currentMonth === todayMonth && year === todayYear;
                  const isCutoffStart = day === 11 || day === 26;
                  const isCutoffEnd = day === 10 || day === 25;
                  const hasPayrollMarker = isCutoffStart || isCutoffEnd;
	                  const holidayColor = holidayMarker ? getHolidayMarkerColor(holidayMarker.holiday_type) : '';
	                  const isHolidayRangeStart = Boolean(
	                    (holiday && (dayOfWeek === 4 || (dayOfWeek === 5 && !thursdayHoliday))) ||
	                    (!holiday && dayOfWeek === 6 && mondayHoliday && !fridayHoliday && !thursdayHoliday)
	                  );
	                  const isHolidayRangeMiddle = Boolean(
	                    (dayOfWeek === 5 && thursdayHoliday) ||
	                    (dayOfWeek === 6 && (thursdayHoliday || fridayHoliday)) ||
	                    (!holiday && dayOfWeek === 0 && mondayHoliday)
	                  );
	                  const isHolidayRangeEnd = Boolean(
	                    (!holiday && dayOfWeek === 0 && (fridayHoliday || thursdayHoliday) && !mondayHoliday) ||
	                    (holiday && dayOfWeek === 1)
	                  );
                  const hasHolidayRange = Boolean(isHolidayRangeStart || isHolidayRangeMiddle || isHolidayRangeEnd || longWeekendHoliday);
                  const isPlainCutoffStart = Boolean(isCutoffStart && !holidayMarker && !isCutoffEnd);
                  const tooltipAlignClass = i % 7 >= 5
                    ? 'right-0 translate-x-0'
                    : i % 7 <= 1
                      ? 'left-0 translate-x-0'
                      : 'left-1/2 -translate-x-1/2';
                  const markers = [
                    ...(holidayMarker ? [{
                      kind: 'holiday',
                      label: holiday ? holiday.name : `${longWeekendHoliday?.name || 'Holiday'} long weekend`,
                      color: holidayColor,
                    }] : []),
                    ...(isCutoffStart ? [{
                      kind: 'cutoff-start',
                      label: day === 11 ? '2nd Cutoff Start' : '1st Cutoff Start',
                      color: '#8b5cf6',
                    }] : []),
                    ...(isCutoffEnd ? [{
                      kind: 'cutoff-end',
                      label: day === 10 ? '1st Cutoff End' : '2nd Cutoff End',
                      color: '#6d28d9',
                    }] : []),
                  ];
	                  const visualMarkers = isPlainCutoffStart
	                    ? markers.filter((marker) => marker.kind !== 'cutoff-start' && !(isHolidayRangeMiddle && marker.kind === 'holiday'))
	                    : markers.filter((marker) => {
	                        if (isHolidayRangeMiddle && !holiday && !hasPayrollMarker && marker.kind === 'holiday') {
	                          return false;
	                        }
	                        if (hasPayrollMarker && marker.kind === 'holiday') {
	                          return false;
	                        }
	                        return true;
	                      });
	                  const markerBackground = getMarkerBackground(visualMarkers.map((marker) => marker.color));
	                  const rangeBackground = hasPayrollMarker && holidayColor
	                    ? getMarkerBackground([
	                        holidayColor,
	                        ...markers.filter((marker) => marker.kind !== 'holiday').map((marker) => marker.color),
	                      ])
	                    : holidayColor;
	                  const holidayPaleBackground = isHolidayRangeMiddle && holidayColor ? mixWithWhite(holidayColor) : undefined;

                  return (
                    <div
                      key={i}
                      className="relative flex min-h-0 items-center justify-center"
                      title={markers.map((marker) => marker.label).join(' / ')}
                      onMouseEnter={() => day && setHoveredCalendarCell(i)}
                      onMouseLeave={() => setHoveredCalendarCell((current) => (current === i ? null : current))}
                    >
                      {day && hasHolidayRange && holidayColor && (
	                        <span
	                          className={`
	                            absolute top-1/2 h-6 -translate-y-1/2 opacity-[0.22]
	                            ${isHolidayRangeStart ? 'left-1/2 right-0 rounded-l-md' : ''}
	                            ${isHolidayRangeMiddle ? 'left-0 right-0' : ''}
	                            ${isHolidayRangeEnd ? 'left-0 right-1/2 rounded-r-md' : ''}
	                          `}
	                          style={{ background: rangeBackground }}
	                        />
                      )}
                      {day && (
                        <span
	                          className={`
	                            relative z-10 flex h-6 w-6 items-center justify-center rounded-md border text-[11px] transition-transform hover:scale-110
	                            ${isToday && !markerBackground && !isPlainCutoffStart ? 'border-teal-500 bg-teal-100 text-[#087568] font-bold' : ''}
	                            ${isHolidayRangeMiddle && !markerBackground ? 'border-transparent bg-transparent font-semibold shadow-none' : ''}
	                            ${markerBackground ? 'border-white font-bold text-white shadow-sm' : 'border-transparent'}
                            ${holidayPaleBackground || isPlainCutoffStart || isHolidayRangeMiddle ? 'font-bold' : ''}
                            ${isToday && (markerBackground || isPlainCutoffStart) ? 'ring-2 ring-teal-300 ring-offset-1' : ''}
                          `}
                          style={markerBackground
                            ? { background: markerBackground }
                            : isPlainCutoffStart
                              ? { background: '#f5f3ff', borderColor: '#8b5cf6', color: '#6d28d9' }
                              : isHolidayRangeMiddle
                                ? { background: 'transparent', borderColor: 'transparent', color: holidayColor }
                              : holidayPaleBackground
                                ? { background: holidayPaleBackground, color: holidayColor }
                                : undefined
                          }
                        >
                          {day}
                        </span>
                      )}
                      {day && markers.length > 0 && hoveredCalendarCell === i && (
                        <div
                          className={`
                            pointer-events-none absolute z-[200] min-w-36 max-w-44 rounded-md border border-gray-200 bg-white px-2.5 py-2 text-left text-[10px] font-semibold text-gray-800 shadow-2xl
                            ${i < 14 ? 'top-full mt-1' : 'bottom-full mb-1'}
                            ${tooltipAlignClass}
                          `}
                        >
                          <div className="space-y-1 whitespace-normal break-words">
                            {markers.map((marker) => (
                              <div key={`${marker.kind}-${marker.label}`} className="flex items-center gap-1.5">
                                <span
                                  className="h-2 w-2 shrink-0 rounded-full"
                                  style={{ backgroundColor: marker.color }}
                                />
                                <span className="text-gray-700">{marker.label}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
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
