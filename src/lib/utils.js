export const money = (value = 0) => `$${Number(value || 0).toFixed(2)}`;

export const formatDate = (dateValue) => {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false
  });
};

export const idCode = (prefix) => `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

export const getRangeStart = (filter = 'day') => {
  const now = new Date();
  const start = new Date(now);
  if (filter === 'day') start.setHours(0, 0, 0, 0);
  if (filter === 'week') start.setDate(now.getDate() - 7);
  if (filter === 'month') start.setMonth(now.getMonth() - 1);
  if (filter === 'year') start.setFullYear(now.getFullYear() - 1);
  return start.toISOString();
};

export const chartKey = (dateValue, filter) => {
  const d = new Date(dateValue);
  if (filter === 'year') return d.toLocaleString('en', { month: 'short' });
  if (filter === 'month') return String(d.getDate()).padStart(2, '0');
  return `${String(d.getHours()).padStart(2, '0')}:00`;
};
