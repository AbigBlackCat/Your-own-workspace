import type { PlanScheduleSnapshot, PlanStatus } from './api.interface';

export function validPlanDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

export function planStatus(item: Record<string, unknown>): PlanStatus {
  return ['todo', 'doing', 'done', 'cancelled'].includes(String(item.status))
    ? item.status as PlanStatus : 'todo';
}

export function planHistory(item: Record<string, unknown>): PlanScheduleSnapshot[] {
  if (!Array.isArray(item.schedule_history)) return [];
  return item.schedule_history.filter((entry): entry is PlanScheduleSnapshot =>
    entry && validPlanDate(entry.date) && validPlanDate(entry.movedTo) && typeof entry.title === 'string');
}

export function isUnfinished(item: Record<string, unknown>): boolean {
  return ['todo', 'doing'].includes(planStatus(item));
}

export function planPatch(
  item: Record<string, unknown>, input: Record<string, unknown>, now: string,
): Record<string, unknown> {
  const next = { ...input };
  const date = next.plan_date ?? item.plan_date;
  if (!validPlanDate(date)) throw new Error('请选择有效的计划日期');
  if (next.title !== undefined && !String(next.title).trim()) throw new Error('请填写事项名称');
  if (next.start_time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(next.start_time))) {
    throw new Error('请选择有效的开始时间');
  }
  if (next.estimated_minutes !== undefined && next.estimated_minutes !== null) {
    const minutes = Number(next.estimated_minutes);
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 1440) {
      throw new Error('预计时长需在0至1440分钟之间');
    }
  }
  if (next.status !== undefined && !['todo', 'doing', 'done', 'cancelled'].includes(String(next.status))) {
    throw new Error('计划状态无效');
  }
  if (item.plan_date && date !== item.plan_date) {
    if (!isUnfinished(item)) throw new Error('请先恢复为未完成，再调整日期');
    const snapshot: PlanScheduleSnapshot = {
      date: String(item.plan_date), title: String(item.title), startTime: String(item.start_time ?? ''),
      estimatedMinutes: Number(item.estimated_minutes ?? 0), priority: String(item.priority ?? 'medium'),
      movedTo: date, changedAt: now,
    };
    next.schedule_history = [...planHistory(item), snapshot];
    next.status = 'todo';
  }
  const status = next.status ?? planStatus(item);
  next.status = status;
  next.completed_at = status === 'done'
    ? (planStatus(item) === 'done' ? item.completed_at || now : now) : null;
  return next;
}
