
/**
 * Converts a Date object to a string in "yyyy-MM-dd" format.
 * @param date The date to format.
 * @returns The formatted date string.
 */
export const toYyyyMmDd = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Calculates start and end date strings based on a preset filter.
 * @param filter The date filter preset ('today', 'tomorrow', 'this_week', 'this_month').
 * @returns An object containing the startDate and endDate strings.
 */
export const getDatePresetsForFilter = (filter: 'today' | 'tomorrow' | 'this_week' | 'this_month'): { startDate: string; endDate: string } => {
  const todayDateObj = new Date();
  todayDateObj.setHours(0, 0, 0, 0); // Use for comparison to ignore time

  let startDate: Date;
  let endDate: Date;

  switch (filter) {
    case 'today':
      startDate = new Date(todayDateObj);
      endDate = new Date(todayDateObj);
      break;
    case 'tomorrow':
      startDate = new Date(todayDateObj);
      startDate.setDate(startDate.getDate() + 1);
      endDate = new Date(startDate);
      break;
    case 'this_week': {
      // Monday of the current week
      const dayOfWeek = todayDateObj.getDay(); // 0=Sun, 1=Mon
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const mondayOfWeek = new Date(todayDateObj);
      mondayOfWeek.setDate(todayDateObj.getDate() + diffToMonday);

      // If Monday is in the past, start the week from today
      startDate = mondayOfWeek < todayDateObj ? new Date(todayDateObj) : mondayOfWeek;
      
      // Sunday of the current week
      endDate = new Date(mondayOfWeek);
      endDate.setDate(mondayOfWeek.getDate() + 6);
      break;
    }
    case 'this_month': {
      // First day of the current month
      const firstDayOfMonth = new Date(todayDateObj.getFullYear(), todayDateObj.getMonth(), 1);

      // If the 1st of the month is in the past, start from today
      startDate = firstDayOfMonth < todayDateObj ? new Date(todayDateObj) : firstDayOfMonth;

      // Last day of the current month
      endDate = new Date(todayDateObj.getFullYear(), todayDateObj.getMonth() + 1, 0);
      break;
    }
  }

  return {
    startDate: toYyyyMmDd(startDate),
    endDate: toYyyyMmDd(endDate),
  };
};

/**
 * Generates an array of date strings ("yyyy-MM-dd") between a start and end date.
 * @param startDateStr The start date in "yyyy-MM-dd" format.
 * @param endDateStr The end date in "yyyy-MM-dd" format.
 * @returns An array of date strings.
 */
export const getDatesInRange = (startDateStr: string, endDateStr: string): string[] => {
  const dates: string[] = [];
  let currentDate = new Date(`${startDateStr}T00:00:00`);
  const endDate = new Date(`${endDateStr}T00:00:00`);

  while (currentDate <= endDate) {
    dates.push(toYyyyMmDd(currentDate));
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return dates;
};
