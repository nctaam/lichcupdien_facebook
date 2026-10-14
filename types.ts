
export interface ScheduleItem {
  ID: string;
  MA_DVIQLY: string;
  TEN_DVIQLY: string;
  TEN_KHU_VUC: string;
  THOI_GIAN_NGUNG: string;
  THOI_GIAN_CO_DIEN_LAI: string;
  LY_DO: string;
  _DATE_STR?: string; // Optional field for range caching
}

export interface EvnApiResponse {
  data: ScheduleItem[];
  success: boolean;
  message: string;
}

export interface PowerTeam {
  [code: string]: string;
}

export interface PowerCompany {
  name: string;
  teams: PowerTeam;
}

export interface PowerCompanyData {
  [code: string]: PowerCompany;
}
