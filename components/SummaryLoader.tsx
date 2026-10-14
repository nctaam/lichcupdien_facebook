
import React from 'react';

const SummaryLoader: React.FC = () => (
  <div
    className="space-y-4"
    data-html2canvas-ignore="true"
    aria-label="Đang tạo tóm tắt AI..."
  >
    <div className="flex items-center gap-3 mb-2">
      <div className="relative">
        <div className="h-5 w-5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin"></div>
        <div className="absolute inset-0 h-5 w-5 border-2 border-purple-200/30 rounded-full"></div>
      </div>
      <span className="text-sm font-bold text-purple-700 dark:text-purple-300 animate-pulse">
        AI đang phân tích và tóm tắt lịch cúp điện...
      </span>
    </div>
    <div className="animate-pulse flex items-start gap-3">
        <div className="h-5 w-5 bg-purple-200 dark:bg-purple-800 rounded-full flex-shrink-0 mt-0.5"></div>
        <div className="flex-1 space-y-2">
            <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-1/4"></div>
            <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded w-full"></div>
            <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded w-3/4"></div>
        </div>
    </div>
    <div className="animate-pulse flex items-start gap-3" style={{ animationDelay: '200ms' }}>
        <div className="h-5 w-5 bg-purple-200 dark:bg-purple-800 rounded-full flex-shrink-0 mt-0.5"></div>
        <div className="flex-1 space-y-2">
            <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-1/3"></div>
            <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded w-4/5"></div>
        </div>
    </div>
  </div>
);

export default SummaryLoader;
