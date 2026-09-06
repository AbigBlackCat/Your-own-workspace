import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarPlus, CaretLeft, CaretRight } from '../icons';
import { api } from '../api';
import { useWorkspace } from '../WorkspaceContext';
import { addDays, formatDate, formatDuration, localDate } from '../workspace-utils';
import { Button, EmptyState, EntityForm, ErrorState, Modal, PageHeader, Section, Skeleton,
  type FieldDefinition } from '../components/workspace-ui';
import { ModuleArtwork } from '../components/ModuleArtwork';
import { PlanList } from '../components/PlanList';
import { PlanReview } from '../components/PlanReview';
import { monthCells, plansForDate, shiftPlanMonth, weekDates, type PlanOccurrence } from '../plan-view';
import { isUnfinished, validPlanDate } from '../../../shared/plan-utils';
import type { PlanStatus } from '../../../shared/api.interface';
import type { Entity } from '../workspace-types';
import './today-plan.css';

const fields: FieldDefinition[] = [
  { name: 'title', label: '事项名称', required: true, placeholder: '例如：完成咨询方案' },
  { name: 'plan_date', label: '日期', type: 'date', required: true },
  { name: 'start_time', label: '开始时间', type: 'time' },
  { name: 'estimated_minutes', label: '预计分钟', type: 'number', min: 0, max: 1440 },
  { name: 'priority', label: '优先级', type: 'select', required: true, options: [
    { value: 'low', label: '低' }, { value: 'medium', label: '普通' }, { value: 'high', label: '高' },
  ] },
  { name: 'notes', label: '备注', type: 'textarea', placeholder: '补充执行说明' },
];

type PlanView = 'today' | 'week' | 'history';

export function TodayPage() {
  const { data, loading, error: loadError, refresh, run } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const [today, setToday] = useState(localDate);
  const dateParam = params.get('date');
  const selectedDate = validPlanDate(dateParam) ? dateParam : today;
  const rawView = params.get('view');
  const view: PlanView = rawView === 'week' || rawView === 'history' ? rawView : 'today';
  const month = selectedDate.slice(0, 7);
  const [editing, setEditing] = useState<Entity | null>(null);
  const [moveEntries, setMoveEntries] = useState<PlanOccurrence[]>([]);
  const [moveDate, setMoveDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [undo, setUndo] = useState<{ id: string; status: PlanStatus } | null>(null);
  const [filter, setFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const newOpen = params.get('new') === '1';

  useEffect(() => {
    const update = () => setToday(localDate());
    const timer = window.setInterval(update, 30_000);
    document.addEventListener('visibilitychange', update);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', update); };
  }, []);

  const changeLocation = (date: string, nextView: PlanView = view) => {
    if (!validPlanDate(date)) return;
    const next = new URLSearchParams(params);
    next.set('date', date); next.set('view', nextView); next.delete('record'); next.delete('new');
    setParams(next); setFilter('all');
  };
  const openForm = (item?: Entity) => {
    setEditing(item ?? null);
    if (!item) { const next = new URLSearchParams(params); next.set('new', '1'); setParams(next); }
  };
  const closeForm = () => {
    setEditing(null);
    const next = new URLSearchParams(params); next.delete('new'); setParams(next, { replace: true });
  };
  const daily = useMemo(() => plansForDate(data.planItems, selectedDate), [data.planItems, selectedDate]);
  const overdue = useMemo(() => data.planItems.filter((item) => item.plan_date < today && isUnfinished(item))
    .flatMap((item) => plansForDate([item], item.plan_date))
    .sort((a, b) => a.date.localeCompare(b.date)), [data.planItems, today]);
  const dates = view === 'week' ? weekDates(selectedDate, data.settings.weekStart) : [selectedDate];
  const period = view === 'week' ? dates.flatMap((date) => plansForDate(data.planItems, date)) : daily;
  const selectedOverdue = overdue.filter((entry) => selectedIds.includes(entry.item.id));
  const currentRecord = params.get('record');
  useEffect(() => {
    if (currentRecord && !loading) document.getElementById(`plan-${currentRecord}-${selectedDate}`)?.scrollIntoView({ block: 'center' });
  }, [currentRecord, loading, selectedDate, view]);

  async function perform(operation: () => Promise<unknown>, message: string): Promise<boolean> {
    if (lock.current) return false;
    lock.current = true; setBusy(true); setError(''); setNotice(''); setUndo(null);
    try { await run(operation); setNotice(message); return true; }
    catch (failure) { setError(failure instanceof Error ? failure.message : '操作未完成，请重试'); return false; }
    finally { lock.current = false; setBusy(false); }
  }
  async function setStatus(entry: PlanOccurrence, status: PlanStatus) {
    if (entry.status === 'moved') return;
    const ok = await perform(() => api.update('planItems', entry.item.id, { status }),
      status === 'done' ? '事项已完成' : status === 'cancelled' ? '计划已取消，历史记录保留' : '计划状态已更新');
    if (ok) setUndo({ id: entry.item.id, status: entry.status });
  }
  async function move(entries: PlanOccurrence[], date: string) {
    if (!validPlanDate(date) || date < today) { setError('请选择今天或之后的日期'); return; }
    const pending = entries.filter((entry) => isUnfinished(entry.item) && entry.item.plan_date !== date);
    if (!pending.length) { setMoveEntries([]); return; }
    const ok = await perform(async () => {
      // Sequential writes retain a useful failure boundary; successful moves disappear from the overdue group.
      for (const entry of pending) await api.postponePlan(entry.item.id, date);
    }, `已将${pending.length}项安排到${formatDate(date)}，原日期保留改期记录`);
    if (ok) { setMoveEntries([]); setSelectedIds([]); }
    else await refresh().catch(() => undefined);
  }
  const listProps = {
    today, tomorrow: addDays(today, 1), busy, focusedId: currentRecord,
    onStatus: (entry: PlanOccurrence, status: PlanStatus) => { void setStatus(entry, status); },
    onMove: (entry: PlanOccurrence, date?: string) => {
      if (date) void move([entry], date);
      else { setMoveDate(today); setMoveEntries([entry]); }
    },
    onEdit: (entry: PlanOccurrence) => openForm(entry.item),
    onDelete: (entry: PlanOccurrence) => { void perform(() => api.remove('planItems', entry.item.id), '已移到回收站，可在设置中恢复'); },
    onDate: (date: string) => changeLocation(date, 'history'),
  };
  const filtered = (entries: PlanOccurrence[]) => entries.filter((entry) =>
    filter === 'all' || (filter === 'unfinished' ? ['todo', 'doing'].includes(entry.status) : entry.status === filter));

  return <div className="today-page-v2">
    <PageHeader icon={<ModuleArtwork module="today" />} title="今日计划"
      description="安排当下，接续未完成的事，也保留每一天的记录。"
      actions={<Button onClick={() => openForm()} disabled={loading || Boolean(loadError)}><CalendarPlus size={18} />添加事项</Button>} />
    <div className="plan-toolbar-v2">
      <div className="segmented" role="group" aria-label="计划视图">
        {(['today', 'week', 'history'] as const).map((key) => <button key={key} aria-pressed={view === key}
          className={view === key ? 'active' : ''} onClick={() => changeLocation(key === 'today' ? today : selectedDate, key)}>
          {key === 'today' ? '今日' : key === 'week' ? '本周' : '历史'}</button>)}
      </div>
      <label className="date-control"><span>查看日期</span><input type="date" value={selectedDate}
        onChange={(event) => changeLocation(event.target.value)} /></label>
      {selectedDate !== today ? <Button size="sm" variant="ghost" onClick={() => changeLocation(today)}>回到今天</Button> : null}
    </div>
    {loading ? <Skeleton lines={6} /> : loadError ? <ErrorState message={loadError} onRetry={() => void refresh()} /> : <>
      <div className="plan-feedback-v2" aria-live="polite">
        {error ? <div role="alert" className="plan-error-v2">{error}。请重试，已保存的记录会保留。</div> : null}
        {notice ? <span>{notice}</span> : null}
        {undo ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => {
          const previous = undo; void perform(() => api.update('planItems', previous.id, { status: previous.status }), '已撤销状态修改');
        }}>撤销</Button> : null}
      </div>
      {view === 'today' && selectedDate === today && overdue.length > 0 ? <Section
        title={`此前未完成（${overdue.length}）`} description="保留原计划日，由你决定今天继续还是重新安排。" className="plan-overdue-v2">
        <details><summary>查看并处理此前事项</summary>
          <div className="plan-batch-v2"><label><input type="checkbox"
            checked={selectedOverdue.length === overdue.length} onChange={(event) => setSelectedIds(event.target.checked ? overdue.map((entry) => entry.item.id) : [])} />全选</label>
            <Button size="sm" variant="secondary" disabled={busy || !selectedOverdue.length}
              onClick={() => void move(selectedOverdue, today)}>选中项安排到今天</Button>
            <Button size="sm" variant="ghost" disabled={busy || !selectedOverdue.length}
              onClick={() => { setMoveDate(today); setMoveEntries(selectedOverdue); }}>批量改期</Button>
          </div>
          {overdue.map((entry) => <div key={entry.item.id} className="plan-select-row">
            <input type="checkbox" aria-label={`选择：${entry.title}`} checked={selectedIds.includes(entry.item.id)}
              onChange={(event) => setSelectedIds(event.target.checked ? [...selectedIds, entry.item.id] : selectedIds.filter((id) => id !== entry.item.id))} />
            <PlanList {...listProps} showDate entries={[entry]} />
          </div>)}
        </details>
      </Section> : null}
      <div className="plan-period-summary"><span>完成 <strong>{period.filter((entry) => entry.status === 'done').length}/{period.length}</strong></span>
        <span>已取消 {period.filter((entry) => entry.status === 'cancelled').length}</span>
        <span>已改期 {period.filter((entry) => entry.status === 'moved').length}</span>
        <span>预计 {formatDuration(period.filter((entry) => entry.status !== 'moved' && entry.status !== 'cancelled').reduce((total, entry) => total + entry.minutes, 0))}</span>
      </div>
      <div className={view === 'history' ? 'plan-calendar-layout' : ''}>
        {view === 'history' ? <Section title="计划日历" className="plan-calendar-section">
          <div className="plan-month-controls"><Button size="sm" variant="ghost" aria-label="上个月"
            onClick={() => changeLocation(`${shiftPlanMonth(month, -1)}-01`)}><CaretLeft size={18} /></Button>
            <label><span className="sr-only">选择月份</span><input type="month" value={month}
              onChange={(event) => changeLocation(`${event.target.value}-01`)} /></label>
            <Button size="sm" variant="ghost" aria-label="下个月"
              onClick={() => changeLocation(`${shiftPlanMonth(month, 1)}-01`)}><CaretRight size={18} /></Button>
          </div>
          <div className="plan-month-weekdays" aria-hidden>{(data.settings.weekStart === 'sunday'
            ? ['日', '一', '二', '三', '四', '五', '六'] : ['一', '二', '三', '四', '五', '六', '日']).map((day) => <span key={day}>{day}</span>)}</div>
          <div className="plan-month-days">{monthCells(month, data.settings.weekStart).map((date, index) => {
            if (!date) return <span key={`empty-${index}`} />;
            const entries = plansForDate(data.planItems, date);
            const done = entries.filter((entry) => entry.status === 'done').length;
            const unfinished = date < today ? entries.filter((entry) => ['todo', 'doing'].includes(entry.status)).length : 0;
            return <button key={date} type="button" aria-pressed={date === selectedDate}
              aria-current={date === today ? 'date' : undefined} onClick={() => changeLocation(date)}
              aria-label={`${date}${date === today ? '，今天' : ''}，${entries.length ? `完成${done}/${entries.length}项，${unfinished}项未完成` : '无计划'}`}>
              <span className="plan-day-number">{Number(date.slice(-2))}</span>
              <small>{entries.length ? `${done}/${entries.length}` : ''}</small>
              {unfinished ? <small className="plan-day-pending">待{unfinished}</small> : null}
            </button>;
          })}</div>
          <p className="plan-calendar-legend">完成数 / 当日安排数；“待”表示此前未完成。空白日期没有计划。</p>
        </Section> : null}
        <div className="plan-day-detail">
          <Section title={view === 'week' ? `${formatDate(dates[0])}至${formatDate(dates[6])}` : formatDate(selectedDate)}
            description={view === 'history' ? '原安排与改期记录均保留；完成时间显示在事项下方。' : '按开始时间排列，未设时间的事项在最后。'}
            action={<label className="plan-status-filter"><span className="sr-only">筛选计划状态</span><select value={filter} onChange={(event) => setFilter(event.target.value)}>
              <option value="all">全部状态</option><option value="unfinished">未完成</option><option value="done">已完成</option>
              <option value="moved">已改期</option><option value="cancelled">已取消</option>
            </select></label>}>
            {view === 'week' ? dates.map((date) => <div key={date} className="plan-week-day">
              <button className="text-button" onClick={() => changeLocation(date, 'history')}>{formatDate(date)}</button>
              {filtered(plansForDate(data.planItems, date)).length ? <PlanList {...listProps} entries={filtered(plansForDate(data.planItems, date))} />
                : <p className="quiet-line">{filter === 'all' ? '这一天没有计划' : '没有符合筛选的计划'}</p>}
            </div>) : filtered(daily).length ? <PlanList {...listProps} entries={filtered(daily)} />
              : <EmptyState title={daily.length ? '没有符合筛选的计划' : '这一天没有计划'}
                description={daily.length ? '切换为全部状态查看当天记录。' : '没有安排的日子，也可以留一段复盘。'}
                action={filter === 'all' ? <Button variant="secondary" size="sm" onClick={() => openForm()}>添加事项</Button>
                  : <Button variant="secondary" size="sm" onClick={() => setFilter('all')}>查看全部</Button>} />}
          </Section>
          {view !== 'week' ? <PlanReview key={selectedDate} date={selectedDate} /> : null}
        </div>
      </div>
    </>}
    <Modal open={newOpen || editing !== null} title={editing ? '编辑计划事项' : '添加计划事项'}
      description="调整未完成事项的日期会保留改期记录。已完成或取消的事项需先恢复未完成才能改期。" onClose={closeForm}>
      <EntityForm key={editing?.id ?? 'new'} fields={fields} initial={{ plan_date: selectedDate, priority: 'medium', ...editing }}
        onCancel={closeForm} onSubmit={async (values) => {
          await run(() => editing ? api.update('planItems', editing.id, values) : api.create('planItems', values)); closeForm();
        }} />
    </Modal>
    <Modal open={moveEntries.length > 0} title={moveEntries.length > 1 ? `重新安排${moveEntries.length}项` : '重新安排计划'}
      description="原日期会保留改期记录。" onClose={() => { if (!busy) setMoveEntries([]); }}>
      <form className="entity-form" onSubmit={(event) => { event.preventDefault(); void move(moveEntries, moveDate); }}>
        <label className="form-field"><span>新的日期</span><input type="date" required min={today} value={moveDate}
          onChange={(event) => setMoveDate(event.target.value)} /></label>
        {error ? <p role="alert" className="field-error">{error}</p> : null}
        <footer className="modal-actions"><Button type="button" variant="ghost" disabled={busy} onClick={() => setMoveEntries([])}>取消</Button>
          <Button type="submit" loading={busy}>确认改期</Button></footer>
      </form>
    </Modal>
  </div>;
}
