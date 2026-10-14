
import type { EvnApiResponse, ScheduleItem } from '../types';

// Persistent cache using localStorage with improved robustness
const CACHE_VERSION = 'v3';
const CACHE_PREFIX = `evn_schedule_${CACHE_VERSION}_`;
const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

interface CacheEntry {
  data: ScheduleItem[];
  timestamp: number;
  expiry: number;
}

const CacheManager = {
  /**
   * Retrieves data from the cache if it exists and hasn't expired.
   */
  get: (key: string): ScheduleItem[] | null => {
    try {
      const fullKey = CACHE_PREFIX + key;
      const cached = localStorage.getItem(fullKey);
      if (!cached) return null;

      const entry: CacheEntry = JSON.parse(cached);
      const now = Date.now();

      // Check if expired or invalid format
      if (!entry || typeof entry.expiry !== 'number' || now > entry.expiry) {
        localStorage.removeItem(fullKey);
        return null;
      }

      return entry.data;
    } catch (e) {
      console.warn("Lỗi khi đọc cache:", e);
      return null;
    }
  },

  /**
   * Saves data to the cache with a specified TTL.
   */
  set: (key: string, data: ScheduleItem[], ttl = CACHE_TTL) => {
    try {
      const now = Date.now();
      const entry: CacheEntry = {
        data,
        timestamp: now,
        expiry: now + ttl
      };
      
      const fullKey = CACHE_PREFIX + key;
      localStorage.setItem(fullKey, JSON.stringify(entry));
    } catch (e) {
      // If quota exceeded, clear old data and try one more time
      if (e instanceof Error && e.name === 'QuotaExceededError') {
        console.warn("Bộ nhớ localStorage đầy, đang dọn dẹp...");
        CacheManager.prune(true); 
        try {
          localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({
            data,
            timestamp: Date.now(),
            expiry: Date.now() + ttl
          }));
        } catch (innerError) {
          console.error("Không thể lưu cache dù đã dọn dẹp:", innerError);
        }
      }
    }
  },

  /**
   * Removes expired or old-version entries from localStorage.
   */
  prune: (forceAll = false) => {
    const now = Date.now();
    try {
      const keys = Object.keys(localStorage);
      for (const key of keys) {
        // Handle all EVN schedule related keys
        if (key.includes('evn_schedule_cache_') || key.startsWith('evn_schedule_')) {
          // If it's an old version or we are forcing all, remove it
          if (forceAll || !key.startsWith(CACHE_PREFIX)) {
            localStorage.removeItem(key);
            continue;
          }

          // Check expiry for current version
          try {
            const item = localStorage.getItem(key);
            if (item) {
              const entry: CacheEntry = JSON.parse(item);
              if (now > (entry.expiry || 0)) {
                localStorage.removeItem(key);
              }
            }
          } catch {
            localStorage.removeItem(key); // Corrupted data
          }
        }
      }
    } catch (e) {
      console.error("Lỗi khi dọn dẹp cache:", e);
    }
  }
};

// Automatic cleanup on load
setTimeout(() => CacheManager.prune(), 2000);

// Request deduplication map
const pendingRequests = new Map<string, Promise<ScheduleItem[]>>();

// Track proxy health
const proxyHealth: Record<string, { failures: number; lastFailure: number }> = {};

const isProxyHealthy = (name: string): boolean => {
  const health = proxyHealth[name];
  if (!health) return true;
  // If failed more than 3 times, wait 5 minutes
  if (health.failures >= 3 && Date.now() - health.lastFailure < 5 * 60 * 1000) {
    return false;
  }
  return true;
};

const reportProxyFailure = (name: string) => {
  if (!proxyHealth[name]) {
    proxyHealth[name] = { failures: 1, lastFailure: Date.now() };
  } else {
    proxyHealth[name].failures++;
    proxyHealth[name].lastFailure = Date.now();
  }
};

const reportProxySuccess = (name: string) => {
  if (proxyHealth[name]) {
    proxyHealth[name].failures = 0;
  }
};

/**
 * Validates if the response text looks like legitimate data (JSON or specific HTML).
 */
const isValidResponse = (text: string): boolean => {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (trimmed.length < 10) return false;
  
  // Check for common proxy error pages
  const lowerText = trimmed.toLowerCase();
  if (lowerText.includes('too many requests') || 
      lowerText.includes('rate limit') || 
      lowerText.includes('access denied') ||
      lowerText.includes('error 403') ||
      lowerText.includes('error 404') ||
      lowerText.includes('cloudflare') ||
      lowerText.includes('forbidden')) {
    return false;
  }
  
  // Check for JSON structure
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    return true;
  }
  
  // Check for expected HTML markers used by EVN CSKH
  if (lowerText.includes('entry') && lowerText.includes('where')) return true;
  if (lowerText.includes('thông tin lịch ngừng') || lowerText.includes('khu vực:')) return true;
  
  return false;
};

/**
 * Parses an HTML response from the EVN website to extract power outage schedule data.
 * Optimized to handle multiple potential HTML structures and variations.
 */
const parseHtmlResponse = (html: string, teamCode: string): ScheduleItem[] => {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const scheduleItems: ScheduleItem[] = [];

        // 1. Try to find a table first, as it's the most structured format
        const tables = doc.querySelectorAll('table');
        let dataRows: Element[] = [];

        for (const table of Array.from(tables)) {
            const rows = Array.from(table.querySelectorAll('tr')).filter(tr => {
                // Skip header rows (usually contain 'Khu vực' or 'Thời gian')
                const text = tr.textContent?.toLowerCase() || '';
                return !text.includes('khu vực') && !text.includes('thời gian') && tr.querySelectorAll('td').length >= 3;
            });
            if (rows.length > 0) {
                dataRows = rows;
                break;
            }
        }

        // 2. If no table rows, try generic entry-based selectors
        if (dataRows.length === 0) {
            dataRows = Array.from(doc.querySelectorAll('.entry, .outage-item, .item-lich, .row-data, .list-item'));
        }

        if (dataRows.length === 0) return [];

        dataRows.forEach((entry, index) => {
            // Flexible selectors for each field
            const areaElement = entry.querySelector('.where, .area, .ten-khu-vuc, td:nth-child(2), .location');
            const timeElement = entry.querySelector('.time, .duration, .thoi-gian, td:nth-child(3), .period');
            const reasonElement = entry.querySelector('.cause, .reason, .ly-do, td:nth-child(4), .note');

            if (areaElement && timeElement) {
                const khuVucRaw = areaElement.textContent?.trim() || '';
                const thoiGianRaw = timeElement.textContent?.trim() || '';
                const lyDoRaw = reasonElement?.textContent?.trim() || 'Bảo trì định kỳ';

                // Clean up labels often embedded in text
                const tenKhuVuc = khuVucRaw.replace(/^(?:KHU VỰC|Khu vực|Địa điểm|Vị trí):?\s*/gi, '').trim();
                const lyDo = lyDoRaw.replace(/^(?:Lý do|Nguyên nhân|Ghi chú):?\s*/gi, '').trim();

                // Robust time parsing
                // Expected format: "07:00 17/03/2026 đến 17:00 17/03/2026" or similar
                const timeParts = thoiGianRaw.split(/(?:đến| đến |- |–|—|to)/i);
                
                if (timeParts.length >= 2) {
                    const startStr = timeParts[0].trim();
                    const endStr = timeParts[1].trim();
                    
                    // Regex to find HH:mm and DD/MM/YYYY
                    const timeRegex = /(\d{1,2}:\d{2}(?::\d{2})?)/;
                    const dateRegex = /(\d{2}\/\d{2}\/\d{4})/;
                    
                    const startTimeMatch = startStr.match(timeRegex);
                    const startDateMatch = startStr.match(dateRegex);
                    const endTimeMatch = endStr.match(timeRegex);
                    const endDateMatch = endStr.match(dateRegex) || startDateMatch; // Fallback to start date if end date missing

                    if (startTimeMatch && startDateMatch && endTimeMatch && endDateMatch) {
                        const thoiGianNgung = `${startTimeMatch[1]} ${startDateMatch[1]}`;
                        const thoiGianCoDienLai = `${endTimeMatch[1]} ${endDateMatch[1]}`;
                        
                        scheduleItems.push({
                            ID: `${teamCode}-${Date.now()}-${index}`,
                            MA_DVIQLY: teamCode,
                            TEN_DVIQLY: '',
                            TEN_KHU_VUC: tenKhuVuc,
                            THOI_GIAN_NGUNG: thoiGianNgung,
                            THOI_GIAN_CO_DIEN_LAI: thoiGianCoDienLai,
                            LY_DO: lyDo,
                        });
                    }
                }
            }
        });

        return scheduleItems;
    } catch (parseError) {
        console.error("Lỗi khi phân tích phản hồi HTML:", parseError);
        return [];
    }
};

/**
 * Helper to fetch data with a timeout.
 */
const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeout = 10000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
};

/**
 * Normalizes and cleans area names using fuzzy-like patterns common in EVN data.
 */
const normalizeAreaName = (name: string): string => {
  if (!name) return "";
  let cleaned = name.trim();
  
  // Remove common prefixes/suffixes that might be artifacts
  cleaned = cleaned.replace(/^(?:Khu vực|Địa điểm|Vị trí|Tại):?\s+/i, "");
  cleaned = cleaned.replace(/\s+$/i, "");
  
  // Fix common OCR or encoding issues (if any)
  cleaned = cleaned.replace(/\s+/g, " ");
  
  // Ensure proper casing for common keywords
  const keywords = ["Ấp", "Xã", "Phường", "Thị trấn", "Huyện", "Thành phố", "Trạm", "Lộ", "Tuyến", "Đường"];
  keywords.forEach(kw => {
    const regex = new RegExp(`\\b${kw}\\b`, "gi");
    cleaned = cleaned.replace(regex, kw);
  });

  return cleaned;
};

/**
 * Normalizes reasons for power outages.
 */
const normalizeReason = (reason: string): string => {
  if (!reason) return "Bảo trì định kỳ";
  let cleaned = reason.trim();
  
  const commonReasons = [
    { pattern: /bảo trì|định kỳ|vệ sinh/i, replacement: "Bảo trì, vệ sinh lưới điện định kỳ" },
    { pattern: /sửa chữa|thay thế|nâng cấp/i, replacement: "Sửa chữa, nâng cấp thiết bị lưới điện" },
    { pattern: /xây dựng|mới|thi công/i, replacement: "Thi công công trình điện mới" },
    { pattern: /đấu nối|trạm/i, replacement: "Đấu nối trạm biến áp/thiết bị mới" },
    { pattern: /sự cố|xử lý/i, replacement: "Xử lý khiếm khuyết, ngăn ngừa sự cố" }
  ];

  for (const { pattern, replacement } of commonReasons) {
    if (pattern.test(cleaned)) return replacement;
  }

  return cleaned;
};

/**
 * Validates a schedule item for logical consistency and flags suspicious data.
 */
const validateScheduleItem = (item: ScheduleItem): { isValid: boolean; isSuspicious: boolean; warning?: string } => {
  if (!item.TEN_KHU_VUC || item.TEN_KHU_VUC.length < 2) {
    return { isValid: false, isSuspicious: true, warning: "Tên khu vực quá ngắn hoặc trống" };
  }
  if (!item.THOI_GIAN_NGUNG || !item.THOI_GIAN_CO_DIEN_LAI) {
    return { isValid: false, isSuspicious: true, warning: "Thiếu thông tin thời gian" };
  }
  
  try {
    const parseTime = (s: string) => {
      const [t, d] = s.split(' ');
      const [dd, mm, yy] = d.split('/');
      const date = new Date(`${yy}-${mm}-${dd}T${t}`);
      if (isNaN(date.getTime())) throw new Error("Invalid date");
      return date.getTime();
    };
    
    const start = parseTime(item.THOI_GIAN_NGUNG);
    const end = parseTime(item.THOI_GIAN_CO_DIEN_LAI);
    const durationMs = end - start;
    
    // 1. Critical failures
    if (durationMs <= 0) {
      return { isValid: false, isSuspicious: true, warning: "Thời gian kết thúc trước thời gian bắt đầu" };
    }

    // 2. Suspicious patterns (flag for review but keep if valid)
    let isSuspicious = false;
    let warning = "";

    if (durationMs > 14 * 60 * 60 * 1000) { // More than 14 hours is unusual for routine maintenance
      isSuspicious = true;
      warning = "Thời gian cúp điện kéo dài bất thường (>14h)";
    } else if (durationMs < 15 * 60 * 1000) { // Less than 15 mins is unusual
      isSuspicious = true;
      warning = "Thời gian cúp điện quá ngắn (<15p)";
    }

    // Check for unusual characters in area name
    if (/[@#$%^&*]/.test(item.TEN_KHU_VUC)) {
      isSuspicious = true;
      warning = "Tên khu vực chứa ký tự lạ";
    }
    
    return { isValid: true, isSuspicious, warning };
  } catch {
    return { isValid: false, isSuspicious: true, warning: "Định dạng thời gian không hợp lệ" };
  }
};

/**
 * Removes duplicates, invalid items, and normalizes data.
 */
const sanitizeData = (data: ScheduleItem[]): ScheduleItem[] => {
  const seen = new Set<string>();
  return data
    .map(item => ({
      ...item,
      TEN_KHU_VUC: normalizeAreaName(item.TEN_KHU_VUC),
      LY_DO: normalizeReason(item.LY_DO)
    }))
    .filter(item => {
      const { isValid, isSuspicious, warning } = validateScheduleItem(item);
      if (!isValid) {
        console.warn(`Bỏ qua mục không hợp lệ: ${item.TEN_KHU_VUC} - ${warning}`);
        return false;
      }
      
      if (isSuspicious) {
        // We keep suspicious items but could tag them if the type supported it
        // For now, we just log them
        console.info(`Mục cần lưu ý: ${item.TEN_KHU_VUC} - ${warning}`);
      }
      
      // Create a unique key based on content to identify duplicates
      const key = `${item.TEN_KHU_VUC}-${item.THOI_GIAN_NGUNG}-${item.THOI_GIAN_CO_DIEN_LAI}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

/**
 * Attempts to fetch from the local backend proxy.
 * The backend handles caching, proxy racing, and scraping.
 */
export const fetchSchedule = async (teamCode: string, date: string, retryCount = 0, force = false): Promise<ScheduleItem[]> => {
  const cacheKey = `${teamCode}_${date}`;
  
  // Deduplicate inflight requests
  if (pendingRequests.has(cacheKey) && retryCount === 0) {
    return pendingRequests.get(cacheKey)!;
  }

  const fetchPromise = (async () => {
    // Check local cache first for instant response (unless forced)
    if (!force) {
      const cachedData = CacheManager.get(cacheKey);
      if (cachedData) return cachedData;
    }

    try {
      const response = await fetchWithTimeout(`/api/schedule?teamCode=${teamCode}&date=${date}`);
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
      const result = await response.json();
      const data = result.data || [];
      
      const sanitized = sanitizeData(data);
      
      // Update cache
      CacheManager.set(cacheKey, sanitized);
      return sanitized;
    } catch (error) {
      console.error("Backend fetch failed:", error);
      
      // Try to return even expired data as fallback
      const staleData = CacheManager.get(cacheKey);
      if (staleData && !force) {
          console.info("Returning stale data due to fetch error");
          return staleData;
      }
      
      if (retryCount < 2) {
        await new Promise(r => setTimeout(r, 1000));
        return fetchSchedule(teamCode, date, retryCount + 1, force);
      }
      throw new Error("Không thể kết nối tới máy chủ dữ liệu. Vui lòng thử lại sau.");
    }
  })();

  if (retryCount === 0) {
    pendingRequests.set(cacheKey, fetchPromise);
    try {
      return await fetchPromise;
    } finally {
      pendingRequests.delete(cacheKey);
    }
  }
  
  return fetchPromise;
};
