import * as Menu from '@radix-ui/react-dropdown-menu';
import { useNavigate } from 'react-router-dom';
import { Check, DotsThree, ArrowSquareOut } from '../icons';
import { Badge, Button } from './workspace-ui';
import { formatDate, formatDuration, classNames } from '../workspace-utils';
import { planSourceRoute, planStatusLabels, type PlanOccurrence } from '../plan-view';
import type { PlanStatus } from '../../../shared/api.interface';

interface Props {
  entries: PlanOccurrence[];
  today: string;
  busy: boolean;
  showDate?: boolean;
  onStatus: (entry: PlanOccurrence, status: PlanStatus) => void;
  onMove: (entry: PlanOccurrence, date?: string) => void;
  onEdit: (entry: PlanOccurrence) => void;
  onDelete: (entry: PlanOccurrence) => void;
  onDate: (date: string) => void;
  tomorrow: string;
  focusedId?: string | null;
}

export function PlanList(props: Props) {
  const navigate = useNavigate();
  return <div className="plan-items-v2">{props.entries.map((entry) => {
    const { item, status } = entry;
    const active = status === 'todo' || status === 'doing';
    const overdue = active && entry.date < props.today;
    return <article key={`${item.id}-${entry.date}`} id={`plan-${item.id}-${entry.date}`}
      className={classNames('plan-item-v2', status === 'done' && 'is-done',
        props.focusedId === item.id && 'is-focused')}>
      <button className="plan-check-v2" disabled={props.busy || status === 'moved' || status === 'cancelled'}
        aria-label={`${status === 'done' ? '恢复未完成' : '完成'}：${entry.title}`}
        aria-pressed={status === 'done'} onClick={() => props.onStatus(entry, status === 'done' ? 'todo' : 'done')}>
        {status === 'done' ? <Check size={18} /> : null}
      </button>
      <div className="plan-body-v2">
        <button className="plan-title-v2" onClick={() => status === 'moved'
          ? props.onDate(String(item.plan_date)) : props.onEdit(entry)}>{entry.title}</button>
        <div className="plan-meta-v2">
          {props.showDate ? <span>{formatDate(entry.date)}</span> : null}
          <span>{entry.time || '未设时间'}</span>
          {entry.minutes > 0 ? <span>{formatDuration(entry.minutes)}</span> : null}
          {entry.priority === 'high' ? <span className="plan-priority">高优先级</span> : null}
          <Badge tone={status === 'done' ? 'success' : overdue ? 'warning' : 'neutral'}>
            {overdue ? '未完成' : planStatusLabels[status]}
          </Badge>
        </div>
        {status === 'moved' ? <p className="plan-note-v2">已改期至{formatDate(entry.movedTo)}，保留原安排。
          <button className="text-button" onClick={() => props.onDate(String(item.plan_date))}>查看当前安排</button>
        </p> : <>
          {item.notes ? <p className="plan-note-v2">{item.notes}</p> : null}
          {status === 'done' && item.completed_at ? <small className="plan-note-v2">
            完成于{new Date(item.completed_at).toLocaleString('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </small> : null}
          {item.source_module ? <button className="text-button source-link" onClick={() => navigate(planSourceRoute(item))}>
            打开来源 <ArrowSquareOut size={14} /></button> : null}
          {item.complete_source ? <small className="plan-note-v2">完成时会同步来源状态；恢复仅撤回未被另外修改的来源状态。</small> : null}
        </>}
        {overdue ? <div className="plan-inline-actions">
          <Button size="sm" variant="secondary" disabled={props.busy} onClick={() => props.onMove(entry, props.today)}>安排到今天</Button>
          <Button size="sm" variant="ghost" disabled={props.busy} onClick={() => props.onMove(entry)}>改期</Button>
        </div> : null}
      </div>
      {status !== 'moved' ? <Menu.Root><Menu.Trigger asChild>
        <button className="icon-button plan-menu-trigger" disabled={props.busy} aria-label={`操作：${entry.title}`}><DotsThree size={22} /></button>
      </Menu.Trigger><Menu.Portal><Menu.Content className="plan-menu-v2" align="end" sideOffset={6}>
        <Menu.Item onSelect={() => props.onEdit(entry)}>编辑事项</Menu.Item>
        {active ? <>
          <Menu.Item onSelect={() => props.onStatus(entry, status === 'doing' ? 'todo' : 'doing')}>
            {status === 'doing' ? '暂停执行' : '开始执行'}</Menu.Item>
          <Menu.Item onSelect={() => props.onMove(entry)}>改期…</Menu.Item>
          <Menu.Item onSelect={() => props.onMove(entry, props.tomorrow)}>移到明天（{formatDate(props.tomorrow)}）</Menu.Item>
          <Menu.Item onSelect={() => props.onStatus(entry, 'cancelled')}>取消计划</Menu.Item>
        </> : <Menu.Item onSelect={() => props.onStatus(entry, 'todo')}>恢复未完成</Menu.Item>}
        <Menu.Separator />
        <Menu.Item className="danger-text" onSelect={() => props.onDelete(entry)}>移到回收站</Menu.Item>
      </Menu.Content></Menu.Portal></Menu.Root> : null}
    </article>;
  })}</div>;
}
