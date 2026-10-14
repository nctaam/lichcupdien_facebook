
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { POWER_COMPANIES } from './constants';
import { fetchSchedule } from './services/evnService';
import { generateScheduleImage, summarizeDailySchedule } from './services/geminiService';
import { getDatePresetsForFilter, getDatesInRange, toYyyyMmDd } from './utils/dateUtils';
import Loader from './components/Loader';
import ScheduleDisplay from './components/ScheduleDisplay';
import MapView from './components/MapView';
import ImageDisplay from './components/ImageDisplay';
import ThemeSwitcher from './components/ThemeSwitcher';
import type { ScheduleItem, PowerTeam } from './types';

function App() {
  const todayString = useMemo(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  // Set default company to Vĩnh Long (PB10)
  const [selectedCompany, setSelectedCompany] = useState<string>('PB10');
  const [selectedTeam, setSelectedTeam] = useState<string>('');
  const [selectedStartDate, setSelectedStartDate] = useState<string>(todayString);
  const [selectedEndDate, setSelectedEndDate] = useState<string>(todayString);
  const [scheduleData, setScheduleData] = useState<ScheduleItem[] | null>(null);
  const [areaFilter, setAreaFilter] = useState<string>('');
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const [fetchProgress, setFetchProgress] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isSummarizing, setIsSummarizing] = useState<boolean>(false);
  const [showSummaries, setShowSummaries] = useState<boolean>(false);
  const [isScheduleFetched, setIsScheduleFetched] = useState<boolean>(false);
  const [isDataVerified, setIsDataVerified] = useState<boolean>(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [failedTasksList, setFailedTasksList] = useState<{ teamCode: string; date: string; endDate?: string; teamName: string }[]>([]);
  const [dailySummaries, setDailySummaries] = useState<Record<string, string>>({});
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<'cache' | 'live' | null>(null);
  const summaryGenerationId = useRef(0);
  
  const [apiKeyError, setApiKeyError] = useState<string | null>(() => {
    if (!process.env.GEMINI_API_KEY) {
      return "GEMINI_API_KEY bị thiếu. Tính năng tóm tắt vẫn hoạt động nhưng tính năng tạo ảnh sẽ bị vô hiệu hóa.";
    }
    return null;
  });

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light' || savedTheme === 'dark') {
      return savedTheme;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const selectedTeamName = useMemo(() => {
    if (!selectedCompany) return '';
    if (selectedTeam === '') {
        return POWER_COMPANIES[selectedCompany]?.name;
    }
    return POWER_COMPANIES[selectedCompany]?.teams[selectedTeam];
  }, [selectedCompany, selectedTeam]);

  const companyProvinceName = useMemo(() => {
    if (!selectedCompany) return '';
    const name = POWER_COMPANIES[selectedCompany]?.name || '';
    return name.replace('Công ty Điện lực ', 'tỉnh ');
  }, [selectedCompany]);

  const formatToDdMmYyyy = (isoDate: string) => {
    if (!isoDate) return '';
    const [y, m, d] = isoDate.split('-');
    return `${d}/${m}/${y}`;
  };

  const formattedHeaderDate = useMemo(() => {
    if (selectedStartDate === selectedEndDate) {
      return `ngày ${formatToDdMmYyyy(selectedStartDate)}`;
    }
    return `từ ngày ${formatToDdMmYyyy(selectedStartDate)} đến ngày ${formatToDdMmYyyy(selectedEndDate)}`;
  }, [selectedStartDate, selectedEndDate]);

  const generateAndSetSummaries = async (schedule: ScheduleItem[], teamName: string) => {
    if (!schedule || schedule.length === 0) {
      setDailySummaries({});
      return;
    }

    const currentGenerationId = ++summaryGenerationId.current;
    setIsSummarizing(true);
    setDailySummaries({});

    try {
      const schedulesByDate = schedule.reduce((acc, item) => {
        try {
          const datePart = item.THOI_GIAN_NGUNG.split(' ')[1];
          if (datePart) {
            if (!acc[datePart]) acc[datePart] = [];
            acc[datePart].push(item);
          }
        } catch {}
        return acc;
      }, {} as Record<string, ScheduleItem[]>);

      const sortedDates = Object.keys(schedulesByDate).sort((a, b) => {
          const [da, ma, ya] = a.split('/').map(Number);
          const [db, mb, yb] = b.split('/').map(Number);
          return new Date(ya, ma - 1, da).getTime() - new Date(yb, mb - 1, db).getTime();
      });

      // Run summarization in parallel for speed
      await Promise.all(sortedDates.map(async (date) => {
        if (summaryGenerationId.current !== currentGenerationId) return;
        try {
          const summary = await summarizeDailySchedule(schedulesByDate[date], teamName, date);
          if (summary && summaryGenerationId.current === currentGenerationId) {
            setDailySummaries(prev => ({ ...prev, [date]: summary }));
          }
        } catch (error) {
          if (summaryGenerationId.current === currentGenerationId) {
            setDailySummaries(prev => ({ ...prev, [date]: `Lỗi: ${error instanceof Error ? error.message : String(error)}` }));
          }
        }
      }));
    } finally {
        if (summaryGenerationId.current === currentGenerationId) setIsSummarizing(false);
    }
  };

  const availableTeams: PowerTeam = useMemo(() => {
    if (!selectedCompany || !POWER_COMPANIES[selectedCompany]) return {};
    return POWER_COMPANIES[selectedCompany].teams;
  }, [selectedCompany]);

  const resetState = () => {
    setScheduleData(null);
    setGeneratedImageUrl(null);
    setIsScheduleFetched(false);
    setError(null);
    setWarning(null);
    setFailedTasksList([]);
    setAreaFilter('');
    setDailySummaries({});
    setIsSummarizing(false);
    setShowSummaries(false);
    setFetchProgress('');
    setValidationErrors({});
    summaryGenerationId.current += 1;
  };

  const handleCompanyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedCompany(e.target.value);
    setSelectedTeam('');
    resetState();
  };
  
  const handleTeamChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedTeam(e.target.value);
    resetState();
  };

  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedStartDate(e.target.value);
    resetState();
  };
  
  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedEndDate(e.target.value);
    resetState();
  };

  const handleDateFilterClick = (filter: 'today' | 'tomorrow' | 'this_week' | 'this_month') => {
    const { startDate, endDate } = getDatePresetsForFilter(filter);
    setSelectedStartDate(startDate);
    setSelectedEndDate(endDate);
    resetState();
  };

  const handleStepDay = (step: number) => {
    const currentStart = new Date(`${selectedStartDate}T00:00:00`);
    const currentEnd = new Date(`${selectedEndDate}T00:00:00`);
    currentStart.setDate(currentStart.getDate() + step);
    currentEnd.setDate(currentEnd.getDate() + step);
    setSelectedStartDate(toYyyyMmDd(currentStart));
    setSelectedEndDate(toYyyyMmDd(currentEnd));
    resetState();
  };

  const handleToggleSummaries = () => {
    if (!showSummaries) {
      if (apiKeyError) {
          setError("Không thể tạo tóm tắt: API Key bị thiếu hoặc không hợp lệ.");
          setShowSummaries(true);
          return;
      }
      const shouldGenerate = scheduleData && scheduleData.length > 0 && Object.keys(dailySummaries).length === 0;
      if (shouldGenerate) generateAndSetSummaries(scheduleData, selectedTeamName);
    }
    setShowSummaries(prev => !prev);
  };

  const filteredScheduleData = useMemo(() => {
    if (!scheduleData) return null;
    const startFilterDate = new Date(`${selectedStartDate}T00:00:00`);
    const endFilterDate = new Date(`${selectedEndDate}T00:00:00`);
    const filterText = areaFilter.trim().toLowerCase();

    return scheduleData.filter(item => {
      try {
        const datePart = item.THOI_GIAN_NGUNG.split(' ')[1];
        if (!datePart) return false;
        const [day, month, year] = datePart.split('/');
        const scheduleDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        scheduleDate.setHours(0, 0, 0, 0);
        if (scheduleDate < startFilterDate || scheduleDate > endFilterDate) return false;
      } catch { return false; }
      if (filterText) return item.TEN_KHU_VUC.toLowerCase().includes(filterText);
      return true;
    });
  }, [scheduleData, areaFilter, selectedStartDate, selectedEndDate]);

  const handleClearCache = () => {
    Object.keys(sessionStorage)
      .filter(k => k.startsWith('evn_schedule_cache_'))
      .forEach(k => sessionStorage.removeItem(k));
    sessionStorage.removeItem('preferred_proxy_index');
    resetState();
    alert('Đã xóa bộ nhớ đệm thành công!');
  };

  const handleFetch = async (retryTasks?: { teamCode: string; date: string; teamName: string }[]) => {
    const errors: Record<string, string> = {};
    
    if (!selectedCompany) {
      errors.company = 'Vui lòng chọn công ty điện lực.';
    }
    
    if (!selectedStartDate) {
      errors.startDate = 'Vui lòng chọn ngày bắt đầu.';
    }
    
    if (!selectedEndDate) {
      errors.endDate = 'Vui lòng chọn ngày kết thúc.';
    }
    
    if (selectedStartDate && selectedEndDate) {
      const start = new Date(selectedStartDate);
      const end = new Date(selectedEndDate);
      
      if (start > end) {
        errors.startDate = 'Ngày bắt đầu không được lớn hơn ngày kết thúc.';
        errors.endDate = 'Ngày kết thúc không được nhỏ hơn ngày bắt đầu.';
      } else {
        const diffTime = Math.abs(end.getTime() - start.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays > 31) {
          errors.endDate = 'Khoảng cách tra cứu không được quá 31 ngày.';
        }

        const minDate = new Date();
        minDate.setDate(minDate.getDate() - 30); // Allow 30 days in past
        const maxDate = new Date();
        maxDate.setDate(maxDate.getDate() + 90); // Allow 90 days in future

        if (start < minDate) {
          errors.startDate = 'Ngày bắt đầu quá xa trong quá khứ (tối đa 30 ngày).';
        }
        if (end > maxDate) {
          errors.endDate = 'Ngày kết thúc quá xa trong tương lai (tối đa 90 ngày).';
        }
      }
    }
    
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      setError('Vui lòng kiểm tra lại các thông tin nhập liệu.');
      return;
    }

    setValidationErrors({});
    const isRetry = Array.isArray(retryTasks);
    
    if (!isRetry) {
      resetState();
    } else {
      setError(null);
      setWarning(null);
    }
    
    setIsFetching(true);
    setFetchProgress(isRetry ? 'Đang thử lại các mục lỗi...' : 'Đang đồng bộ dữ liệu...');

    const isFetchingAllTeams = selectedTeam === '';
    const teamCodes = isFetchingAllTeams ? Object.keys(availableTeams) : [selectedTeam];

    if (!isRetry && teamCodes.length === 0) {
      setError(`Không tìm thấy danh mục điện lực cho công ty này.`);
      setIsFetching(false);
      return;
    }

    const tasks: { teamCode: string; date: string; endDate?: string; teamName: string }[] = isRetry ? (retryTasks as any) : [];
    
    if (!isRetry) {
      teamCodes.forEach(tc => {
        const teamName = availableTeams[tc] || tc;
        tasks.push({ teamCode: tc, date: selectedStartDate, endDate: selectedEndDate, teamName });
      });
    }

    let successfulCount = 0;
    const currentFailedTasks: { teamCode: string; date: string; endDate?: string; teamName: string }[] = [];
    let completedCount = 0;
    const totalCount = tasks.length;

    // Use parallel fetching with controlled concurrency
    const CONCURRENCY = 2; // Reduced concurrency to avoid rate limits
    const queue = [...tasks];

    const worker = async () => {
      while (queue.length > 0) {
        const task = queue.shift();
        if (!task) break;

        const { teamCode, date, endDate, teamName } = task;

        try {
          const url = endDate 
            ? `/api/schedule?teamCode=${teamCode}&date=${date}&endDate=${endDate}`
            : `/api/schedule?teamCode=${teamCode}&date=${date}`;
          const response = await fetch(url);
          if (!response.ok) throw new Error("Fetch failed");
          const result = await response.json();
          if (result.source) setDataSource(result.source);
          setLastSync(new Date().toLocaleTimeString());
          
          const schedules: ScheduleItem[] = result.data || [];
          successfulCount++;
          const augmented = schedules.map(item => ({
            ...item,
            TEN_DVIQLY: item.TEN_DVIQLY || teamName,
          }));
          
          // Update UI incrementally
          setScheduleData(prev => {
            const current = prev || [];
            const existingIds = new Set(current.map(s => s.ID));
            const newItems = augmented.filter(item => !existingIds.has(item.ID));
            
            if (newItems.length === 0) return current;
            
            const combined = [...current, ...newItems];
            // Sort combined data
            return combined.sort((a, b) => {
              const parseTime = (s: string) => {
                try {
                  const [t, d] = s.split(' ');
                  const [dd, mm, yy] = d.split('/');
                  return new Date(`${yy}-${mm}-${dd}T${t}`).getTime();
                } catch { return 0; }
              };
              return parseTime(a.THOI_GIAN_NGUNG) - parseTime(b.THOI_GIAN_NGUNG);
            });
          });
          
          setIsScheduleFetched(true);
        } catch (err) {
          currentFailedTasks.push(task);
        } finally {
          completedCount++;
          setFetchProgress(`Tiến trình: ${completedCount}/${totalCount} - ${teamName}...`);
          // Optimized delay: slightly longer and more jitter to be gentle on proxies
          await new Promise(r => setTimeout(r, 400 + Math.random() * 600));
        }
      }
    };

    try {
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, worker));

      setFailedTasksList(currentFailedTasks);

      if (currentFailedTasks.length > 0) {
        if (successfulCount === 0 && !isScheduleFetched) {
          setError(`Lỗi: Không thể tải dữ liệu cho ${currentFailedTasks.length} đơn vị/ngày. Vui lòng kiểm tra kết nối mạng và thử lại.`);
        } else {
          setWarning(`Lưu ý: Không thể tải dữ liệu cho ${currentFailedTasks.length} đơn vị/ngày. Kết quả hiển thị có thể không đầy đủ.`);
        }
      }

      setIsDataVerified(currentFailedTasks.length === 0 && successfulCount > 0);

      // Automatic retry for failed tasks if any
      if (currentFailedTasks.length > 0 && !isRetry) {
        setFetchProgress(`Đang tự động thử lại ${currentFailedTasks.length} mục lỗi...`);
        // Wait a bit before auto-retry
        await new Promise(r => setTimeout(r, 2000));
        handleFetch(currentFailedTasks);
      }
    } catch (err) {
      setError('Đã xảy ra lỗi không xác định trong quá trình tải dữ liệu.');
    } finally {
      setIsFetching(false);
    }
  };

  const handleGenerateImage = async () => {
    if (!filteredScheduleData || filteredScheduleData.length === 0) {
      setError('Không có dữ liệu để tạo ảnh.');
      return;
    }
    setError(null);
    setGeneratedImageUrl(null);
    setIsGenerating(true);
    try {
      const imageUrl = await generateScheduleImage(filteredScheduleData, selectedTeamName);
      setGeneratedImageUrl(imageUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setIsGenerating(false); }
  };

  const isLoading = isFetching || isGenerating;
  const backgroundClass = useMemo(() => {
    if (generatedImageUrl) return 'bg-gradient-to-br from-teal-50 to-green-100 dark:from-slate-900 dark:to-teal-950';
    if (isScheduleFetched) return 'bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-slate-900 dark:to-blue-950';
    return 'bg-gradient-to-br from-gray-50 to-slate-100 dark:from-gray-900 dark:to-slate-950';
  }, [isScheduleFetched, generatedImageUrl]);

  return (
    <div className={`min-h-screen ${backgroundClass} text-gray-900 dark:text-gray-100 font-sans transition-colors duration-500`}>
      <main className="container mx-auto p-4 md:p-8">
        <div className="relative max-w-7xl mx-auto bg-white dark:bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl p-6 md:p-8 border border-gray-200 dark:border-gray-700">
          <div className="absolute top-4 right-4 z-10">
            <ThemeSwitcher theme={theme} setTheme={setTheme} />
          </div>
          <div className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-teal-400">
              Tạo Ảnh Lịch Cúp Điện
            </h1>
            <p className="mt-2 text-gray-600 dark:text-gray-300">
              Hệ thống tra cứu tự động từ EVN với độ chính xác và tính toàn vẹn cao.
              {lastSync && (
                <span className="ml-2 inline-flex items-center text-xs font-normal text-teal-600 dark:text-teal-400">
                  <span className={`w-2 h-2 rounded-full mr-1.5 ${dataSource === 'live' ? 'bg-green-500 animate-pulse' : 'bg-blue-400'}`}></span>
                  Cập nhật: {lastSync} ({dataSource === 'live' ? 'Ghi từ EVN' : 'Từ bộ nhớ'})
                </span>
              )}
            </p>
          </div>

          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div>
                <label className="block text-sm font-medium mb-1">Công ty Điện lực</label>
                <select 
                  value={selectedCompany} 
                  onChange={handleCompanyChange} 
                  className={`w-full p-3 bg-white dark:bg-gray-700 border ${validationErrors.company ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-300 dark:border-gray-600'} rounded-lg transition-colors`}
                >
                  <option value="">-- Chọn công ty --</option>
                  {Object.entries(POWER_COMPANIES).map(([code, company]) => (
                    <option key={code} value={code}>{company.name}</option>
                  ))}
                </select>
                {validationErrors.company && <p className="mt-1 text-xs text-red-500">{validationErrors.company}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Điện lực</label>
                <select 
                  value={selectedTeam} 
                  onChange={handleTeamChange} 
                  disabled={!selectedCompany || Object.keys(availableTeams).length === 0} 
                  className="w-full p-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg"
                >
                  <option value="">-- Tất cả điện lực --</option>
                  {Object.entries(availableTeams).map(([code, name]) => (
                    <option key={code} value={code}>{name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Từ Ngày</label>
                <input 
                  type="date" 
                  value={selectedStartDate} 
                  onChange={handleStartDateChange} 
                  className={`w-full p-3 bg-white dark:bg-gray-700 border ${validationErrors.startDate ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-300 dark:border-gray-600'} rounded-lg transition-colors`} 
                />
                {validationErrors.startDate && <p className="mt-1 text-xs text-red-500">{validationErrors.startDate}</p>}
              </div>
               <div>
                <label className="block text-sm font-medium mb-1">Đến Ngày</label>
                <input 
                  type="date" 
                  value={selectedEndDate} 
                  onChange={handleEndDateChange} 
                  className={`w-full p-3 bg-white dark:bg-gray-700 border ${validationErrors.endDate ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-300 dark:border-gray-600'} rounded-lg transition-colors`} 
                />
                {validationErrors.endDate && <p className="mt-1 text-xs text-red-500">{validationErrors.endDate}</p>}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400 mr-2">Lọc nhanh:</span>
              <button onClick={() => handleStepDay(-1)} className="p-1.5 bg-gray-200 dark:bg-gray-600 rounded-md hover:bg-blue-500 hover:text-white transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
              </button>
              <button onClick={() => handleDateFilterClick('today')} className="px-3 py-1 bg-gray-200 dark:bg-gray-600 rounded-md text-sm hover:bg-blue-500 hover:text-white transition-colors">Hôm nay</button>
              <button onClick={() => handleDateFilterClick('tomorrow')} className="px-3 py-1 bg-gray-200 dark:bg-gray-600 rounded-md text-sm hover:bg-blue-500 hover:text-white transition-colors">Ngày mai</button>
              <button onClick={() => handleStepDay(1)} className="p-1.5 bg-gray-200 dark:bg-gray-600 rounded-md hover:bg-blue-500 hover:text-white transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
              </button>
              <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1 hidden sm:block"></div>
              <button onClick={() => handleDateFilterClick('this_week')} className="px-3 py-1 bg-gray-200 dark:bg-gray-600 rounded-md text-sm hover:bg-blue-500 hover:text-white transition-colors">Tuần này</button>
              <button onClick={() => handleDateFilterClick('this_month')} className="px-3 py-1 bg-gray-200 dark:bg-gray-600 rounded-md text-sm hover:bg-blue-500 hover:text-white transition-colors">Tháng này</button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button onClick={() => handleFetch()} disabled={!selectedCompany || isLoading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg shadow-lg disabled:bg-gray-400 flex items-center justify-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                {isFetching ? 'Đang tải...' : 'Tra Cứu Lịch'}
              </button>
              <button onClick={handleGenerateImage} disabled={!isScheduleFetched || isLoading || !!apiKeyError} className="w-full bg-teal-500 hover:bg-teal-600 text-white font-bold py-3 px-4 rounded-lg shadow-lg disabled:bg-gray-400 flex items-center justify-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                {isGenerating ? 'Đang tạo...' : 'Tạo Ảnh Thông Báo'}
              </button>
              <button onClick={handleClearCache} disabled={isLoading} className="w-full bg-gray-500 hover:bg-gray-600 text-white font-bold py-3 px-4 rounded-lg shadow-lg disabled:bg-gray-400 flex items-center justify-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                Xóa Bộ Nhớ Đệm
              </button>
            </div>
          </div>

          {error && (
            <div className="mt-6 p-4 bg-red-100 dark:bg-red-900/50 border-l-4 border-red-500 text-red-700 dark:text-red-200 rounded-md">
              <p className="font-bold">Thông báo hệ thống</p>
              <p className="whitespace-pre-line">{error}</p>
            </div>
          )}

          {warning && (
            <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-900/30 border-l-4 border-amber-500 text-amber-800 dark:text-amber-200 rounded-md shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <p className="font-bold flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    Thông báo hệ thống
                  </p>
                  <p className="mt-1">{warning}</p>
                </div>
                <button 
                  onClick={() => handleFetch(failedTasksList)}
                  disabled={isLoading}
                  className="whitespace-nowrap px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium transition-colors shadow-sm flex items-center gap-2 disabled:bg-gray-400"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Thử lại các mục lỗi
                </button>
              </div>
              <div className="mt-3 text-xs opacity-75 max-h-24 overflow-y-auto border-t border-amber-200 dark:border-amber-700/50 pt-2">
                <span className="font-semibold">Danh sách lỗi: </span>
                {failedTasksList.map((t, idx) => (
                  <span key={idx}>
                    {t.teamName} ({formatToDdMmYyyy(t.date)}{t.endDate && t.endDate !== t.date ? ` - ${formatToDdMmYyyy(t.endDate)}` : ''})
                    {idx < failedTasksList.length - 1 ? ', ' : ''}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 space-y-4">
            {isLoading && <Loader message={isFetching ? fetchProgress : 'Đang tạo ảnh với Gemini...'} />}
            
            {isScheduleFetched && !isFetching && (
              <div className="text-center py-6 mb-4 border-y border-gray-100 dark:border-gray-700 animate-in fade-in duration-700">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <h2 className="text-2xl md:text-3xl lg:text-4xl font-black text-blue-800 dark:text-blue-300 uppercase tracking-tight leading-tight">
                    Lịch cúp điện trên địa bàn {companyProvinceName} <br className="sm:hidden" /> {formattedHeaderDate}
                  </h2>
                  {isDataVerified && (
                    <div className="flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 text-[10px] font-bold rounded-full border border-green-200 dark:border-green-800 uppercase tracking-wider" title="Dữ liệu đã được kiểm tra chéo và xác thực tính toàn vẹn">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8.001 11.224A11.742 11.742 0 0110 18.056c-4.66-1.555-8-6-8-11.224 0-.68.056-1.35.166-2.001zm9.496 3.852a1 1 0 00-1.415-1.414L8 9.586 6.752 8.338a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l3.5-3.5z" clipRule="evenodd" />
                      </svg>
                      Đã xác thực
                    </div>
                  )}
                </div>
              </div>
            )}

            {scheduleData && scheduleData.length > 0 && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 my-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1">Lọc theo tên khu vực</label>
                  <input type="text" placeholder="Ví dụ: Phường 5..." value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)} className="w-full p-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm" />
                </div>
                <div className="flex items-center bg-gray-100 dark:bg-gray-700 p-1 rounded-lg self-end sm:self-auto">
                  <button 
                    onClick={() => setViewMode('list')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${viewMode === 'list' ? 'bg-white dark:bg-gray-600 shadow-sm text-blue-600 dark:text-blue-300' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
                  >
                    Danh sách
                  </button>
                  <button 
                    onClick={() => setViewMode('map')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${viewMode === 'map' ? 'bg-white dark:bg-gray-600 shadow-sm text-blue-600 dark:text-blue-300' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
                  >
                    Bản đồ
                  </button>
                </div>
              </div>
            )}

            {viewMode === 'map' && filteredScheduleData && (
              <MapView 
                schedule={filteredScheduleData} 
                selectedCompany={selectedCompany} 
                selectedTeam={selectedTeam} 
              />
            )}

            {viewMode === 'list' && filteredScheduleData && <ScheduleDisplay 
                schedule={filteredScheduleData} 
                teamName={selectedTeamName} 
                startDate={selectedStartDate} 
                endDate={selectedEndDate} 
                showTeamColumn={selectedTeam === ''} 
                dailySummaries={dailySummaries} 
                isSummarizing={isSummarizing}
                showSummaries={showSummaries}
                onToggleSummaries={handleToggleSummaries}
                isAiDisabled={!!apiKeyError}
                orderedTeams={selectedTeam === '' ? Object.values(availableTeams) : undefined} 
            />}
            {generatedImageUrl && <ImageDisplay imageUrl={generatedImageUrl} teamName={selectedTeamName} />}
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
