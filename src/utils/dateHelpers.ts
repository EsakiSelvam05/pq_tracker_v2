export const formatDate = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

export const isDelayed = (createdAt: string | number, status: string | null): boolean => {
  if (status !== 'Pending') return false;
  const now = Date.now();
  const createdTime = typeof createdAt === 'string' ? new Date(createdAt).getTime() : createdAt;
  const hoursElapsed = (now - createdTime) / (1000 * 60 * 60);
  return hoursElapsed > 48;
};

export const getHoursElapsed = (createdAt: string | number): number => {
  const now = Date.now();
  const createdTime = typeof createdAt === 'string' ? new Date(createdAt).getTime() : createdAt;
  return Math.floor((now - createdTime) / (1000 * 60 * 60));
};