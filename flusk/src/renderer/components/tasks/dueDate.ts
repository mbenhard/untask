const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/;

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

export const formatDueDateDisplay = (iso: string): string => {
  const parts = parseDateParts(iso);
  if (!parts) {
    return iso;
  }

  const date = toLocalDate(parts);
  if (!isSameDate(date, parts)) {
    return iso;
  }

  return `${String(parts.day).padStart(2, '0')}.${String(parts.month).padStart(2, '0')}.${String(parts.year % 100).padStart(2, '0')}`;
};

export const toISODate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
