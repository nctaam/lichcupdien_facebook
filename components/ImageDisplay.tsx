
import React from 'react';

interface ImageDisplayProps {
  imageUrl: string;
  teamName: string;
}

const ImageDisplay: React.FC<ImageDisplayProps> = ({ imageUrl, teamName }) => {
  const downloadImage = () => {
    const link = document.createElement('a');
    link.href = imageUrl;
    const safeTeamName = teamName.replace(/ /g, '_');
    const date = new Date().toISOString().slice(0, 10);
    link.download = `Lich_cup_dien_${safeTeamName}_${date}.jpeg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  return (
    <div className="mt-6 p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md">
      <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-4">Ảnh Lịch Cúp Điện Đã Tạo</h3>
      <div className="flex justify-center mb-4">
        <img src={imageUrl} alt="Generated Power Outage Schedule" className="rounded-lg shadow-lg max-w-full h-auto border-4 border-gray-200 dark:border-gray-600" />
      </div>
      <button
        onClick={downloadImage}
        className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-4 rounded-lg transition-colors duration-300 flex items-center justify-center gap-2"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 9.707a1 1 0 011.414 0L9 11.086V3a1 1 0 112 0v8.086l1.293-1.379a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
        Tải ảnh xuống
      </button>
    </div>
  );
};

export default ImageDisplay;
