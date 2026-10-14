
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Popup, CircleMarker, useMap, LayersControl, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { ScheduleItem } from '../types';
import { TEAM_COORDINATES, COMPANY_COORDINATES, getOutageStatus, getStatusColor } from '../utils/mapUtils';
import { Maximize2, Minimize2, Navigation, Search, Map as MapIcon, Info } from 'lucide-react';

// Fix for default marker icons in Leaflet with Webpack/Vite
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface MapViewProps {
  schedule: ScheduleItem[];
  selectedCompany: string;
  selectedTeam: string;
}

// Component to handle map bounds and centering
const MapController: React.FC<{ center: { lat: number, lng: number }, markers: any[], selectedTeam: string }> = ({ center, markers, selectedTeam }) => {
  const map = useMap();
  
  useEffect(() => {
    if (markers.length > 0) {
      if (markers.length === 1) {
        // If only one marker, center on it with a good zoom level
        map.setView([markers[0].coord.lat, markers[0].coord.lng], 13, { animate: true });
      } else {
        // Multiple markers: fit bounds
        const bounds = L.latLngBounds(markers.map(m => [m.coord.lat, m.coord.lng]));
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14, animate: true });
      }
    } else {
      // No markers: center on the selected company/team default coordinate
      map.setView([center.lat, center.lng], selectedTeam ? 12 : 9, { animate: true });
    }
  }, [center, markers, map, selectedTeam]);

  return null;
};

const MapView: React.FC<MapViewProps> = ({ schedule, selectedCompany, selectedTeam }) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredMarker, setHoveredMarker] = useState<string | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  const center = useMemo(() => {
    if (selectedTeam && TEAM_COORDINATES[selectedTeam]) {
      return TEAM_COORDINATES[selectedTeam];
    }
    if (selectedCompany && COMPANY_COORDINATES[selectedCompany]) {
      return COMPANY_COORDINATES[selectedCompany];
    }
    return { lat: 10.2524, lng: 105.9722 }; // Default to Vĩnh Long
  }, [selectedCompany, selectedTeam]);

  const markers = useMemo(() => {
    // Group by team to avoid overlapping markers for the same location
    const teamGroups: Record<string, ScheduleItem[]> = {};
    
    schedule.forEach(item => {
      const teamCode = item.MA_DVIQLY;
      if (!teamGroups[teamCode]) {
        teamGroups[teamCode] = [];
      }
      teamGroups[teamCode].push(item);
    });

    return Object.entries(teamGroups).map(([teamCode, items]) => {
      const coord = TEAM_COORDINATES[teamCode];
      if (!coord) return null;

      // Filter by search query if exists
      if (searchQuery && !items[0].TEN_DVIQLY.toLowerCase().includes(searchQuery.toLowerCase()) && 
          !items.some(it => it.TEN_KHU_VUC.toLowerCase().includes(searchQuery.toLowerCase()))) {
        return null;
      }

      // Determine overall status for the team marker
      const statuses = items.map(item => getOutageStatus(item.LY_DO));
      const hasEmergency = statuses.includes('emergency');
      const hasPlanned = statuses.includes('planned');
      
      let status: 'planned' | 'emergency' | 'other' = 'other';
      if (hasEmergency) status = 'emergency';
      else if (hasPlanned) status = 'planned';

      return {
        teamCode,
        teamName: items[0].TEN_DVIQLY || `Đơn vị ${teamCode}`,
        coord,
        status,
        items
      };
    }).filter(Boolean);
  }, [schedule, searchQuery]);

  const handleLocateMe = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((position) => {
        const { latitude, longitude } = position.coords;
        if (mapRef.current) {
          mapRef.current.setView([latitude, longitude], 13);
        }
      });
    }
  };

  return (
    <div className={`${isFullscreen ? 'fixed inset-0 z-[9999] bg-white dark:bg-gray-900' : 'h-[600px] w-full rounded-2xl mt-6'} overflow-hidden shadow-2xl border border-gray-200 dark:border-gray-700 relative transition-all duration-300`}>
      
      {/* Map Controls Overlay */}
      <div className="absolute top-4 left-4 z-[1000] flex flex-col gap-2">
        <div className="bg-white dark:bg-gray-800 p-1 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 flex flex-col">
          <button 
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors text-gray-600 dark:text-gray-300"
            title={isFullscreen ? "Thu nhỏ" : "Toàn màn hình"}
          >
            {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
          </button>
          <button 
            onClick={handleLocateMe}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors text-gray-600 dark:text-gray-300 border-t border-gray-100 dark:border-gray-700"
            title="Vị trí của tôi"
          >
            <Navigation size={20} />
          </button>
        </div>
      </div>

      {/* Search Bar Overlay */}
      <div className="absolute top-4 right-4 z-[1000] w-64 md:w-80">
        <div className="relative">
          <input 
            type="text"
            placeholder="Tìm kiếm khu vực..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white/90 dark:bg-gray-800/90 backdrop-blur-md border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm dark:text-white"
          />
          <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
        </div>
      </div>

      {markers.length === 0 && schedule.length > 0 && !searchQuery && (
        <div className="absolute inset-0 z-[2000] bg-gray-100/80 dark:bg-gray-900/80 flex items-center justify-center p-6 text-center backdrop-blur-sm">
          <div className="max-w-md bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-700">
            <div className="w-20 h-20 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-6">
              <MapIcon className="h-10 w-10 text-gray-400" />
            </div>
            <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">Chưa có tọa độ bản đồ</h3>
            <p className="text-gray-500 dark:text-gray-400">
              Hiện tại hệ thống chưa có tọa độ chính xác cho các khu vực này trên bản đồ. 
              Bạn có thể xem chi tiết ở tab <b>Danh sách</b>.
            </p>
          </div>
        </div>
      )}

      <MapContainer 
        center={[center.lat, center.lng]} 
        zoom={selectedTeam ? 12 : 9} 
        scrollWheelZoom={true}
        style={{ height: '100%', width: '100%' }}
        ref={mapRef}
      >
        <LayersControl position="bottomleft">
          <LayersControl.BaseLayer checked name="Bản đồ đường phố">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Bản đồ vệ tinh">
            <TileLayer
              attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EBP, and the GIS User Community'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            />
          </LayersControl.BaseLayer>
        </LayersControl>
        
        <MapController center={center} markers={markers} selectedTeam={selectedTeam} />
        
        {markers.map((marker, idx) => (
          <CircleMarker 
            key={idx}
            center={[marker!.coord.lat, marker!.coord.lng]}
            pathOptions={{ 
              fillColor: getStatusColor(marker!.status), 
              color: 'white', 
              weight: hoveredMarker === marker!.teamCode ? 3 : 2, 
              fillOpacity: hoveredMarker === marker!.teamCode ? 1 : 0.85 
            }}
            radius={hoveredMarker === marker!.teamCode ? 18 : 14}
            eventHandlers={{
              mouseover: () => setHoveredMarker(marker!.teamCode),
              mouseout: () => setHoveredMarker(null),
            }}
          >
            <Tooltip direction="top" offset={[0, -10]} opacity={1} permanent={false}>
              <div className="px-2 py-1">
                <p className="font-bold text-gray-800 m-0">{marker!.teamName}</p>
                <p className="text-[10px] text-gray-500 m-0">{marker!.items.length} khu vực mất điện</p>
              </div>
            </Tooltip>
            
            <Popup className="custom-popup">
              <div className="p-2 min-w-[280px]">
                <div className="flex items-center gap-2 mb-3 border-b border-gray-100 pb-2">
                  <div className={`w-3 h-3 rounded-full bg-[${getStatusColor(marker!.status)}]`} />
                  <h4 className="font-bold text-gray-800 text-base m-0">{marker!.teamName}</h4>
                </div>
                
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                  {marker!.items.map((item, i) => {
                    const status = getOutageStatus(item.LY_DO);
                    const statusText = status === 'emergency' ? 'Sự cố / Đột xuất' : (status === 'planned' ? 'Kế hoạch' : 'Khác');
                    const statusBg = status === 'emergency' ? 'bg-red-100 text-red-700' : (status === 'planned' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700');
                    
                    return (
                      <div key={i} className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl border border-gray-100 dark:border-gray-700">
                        <div className="flex justify-between items-center mb-2">
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${statusBg}`}>
                            {statusText}
                          </span>
                          <span className="text-[10px] font-medium text-gray-500">{item.THOI_GIAN_NGUNG.split(' ')[0]}</span>
                        </div>
                        <p className="font-bold text-gray-900 dark:text-white text-sm leading-tight mb-1">{item.TEN_KHU_VUC}</p>
                        <div className="flex items-start gap-1 text-[11px] text-gray-500 italic">
                          <Info size={12} className="mt-0.5 shrink-0" />
                          <span className="truncate">{item.LY_DO}</span>
                        </div>
                        <div className="mt-2 text-[10px] flex gap-2 text-gray-400">
                          <span>Từ: {item.THOI_GIAN_NGUNG.split(' ')[0]}</span>
                          <span>Đến: {item.THOI_GIAN_CO_DIEN_LAI.split(' ')[0]}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
      
      {/* Legend Overlay */}
      <div className="absolute bottom-6 right-6 bg-white/90 dark:bg-gray-800/90 backdrop-blur-md p-4 rounded-2xl shadow-2xl z-[1000] text-xs border border-gray-200 dark:border-gray-700 min-w-[180px]">
        <h5 className="font-bold mb-3 text-gray-800 dark:text-white flex items-center gap-2">
          <div className="w-1.5 h-4 bg-blue-500 rounded-full" />
          Chú thích trạng thái
        </h5>
        <div className="space-y-2.5">
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-red-500 shadow-sm shadow-red-200" />
            <span className="text-gray-600 dark:text-gray-300">Sự cố / Đột xuất</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-blue-500 shadow-sm shadow-blue-200" />
            <span className="text-gray-600 dark:text-gray-300">Theo kế hoạch</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-gray-500 shadow-sm shadow-gray-200" />
            <span className="text-gray-600 dark:text-gray-300">Chưa xác định</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MapView;
