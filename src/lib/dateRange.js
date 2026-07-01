function parseDateInputParts(dateString) {
  const [year, month, day] = String(dateString || '').split('-').map(Number);
  if (!year || !month || !day) return null;
  return { year, month, day };
}

export function getLocalDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function localDateInputToIso(dateString, { endOfDay = false } = {}) {
  const parts = parseDateInputParts(dateString);
  if (!parts) return null;

  const hours = endOfDay ? 23 : 0;
  const minutes = endOfDay ? 59 : 0;
  const seconds = endOfDay ? 59 : 0;
  const milliseconds = endOfDay ? 999 : 0;

  return new Date(
    parts.year,
    parts.month - 1,
    parts.day,
    hours,
    minutes,
    seconds,
    milliseconds
  ).toISOString();
}

export function formatStoredDateForPtBr(value) {
  if (!value) return '';

  const raw = String(value);
  const datePart = raw.slice(0, 10);
  const parts = parseDateInputParts(datePart);
  if (parts) {
    return `${String(parts.day).padStart(2, '0')}/${String(parts.month).padStart(2, '0')}/${parts.year}`;
  }

  return new Date(value).toLocaleDateString('pt-BR');
}
