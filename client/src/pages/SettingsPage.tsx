import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import JSZip from 'jszip';

import { api } from '../api';
import { useWorkspace } from '../WorkspaceContext';
import { Archive, ArrowCounterClockwise, Check, Database, DownloadSimple, Moon, Notebook, ShieldCheck, SquaresFour, Stack, Sun, Trash } from '../icons';
import type { CollectionName, Entity, WorkspaceState } from '../workspace-types';
import { formatDateTime } from '../workspace-utils';
import { normalizeAppearance } from '../appearance';
import { ModuleArtwork } from '../components/ModuleArtwork';
import { Badge, Button, ConfirmDialog, PageHeader, Section, Skeleton } from '../components/workspace-ui';

const collectionLabels: Record<string, string> = {
  planItems: '今日计划', quickMemos: '快速备忘', mediaContents: '自媒体', devProjects: '开发项目', devMilestones: '里程碑',
  devWorkItems: '开发工作项', devLogs: '开发日志', clients: '客户', consultingProjects: '咨询项目', consultingInteractions: '沟通记录',
  consultingDeliverables: '咨询交付物', consultingFollowups: '咨询跟进', consultingTimeEntries: '咨询时长', workoutTemplates: '训练模板',
  workoutTemplateExercises: '模板动作', workouts: '训练记录', workoutExercises: '训练动作', workoutSets: '训练组', bodyMetrics: '身体数据',
  nutritionTargets: '营养目标', foods: '常用食物', meals: '餐食', mealItems: '餐食明细', readingBooks: '阅读书架', readingDays: '阅读日历',
  readingNotes: '阅读笔记', readingBookDays: '按书阅读记录', readingSyncs: '阅读同步记录', xunjiSyncs: '训记同步记录',
};
const dashboardOptions = [{ value: 'media', label: '自媒体' }, { value: 'development', label: '开发工作' }, { value: 'consulting', label: '咨询工作' }, { value: 'fitness', label: '健身计划' }, { value: 'diet', label: '饮食计划' }, { value: 'reading', label: '阅读桌面' }];

export function SettingsPage() {
  const { data, run } = useWorkspace();
  const system = useQuery({ queryKey: ['system'], queryFn: api.systemStatus });
  const [busy, setBusy] = useState('');
  const [permanent, setPermanent] = useState<{ collection: CollectionName; id: string; title: string } | null>(null);
  const [dashboardModules, setDashboardModules] = useState<string[] | null>(null);
  const appearance = normalizeAppearance(data.settings.appearance);
  const persistedModules = Array.isArray(data.settings.dashboardModules) ? data.settings.dashboardModules : dashboardOptions.map((option) => option.value);
  const visibleModules = dashboardModules ?? persistedModules;
  const saveSetting = (key: string, value: any) => run(() => api.saveSettings({ [key]: value }));
  useEffect(() => { setDashboardModules(null); }, [data.settings.dashboardModules]);

  const exportAll = async () => {
    setBusy('export');
    try {
      const state = stripSecrets(await api.exportState()) as WorkspaceState;
      const zip = new JSZip();
      const exportedAt = new Date().toISOString();
      zip.file('barry-workspace.json', JSON.stringify(state, null, 2));
      zip.file('manifest.json', JSON.stringify({ app: 'Barry工作台', exportedAt, containsSecrets: false, database: 'Miaoda Serverless PostgreSQL' }, null, 2));
      for (const [name, value] of Object.entries(state)) {
        if (Array.isArray(value)) zip.file(`tables/${name}.csv`, toCsv(value));
      }
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `barry-workspace-${exportedAt.slice(0, 10)}.zip`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(link.href), 1_000);
    } finally {
      setBusy('');
    }
  };

  const toggleDashboardModule = (module: string, checked: boolean) => {
    const next = checked ? Array.from(new Set([...visibleModules, module])) : visibleModules.filter((value: string) => value !== module);
    setDashboardModules(next);
    void saveSetting('dashboardModules', next).catch(() => setDashboardModules(null));
  };

  if (system.isLoading) return <><PageHeader icon={<ModuleArtwork module="settings" />} eyebrow="系统" title="数据与设置" description="检查云端数据保护与个人偏好" /><Skeleton lines={8} /></>;
  const status = system.data ?? {};
  return (
    <div>
      <PageHeader icon={<ModuleArtwork module="settings" />} eyebrow="私人云端" title="数据与设置" description="数据只写入妙搭 PostgreSQL，密钥只保存在私有环境变量。" />
      <Section title="云数据库保护" description="妙搭是唯一主库；迁移前 SQLite 已冻结为只读存档">
        <div className="data-file-panel">
          <div className="file-icon"><Database size={27} /></div>
          <div className="file-copy"><strong>Miaoda Serverless PostgreSQL</strong><code>仅当前飞书账号可访问</code><div><Badge tone="success"><Check size={12} />唯一主库</Badge><span>{Number(status.recordCount ?? 0).toLocaleString('zh-CN')} 条云端记录</span><span>RLS + 平台访问范围</span></div></div>
        </div>
      </Section>
      <div className="settings-grid">
        <Section title="持续保护" description="云数据库使用平台备份能力；不再生成本机 SQLite 备份">
          <div className="export-panel"><ShieldCheck size={28} /><div><strong>云端自动保护</strong><p>新增和编辑立即进入唯一主库，避免手机与电脑出现数据分叉。</p></div><Badge tone="success">已启用</Badge></div>
        </Section>
        <Section title="手动导出 ZIP" description="包含 JSON 与各模块 CSV；导出前再次剔除任何疑似密钥字段">
          <div className="export-panel"><DownloadSimple size={28} /><div><strong>完整业务数据</strong><p>导出包永远不包含微信读书、训记或平台密钥。</p></div><Button variant="secondary" loading={busy === 'export'} onClick={() => void exportAll()}>导出 ZIP</Button></div>
        </Section>
      </div>
      <Section title="同步策略" description="定时任务自动更新，阅读桌面和健身计划中仍保留手动同步按钮">
        <div className="data-file-panel"><div className="file-icon"><Archive size={25} /></div><div className="file-copy"><strong>微信读书 + 训记</strong><code>私有后端环境变量</code><div><Badge tone="success"><Check size={12} />自动同步</Badge><span>支持手机端手动触发</span><span>错误不会覆盖上次成功数据</span></div></div></div>
      </Section>
      <Section title="使用偏好" description="偏好和业务数据一起保存在私人云端">
        <div className="preferences">
          <div><div><strong>界面风格</strong><small>功能和数据保持一致，只改变视觉系统</small></div><div className="appearance-toggle style-toggle" role="group" aria-label="界面风格"><button className={appearance === 'liquid' ? 'active' : ''} aria-pressed={appearance === 'liquid'} onClick={() => void saveSetting('appearance', 'liquid')}><span><Stack size={17} /><strong>Liquid Glass</strong></span><small>环境色、透明材质与柔和层次</small></button><button className={appearance === 'notebook' ? 'active' : ''} aria-pressed={appearance === 'notebook'} onClick={() => void saveSetting('appearance', 'notebook')}><span><Notebook size={17} /><strong>Notion 笔记</strong></span><small>紧凑画布、纯平表面与低饱和标记</small></button><button className={appearance === 'neo' ? 'active' : ''} aria-pressed={appearance === 'neo'} onClick={() => void saveSetting('appearance', 'neo')}><span><SquaresFour size={17} /><strong>Neo-Brutalism</strong></span><small>多色印刷、硬边框与机械反馈</small></button></div></div>
          <div><div><strong>界面主题</strong><small>选择适合长时间使用的明暗风格</small></div><div className="theme-toggle" role="group" aria-label="界面主题"><button className={(data.settings.theme ?? 'light') === 'light' ? 'active' : ''} aria-pressed={(data.settings.theme ?? 'light') === 'light'} onClick={() => void saveSetting('theme', 'light')}><Sun size={16} />浅色</button><button className={data.settings.theme === 'dark' ? 'active' : ''} aria-pressed={data.settings.theme === 'dark'} onClick={() => void saveSetting('theme', 'dark')}><Moon size={16} />深色</button></div></div>
          <label><div><strong>每周起始日</strong><small>影响今日计划的本周视图</small></div><select value={data.settings.weekStart ?? 'monday'} onChange={(event) => void saveSetting('weekStart', event.target.value)}><option value="monday">星期一</option><option value="sunday">星期日</option></select></label>
          <label><div><strong>日期格式</strong><small>用于列表和时间线</small></div><select value={data.settings.dateFormat ?? 'zh-CN'} onChange={(event) => void saveSetting('dateFormat', event.target.value)}><option value="zh-CN">中文日期</option><option value="iso">YYYY-MM-DD</option></select></label>
          <fieldset className="dashboard-options"><legend><strong>首页模块摘要</strong><small>选择首页底部需要显示的模块</small></legend><div>{dashboardOptions.map((option) => <label key={option.value}><input type="checkbox" checked={visibleModules.includes(option.value)} onChange={(event) => toggleDashboardModule(option.value, event.target.checked)} />{option.label}</label>)}</div></fieldset>
        </div>
      </Section>
      <Section title="回收站" description="删除记录先进入这里，永久删除需要再次确认">
        {data.trash.length ? <div className="trash-list">{data.trash.map((item) => <article key={item.id}><Trash size={18} /><div><strong>{item.display_title}</strong><small>{collectionLabels[item.collection] || item.collection} · 删除于 {formatDateTime(item.deleted_at)}</small></div><Button variant="ghost" size="sm" onClick={() => void run(() => api.restore(item.collection as CollectionName, item.entity_id))}><ArrowCounterClockwise size={15} />恢复</Button><Button variant="ghost" size="sm" className="danger-text" onClick={() => setPermanent({ collection: item.collection as CollectionName, id: item.entity_id, title: item.display_title })}>永久删除</Button></article>)}</div> : <p className="quiet-line">回收站是空的。</p>}
      </Section>
      <ConfirmDialog open={Boolean(permanent)} title="永久删除这条记录？" description={`“${permanent?.title ?? '记录'}”将无法从回收站恢复。`} confirmLabel="永久删除" danger onClose={() => setPermanent(null)} onConfirm={async () => { if (permanent) await run(() => api.permanentDelete(permanent.collection, permanent.id)); }} />
    </div>
  );
}

function stripSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSecrets);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !/(secret|token|password|cookie|api[_-]?key|authorization|credential)/i.test(key))
    .map(([key, item]) => [key, stripSecrets(item)]));
}

function toCsv(rows: Entity[]): string {
  const fields = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return `\uFEFF${fields.map(escape).join(',')}\n${rows.map((row) => fields.map((field) => escape(typeof row[field] === 'object' && row[field] !== null ? JSON.stringify(row[field]) : row[field])).join(',')).join('\n')}`;
}
