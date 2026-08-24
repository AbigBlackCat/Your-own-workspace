const MINUTES_PER_DAY = 24 * 60;
const DAY_MS = 24 * 60 * 60 * 1000;

const lifeStart = { year: 2001, month: 0, day: 5 };
const lifeEnd = { year: 2121, month: 0, day: 5 };

export type ProgressSnapshot = {
  life: { elapsedDays: number; totalDays: number; percent: number };
  today: { elapsedMinutes: number; percent: number };
};

export function getTimeProgress(now: Date): ProgressSnapshot {
  const totalDays = calendarDay(lifeEnd.year, lifeEnd.month, lifeEnd.day) - calendarDay(lifeStart.year, lifeStart.month, lifeStart.day);
  const elapsedDays = clamp(calendarDay(now.getFullYear(), now.getMonth(), now.getDate()) - calendarDay(lifeStart.year, lifeStart.month, lifeStart.day), 0, totalDays);
  const elapsedMinutes = now.getHours() * 60 + now.getMinutes();
  return {
    life: { elapsedDays, totalDays, percent: (elapsedDays / totalDays) * 100 },
    today: { elapsedMinutes, percent: (elapsedMinutes / MINUTES_PER_DAY) * 100 },
  };
}

export const minutesPerDay = MINUTES_PER_DAY;

function calendarDay(year: number, month: number, day: number): number {
  return Date.UTC(year, month, day) / DAY_MS;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
