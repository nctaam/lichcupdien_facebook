
import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { ScheduleItem } from '../types';
import html2canvas from 'html2canvas';
import SummaryLoader from './SummaryLoader';
import Markdown from 'react-markdown';
import { Sparkles, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';

interface ScheduleDisplayProps {
  schedule: ScheduleItem[];
  teamName: string;
  startDate: string;
  endDate: string;
  showTeamColumn?: boolean;
  dailySummaries?: Record<string, string>;
  isSummarizing?: boolean;
  orderedTeams?: string[];
  showSummaries: boolean;
  onToggleSummaries: () => void;
  isAiDisabled: boolean;
}

type SortableColumn = 'time' | 'area';
type SortDirection = 'asc' | 'desc';

const ITEMS_PER_PAGE = 10;

// A palette of soft, distinct background colors for each paginated view
const PAGE_COLORS = [
    'bg-white dark:bg-gray-800',
    'bg-sky-50 dark:bg-sky-900/60',
    'bg-amber-50 dark:bg-amber-900/60',
    'bg-emerald-50 dark:bg-emerald-900/60',
    'bg-fuchsia-50 dark:bg-fuchsia-900/60',
    'bg-rose-50 dark:bg-rose-900/60',
    'bg-indigo-50 dark:bg-indigo-900/60',
];

const SortIcon = ({ direction }: { direction: SortDirection }) => (
  <span className="inline-block w-4 h-4 ml-1 text-white/80">
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      {direction === 'asc' ? (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 15l7-7 7 7" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
      )}
    </svg>
  </span>
);

const ScheduleDisplay: React.FC<ScheduleDisplayProps> = ({ schedule, teamName, startDate, endDate, showTeamColumn = false, dailySummaries, isSummarizing = false, orderedTeams, showSummaries, onToggleSummaries, isAiDisabled }) => {
  // State for team group pagination
  const [currentTeamPageIndex, setCurrentTeamPageIndex] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingAll, setIsExportingAll] = useState(false);
  const [exportProgressMessage, setExportProgressMessage] = useState('');
  const [expandedSummaries, setExpandedSummaries] = useState<Record<string, boolean>>({});
  const [sortConfig, setSortConfig] = useState<{ column: SortableColumn; direction: SortDirection }>({ column: 'time', direction: 'asc' });
  const displayContainerRef = useRef<HTMLDivElement>(null);
  const originalPageIndexRef = useRef<number>(0);

  // Group schedules by team if in "all teams" mode
  const schedulesByTeam = useMemo(() => {
    if (!showTeamColumn) return null;
    return schedule.reduce((acc, item) => {
      const team = item.TEN_DVIQLY || 'Không xác định';
      if (!acc[team]) {
        acc[team] = [];
      }
      acc[team].push(item);
      return acc;
    }, {} as Record<string, ScheduleItem[]>);
  }, [schedule, showTeamColumn]);

  const teamsWithSchedules = useMemo(() => {
    if (!schedulesByTeam) {
      return [];
    }
    const teamsInSchedule = Object.keys(schedulesByTeam);
    
    // If we are in "all teams" mode and an ordered list is provided, use it to sort.
    if (showTeamColumn && orderedTeams) {
      return orderedTeams.filter(team => teamsInSchedule.includes(team));
    }

    // Otherwise, return the teams as they are (order isn't guaranteed, but it's not "all teams" view).
    return teamsInSchedule;
  }, [schedulesByTeam, orderedTeams, showTeamColumn]);

  // Unified pagination logic: Group small teams, but give large teams their own pages.
  const teamPages = useMemo(() => {
    if (!showTeamColumn || !schedulesByTeam || teamsWithSchedules.length === 0) {
      return [];
    }

    const pages: { teamNames: string[]; schedule: ScheduleItem[] }[] = [];
    let currentPageItems: ScheduleItem[] = [];
    let currentPageTeamNames = new Set<string>();

    for (const teamName of teamsWithSchedules) {
      const teamSchedule = schedulesByTeam[teamName];
      const teamItemCount = teamSchedule.length;

      // Case 1: Large team that gets its own dedicated page(s).
      if (teamItemCount > ITEMS_PER_PAGE) {
        // First, if there's a pending page of small teams, finalize and push it.
        if (currentPageItems.length > 0) {
          pages.push({
            teamNames: Array.from(currentPageTeamNames),
            schedule: currentPageItems,
          });
          currentPageItems = [];
          currentPageTeamNames.clear();
        }

        // Now, paginate the large team's items into its own pages.
        for (let i = 0; i < teamItemCount; i += ITEMS_PER_PAGE) {
          const chunk = teamSchedule.slice(i, i + ITEMS_PER_PAGE);
          pages.push({
            teamNames: [teamName], // This page only contains this one team.
            schedule: chunk,
          });
        }
      }
      // Case 2: Small team. Try to group it with other small teams.
      else {
        // If adding this team would overflow the current page, finalize the old page and start a new one.
        if (currentPageItems.length > 0 && currentPageItems.length + teamItemCount > ITEMS_PER_PAGE) {
            pages.push({
              teamNames: Array.from(currentPageTeamNames),
              schedule: currentPageItems,
            });
            // Start a new page with the current small team.
            currentPageItems = [...teamSchedule];
            currentPageTeamNames = new Set([teamName]);
        }
        // Otherwise, add this small team to the current page.
        else {
            currentPageItems.push(...teamSchedule);
            currentPageTeamNames.add(teamName);
        }
      }
    }

    // After the loop, if there's a pending page of small teams, add it.
    if (currentPageItems.length > 0) {
      pages.push({
        teamNames: Array.from(currentPageTeamNames),
        schedule: currentPageItems,
      });
    }

    return pages;
  }, [schedulesByTeam, teamsWithSchedules, showTeamColumn]);


  // Determine the schedule to display based on the current view
  const currentTeamPageData = useMemo(() => {
    if (!showTeamColumn) {
      // For single team view, we still need to paginate items
       const totalPages = Math.ceil(schedule.length / ITEMS_PER_PAGE);
       const pages = Array.from({ length: totalPages }, (_, i) => {
         const start = i * ITEMS_PER_PAGE;
         return schedule.slice(start, start + ITEMS_PER_PAGE);
       });
       return { teamNames: [teamName], schedule: pages[currentTeamPageIndex] || [] };
    }
    return teamPages[currentTeamPageIndex] || { teamNames: [], schedule: [] };
  }, [schedule, teamName, showTeamColumn, teamPages, currentTeamPageIndex]);
  
  const itemsToDisplay = currentTeamPageData.schedule;
  
  // Reset pagination state when the base data changes
  useEffect(() => {
    setCurrentTeamPageIndex(0);
    setSortConfig({ column: 'time', direction: 'asc' }); // Reset sorting as well
    setExpandedSummaries({});
  }, [schedule]);


  const formatDateForDisplay = (dateString: string) => {
    if (!dateString) return 'Ngày không xác định';
    const date = new Date(`${dateString}T00:00:00`);
    return date.toLocaleDateString('vi-VN', {
      weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
    });
  };

  const isoDateFromDdMmYyyy = (ddmmyyyy: string): string => {
    if (!ddmmyyyy) return '';
    const parts = ddmmyyyy.split('/');
    if (parts.length !== 3) return '';
    const [day, month, year] = parts;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const title = useMemo(() => {
    const displayStartDate = formatDateForDisplay(startDate);
    const displayEndDate = formatDateForDisplay(endDate);
    const datePart = startDate === endDate
      ? `ngày ${displayStartDate}`
      : `từ ngày ${displayStartDate} đến ngày ${displayEndDate}`;

    const isPaginating = (showTeamColumn && teamPages.length > 0) || (!showTeamColumn && schedule.length > ITEMS_PER_PAGE);
    const name = isPaginating && showTeamColumn ? currentTeamPageData.teamNames.join(' & ') : teamName;

    return `Lịch cúp điện của ${name} ${datePart}`;
  }, [startDate, endDate, teamName, showTeamColumn, teamPages, currentTeamPageData, schedule.length]);

  const formatTime = (dateTimeStr: string): string => {
    if (!dateTimeStr || typeof dateTimeStr !== 'string') return '';
    try {
      const parts = dateTimeStr.trim().split(' ');
      const timePart = parts.find(p => p.includes(':'));
      if (!timePart) return '';
      return timePart.substring(0, 5); // Returns HH:mm
    } catch (error) {
      console.error(`Could not parse time string: "${dateTimeStr}"`, error);
      const timeMatch = dateTimeStr.match(/\d{1,2}:\d{2}/);
      return timeMatch ? timeMatch[0] : '';
    }
  };
  
  const parseDateTime = (dateTimeStr: string): number => {
    if (!dateTimeStr) return 0;
    try {
        const [time, date] = dateTimeStr.split(' ');
        if (!time || !date) return 0;
        const [day, month, year] = date.split('/');
        return new Date(`${year}-${month}-${day}T${time}`).getTime();
    } catch (e) {
        return 0;
    }
  };


  const summariesForCurrentPage = useMemo(() => {
    if (!dailySummaries || !itemsToDisplay) return [];
    
    // Get unique date strings (dd/MM/yyyy) from the items on the current page
    const uniqueDatesOnPage = [...new Set(itemsToDisplay.map(item => item.THOI_GIAN_NGUNG?.split(' ')[1]).filter(Boolean) as string[])];
    
    // Sort dates chronologically before displaying summaries
    uniqueDatesOnPage.sort((a, b) => {
        const dateA = new Date(isoDateFromDdMmYyyy(a)).getTime();
        const dateB = new Date(isoDateFromDdMmYyyy(b)).getTime();
        return dateA - dateB;
    });

    return uniqueDatesOnPage.map(date => ({
        date,
        summary: dailySummaries[date]
    })).filter(s => s.summary);
  }, [itemsToDisplay, dailySummaries]);

  const toggleSummaryExpansion = (date: string) => {
    setExpandedSummaries(prev => ({
      ...prev,
      [date]: !prev[date]
    }));
  };

  const handleTeamPageChange = (newIndex: number) => {
      const totalPages = showTeamColumn ? teamPages.length : Math.ceil(schedule.length / ITEMS_PER_PAGE);
      if (newIndex >= 0 && newIndex < totalPages) {
          setCurrentTeamPageIndex(newIndex);
      }
  };

  const removeVietnameseTones = (str: string): string => {
    if (!str) return '';
    str = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    str = str.replace(/đ/g, 'd').replace(/Đ/g, 'D');
    return str;
  };

  const generateBaseFileName = () => {
    const safeTeamName = removeVietnameseTones(teamName).replace(/[\s/]/g, '_');
    const datePart = startDate === endDate ? startDate : `${startDate}_den_${endDate}`;
    return `Bang_Lich_cup_dien_${safeTeamName}_${datePart}`;
  };

  const captureAndDownload = async (filename: string) => {
    if (!displayContainerRef.current) {
        throw new Error("Container ref not found for image export.");
    }
    const canvas = await html2canvas(displayContainerRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        ignoreElements: (element) => {
            if (typeof element.hasAttribute !== 'function') return false;
            return element.hasAttribute('data-html2canvas-ignore');
        }
    });
    const image = canvas.toDataURL('image/png', 1.0);
    const link = document.createElement('a');
    link.download = filename;
    link.href = image;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  const handleExportTableAsImage = async () => {
    setIsExporting(true);
    try {
        await captureAndDownload(`${generateBaseFileName()}.png`);
    } catch (error) {
        console.error("Lỗi khi xuất ảnh bảng:", error);
    } finally {
        setIsExporting(false);
    }
  };

  const totalPages = useMemo(() => {
     return showTeamColumn ? teamPages.length : Math.ceil(schedule.length / ITEMS_PER_PAGE);
  }, [showTeamColumn, teamPages, schedule.length]);
  
  const isPaginating = totalPages > 1;

  const handleExportAllPagesAsImages = async () => {
    if (!isPaginating) return;

    setIsExportingAll(true);
    originalPageIndexRef.current = currentTeamPageIndex; // Save current page
    const baseFileName = generateBaseFileName();

    for (let i = 0; i < totalPages; i++) {
        // Set state for the new page and wait for re-render
        setCurrentTeamPageIndex(i);
        setExportProgressMessage(`Đang xuất trang ${i + 1}/${totalPages}...`);
        
        // Wait for React to re-render the component with the new page's content
        await new Promise(resolve => setTimeout(resolve, 100));

        try {
            const filename = `${baseFileName}_trang_${i + 1}_tren_${totalPages}.png`;
            await captureAndDownload(filename);
        } catch (error) {
            console.error(`Lỗi khi xuất trang ${i + 1}:`, error);
            // Optionally, show an error to the user and stop
            break;
        }

        // Small delay to prevent overwhelming the browser
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    // Restore original state
    setCurrentTeamPageIndex(originalPageIndexRef.current);
    setIsExportingAll(false);
    setExportProgressMessage('');
  };

  const handleSort = (column: SortableColumn) => {
    setSortConfig(currentConfig => {
      if (currentConfig.column === column) {
        return { ...currentConfig, direction: currentConfig.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { column, direction: 'asc' };
    });
  };

  const processedSchedule = useMemo(() => {
    if (!itemsToDisplay) return { groupedByDate: {}, sortedDates: [] };

    const groupedByDate = itemsToDisplay.reduce((acc, item) => {
      const datePart = item.THOI_GIAN_NGUNG?.split(' ')[1] || 'unknown_date';
      if (!acc[datePart]) {
        acc[datePart] = [];
      }
      acc[datePart].push(item);
      return acc;
    }, {} as Record<string, ScheduleItem[]>);

    // Sort items within each date group
    for (const date in groupedByDate) {
        groupedByDate[date] = groupedByDate[date].slice().sort((a, b) => {
            const directionMultiplier = sortConfig.direction === 'asc' ? 1 : -1;
            switch (sortConfig.column) {
                case 'time': {
                    const timeA = parseDateTime(a.THOI_GIAN_NGUNG);
                    const timeB = parseDateTime(b.THOI_GIAN_NGUNG);
                    return (timeA - timeB) * directionMultiplier;
                }
                case 'area': {
                    const areaA = a.TEN_KHU_VUC || '';
                    const areaB = b.TEN_KHU_VUC || '';
                    return areaA.localeCompare(areaB) * directionMultiplier;
                }
                default:
                    return 0;
            }
        });
    }


    const sortedDates = Object.keys(groupedByDate).sort((a, b) => {
      const dateA = new Date(isoDateFromDdMmYyyy(a)).getTime();
      const dateB = new Date(isoDateFromDdMmYyyy(b)).getTime();
      return dateA - dateB;
    });

    return { groupedByDate, sortedDates };
  }, [itemsToDisplay, sortConfig]);


  const colSpan = showTeamColumn ? 3 : 2;

  const backgroundClass = useMemo(() => {
    if (!isPaginating) {
      return PAGE_COLORS[0];
    }
    return PAGE_COLORS[currentTeamPageIndex % PAGE_COLORS.length];
  }, [currentTeamPageIndex, isPaginating]);
  
  const paginationLabel = useMemo(() => {
    // In single-team view, we are always paginating items. The label is 'Page'.
    if (!showTeamColumn) {
        return 'Trang';
    }
    
    const currentPage = teamPages[currentTeamPageIndex];
    // Default to 'Page' if something is wrong
    if (!currentPage) {
        return 'Trang';
    }

    // If the current page contains multiple teams, it's a group of teams.
    if (currentPage.teamNames.length > 1) {
        return 'Nhóm'; // 'Group'
    }

    // Otherwise (1 or 0 teams), it's paginating items. The label is 'Page'.
    return 'Trang';
  }, [showTeamColumn, teamPages, currentTeamPageIndex]);

  const SortableHeader = ({ column, title, className = '' }: { column: SortableColumn, title: string, className?: string }) => (
    <th scope="col" className={`px-6 py-4 text-left text-sm font-semibold text-white uppercase tracking-wider ${className}`}>
      <button
        type="button"
        onClick={() => handleSort(column)}
        className="flex items-center gap-1 group"
        aria-label={`Sắp xếp theo ${title}`}
      >
        <span className="group-hover:text-sky-200 transition-colors">{title}</span>
        {sortConfig.column === column ? (
          <SortIcon direction={sortConfig.direction} />
        ) : (
          <span className="inline-block w-4 h-4 ml-1 text-white/30 opacity-0 group-hover:opacity-100 transition-opacity">
             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 15l7-7 7 7" />
             </svg>
          </span>
        )}
      </button>
    </th>
  );

  return (
    <div ref={displayContainerRef} className={`relative overflow-hidden mt-6 p-6 sm:p-8 rounded-lg shadow-md transition-colors duration-500 ${backgroundClass}`}>
      {schedule.length > 0 && (
        <div 
          className="absolute inset-0 flex items-center justify-center z-0 pointer-events-none"
          aria-hidden="true"
        >
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            className="h-64 w-64 sm:h-80 sm:w-80 text-gray-900/5 dark:text-white/5 transform -rotate-12" 
            fill="currentColor" 
            viewBox="0 0 256 256"
          >
            <path d="M168,40H213.63a8,8,0,0,1,5.33,13.89l-112,144a8,8,0,0,1-13.85-8.22l40-104H88a8,8,0,0,1-5.33-13.89l112-96A8,8,0,0,1,168,40Z" />
          </svg>
        </div>
      )}

      {/* Wrapper for content to sit above watermark */}
      <div className="relative z-10">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-4">
          <h3 className="text-2xl font-bold text-gray-800 dark:text-white tracking-tight min-w-0 flex-1">
            {title}
          </h3>
          {schedule.length > 0 && (
            <div className="flex items-center gap-2 flex-shrink-0" data-html2canvas-ignore="true">
               <button
                  onClick={onToggleSummaries}
                  disabled={isSummarizing || isAiDisabled}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-purple-100 dark:bg-purple-900/60 border border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-200 font-semibold rounded-lg shadow-sm hover:bg-purple-200 dark:hover:bg-purple-800/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  aria-label={showSummaries ? "Ẩn tóm tắt AI" : "Hiển thị tóm tắt AI"}
                  title={isAiDisabled ? "Tính năng AI bị vô hiệu hóa do thiếu API key" : ""}
                >
                  <Sparkles className={`h-5 w-5 ${isSummarizing ? 'animate-pulse' : ''}`} />
                  {isSummarizing ? 'Đang tóm tắt...' : (showSummaries ? 'Ẩn tóm tắt' : 'Tóm tắt AI')}
                </button>
              <button
                onClick={handleExportTableAsImage}
                disabled={isExporting || isExportingAll}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 font-semibold rounded-lg shadow-sm hover:bg-gray-100 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-wait transition-colors"
                aria-label="Xuất trang hiện tại ra ảnh"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                </svg>
                {isExporting ? 'Đang xử lý...' : 'Xuất trang này'}
              </button>
              {isPaginating && (
                <button
                  onClick={handleExportAllPagesAsImages}
                  disabled={isExporting || isExportingAll}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-wait transition-colors"
                  aria-label="Xuất tất cả các trang ra ảnh"
                >
                   <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                  {isExportingAll ? exportProgressMessage : 'Xuất tất cả'}
                </button>
              )}
            </div>
          )}
        </div>
        
        {schedule.length === 0 ? (
          <p className="text-gray-600 dark:text-gray-300 text-center py-10 text-lg">Không tìm thấy lịch cúp điện nào cho khu vực và khoảng ngày đã chọn.</p>
        ) : (
          <>
            {showSummaries && (
                <div
                  className="mb-6 p-4 bg-sky-100 dark:bg-sky-900/60 rounded-lg border border-blue-200 dark:border-blue-700 animate-in fade-in slide-in-from-top-2 duration-500"
                  data-html2canvas-ignore="true"
                >
                {summariesForCurrentPage.length > 0 ? (
                    <div className="divide-y divide-blue-200 dark:divide-blue-800/50">
                    {summariesForCurrentPage.map(({ date, summary }) => {
                        const isError = summary.startsWith('Lỗi:');
                        const summaryText = isError ? summary.substring(5) : summary;
                        const isExpanded = !!expandedSummaries[date];
                        const summaryId = `summary-${date.replace(/\//g, '-')}`;

                        return (
                          <div key={date} className="py-2 first:pt-0 last:pb-0">
                            <button
                              type="button"
                              onClick={() => toggleSummaryExpansion(date)}
                              className={`w-full flex justify-between items-center text-left p-3 rounded-xl transition-all ${
                                isExpanded 
                                  ? 'bg-white/40 dark:bg-white/10 shadow-sm' 
                                  : 'hover:bg-white/30 dark:hover:bg-white/5'
                              }`}
                              aria-expanded={isExpanded}
                              aria-controls={summaryId}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg ${isError ? 'bg-red-100 dark:bg-red-900/40 text-red-600' : 'bg-purple-100 dark:bg-purple-900/40 text-purple-600'}`}>
                                  {isError ? <AlertTriangle size={18} /> : <Sparkles size={18} />}
                                </div>
                                <div>
                                  <p className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-0.5">
                                    Lịch cúp điện ngày
                                  </p>
                                  <h4 className={`font-bold ${isError ? 'text-red-800 dark:text-red-200' : 'text-gray-900 dark:text-white'}`}>
                                    {date}
                                  </h4>
                                </div>
                              </div>
                              <div className="bg-blue-200/50 dark:bg-blue-800/50 p-1.5 rounded-full transition-transform duration-300">
                                {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                              </div>
                            </button>
                            <div
                              id={summaryId}
                              className={`grid transition-all duration-500 ease-in-out ${isExpanded ? 'grid-rows-[1fr] opacity-100 mt-2' : 'grid-rows-[0fr] opacity-0'}`}
                            >
                              <div className="overflow-hidden">
                                  <div className={`p-4 rounded-xl border ${
                                    isError 
                                      ? 'bg-red-50/50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200' 
                                      : 'bg-white/60 dark:bg-gray-800/60 border-blue-100 dark:border-blue-900/50 text-gray-800 dark:text-gray-100'
                                  }`}>
                                    <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-li:my-0">
                                      <Markdown>{summaryText}</Markdown>
                                    </div>
                                  </div>
                              </div>
                            </div>
                          </div>
                        );
                    })}
                    {isSummarizing && (
                      <div className="pt-4 border-t border-blue-200 dark:border-blue-800/50">
                        <SummaryLoader />
                      </div>
                    )}
                    </div>
                ) : isSummarizing ? (
                  <SummaryLoader />
                ) : (
                    <div className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                        <p>Không có tóm tắt nào được tạo hoặc dữ liệu trống cho các mục trên trang này.</p>
                    </div>
                )}
                </div>
            )}
            <div className="overflow-x-auto rounded-lg border border-gray-200/50 dark:border-gray-700 bg-white/60 dark:bg-slate-800/70 backdrop-blur-sm shadow-lg">
              <table className="min-w-full">
                <thead className="bg-blue-600 dark:bg-blue-800">
                  <tr>
                    {showTeamColumn && (
                      <th scope="col" className="px-6 py-4 text-left text-sm font-semibold text-white uppercase tracking-wider whitespace-nowrap w-px">
                        Điện lực
                      </th>
                    )}
                    <SortableHeader column="time" title="Thời Gian" className="whitespace-nowrap w-px" />
                    <SortableHeader column="area" title="Khu Vực" />
                  </tr>
                </thead>
                <tbody className="">
                  {itemsToDisplay && itemsToDisplay.length > 0 ? (
                    processedSchedule.sortedDates.map(datePart => (
                      <React.Fragment key={datePart}>
                        <tr className="border-t-2 border-b border-blue-200 dark:border-blue-700">
                            <td colSpan={colSpan} className="px-6 py-3 font-bold text-base text-blue-800 dark:text-blue-200">
                              {formatDateForDisplay(isoDateFromDdMmYyyy(datePart))}
                            </td>
                        </tr>
                        {processedSchedule.groupedByDate[datePart].map(item => (
                            <tr key={item.ID} className="odd:bg-black/5 dark:odd:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors">
                              {showTeamColumn && (
                                <td className="px-6 py-5 whitespace-nowrap text-sm font-semibold text-gray-700 dark:text-gray-300">
                                  {item.TEN_DVIQLY}
                                </td>
                              )}
                              <td className="px-6 py-5 whitespace-nowrap text-sm font-semibold text-gray-700 dark:text-gray-300 tabular-nums">
                                {`${formatTime(item.THOI_GIAN_NGUNG)} - ${formatTime(item.THOI_GIAN_CO_DIEN_LAI)}`}
                              </td>
                              <td className="px-6 py-5 whitespace-normal text-lg font-semibold text-gray-800 dark:text-gray-100">{item.TEN_KHU_VUC}</td>
                            </tr>
                        ))}
                      </React.Fragment>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={colSpan} className="text-center py-10 px-6 text-gray-500 dark:text-gray-400">
                          Không có lịch cúp điện cho trang này.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {isPaginating && (
              <div
                className="flex items-center justify-center gap-4 mt-5 p-2 bg-gray-100 dark:bg-gray-700/50 rounded-lg"
                data-html2canvas-ignore="true"
              >
                  <button
                  onClick={() => handleTeamPageChange(currentTeamPageIndex - 1)}
                  disabled={currentTeamPageIndex === 0}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-800 dark:text-gray-200 font-semibold rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                  {paginationLabel} trước
                  </button>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {paginationLabel} {currentTeamPageIndex + 1} / {totalPages}
                  </span>
                  <button
                  onClick={() => handleTeamPageChange(currentTeamPageIndex + 1)}
                  disabled={currentTeamPageIndex === totalPages - 1}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-800 dark:text-gray-200 font-semibold rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                  {paginationLabel} sau
                  </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ScheduleDisplay;