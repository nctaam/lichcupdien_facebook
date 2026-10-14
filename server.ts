
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import cron from "node-cron";
import axios from "axios";
import * as https from "https";
import * as cheerio from "cheerio";
import { GoogleGenAI } from "@google/genai";
import { POWER_COMPANIES } from "./constants.ts";
import type { ScheduleItem } from "./types.ts";

// Initialize Gemini Client
const aiClient = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

let geminiDisabledUntil = 0;

const app = express();
const PORT = 3000;
const DATA_DIR = path.join(process.cwd(), "data");
const CACHE_FILE = path.join(DATA_DIR, "schedule_cache.json");

// Bypassed SSL verification without TCP connection reuse (keepAlive: false)
// to avoid stale/hung connections from EVN servers
const httpsAgent = new https.Agent({
  keepAlive: false,
  rejectUnauthorized: false,
});

app.use(express.json());

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}

// In-memory cache
let globalCache: Record<string, { data: ScheduleItem[]; timestamp: number }> = {};

// Load cache from file on startup
if (fs.existsSync(CACHE_FILE)) {
  try {
    globalCache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
    console.log("Loaded cache from file.");
  } catch (e) {
    console.error("Failed to load cache file:", e);
  }
}

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Mobile/15E148 Safari/604.1'
];

const getRandomUA = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

/**
 * Scraping logic for SPC (Southern Power Corporation)
 * Supports single day or range
 */
const scrapeEvnData = async (teamCode: string, startDateStr: string, endDateStr?: string, retries = 3): Promise<ScheduleItem[]> => {
  const formatDate = (dStr: string) => {
    const [year, month, day] = dStr.split("-");
    return `${day}/${month}/${year}`;
  };

  const start = formatDate(startDateStr);
  const end = endDateStr ? formatDate(endDateStr) : start;
  
  // SPC API can sometimes use tuNgay/denNgay or just ngay
  const targetUrl = endDateStr 
    ? `https://cskh.evnspc.vn/TraCuu/GetThongTinLichNgungGiamCungCapDien?madvi=${teamCode}&tuNgay=${start}&denNgay=${end}&ChucNang=MaDonVi`
    : `https://cskh.evnspc.vn/TraCuu/GetThongTinLichNgungGiamCungCapDien?madvi=${teamCode}&ngay=${start}&ChucNang=MaDonVi`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.get(targetUrl, { 
        timeout: 15000,
        httpsAgent,
        headers: {
          'User-Agent': getRandomUA(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
        }
      });
      const text = response.data;

      if (typeof text === "object" && text.success) {
        return (text.data || []).map((item: any) => ({
          ...item,
          _DATE_STR: item.THOI_GIAN_NGUNG?.split(' ')[1]?.split('/').reverse().join('-')
        }));
      }

      if (typeof text !== "string") return [];

      const $ = cheerio.load(text);
      const scheduleItems: ScheduleItem[] = [];

      let rows = $("table tr").filter((i, el) => {
        const rowText = $(el).text().toLowerCase();
        return !rowText.includes("khu vực") && !rowText.includes("thời gian") && $(el).find("td").length >= 3;
      });

      if (rows.length === 0) {
        rows = $(".entry, .outage-item, .item-lich, .row-data, .list-item");
      }

      rows.each((i, el) => {
        const area = $(el).find(".where, .area, .ten-khu-vuc, td:nth-child(2), .location").text().trim();
        const time = $(el).find(".time, .duration, .thoi-gian, td:nth-child(3), .period").text().trim();
        const reason = $(el).find(".cause, .reason, .ly-do, td:nth-child(4), .note").text().trim() || "Bảo trì định kỳ";

        if (area && time) {
          const tenKhuVuc = area.replace(/^(?:KHU VỰC|Khu vực|Địa điểm|Vị trí):?\s*/gi, "").trim();
          const lyDo = reason.replace(/^(?:Lý do|Nguyên nhân|Ghi chú):?\s*/gi, "").trim();

          const timeParts = time.split(/(?:đến| đến |- |–|—|to)/i);
          if (timeParts.length >= 2) {
            const startStr = timeParts[0].trim();
            const endStr = timeParts[1].trim();
            
            const timeRegex = /(\d{1,2}:\d{2}(?::\d{2})?)/;
            const dateRegex = /(\d{2}\/\d{2}\/\d{4})/;
            
            const startTimeMatch = startStr.match(timeRegex);
            const startDateMatch = startStr.match(dateRegex);
            const endTimeMatch = endStr.match(timeRegex);
            const endDateMatch = endStr.match(dateRegex) || startDateMatch;

            if (startTimeMatch && startDateMatch && endTimeMatch && endDateMatch) {
              const dateIso = startDateMatch[1].split('/').reverse().join('-');
              scheduleItems.push({
                ID: `${teamCode}-${Date.now()}-${i}`,
                MA_DVIQLY: teamCode,
                TEN_DVIQLY: "",
                TEN_KHU_VUC: tenKhuVuc,
                THOI_GIAN_NGUNG: `${startTimeMatch[1]} ${startDateMatch[1]}`,
                THOI_GIAN_CO_DIEN_LAI: `${endTimeMatch[1]} ${endDateMatch[1]}`,
                LY_DO: lyDo,
                _DATE_STR: dateIso
              } as any);
            }
          }
        }
      });

      return scheduleItems;
    } catch (error) {
      console.log(`[SPC] Attempt ${attempt}/${retries} unsuccessful for ${teamCode}.`);
      if (attempt === retries) {
        throw new Error(`SPC scrape unavailable for ${teamCode}`);
      }
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 3000 * attempt));
      }
    }
  }
  return [];
};

/**
 * Scraping logic for CPC (Central Power Corporation)
 */
const scrapeCpcData = async (teamCode: string, startDateStr: string, endDateStr?: string, retries = 2): Promise<ScheduleItem[]> => {
  const formatDate = (dStr: string) => {
    const [year, month, day] = dStr.split("-");
    return `${day}-${month}-${year}`;
  };

  const start = formatDate(startDateStr);
  const end = endDateStr ? formatDate(endDateStr) : start;
  const targetUrl = `https://cskh-api.cpc.vn/api/remote/outages?maDonVi=${teamCode}&tuNgay=${start}&denNgay=${end}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.get(targetUrl, { 
        timeout: 12000, 
        httpsAgent,
        headers: {
          'User-Agent': getRandomUA(),
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Encoding': 'gzip, deflate, br',
          'Referer': 'https://cskh.cpc.vn/',
          'Origin': 'https://cskh.cpc.vn',
          'Connection': 'keep-alive',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      const data = response.data;
      if (!data || !Array.isArray(data)) return [];

      return data.map((item: any, i: number) => {
        const startD = new Date(item.thoiGianBatDau || item.thoiGianNgung);
        const endD = new Date(item.thoiGianKetThuc || item.thoiGianCoDienLai);
        
        const formatTime = (d: Date) => {
          if (isNaN(d.getTime())) return "N/A";
          const hh = String(d.getHours()).padStart(2, '0');
          const mm = String(d.getMinutes()).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          const mon = String(d.getMonth() + 1).padStart(2, '0');
          const yyyy = d.getFullYear();
          return `${hh}:${mm} ${dd}/${mon}/${yyyy}`;
        };

        const isoDate = (item.thoiGianNgung || item.thoiGianBatDau)?.split('T')[0] || startDateStr;

        return {
          ID: `${teamCode}-${Date.now()}-${i}`,
          MA_DVIQLY: teamCode,
          TEN_DVIQLY: item.tenDonVi || "",
          TEN_KHU_VUC: item.khuVuc || item.tenKhuVuc || "Toàn bộ khu vực",
          THOI_GIAN_NGUNG: formatTime(startD),
          THOI_GIAN_CO_DIEN_LAI: formatTime(endD),
          LY_DO: item.lyDo || item.nguyenNhan || "Bảo trì định kỳ",
          _DATE_STR: isoDate
        } as any;
      });
    } catch (error) {
      console.log(`[CPC] Attempt ${attempt}/${retries} unsuccessful for ${teamCode}.`);
      if (attempt === retries) {
        throw new Error(`CPC scrape unavailable for ${teamCode}`);
      }
      if (attempt < retries) {
        // Longer wait for retry
        await new Promise(resolve => setTimeout(resolve, 5000 * attempt));
      }
    }
  }
  return [];
};

/**
 * Scraping logic for NPC (Northern Power Corporation)
 */
const scrapeNpcData = async (teamCode: string, startDateStr: string, endDateStr?: string, retries = 2): Promise<ScheduleItem[]> => {
  const formatDate = (dStr: string) => {
    const [year, month, day] = dStr.split("-");
    return `${day}/${month}/${year}`;
  };

  const start = formatDate(startDateStr);
  const end = endDateStr ? formatDate(endDateStr) : start;
  const targetUrl = `https://cskh.npc.com.vn/ThongTinKhachHang/GetLichNgungGiamCungCapDien?madvi=${teamCode}&tuNgay=${start}&denNgay=${end}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.get(targetUrl, { 
        timeout: 12000,
        httpsAgent,
        headers: {
          'User-Agent': getRandomUA(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
          'Referer': 'https://cskh.npc.com.vn/ThongTinKhachHang/LichTamNgungCungCapDien',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'same-origin',
          'Sec-Fetch-User': '?1',
          'Cache-Control': 'max-age=0',
        }
      });
      
      const text = response.data;
      if (typeof text === "object" && text.success) {
        return (text.data || []).map((item: any) => ({
          ...item,
          _DATE_STR: item.THOI_GIAN_NGUNG?.split(' ')[1]?.split('/').reverse().join('-')
        }));
      }

      if (typeof text !== "string") return [];

      const $ = cheerio.load(text);
      const scheduleItems: ScheduleItem[] = [];

      $("table tr").each((i, el) => {
        if (i === 0) return;
        const cols = $(el).find("td");
        if (cols.length >= 4) {
          const area = $(cols[1]).text().trim();
          const time = $(cols[2]).text().trim();
          const reason = $(cols[3]).text().trim() || "Bảo trì định kỳ";

          if (area && time) {
            const timeParts = time.split(/(?:đến| đến |- |–|—|to)/i);
            if (timeParts.length >= 2) {
              const startStr = timeParts[0].trim();
              const endStr = timeParts[1].trim();
              
              const timeRegex = /(\d{1,2}:\d{2}(?::\d{2})?)/;
              const dateRegex = /(\d{2}\/\d{2}\/\d{4})/;
              
              const startTimeMatch = startStr.match(timeRegex);
              const startDateMatch = startStr.match(dateRegex);
              const endTimeMatch = endStr.match(timeRegex);
              const endDateMatch = endStr.match(dateRegex) || startDateMatch;

              if (startTimeMatch && endTimeMatch) {
                const dateIso = (startDateMatch ? startDateMatch[1] : start).split('/').reverse().join('-');
                scheduleItems.push({
                  ID: `${teamCode}-${Date.now()}-${i}`,
                  MA_DVIQLY: teamCode,
                  TEN_DVIQLY: "",
                  TEN_KHU_VUC: area,
                  THOI_GIAN_NGUNG: `${startTimeMatch[1]} ${startDateMatch ? startDateMatch[1] : start}`,
                  THOI_GIAN_CO_DIEN_LAI: `${endTimeMatch[1]} ${endDateMatch ? endDateMatch[1] : start}`,
                  LY_DO: reason,
                  _DATE_STR: dateIso
                } as any);
              }
            }
          }
        }
      });

      return scheduleItems;
    } catch (error) {
      console.log(`[NPC] Attempt ${attempt}/${retries} unsuccessful for ${teamCode}.`);
      if (attempt === retries) {
        throw new Error(`NPC scrape unavailable for ${teamCode}`);
      }
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 3000 * attempt));
      }
    }
  }
  return [];
};

/**
 * Scraping logic for HCMC (Ho Chi Minh City Power Corporation)
 */
const scrapeHcmcData = async (teamCode: string, startDateStr: string, endDateStr?: string, retries = 3): Promise<ScheduleItem[]> => {
  const formatDate = (dStr: string) => {
    const [year, month, day] = dStr.split("-");
    return `${day}/${month}/${year}`;
  };

  const start = formatDate(startDateStr);
  const end = endDateStr ? formatDate(endDateStr) : start;
  
  // HCMC typical API endpoint
  const targetUrl = `https://cskh.evnhcmc.vn/TraCuu/GetThongTinLichNgungGiamCungCapDien?maDonVi=${teamCode}&tuNgay=${start}&denNgay=${end}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.get(targetUrl, { 
        timeout: 30000,
        headers: { 'User-Agent': getRandomUA() }
      });
      const data = response.data;

      // Handle JSON response if applicable
      if (typeof data === "object" && data.success) {
        return (data.data || []).map((item: any) => ({
          ...item,
          _DATE_STR: item.THOI_GIAN_NGUNG?.split(' ')[1]?.split('/').reverse().join('-') || startDateStr
        }));
      }

      // If it's HTML, use generic parsing
      if (typeof data !== "string") return [];
      
      const $ = cheerio.load(data);
      const scheduleItems: ScheduleItem[] = [];

      $("table tr, .outage-row").each((i, el) => {
        const cells = $(el).find("td");
        if (cells.length >= 4) {
          const area = $(cells[1]).text().trim();
          const time = $(cells[2]).text().trim();
          const reason = $(cells[3]).text().trim();

          if (area && time && !area.toLowerCase().includes("vực")) {
             // Basic parsing (similar to SPC)
             scheduleItems.push({
               ID: `hcmc-${teamCode}-${Date.now()}-${i}`,
               MA_DVIQLY: teamCode,
               TEN_KHU_VUC: area,
               THOI_GIAN_NGUNG: time.split('đến')[0]?.trim() || "",
               THOI_GIAN_CO_DIEN_LAI: time.split('đến')[1]?.trim() || "",
               LY_DO: reason || "Bảo trì định kỳ",
               _DATE_STR: startDateStr
             } as any);
          }
        }
      });
      return scheduleItems;
    } catch (e) {
      console.log(`[HCMC] Attempt ${attempt}/${retries} unsuccessful for ${teamCode}.`);
      if (attempt === retries) {
        throw new Error(`HCMC scrape unavailable for ${teamCode}`);
      }
      if (attempt < retries) await new Promise(r => setTimeout(r, 2000));
    }
  }
  return [];
};

/**
 * Search Grounding fallback using Gemini 3.5 Flash and Google Search
 */
const fetchScheduleviaSearchGrounding = async (teamCode: string, startDateStr: string, endDateStr?: string): Promise<ScheduleItem[]> => {
  if (geminiDisabledUntil && Date.now() < geminiDisabledUntil) {
    console.log(`[Gemini Grounding] Gemini fallback is temporarily disabled due to quota limits.`);
    return [];
  }

  // Find company name in constants
  let companyName = "Chi nhánh Điện lực";
  for (const [key, comp] of Object.entries(POWER_COMPANIES)) {
    if (comp.teams && comp.teams[teamCode]) {
      companyName = `${comp.name} - ${comp.teams[teamCode]}`;
      break;
    }
    if (key === teamCode) {
      companyName = comp.name;
      break;
    }
  }

  const formatDate = (dStr: string) => {
    const [year, month, day] = dStr.split("-");
    return `${day}/${month}/${year}`;
  };

  const start = formatDate(startDateStr);
  const end = endDateStr ? formatDate(endDateStr) : start;

  const query = `lịch cúp điện ${companyName} từ ngày ${start} đến ngày ${end}`;
  console.log(`[Gemini Grounding] Querying: "${query}"`);

  try {
    const systemInstruction = `Bạn là một trợ lý ảo chuyên nghiệp chịu trách nhiệm lấy thông tin lịch tạm ngừng cung cấp điện (lịch cúp điện) chính xác tại Việt Nam.
Hãy sử dụng công cụ tìm kiếm Google Search được cung cấp để tìm lịch cúp điện của điện lực "${companyName}" trong khoảng thời gian từ "${start}" đến "${end}".

YÊU CẦU ĐỊNH DẠNG TRẢ VỀ:
Chỉ trả về DUY NHẤT một mảng các đối tượng JSON đại diện cho lịch cúp điện, đặt trong khối mã \`\`\`json ... \`\`\`. Không chứa bất kỳ văn bản giải thích nào khác ngoài khối mã JSON.

Cấu trúc mỗi đối tượng trong mảng JSON:
{
  "ID": "Mã ngẫu nhiên duy nhất, ví dụ: ${teamCode}-gemini-\${index}",
  "MA_DVIQLY": "${teamCode}",
  "TEN_DVIQLY": "${companyName}",
  "TEN_KHU_VUC": "Tên chi tiết khu dân cư, đường phố, thôn xóm bị mất điện",
  "THOI_GIAN_NGUNG": "Giờ:phút Ngày/Tháng/Năm (ví dụ: 08:00 15/06/2026)",
  "THOI_GIAN_CO_DIEN_LAI": "Giờ:phút Ngày/Tháng/Năm (ví dụ: 16:30 15/06/2026)",
  "LY_DO": "Lý do cúp điện (ví dụ: Sửa chữa đường dây, bảo trì định kỳ)",
  "_DATE_STR": "Định dạng YYYY-MM-DD (ngày mất điện, ví dụ: 2026-06-15)"
}

LƯU Ý:
- Nếu Google Search không cung cấp kết quả hoặc không có thông tin lịch cúp điện nào cho khu vực này, hãy trả về mảng rỗng: \`[]\`.`;

    const response = await aiClient.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `Tìm thông tin mới nhất cho truy vấn: "${query}"`,
      config: {
        systemInstruction,
        tools: [{ googleSearch: {} }],
        temperature: 0.1,
      },
    });

    const text = response.text || "";
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/(\[\s*\{[\s\S]*\}\s*\])/);
    
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1]);
      if (Array.isArray(parsed)) {
        console.log(`[Gemini Grounding] Successfully retrieved ${parsed.length} items from search grounding fallback for ${teamCode}.`);
        return parsed.map((item, index) => ({
          ID: item.ID || `${teamCode}-gemini-${Date.now()}-${index}`,
          MA_DVIQLY: item.MA_DVIQLY || teamCode,
          TEN_DVIQLY: item.TEN_DVIQLY || companyName,
          TEN_KHU_VUC: item.TEN_KHU_VUC || "Toàn bộ khu vực",
          THOI_GIAN_NGUNG: item.THOI_GIAN_NGUNG || `08:00 ${start}`,
          THOI_GIAN_CO_DIEN_LAI: item.THOI_GIAN_CO_DIEN_LAI || `17:00 ${end}`,
          LY_DO: item.LY_DO || "Bảo trì lưới điện",
          _DATE_STR: item._DATE_STR || startDateStr
        }));
      }
    }

    try {
      const parsed = JSON.parse(text.trim());
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch (_) {}

    console.warn(`[Gemini Grounding] No parsable schedule JSON found in Gemini output for ${teamCode}.`);
    return [];
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.warn(`[Gemini Grounding] Fallback query unsuccessful for ${teamCode}: ${errMsg}`);
    if (errMsg.includes("429") || errMsg.toLowerCase().includes("quota") || errMsg.toLowerCase().includes("rate limit") || errMsg.toLowerCase().includes("limit exceeded") || errMsg.toLowerCase().includes("exhausted")) {
      // If it is a hard quota / billing limit error, disable fallback for 1 hour; otherwise 10 minutes.
      const isHardQuota = errMsg.toLowerCase().includes("quota") && errMsg.toLowerCase().includes("exceeded");
      geminiDisabledUntil = Date.now() + (isHardQuota ? 60 * 60 * 1000 : 10 * 60 * 1000);
      console.warn(`[Gemini Grounding] Quota or rate limit exceeded. Disabling Gemini fallback for ${isHardQuota ? '60' : '10'} minutes.`);
    }
    return [];
  }
};

/**
 * Dispatcher to choose the right scraper
 */
const fetchScheduleData = async (teamCode: string, startDateStr: string, endDateStr?: string, useFallback = false): Promise<ScheduleItem[]> => {
  // HCMC logic (Assuming codes start with 'HC')
  if (teamCode.startsWith('HC')) {
    try {
      return await scrapeHcmcData(teamCode, startDateStr, endDateStr);
    } catch (err) {
      console.log(`[Dispatcher] Direct HCMC query unsuccessful for ${teamCode}.`);
      if (useFallback) {
        return fetchScheduleviaSearchGrounding(teamCode, startDateStr, endDateStr);
      }
      throw err;
    }
  }
  // CPC codes
  if (teamCode.startsWith('PC') || teamCode.startsWith('PP') || teamCode.startsWith('PQ')) {
    try {
      return await scrapeCpcData(teamCode, startDateStr, endDateStr);
    } catch (err) {
      console.log(`[Dispatcher] Direct CPC query unsuccessful for ${teamCode}.`);
      if (useFallback) {
        return fetchScheduleviaSearchGrounding(teamCode, startDateStr, endDateStr);
      }
      throw err;
    }
  }
  // NPC codes
  if (teamCode.startsWith('PA') || teamCode.startsWith('PH') || teamCode.startsWith('PN')) {
    try {
      return await scrapeNpcData(teamCode, startDateStr, endDateStr);
    } catch (err) {
      console.log(`[Dispatcher] Direct NPC query unsuccessful for ${teamCode}.`);
      if (useFallback) {
        return fetchScheduleviaSearchGrounding(teamCode, startDateStr, endDateStr);
      }
      throw err;
    }
  }
  // Default to SPC
  try {
    return await scrapeEvnData(teamCode, startDateStr, endDateStr);
  } catch (err) {
    console.log(`[Dispatcher] Direct SPC query unsuccessful for ${teamCode}.`);
    if (useFallback) {
      return fetchScheduleviaSearchGrounding(teamCode, startDateStr, endDateStr);
    }
    throw err;
  }
};

/**
 * Background task to refresh cache using range fetching
 */
const refreshAllData = async () => {
  if (global.isRefreshing) {
    console.log("Refresh already in progress. Skipping.");
    return;
  }
  global.isRefreshing = true;
  
  console.log("Starting background data refresh...");
  const today = new Date();
  const datesInRange: string[] = [];
  for (let i = 0; i < 10; i++) { // Fetching 10 days instead of 7 for better coverage
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    datesInRange.push(d.toISOString().split('T')[0]);
  }

  const startDate = datesInRange[0];
  const endDate = datesInRange[datesInRange.length - 1];

  const allTeams: string[] = [];
  Object.values(POWER_COMPANIES).forEach(company => {
    Object.keys(company.teams).forEach(teamCode => {
      allTeams.push(teamCode);
    });
  });

  // Separate CPC, NPC, SPC (starts with PB, PK) and general other companies
  const cpcTeams = allTeams.filter(t => t.startsWith('PC') || t.startsWith('PP') || t.startsWith('PQ'));
  const npcTeams = allTeams.filter(t => t.startsWith('PA') || t.startsWith('PH') || t.startsWith('PN'));
  const spcTeams = allTeams.filter(t => t.startsWith('PB') || t.startsWith('PK'));
  const otherTeams = allTeams.filter(t => !cpcTeams.includes(t) && !npcTeams.includes(t) && !spcTeams.includes(t));

  console.log(`Refreshing ${otherTeams.length} general teams in parallel...`);
  const OTHER_CONCURRENCY = 4;
  for (let i = 0; i < otherTeams.length; i += OTHER_CONCURRENCY) {
    const chunk = otherTeams.slice(i, i + OTHER_CONCURRENCY);
    await Promise.all(chunk.map(async (teamCode, j) => {
      await new Promise(r => setTimeout(r, j * 1000 + Math.random() * 1000));
      try {
        const items = await fetchScheduleData(teamCode, startDate, endDate, false);
        datesInRange.forEach(d => {
          globalCache[`${teamCode}_${d}`] = { data: [], timestamp: Date.now() };
        });
        items.forEach((item: any) => {
          const itemDate = item._DATE_STR;
          if (itemDate && datesInRange.includes(itemDate)) {
            const cacheKey = `${teamCode}_${itemDate}`;
            if (!globalCache[cacheKey]) globalCache[cacheKey] = { data: [], timestamp: Date.now() };
            globalCache[cacheKey].data.push(item);
          }
        });
      } catch (e) {
        console.log(`[Refresh] State update deferred for ${teamCode}:`, e instanceof Error ? e.message : e);
      }
    }));
    if (i % 20 === 0) fs.writeFile(CACHE_FILE, JSON.stringify(globalCache), () => {});
  }

  let npcFailures = 0;
  console.log(`Refreshing ${npcTeams.length} NPC teams sequentially...`);
  for (let i = 0; i < npcTeams.length; i++) {
    const teamCode = npcTeams[i];
    if (npcFailures >= 5) {
      console.log(`[NPC] Circuit breaker active. Skipping background fetch for remaining NPC teams (including ${teamCode}) to avoid server freeze.`);
      continue;
    }
    try {
      console.log(`[NPC ${i+1}/${npcTeams.length}] Fetching: ${teamCode}`);
      const items = await fetchScheduleData(teamCode, startDate, endDate, false);
      datesInRange.forEach(d => {
        globalCache[`${teamCode}_${d}`] = { data: [], timestamp: Date.now() };
      });
      items.forEach((item: any) => {
        const itemDate = item._DATE_STR;
        if (itemDate && datesInRange.includes(itemDate)) {
          const cacheKey = `${teamCode}_${itemDate}`;
          if (!globalCache[cacheKey]) globalCache[cacheKey] = { data: [], timestamp: Date.now() };
          globalCache[cacheKey].data.push(item);
        }
      });
      npcFailures = 0;
    } catch (e) {
      console.log(`[Refresh] NPC query unsuccessful for ${teamCode}:`, e instanceof Error ? e.message : e);
      npcFailures++;
    }
    await new Promise(r => setTimeout(r, 1500 + Math.random() * 1500));
  }

  let spcFailures = 0;
  console.log(`Refreshing ${spcTeams.length} SPC teams sequentially...`);
  for (let i = 0; i < spcTeams.length; i++) {
    const teamCode = spcTeams[i];
    if (spcFailures >= 5) {
      console.log(`[SPC] Circuit breaker active. Skipping background fetch for remaining SPC teams (including ${teamCode}) to avoid server freeze.`);
      continue;
    }
    try {
      console.log(`[SPC ${i+1}/${spcTeams.length}] Fetching: ${teamCode}`);
      const items = await fetchScheduleData(teamCode, startDate, endDate, false);
      datesInRange.forEach(d => {
        globalCache[`${teamCode}_${d}`] = { data: [], timestamp: Date.now() };
      });
      items.forEach((item: any) => {
        const itemDate = item._DATE_STR;
        if (itemDate && datesInRange.includes(itemDate)) {
          const cacheKey = `${teamCode}_${itemDate}`;
          if (!globalCache[cacheKey]) globalCache[cacheKey] = { data: [], timestamp: Date.now() };
          globalCache[cacheKey].data.push(item);
        }
      });
      spcFailures = 0;
    } catch (e) {
      console.log(`[Refresh] SPC query unsuccessful for ${teamCode}:`, e instanceof Error ? e.message : e);
      spcFailures++;
    }
    await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000));
    if (i % 5 === 0) {
      fs.writeFile(CACHE_FILE, JSON.stringify(globalCache), () => {});
    }
  }

  let cpcFailures = 0;
  console.log(`Refreshing ${cpcTeams.length} CPC teams sequentially...`);
  for (let i = 0; i < cpcTeams.length; i++) {
    const teamCode = cpcTeams[i];
    if (cpcFailures >= 5) {
      console.log(`[CPC] Circuit breaker active. Skipping background fetch for remaining CPC teams (including ${teamCode}) to avoid server freeze.`);
      continue;
    }
    try {
      console.log(`[${i+1}/${cpcTeams.length}] Fetching CPC: ${teamCode}`);
      const items = await fetchScheduleData(teamCode, startDate, endDate, false);
      
      datesInRange.forEach(d => {
        globalCache[`${teamCode}_${d}`] = { data: [], timestamp: Date.now() };
      });

      items.forEach((item: any) => {
        const itemDate = item._DATE_STR;
        if (itemDate && datesInRange.includes(itemDate)) {
          const cacheKey = `${teamCode}_${itemDate}`;
          if (!globalCache[cacheKey]) globalCache[cacheKey] = { data: [], timestamp: Date.now() };
          globalCache[cacheKey].data.push(item);
        }
      });
      
      datesInRange.forEach(d => {
        if (globalCache[`${teamCode}_${d}`]) {
          globalCache[`${teamCode}_${d}`].timestamp = Date.now();
        }
      });
      cpcFailures = 0;
    } catch (e) {
      console.log(`[Refresh] CPC query unsuccessful for ${teamCode}:`, e instanceof Error ? e.message : e);
      cpcFailures++;
    }
    
    // Major delay between CPC requests to avoid ETIMEDOUT
    await new Promise(r => setTimeout(r, 4000 + Math.random() * 2000));
    
    if (i % 5 === 0) {
      fs.writeFile(CACHE_FILE, JSON.stringify(globalCache), () => {});
    }
  }

  fs.writeFileSync(CACHE_FILE, JSON.stringify(globalCache));
  global.isRefreshing = false;
  console.log("Background data refresh completed.");
};

declare global {
  var isRefreshing: boolean;
}
global.isRefreshing = false;

// Schedule cron job: Every 30 minutes
cron.schedule("*/30 * * * *", () => {
  refreshAllData();
});

// Initial fetch on startup if cache is empty or old
if (Object.keys(globalCache).length === 0) {
  refreshAllData();
}

async function startServer() {
  // API Routes
  app.get("/api/schedule", async (req, res) => {
    const { teamCode, date, endDate } = req.query;
    if (!teamCode || !date) {
      return res.status(400).json({ error: "Missing teamCode or date" });
    }

    const startStr = date as string;
    const endStr = endDate ? (endDate as string) : startStr;

    // Helper to get dates list in range
    const getDatesInRangeList = (sStr: string, eStr: string): string[] => {
      const datesList: string[] = [];
      try {
        const start = new Date(sStr);
        const end = new Date(eStr);
        const current = new Date(start);
        while (current <= end) {
          datesList.push(current.toISOString().split('T')[0]);
          current.setDate(current.getDate() + 1);
        }
      } catch (err) {
        console.error("Error generating dates list:", err);
      }
      return datesList;
    };

    const dates = getDatesInRangeList(startStr, endStr);

    // Check if ALL dates in the range are cached and fresh (4 hours)
    let allCachedAndFresh = true;
    const combinedData: ScheduleItem[] = [];

    for (const d of dates) {
      const cacheKey = `${teamCode}_${d}`;
      const cached = globalCache[cacheKey];
      if (cached && Date.now() - cached.timestamp < 4 * 60 * 60 * 1000) {
        combinedData.push(...cached.data);
      } else {
        allCachedAndFresh = false;
        break;
      }
    }

    if (allCachedAndFresh && dates.length > 0) {
      return res.json({ data: combinedData, source: "cache" });
    }

    // Otherwise, fetch fresh range and update cache
    try {
      const data = await fetchScheduleData(teamCode as string, startStr, endStr, true);
      
      // Initialize cache for all dates in the queried range to empty lists
      dates.forEach(d => {
        globalCache[`${teamCode}_${d}`] = { data: [], timestamp: Date.now() };
      });

      // Populate fresh data into cache
      data.forEach((item: any) => {
        const itemDate = item._DATE_STR;
        if (itemDate && dates.includes(itemDate)) {
          const cacheKey = `${teamCode}_${itemDate}`;
          if (!globalCache[cacheKey]) {
            globalCache[cacheKey] = { data: [], timestamp: Date.now() };
          }
          globalCache[cacheKey].data.push(item);
        }
      });

      // Assemble response from cache so we include any dates that were empty
      const responseData: ScheduleItem[] = [];
      dates.forEach(d => {
        responseData.push(...(globalCache[`${teamCode}_${d}`]?.data || []));
      });

      res.json({ data: responseData, source: "live" });
      
      // Save cache asynchronously
      fs.writeFile(CACHE_FILE, JSON.stringify(globalCache), () => {});
    } catch (error) {
      console.warn(`Local fetch failed for range ${teamCode}_${startStr}_${endStr}, checking cache fallback:`, error instanceof Error ? error.message : error);
      
      // Fallback: merge what we have in cache (even if stale/expired)
      const fallbackData: ScheduleItem[] = [];
      let foundAnyInCache = false;

      dates.forEach(d => {
        const cacheKey = `${teamCode}_${d}`;
        if (globalCache[cacheKey]) {
          fallbackData.push(...globalCache[cacheKey].data);
          foundAnyInCache = true;
        }
      });

      if (foundAnyInCache) {
        return res.json({ data: fallbackData, source: "stale" });
      }

      res.json({ data: [], source: "offline", error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", cacheSize: Object.keys(globalCache).length });
  });

  app.post("/api/summarize", async (req, res) => {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Missing prompt" });
    }

    try {
      const response = await axios.post("http://5.223.85.222:20128/v1/chat/completions", {
        model: "cx/gpt-5.4",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1, // Lower temperature is faster and more stable
        max_tokens: 500,  // Limit context to speed up generation
      }, {
        headers: {
          "Authorization": `Bearer sk-59d31ddfc474b8fe-i1s0qz-30221328`,
          "Content-Type": "application/json"
        },
        timeout: 45000 // Slightly shorter timeout for snappier failure handling
      });

      const text = response.data.choices?.[0]?.message?.content || "";
      res.json({ text });
    } catch (error) {
      console.error("Error calling custom LLM:", error instanceof Error ? error.message : error);
      res.status(500).json({ error: "Failed to generate summary from custom LLM" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
