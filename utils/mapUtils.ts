
export interface Coordinate {
  lat: number;
  lng: number;
}

export const TEAM_COORDINATES: Record<string, Coordinate> = {
  // Vĩnh Long (PB10)
  "PB1001": { lat: 10.2524, lng: 105.9722 }, // Long Châu
  "PB1002": { lat: 10.0231, lng: 105.9123 }, // Trà Ôn
  "PB1003": { lat: 10.0834, lng: 105.9543 }, // Tam Bình
  "PB1004": { lat: 10.1234, lng: 105.8543 }, // Cái Vồn (Bình Minh)
  "PB1005": { lat: 10.1834, lng: 106.0543 }, // Trung Thành (Vũng Liêm)
  "PB1006": { lat: 10.2234, lng: 106.0043 }, // Long Hồ
  "PB1007": { lat: 10.2034, lng: 105.9243 }, // Cái Nhum (Mang Thít)
  "PB1008": { lat: 10.1534, lng: 105.8043 }, // Tân Quới (Bình Tân)
  
  // Bến Tre (PB09) - Though listed under PB10 in constants.ts for some reason
  "PB0901": { lat: 10.2431, lng: 106.3758 }, // Bến Tre
  "PB0902": { lat: 10.0431, lng: 106.5758 }, // Ba Tri
  "PB0903": { lat: 10.1431, lng: 106.3258 }, // Mỏ Cày
  "PB0904": { lat: 10.2931, lng: 106.5758 }, // Bình Đại
  "PB0905": { lat: 9.9431, lng: 106.5258 },  // Thạnh Phú
  "PB0906": { lat: 10.3431, lng: 106.2758 }, // Phú Túc (Châu Thành)
  "PB0907": { lat: 10.1931, lng: 106.4758 }, // Giồng Trôm
  "PB0908": { lat: 10.2431, lng: 106.1258 }, // Chợ Lách
  "PB0909": { lat: 10.0931, lng: 106.2258 }, // Phước Mỹ Trung (Mỏ Cày Bắc)

  // Trà Vinh (PB16)
  "PB1601": { lat: 9.9333, lng: 106.3333 }, // Trà Vinh
  "PB1602": { lat: 9.8333, lng: 106.4833 }, // Cầu Ngang
  "PB1603": { lat: 9.9833, lng: 106.1333 }, // Cầu Kè
  "PB1604": { lat: 9.6833, lng: 106.2333 }, // Trà Cú
  "PB1605": { lat: 9.8833, lng: 106.1833 }, // Tiểu Cần
  "PB1606": { lat: 9.6333, lng: 106.4333 }, // Duyên Hải
  "PB1607": { lat: 10.1333, lng: 106.2333 }, // Càng Long
  "PB1608": { lat: 9.9333, lng: 106.4333 }, // Châu Thành
  "PB1609": { lat: 9.7333, lng: 106.3833 }, // Ngũ Lạc

  // Đồng Nai (PB01)
  "PB0101": { lat: 11.5333, lng: 106.8833 }, // Đồng Xoài (Actually in Bình Phước but listed here)
  "PK0100": { lat: 10.9500, lng: 106.8167 }, // Trấn Biên
  "PK0400": { lat: 10.9333, lng: 107.2333 }, // Long Khánh
  "PK0700": { lat: 10.7833, lng: 106.9500 }, // Long Thành
  "PK0800": { lat: 10.6833, lng: 106.8833 }, // Nhơn Trạch
  "PK1000": { lat: 10.9500, lng: 107.0167 }, // Trảng Bom

  // Lâm Đồng (PB03)
  "PB0301": { lat: 11.9465, lng: 108.4419 }, // Đà Lạt
  "PB0302": { lat: 11.5461, lng: 107.8025 }, // Bảo Lộc
  "PB0305": { lat: 11.7167, lng: 108.3667 }, // Đức Trọng
  "PB0304": { lat: 11.5833, lng: 108.1167 }, // Di Linh

  // Tây Ninh (PB05)
  "PB0501": { lat: 11.3121, lng: 106.1015 }, // Tân Ninh
  "PB0502": { lat: 11.1000, lng: 106.2667 }, // Gò Dầu
  "PB0503": { lat: 11.0333, lng: 106.3667 }, // Trảng Bàng

  // Đồng Tháp (PB07)
  "PB0701": { lat: 10.4566, lng: 105.6375 }, // Cao Lãnh
  "PB0702": { lat: 10.2917, lng: 105.7583 }, // Sa Đéc
  "PB0711": { lat: 10.6667, lng: 105.4833 }, // Tam Nông

  // Cần Thơ (PB11)
  "PB1101": { lat: 10.0333, lng: 105.7833 }, // Ninh Kiều
  "PB1102": { lat: 10.0000, lng: 105.8167 }, // Cái Răng
  "PB1103": { lat: 10.1167, lng: 105.6333 }, // Ô Môn

  // An Giang (PB12)
  "PB1201": { lat: 10.3759, lng: 105.4319 }, // Long Xuyên
  "PB1204": { lat: 10.7000, lng: 105.1167 }, // Châu Đốc
  "PB1203": { lat: 10.4667, lng: 105.5000 }, // Chợ Mới

  // Cà Mau (PB14)
  "PB1401": { lat: 9.1769, lng: 105.1501 },  // Tân Thành (Cà Mau city area)
  "PB1402": { lat: 9.0167, lng: 104.9667 },  // Cái Nước
  "PB1404": { lat: 9.1167, lng: 104.8333 },  // Trần Văn Thời

  // Bạc Liêu (PB19)
  "PB1901": { lat: 9.2942, lng: 105.7274 }, // Bạc Liêu city
  "PB1902": { lat: 9.2333, lng: 105.5000 }, // Giá Rai

  // Sóc Trăng (PB17)
  "PB1701": { lat: 9.6000, lng: 105.9667 }, // Sóc Trăng city
  "PB1709": { lat: 9.4500, lng: 105.8167 }, // Ngã Năm

  // Hậu Giang (PB20)
  "PB2001": { lat: 9.7833, lng: 105.4667 }, // Vị Thanh city
  "PB2003": { lat: 9.8333, lng: 105.8167 }, // Ngã Bảy

  // Kiên Giang (PB13)
  "PB1301": { lat: 10.0125, lng: 105.0808 }, // Rạch Giá city
  "PB1304": { lat: 10.3833, lng: 104.4833 }, // Hà Tiên
  "PB1307": { lat: 10.2167, lng: 103.9667 }, // Phú Quốc

  // Long An (PB06)
  "PB0601": { lat: 10.5333, lng: 106.4000 }, // Tân An city
  "PB0603": { lat: 10.9000, lng: 106.5000 }, // Đức Hòa

  // Tiền Giang (PB08)
  "PB0801": { lat: 10.3500, lng: 106.3500 }, // Mỹ Tho city
  "PB0805": { lat: 10.4667, lng: 106.1167 }, // Cai Lậy

  // Quảng Trị (PC02)
  "PC02AA": { lat: 16.8167, lng: 107.1000 }, // Đông Hà
  "PC02BB": { lat: 16.7406, lng: 107.1855 }, // Quảng Trị city

  // Thừa Thiên Huế (PC03)
  "PC03AA": { lat: 16.4637, lng: 107.5905 }, // Huế city area
  "PC03EE": { lat: 16.5833, lng: 107.4167 }, // Phong Điền

  // Đà Nẵng (PP)
  "PPAA": { lat: 16.0544, lng: 108.2022 }, // Đà Nẵng city area
  "PPGG": { lat: 15.9500, lng: 108.1167 }, // Hòa Vang

  // Quảng Ngãi (PC06)
  "PC06AA": { lat: 15.1205, lng: 108.8049 }, // Quảng Ngãi city
  "PC06LL": { lat: 15.3833, lng: 109.1167 }, // Lý Sơn

  // Gia Lai (PC10)
  "PC10AA": { lat: 13.9833, lng: 108.0000 }, // Pleiku
  "PC10GG": { lat: 14.1500, lng: 108.6667 }, // An Khê

  // Đắk Lắk (PC12)
  "PC12AA": { lat: 12.6667, lng: 108.0500 }, // Buôn Ma Thuột
  "PC12LL": { lat: 12.4167, lng: 108.1833 }, // Lắk
  
  // Đắk Nông (PC13)
  "PC13FF": { lat: 12.0000, lng: 107.6833 }, // Gia Nghĩa
  "PC13CC": { lat: 12.5833, lng: 107.8333 }, // Cư Jút
  "PC13DD": { lat: 12.4167, lng: 107.6667 }, // Đắk Mil
  "PC13BB": { lat: 12.2500, lng: 107.4167 }, // Đắk R'Lấp

  // Khánh Hòa (PQ)
  "PQAA": { lat: 12.2451, lng: 109.1943 }, // Nha Trang
  "PQBB": { lat: 11.9167, lng: 109.1500 }, // Cam Ranh

  // NPC Companies
  "PA02": { lat: 21.3222, lng: 105.2283 }, // Phú Thọ
  "PA03": { lat: 20.9500, lng: 107.0833 }, // Quảng Ninh
  "PA04": { lat: 21.5928, lng: 105.8442 }, // Thái Nguyên
  "PA05": { lat: 21.2731, lng: 106.1947 }, // Bắc Giang
  "PA07": { lat: 19.8075, lng: 105.7764 }, // Thanh Hóa
  "PA11": { lat: 21.8500, lng: 106.7500 }, // Lạng Sơn
  "PA12": { lat: 21.8167, lng: 105.2167 }, // Tuyên Quang
  "PA13": { lat: 18.6667, lng: 105.6667 }, // Nghệ An
  "PA14": { lat: 22.6667, lng: 106.2500 }, // Cao Bằng
  "PA15": { lat: 21.3333, lng: 103.9167 }, // Sơn La
  "PA16": { lat: 18.3333, lng: 105.9000 }, // Hà Tĩnh
  "PA18": { lat: 22.4833, lng: 103.9667 }, // Lào Cai
  "PA19": { lat: 21.3833, lng: 103.0167 }, // Điện Biên
  "PA22": { lat: 21.1833, lng: 106.0667 }, // Bắc Ninh
  "PA23": { lat: 20.6500, lng: 106.0500 }, // Hưng Yên
  "PA29": { lat: 22.4000, lng: 103.4500 }, // Lai Châu
  "PH": { lat: 20.8475, lng: 106.6811 }, // Hải Phòng
  "PN": { lat: 20.2500, lng: 105.9667 }, // Ninh Bình
};

export const COMPANY_COORDINATES: Record<string, Coordinate> = {
  "PB10": { lat: 10.2524, lng: 105.9722 }, // Vĩnh Long
  "PB01": { lat: 10.9482, lng: 106.8125 }, // Đồng Nai
  "PB03": { lat: 11.9465, lng: 108.4419 }, // Lâm Đồng
  "PB05": { lat: 11.3121, lng: 106.1015 }, // Tây Ninh
  "PB07": { lat: 10.4566, lng: 105.6375 }, // Đồng Tháp
  "PB11": { lat: 10.0333, lng: 105.7833 }, // Cần Thơ
  "PB12": { lat: 10.3759, lng: 105.4319 }, // An Giang
  "PB14": { lat: 9.1769, lng: 105.1501 },  // Cà Mau
  "PC02": { lat: 16.7406, lng: 107.1855 }, // Quảng Trị
  "PC03": { lat: 16.4637, lng: 107.5905 }, // Huế
  "PP":   { lat: 16.0544, lng: 108.2022 }, // Đà Nẵng
  "PC06": { lat: 15.1205, lng: 108.8049 }, // Quảng Ngãi
  "PC10": { lat: 13.9833, lng: 108.0000 }, // Gia Lai
  "PC12": { lat: 12.6667, lng: 108.0500 }, // Đắk Lắk
  "PC13": { lat: 12.0000, lng: 107.6833 }, // Đắk Nông
  "PQ":   { lat: 12.2451, lng: 109.1943 }, // Khánh Hòa
  "PA02": { lat: 21.3222, lng: 105.2283 }, // Phú Thọ
  "PA03": { lat: 20.9500, lng: 107.0833 }, // Quảng Ninh
  "PA04": { lat: 21.5928, lng: 105.8442 }, // Thái Nguyên
  "PA05": { lat: 21.2731, lng: 106.1947 }, // Bắc Giang
  "PA07": { lat: 19.8075, lng: 105.7764 }, // Thanh Hóa
  "PA11": { lat: 21.8500, lng: 106.7500 }, // Lạng Sơn
  "PA12": { lat: 21.8167, lng: 105.2167 }, // Tuyên Quang
  "PA13": { lat: 18.6667, lng: 105.6667 }, // Nghệ An
  "PA14": { lat: 22.6667, lng: 106.2500 }, // Cao Bằng
  "PA15": { lat: 21.3333, lng: 103.9167 }, // Sơn La
  "PA16": { lat: 18.3333, lng: 105.9000 }, // Hà Tĩnh
  "PA18": { lat: 22.4833, lng: 103.9667 }, // Lào Cai
  "PA19": { lat: 21.3833, lng: 103.0167 }, // Điện Biên
  "PA22": { lat: 21.1833, lng: 106.0667 }, // Bắc Ninh
  "PA23": { lat: 20.6500, lng: 106.0500 }, // Hưng Yên
  "PA29": { lat: 22.4000, lng: 103.4500 }, // Lai Châu
  "PH": { lat: 20.8475, lng: 106.6811 }, // Hải Phòng
  "PN": { lat: 20.2500, lng: 105.9667 }, // Ninh Bình
};

export const getOutageStatus = (reason: string): 'planned' | 'emergency' | 'other' => {
  const r = reason.toLowerCase();
  if (r.includes('đột xuất') || r.includes('sự cố') || r.includes('khẩn cấp')) return 'emergency';
  if (r.includes('kế hoạch') || r.includes('bảo trì') || r.includes('sửa chữa') || r.includes('nâng cấp')) return 'planned';
  return 'other';
};

export const getStatusColor = (status: 'planned' | 'emergency' | 'other'): string => {
  switch (status) {
    case 'emergency': return '#ef4444'; // red-500
    case 'planned': return '#3b82f6';   // blue-500
    default: return '#6b7280';         // gray-500
  }
};
