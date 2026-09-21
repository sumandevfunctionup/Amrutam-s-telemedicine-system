/**
 * Format a Date object, ISO string, or timestamp into UTC 'yyyy-mm-dd hh:mm:ss'
 * @param {Date|string|number} [date=new Date()]
 * @returns {string} Formatted UTC date-time string
 */
export function formatUtcDateTime(date = new Date()) {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) {
    return null;
  }

  const pad = (n) => String(n).padStart(2, '0');
  const year = d.getUTCFullYear();
  const month = pad(d.getUTCMonth() + 1);
  const day = pad(d.getUTCDate());
  const hours = pad(d.getUTCHours());
  const minutes = pad(d.getUTCMinutes());
  const seconds = pad(d.getUTCSeconds());

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Returns current UTC time formatted as 'yyyy-mm-dd hh:mm:ss'
 * @returns {string}
 */
export function getCurrentUtcDateTime() {
  return formatUtcDateTime(new Date());
}

export const getUTCDateTime = getCurrentUtcDateTime;

/**
 * Automatically format all Date instances and recognized timestamp keys
 * in an object/array to UTC 'yyyy-mm-dd hh:mm:ss'
 * @param {any} obj
 * @returns {any}
 */
export function formatDatesInObject(obj) {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  if (obj instanceof Date) {
    return formatUtcDateTime(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(formatDatesInObject);
  }

  const dateKeys = [
    'created_at',
    'updated_at',
    'issued_at',
    'start_time',
    'end_time',
    'timestamp',
    'serverTime',
    'expires_at',
    'date_time',
  ];

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value instanceof Date) {
      result[key] = formatUtcDateTime(value);
    } else if (
      dateKeys.includes(key) &&
      typeof value === 'string' &&
      (value.includes('T') || value.includes('Z'))
    ) {
      result[key] = formatUtcDateTime(value);
    } else if (value && typeof value === 'object') {
      result[key] = formatDatesInObject(value);
    } else {
      result[key] = value;
    }
  }

  return result;
}

export const formatUtcDate = formatUtcDateTime;

