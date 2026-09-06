import { useSearchParams } from 'react-router-dom';
import { useWorkspace } from '../WorkspaceContext';
import { Button, ErrorState, Modal, Skeleton } from './workspace-ui';
import type { CollectionName, Entity } from '../workspace-types';

const fields: Record<string, string> = {
  title: '标题', name: '名称', content: '内容', description: '说明', notes: '备注', copy_text: '内容笔记',
  current_need: '当前需求', status: '状态', priority: '优先级', stage: '制作阶段', platform: '平台',
  due_date: '截止日期', followup_at: '跟进时间', workout_date: '训练日期', meal_date: '餐食日期',
  log_date: '日志日期', entry_date: '记录日期', occurred_at: '发生时间', planned_publish_at: '计划发布时间',
  author: '作者', progress: '阅读进度', quote_text: '划线', thought_text: '想法', chapter_title: '章节',
  minutes: '分钟', start_time: '开始时间', estimated_minutes: '预计分钟', created_at: '创建时间',
};
const labels: Record<string, string> = {
  todo: '待办', doing: '进行中', done: '已完成', cancelled: '已取消', active: '进行中', paused: '暂停',
  completed: '已完成', waiting: '等待中', high: '高', medium: '普通', low: '低', idea: '灵感',
  producing: '制作中', ready: '待发布', published: '已发布', archived: '已归档', open: '进行中',
};

export function RecordDetail() {
  const [params, setParams] = useSearchParams();
  const { data, loading, error, refresh } = useWorkspace();
  const id = params.get('record');
  const collection = params.get('collection');
  if (!id || !collection || collection === 'planItems') return null;
  const candidates = data[collection as CollectionName];
  const record: Entity | undefined = Array.isArray(candidates) ? candidates.find((item) => item.id === id) : undefined;
  const close = () => {
    const next = new URLSearchParams(params); next.delete('record'); next.delete('collection');
    setParams(next, { replace: true });
  };
  return <Modal open wide title={record?.title || record?.name || '记录详情'} onClose={close}
    description="直接查看所选记录；返回后继续原来的计划。">
    {loading ? <Skeleton lines={4} /> : error ? <ErrorState message={error} onRetry={() => void refresh()} />
      : !record ? <p role="status">这条记录已删除或暂时不可用。可以在设置的回收站中查找。</p>
        : <dl className="record-detail-grid">{Object.entries(fields).filter(([key]) =>
          record[key] !== undefined && record[key] !== null && String(record[key]).trim() !== '')
          .map(([key, label]) => <div key={key}><dt>{label}</dt><dd>
            {['status', 'priority', 'stage'].includes(key) ? labels[String(record[key])] || String(record[key]) : String(record[key])}
          </dd></div>)}</dl>}
    <div className="record-return"><Button variant="secondary" onClick={() => window.history.back()}>返回上一页</Button>
      <Button variant="ghost" onClick={close}>留在当前模块</Button></div>
  </Modal>;
}
