

import { GoogleGenAI } from "@google/genai";
import type { ScheduleItem } from '../types';

// Gemini is still used for image generation (multimodal feature)
// But for text summarization, we use the custom endpoint as per user request.
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const generateScheduleImage = async (scheduleData: ScheduleItem[], teamName: string): Promise<string> => {
  // Group schedules by date first, then by team
  const schedulesByDate = scheduleData.reduce((acc, item) => {
    try {
        const datePart = item.THOI_GIAN_NGUNG.split(' ')[1]; // "dd/MM/yyyy"
        if (!acc[datePart]) {
            acc[datePart] = [];
        }
        acc[datePart].push(item);
    } catch(e) {
      // ignore items with malformed dates
    }
    return acc;
  }, {} as Record<string, ScheduleItem[]>);


  const formattedSchedule = Object.keys(schedulesByDate).length > 0 
    ? Object.entries(schedulesByDate).sort().map(([date, itemsOnDate]) => {
        // Now group by team for that specific date
        const schedulesByTeam = itemsOnDate.reduce((acc, item) => {
            const team = item.TEN_DVIQLY || 'Không xác định';
            if (!acc[team]) {
                acc[team] = [];
            }
            acc[team].push(item);
            return acc;
        }, {} as {[key: string]: ScheduleItem[]});

        const teamsFormatted = Object.entries(schedulesByTeam).map(([team, items]) => {
            const itemsFormatted = items.map(item => 
                `- Khu vực: ${item.TEN_KHU_VUC}\n  Thời gian: Từ ${item.THOI_GIAN_NGUNG} đến ${item.THOI_GIAN_CO_DIEN_LAI}\n  Lý do: ${item.LY_DO}`
            ).join('\n');
             // Add a team header only if there's more than one team in the data for that day
            return Object.keys(schedulesByTeam).length > 1 
                ? `ĐIỆN LỰC: ${team}\n${itemsFormatted}` 
                : itemsFormatted;
        }).join('\n');
        
        return `THÔNG TIN NGÀY ${date}\n${teamsFormatted}`;

    }).join('\n\n') 
    : "Không có lịch cúp điện nào được ghi nhận.";

  const prompt = `Tạo một hình ảnh thông báo lịch tạm ngừng cung cấp điện cho khu vực của "${teamName}".
Hình ảnh cần có tiêu đề to, rõ ràng: "THÔNG BÁO LỊCH TẠM NGỪNG CUNG CẤP ĐIỆN".
Sử dụng tông màu xanh dương đậm và trắng làm chủ đạo. Thiết kế phải chuyên nghiệp, sạch sẽ, và hiện đại.
Thêm một biểu tượng (icon) hình bóng đèn hoặc tia sét ở góc trên.
Dưới đây là danh sách chi tiết các khu vực bị ảnh hưởng, được phân chia rõ ràng theo từng ngày:

${formattedSchedule}

Hãy trình bày thông tin này một cách cực kỳ ngăn nắp, dễ đọc trong một khung hình duy nhất. Font chữ phải rõ ràng.
Thêm một dòng chân trang nhỏ: "Thông tin từ EVNSPC. Để biết thêm chi tiết, vui lòng liên hệ tổng đài."
`;

  try {
    const response = await ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: prompt,
        config: {
          numberOfImages: 1,
          outputMimeType: 'image/jpeg',
          aspectRatio: '1:1',
        },
    });

    if (response.generatedImages && response.generatedImages.length > 0) {
      const base64ImageBytes = response.generatedImages[0].image.imageBytes;
      return `data:image/jpeg;base64,${base64ImageBytes}`;
    } else {
      throw new Error('Image generation failed, no image returned.');
    }
  } catch (error) {
    console.error('Error generating image with Gemini:', error);
    if (error instanceof Error && error.message.includes('API key not valid')) {
        throw new Error('API key not valid. Please check your configuration.');
    }
    throw new Error('Không thể tạo ảnh. Vui lòng kiểm tra API key (SỬ DỤNG CHO TẠO ẢNH) và thử lại.');
  }
};


const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 2000; // Start with 2 seconds

export const summarizeDailySchedule = async (scheduleForDay: ScheduleItem[], teamName: string, date: string): Promise<string> => {
  if (!scheduleForDay || scheduleForDay.length === 0) {
    return "Không có lịch cúp điện cho ngày này.";
  }

  // Pre-group schedules by time frame to improve the model's ability to summarize.
  const schedulesByTime = scheduleForDay.reduce((acc, item) => {
    try {
      const startTime = item.THOI_GIAN_NGUNG?.split(' ')[0] || '';
      const endTime = item.THOI_GIAN_CO_DIEN_LAI?.split(' ')[0] || '';
      if (startTime && endTime) {
        const timeFrame = `từ ${startTime} đến ${endTime}`;
        if (!acc[timeFrame]) {
          acc[timeFrame] = [];
        }
        // Avoid duplicating area names for the same time frame
        if (!acc[timeFrame].includes(item.TEN_KHU_VUC)) {
            acc[timeFrame].push(item.TEN_KHU_VUC);
        }
      }
    } catch (e) {
      // Ignore items with malformed time strings
    }
    return acc;
  }, {} as Record<string, string[]>);

  const formattedSchedule = Object.entries(schedulesByTime)
    .map(([timeFrame, areas]) => 
      `Khung giờ ${timeFrame}:\n${areas.map(area => `- ${area}`).join('\n')}`
    ).join('\n\n');


  const prompt = `Hãy viết một bản tin ngắn gọn về lịch tạm ngừng cung cấp điện ngày ${date} tại "${teamName}":
${formattedSchedule}

Yêu cầu:
- Phong cách: Bản tin cập nhật nhanh, chuyên nghiệp.
- Cấu trúc: 
  + Tiêu đề: 📢 **BẢN TIN CÚP ĐIỆN NHANH**
  + Nội dung: Liệt kê rõ khung giờ và các **khu vực** bị ảnh hưởng.
- Sử dụng emoji: ⚡, 🕒, 📍.
- Định dạng: Markdown, cực kỳ súc tích, đi thẳng vào vấn đề.`;

  const cacheKey = `news_bulletin_${teamName}_${date}`;
  const cachedSummary = sessionStorage.getItem(cacheKey);
  if (cachedSummary) return cachedSummary;

  let lastError: Error | null = null;

  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      const text = result.text?.trim() ?? "";
      if (text) {
        sessionStorage.setItem(cacheKey, text);
      }
      return text;
    } catch (error) {
      lastError = error as Error;
      console.error(`Attempt ${i + 1} for summary generation failed:`, error);
      
      if (i < MAX_RETRIES - 1) {
        const delay = INITIAL_BACKOFF_MS * Math.pow(2, i) + Math.random() * 1000; 
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        break;
      }
    }
  }

  // If the loop completes without returning, it means all retries failed.
  console.error('Failed to generate summary with Gemini after all retries.', lastError);
  if (lastError && (lastError.message || '').toLowerCase().includes('api key not valid')) {
      throw new Error('API key not valid. Please check your configuration.');
  }
  
  const finalErrorString = (lastError instanceof Error ? lastError.message : String(lastError)).toLowerCase();
  if (finalErrorString.includes('resource_exhausted')) {
      throw new Error('Đã đạt đến giới hạn yêu cầu API của Gemini. Vui lòng thử lại sau một lát.');
  }
  
  throw new Error('Không thể tạo tóm tắt. Vui lòng thử lại.');
};