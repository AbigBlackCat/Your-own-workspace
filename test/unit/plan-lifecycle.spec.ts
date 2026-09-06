import { planPatch, planHistory, planStatus, validPlanDate } from '../../shared/plan-utils';
import { plansForDate, weekDates, monthCells } from '../../client/src/plan-view';

const now = '2026-09-06T15:45:00.000Z';
const base = { id: 'plan-1', title: '完成方案', plan_date: '2026-09-01', status: 'todo', estimated_minutes: 30 };

describe('plan lifecycle and date history', () => {
  it('retains original schedule when moving an old plan to today', () => {
    const moved = { ...base, ...planPatch(base, { plan_date: '2026-09-06' }, now) };
    expect(moved.plan_date).toBe('2026-09-06');
    expect(planHistory(moved)).toHaveLength(1);
    expect(plansForDate([moved], '2026-09-01')[0]).toMatchObject({ status: 'moved', title: '完成方案', movedTo: '2026-09-06' });
    expect(plansForDate([moved], '2026-09-06')).toHaveLength(1);
    expect(plansForDate([moved], '2026-09-02')).toHaveLength(0);
  });
  it('keeps one active occurrence when rescheduled more than once or returned to the original day', () => {
    let plan: Record<string, unknown> & { id: string } = { ...base };
    for (const date of ['2026-09-06', '2026-09-08', '2026-09-01']) {
      plan = { ...plan, ...planPatch(plan, { plan_date: date }, now) };
    }
    expect(planHistory(plan)).toHaveLength(3);
    expect(plansForDate([plan], '2026-09-01')).toHaveLength(1);
    expect(plansForDate([plan], '2026-09-01')[0].status).toBe('todo');
    expect(plansForDate([plan], '2026-09-06')[0].status).toBe('moved');
  });
  it('does not inflate original completion percentage after postponement', () => {
    const done = { ...base, id: 'done', status: 'done' };
    const moved = { ...base, ...planPatch(base, { plan_date: '2026-09-06', title: '新的标题' }, now) };
    const original = plansForDate([done, moved], '2026-09-01');
    expect(original).toHaveLength(2);
    expect(original.filter((entry) => entry.status === 'done')).toHaveLength(1);
    expect(original.find((entry) => entry.status === 'moved')?.title).toBe('完成方案');
  });
  it('makes completing and reopening consistent and refuses silently moving a completed plan', () => {
    const completed = { ...base, ...planPatch(base, { status: 'done' }, now) };
    expect(completed.completed_at).toBe(now);
    expect(planPatch(completed, { status: 'todo' }, now).completed_at).toBeNull();
    expect(planPatch(completed, { status: 'cancelled' }, now).completed_at).toBeNull();
    expect(() => planPatch(completed, { plan_date: '2026-09-08' }, now)).toThrow('恢复');
    expect(planPatch(completed, { notes: '备注' }, '2026-09-07T00:00:00Z').completed_at).toBe(now);
  });
  it('rejects impossible dates, invalid status and negative durations', () => {
    expect(validPlanDate('2026-02-30')).toBe(false);
    expect(validPlanDate('2024-02-29')).toBe(true);
    expect(() => planPatch(base, { estimated_minutes: -10 }, now)).toThrow('时长');
    expect(() => planPatch(base, { status: 'invalid' }, now)).toThrow('状态');
    expect(() => planPatch(base, { start_time: '25:60' }, now)).toThrow('时间');
    expect(planStatus({})).toBe('todo');
  });
  it('respects natural week start and month boundaries', () => {
    expect(weekDates('2026-09-06', 'monday')).toEqual([
      '2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06',
    ]);
    expect(weekDates('2026-09-06', 'sunday')[0]).toBe('2026-09-06');
    expect(monthCells('2024-02', 'monday').filter(Boolean)).toHaveLength(29);
    expect(monthCells('2026-09', 'monday')[0]).toBeNull();
  });
  it('does not bring future completed and cancelled plans into an earlier day', () => {
    expect(plansForDate([{ ...base, plan_date: '2026-09-10', status: 'cancelled' }], '2026-09-06')).toEqual([]);
  });
});
