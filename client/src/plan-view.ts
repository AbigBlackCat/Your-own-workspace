import type { PlanStatus } from '../../shared/api.interface';
import { planHistory, planStatus } from '../../shared/plan-utils';
import type { Entity } from './workspace-types';
import { addDays } from './workspace-utils';

export interface PlanOccurrence {
  item: Entity;
  date: string;
  title: string;
  time: string;
  minutes: number;
  priority: string;
  status: PlanStatus | 'moved';
  movedTo?: string;
}

export function plansForDate(items: Entity[], date: string): PlanOccurrence[] {
  return items.flatMap((item): PlanOccurrence[] => {
    if (item.plan_date === date) return [{ item, date, title: String(item.title), time: item.start_time || '',
      minutes: Number(item.estimated_minutes || 0), priority: item.priority || 'medium', status: planStatus(item) }];
    const history = planHistory(item).filter((entry) => entry.date === date).at(-1);
    return history ? [{ item, date, title: history.title, time: history.startTime,
      minutes: history.estimatedMinutes, priority: history.priority, status: 'moved', movedTo: history.movedTo }] : [];
  }).sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99') || a.title.localeCompare(b.title));
}

export function weekDates(date: string, start: unknown): string[] {
  const weekday = new Date(`${date}T12:00:00`).getDay();
  const offset = start === 'sunday' ? weekday : (weekday + 6) % 7;
  return Array.from({ length: 7 }, (_, index) => addDays(date, index - offset));
}

export function monthCells(month: string, start: unknown): Array<string | null> {
  const [year, value] = month.split('-').map(Number);
  const weekday = new Date(year, value - 1, 1).getDay();
  const offset = start === 'sunday' ? weekday : (weekday + 6) % 7;
  return [...Array<null>(offset).fill(null), ...Array.from({ length: new Date(year, value, 0).getDate() },
    (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)];
}

export function shiftPlanMonth(month: string, offset: number): string {
  const [year, value] = month.split('-').map(Number);
  const next = new Date(year, value - 1 + offset, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
}

export const planStatusLabels = { todo: '待办', doing: '进行中', done: '已完成', cancelled: '已取消', moved: '已改期' };

const sourceCollections: Record<string, string> = {
  media_content: 'mediaContents', dev_work_item: 'devWorkItems', consulting_deliverable: 'consultingDeliverables',
  consulting_followup: 'consultingFollowups', workout: 'workouts', meal: 'meals', reading_book: 'readingBooks',
};

export function recordRoute(module: string, collection: string, id: string, date?: string): string {
  if (collection === 'planItems') return `/today?${new URLSearchParams({ view: 'history', ...(date ? { date } : {}), record: id })}`;
  return `/${module === 'dashboard' ? '' : module}?${new URLSearchParams({ collection, record: id })}`;
}

export function planSourceRoute(item: Entity): string {
  const collection = sourceCollections[String(item.source_entity_type)];
  return collection ? recordRoute(item.source_module, collection, item.source_entity_id) : `/${item.source_module}`;
}
