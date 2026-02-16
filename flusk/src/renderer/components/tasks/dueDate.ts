const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/;
const ISO_TIME_PATTERN = /T(\d{2}):(\d{2})(?:$|[:.Z+-])/;

type DateParts = {
  year: number;
  month: number;
  day: number;
};

const parseDateParts = (iso: string): DateParts | null => {
  const match = ISO_DATE_PATTERN.exec(iso);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  return { year, month, day };
};

const toLocalDate = ({ year, month, day }: DateParts): Date => {
  return new Date(year, month - 1, day);
};

const isSameDate = (date: Date, { year, month, day }: DateParts): boolean => {
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
};

export const parseDueDate = (iso?: string | null): Date | undefined => {
  if (!iso) {
    return undefined;
  }

  const parts = parseDateParts(iso);
  if (!parts) {
    return undefined;
  }

  const date = toLocalDate(parts);
  if (!isSameDate(date, parts)) {
    return undefined;
  }

  return date;
};

export const parseDueTime = (iso?: string | null): string | null => {
  if (!iso) {
    return null;
  }

  const match = ISO_TIME_PATTERN.exec(iso);
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

export const formatDueDateDisplay = (iso: string): string => {
  const parts = parseDateParts(iso);
  if (!parts) {
    return iso;
  }

  const date = toLocalDate(parts);
  if (!isSameDate(date, parts)) {
    return iso;
  }

  const dateStr = `${String(parts.day).padStart(2, '0')}.${String(parts.month).padStart(2, '0')}.${String(parts.year % 100).padStart(2, '0')}`;
  const time = parseDueTime(iso);
  return time ? `${dateStr} ${time}` : dateStr;
};

export const toISODate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const toISODateTime = (date: Date, time?: string | null): string => {
  const dateStr = toISODate(date);
  if (!time) {
    return dateStr;
  }
  return `${dateStr}T${time}`;
};
