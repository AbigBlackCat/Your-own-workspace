import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, FolderOpen, GitBranch, Flag, Bug, Wrench, Lightbulb, Check, CalendarPlus, Notebook, Trash } from "../icons";
import { api } from "../api";
import { useWorkspace } from "../WorkspaceContext";
import { formatDate, localDate, classNames } from "../workspace-utils";
import { Badge, Button, EmptyState, EntityForm, Modal, PageHeader, Section, type FieldDefinition } from "../components/workspace-ui";
import { ModuleArtwork } from "../components/ModuleArtwork";

const projectFields: FieldDefinition[] = [
  { name: "name", label: "项目名称", required: true },
  { name: "description", label: "项目说明", type: "textarea" },
  { name: "status", label: "状态", type: "select", required: true, options: [{ value: "active", label: "进行中" }, { value: "paused", label: "暂停" }, { value: "completed", label: "已完成" }] },
  { name: "local_path", label: "本地目录", placeholder: "/Users/..." },
  { name: "repository_url", label: "代码仓库", placeholder: "https://..." },
  { name: "document_url", label: "文档链接", placeholder: "https://..." },
];

export function DevelopmentPage() {
  const { data, run } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const [projectId, setProjectId] = useState<string | null>(data.devProjects[0]?.id ?? null);
  const [dialog, setDialog] = useState<{ type: string; item?: Record<string, any> } | null>(null);
  const [filter, setFilter] = useState("open");
  useEffect(() => { if (!projectId && data.devProjects[0]) setProjectId(data.devProjects[0].id); }, [data.devProjects, projectId]);
  useEffect(() => { const value = params.get("new"); if (value) setDialog({ type: value === "work-item" ? "work" : "project" }); }, [params]);
  const close = () => { setDialog(null); setParams({}); };
  const project = data.devProjects.find((item) => item.id === projectId);
  const milestones = data.devMilestones.filter((item) => item.project_id === projectId);
  const workItems = useMemo(() => data.devWorkItems.filter((item) => item.project_id === projectId && (filter === "all" || (filter === "open" ? item.status !== "done" : item.item_type === filter))), [data.devWorkItems, filter, projectId]);
  const logs = data.devLogs.filter((item) => item.project_id === projectId);
  return (
    <div>
      <PageHeader icon={<ModuleArtwork module="development" />} eyebrow="项目与技术记录" title="开发工作" description="项目、里程碑、功能、Bug 和开发日志各归其位。" actions={<><Button variant="secondary" onClick={() => setDialog({ type: "project" })}><Plus size={17} />新建项目</Button>{project ? <Button onClick={() => setDialog({ type: "work" })}><Plus size={17} />添加工作项</Button> : null}</>} />
      {data.devProjects.length === 0 ? <EmptyState title="还没有开发项目" description="建立项目后再添加里程碑、工作项和日志。" action={<Button onClick={() => setDialog({ type: "project" })}>建立第一个项目</Button>} /> : <div className="workspace-split">
        <aside className="project-rail"><span className="rail-label">项目</span>{data.devProjects.map((item) => <button key={item.id} className={projectId === item.id ? "active" : ""} onClick={() => setProjectId(item.id)}><div><strong>{item.name}</strong><small>{item.description || "没有项目说明"}</small></div><Badge tone={item.status === "active" ? "success" : "neutral"}>{item.status === "active" ? "进行中" : item.status === "completed" ? "已完成" : "暂停"}</Badge></button>)}</aside>
        <div className="workspace-detail">
          {project ? <>
            <div className="detail-hero"><div><span className="eyebrow">当前项目</span><h2>{project.name}</h2><p>{project.description || "尚未填写项目说明。"}</p></div><div className="detail-actions">{project.repository_url ? <a className="button button-secondary button-sm" href={project.repository_url} target="_blank" rel="noreferrer"><GitBranch size={16} />代码仓库</a> : null}<Button variant="ghost" size="sm" onClick={() => setDialog({ type: "project", item: project })}>编辑</Button></div></div>
            <Section title="里程碑" description="用目标日期判断项目节奏" action={<Button variant="ghost" size="sm" onClick={() => setDialog({ type: "milestone" })}><Plus size={15} />添加</Button>}>
              {milestones.length ? <div className="milestone-row">{milestones.map((item) => <button key={item.id} onClick={() => setDialog({ type: "milestone", item })}><Flag size={18} /><div><strong>{item.name}</strong><small>{item.target_date ? formatDate(item.target_date) : "未设置目标日期"}</small></div><Badge tone={item.status === "done" ? "success" : "neutral"}>{item.status === "done" ? "完成" : "进行中"}</Badge></button>)}</div> : <p className="quiet-line">这个项目还没有里程碑。</p>}
            </Section>
            <Section title="工作项" description="功能、需求、Bug 与技术问题" action={<div className="work-section-actions"><div className="compact-filter"><button className={filter === "open" ? "active" : ""} onClick={() => setFilter("open")}>未完成</button><button className={filter === "bug" ? "active" : ""} onClick={() => setFilter("bug")}>Bug</button><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>全部</button></div><Button size="sm" onClick={() => setDialog({ type: "work" })}><Plus size={15} />添加工作项</Button></div>}>
              {workItems.length ? <div className="work-list">{workItems.map((item) => <WorkItem key={item.id} item={item} milestone={milestones.find((value) => value.id === item.milestone_id)} onEdit={() => setDialog({ type: "work", item })} onDone={() => run(() => api.update("devWorkItems", item.id, { status: "done" }))} onPlan={() => run(() => api.create("planItems", { title: item.title, plan_date: localDate(), source_module: "development", source_entity_type: "dev_work_item", source_entity_id: item.id, priority: item.priority }))} onDelete={() => run(() => api.remove("devWorkItems", item.id))} />)}</div> : <EmptyState title="当前筛选没有工作项" description="添加一个功能、需求、Bug 或技术问题。" action={<Button variant="secondary" size="sm" onClick={() => setDialog({ type: "work" })}>添加第一个工作项</Button>} />}
            </Section>
            <Section title="开发日志" description="按日期连续记录技术决策和进展" action={<Button variant="ghost" size="sm" onClick={() => setDialog({ type: "log" })}><Notebook size={15} />写日志</Button>}>
              {logs.length ? <div className="log-list">{logs.slice(0, 8).map((item) => <article key={item.id}><time>{formatDate(item.log_date)}</time><p>{item.content}</p></article>)}</div> : <p className="quiet-line">暂无开发日志。</p>}
            </Section>
          </> : null}
        </div>
      </div>}
      <DevelopmentDialog dialog={dialog} project={project} milestones={milestones} close={close} run={run} />
    </div>
  );
}

function WorkItem({ item, milestone, onEdit, onDone, onPlan, onDelete }: any) {
  const icons = { feature: Lightbulb, requirement: Wrench, bug: Bug, technical: Wrench } as const; const Icon = icons[item.item_type as keyof typeof icons] ?? Wrench;
  return <article className={classNames("work-item", item.status === "done" && "is-done")}><button className="complete-control" disabled={item.status === "done"} onClick={onDone}>{item.status === "done" ? <Check size={14} /> : null}</button><Icon size={18} /><div className="work-copy"><button onClick={onEdit}>{item.title}</button><small>{milestone?.name || "未关联里程碑"}{item.description ? ` · ${item.description}` : ""}</small></div><Badge tone={item.priority === "high" ? "warning" : "neutral"}>{item.item_type === "bug" ? "Bug" : item.item_type === "feature" ? "功能" : item.item_type === "requirement" ? "需求" : "技术"}</Badge><button className="icon-button" title="加入今日计划" onClick={onPlan}><CalendarPlus size={17} /></button><button className="icon-button danger-text" title="移到回收站" onClick={onDelete}><Trash size={17} /></button></article>;
}

function DevelopmentDialog({ dialog, project, milestones, close, run }: any) {
  if (!dialog) return null;
  let title = ""; let fields: FieldDefinition[] = []; let collection: any;
  if (dialog.type === "project") { title = dialog.item ? "编辑项目" : "新建项目"; fields = projectFields; collection = "devProjects"; }
  if (dialog.type === "milestone") { title = dialog.item ? "编辑里程碑" : "添加里程碑"; fields = [{ name: "name", label: "里程碑名称", required: true }, { name: "target_date", label: "目标日期", type: "date" }, { name: "status", label: "状态", type: "select", required: true, options: [{ value: "open", label: "进行中" }, { value: "done", label: "已完成" }] }]; collection = "devMilestones"; }
  if (dialog.type === "work") { title = dialog.item ? "编辑工作项" : "添加工作项"; fields = [{ name: "title", label: "标题", required: true }, { name: "item_type", label: "类型", type: "select", required: true, options: [{ value: "feature", label: "功能" }, { value: "requirement", label: "需求" }, { value: "bug", label: "Bug" }, { value: "technical", label: "技术问题" }] }, { name: "priority", label: "优先级", type: "select", required: true, options: [{ value: "low", label: "低" }, { value: "medium", label: "普通" }, { value: "high", label: "高" }] }, { name: "milestone_id", label: "里程碑", type: "select", options: milestones.map((item: any) => ({ value: item.id, label: item.name })) }, { name: "description", label: "说明", type: "textarea" }]; collection = "devWorkItems"; }
  if (dialog.type === "log") { title = "记录开发日志"; fields = [{ name: "log_date", label: "日期", type: "date", required: true }, { name: "content", label: "日志内容", type: "textarea", required: true }]; collection = "devLogs"; }
  const defaults: Record<string, any> = dialog.type === "project" ? { status: "active" } : dialog.type === "milestone" ? { project_id: project?.id, status: "open" } : dialog.type === "work" ? { project_id: project?.id, item_type: "feature", priority: "medium", status: "todo" } : { project_id: project?.id, log_date: localDate() };
  return <Modal open title={title} description="保存后会立即更新当前项目。" onClose={close}><EntityForm fields={fields} initial={{ ...defaults, ...dialog.item }} onCancel={close} onSubmit={async (values) => { const payload = { ...defaults, ...values }; if (dialog.type === "work" && !payload.milestone_id) payload.milestone_id = null; if (dialog.item?.id) await run(() => api.update(collection, dialog.item.id, payload)); else await run(() => api.create(collection, payload)); close(); }} /></Modal>;
}
