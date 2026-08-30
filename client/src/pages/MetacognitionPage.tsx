import { useMemo, useRef, useState } from "react";
import { CaretLeft, CaretRight, Clock, NotePencil, PencilSimple, Plus, Trash } from "../icons";
import { api } from "../api";
import { useWorkspace } from "../WorkspaceContext";
import { addDays, classNames, formatDate, formatDateTime, localDate } from "../workspace-utils";
import { Button, EmptyState, Modal, PageHeader, Section } from "../components/workspace-ui";
import { ModuleArtwork } from "../components/ModuleArtwork";

type Entry = Record<string, any>;

export function MetacognitionPage() {
  const { data, run } = useWorkspace();
  const today = localDate();
  const [selectedDate, setSelectedDate] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<Entry | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const entries = useMemo(() => data.dailyMetacognitions
    .filter((entry) => !entry.deleted_at && String(entry.content ?? "").trim())
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))), [data.dailyMetacognitions]);
  const byDate = useMemo(() => entries.reduce<Record<string, Entry[]>>((result, entry) => {
    (result[entry.entry_date] ??= []).push(entry);
    return result;
  }, {}), [entries]);
  const selectedEntries = byDate[selectedDate] ?? [];
  const recentDates = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(today, -index)), [today]);

  const createEntry = async () => {
    const content = draft.trim();
    if (!content) return;
    await run(() => api.create("dailyMetacognitions", { entry_date: selectedDate, content, source_type: "manual" }));
    setDraft("");
  };
  const chooseDate = (date: string) => {
    setSelectedDate(date);
    setMonth(date.slice(0, 7));
    window.requestAnimationFrame(() => timelineRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  return <div className="metacognition-page">
    <PageHeader icon={<ModuleArtwork module="metacognition" />} eyebrow="日常思考" title="每日元认知" description="把主动感想、当日复盘和转化备忘保留成按分钟排序的时间线。" actions={<Button onClick={() => document.getElementById("metacognition-draft")?.focus()}><Plus size={17} />写下感想</Button>} />

    <div ref={timelineRef}>
      <Section title={selectedDate === today ? "今天的时间线" : `${formatDate(selectedDate)}的时间线`} description="最新记录排在最前，编辑不会改变最初的记录分钟。" className="metacognition-timeline-section">
        {selectedEntries.length ? <div className="metacognition-timeline">{selectedEntries.map((entry) => <EntryCard key={entry.id} entry={entry} onEdit={() => setEditing(entry)} onDelete={() => void run(() => api.remove("dailyMetacognitions", entry.id))} />)}</div> : <EmptyState title="这一天还没有感想" description="在下方写下第一条感想，它会归属到当前选择的日期。" />}
      </Section>
    </div>

    <Section title={selectedDate === today ? "今天的主要感想" : `为 ${formatDate(selectedDate)} 添加感想`} description={selectedDate === today ? "写下此刻最值得保留的观察，保存后会记录到今天的时间线。" : "记录归属到所选日期，创建时间仍保留此刻的分钟。"} className="metacognition-compose">
      <div className="metacognition-draft"><NotePencil size={20} /><textarea id="metacognition-draft" aria-label="每日主要感想" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={selectedDate === today ? "今天有什么新的发现、情绪或判断？" : `为 ${formatDate(selectedDate)} 留下一条感想……`} /><Button size="sm" onClick={() => void createEntry()} disabled={!draft.trim()}>保存感想</Button></div>
    </Section>

    <Section title="每日感想" description={calendarOpen ? "选择日期，按记录时间倒序回看当天全部内容。" : "近 7 天展示每一天最新一条感想摘要。"} className="metacognition-calendar-section" action={<Button variant="ghost" size="sm" onClick={() => setCalendarOpen((value) => !value)}>{calendarOpen ? "收起日历" : "展开日历"}</Button>}>
      {!calendarOpen ? <div className="metacognition-week-strip">{recentDates.map((date) => <DaySummary key={date} date={date} entries={byDate[date] ?? []} active={date === selectedDate} onClick={() => chooseDate(date)} />)}</div> : <ExpandedCalendar month={month} selectedDate={selectedDate} byDate={byDate} onMonthChange={setMonth} onSelect={chooseDate} maxMonth={today.slice(0, 7)} />}
    </Section>

    <Modal open={Boolean(editing)} title="编辑元认知记录" description="会保留原始记录时间，并显示此次更新时间。" onClose={() => setEditing(null)}>
      <div className="metacognition-edit-form"><label htmlFor="metacognition-edit">感想内容</label><textarea id="metacognition-edit" value={editing?.content ?? ""} onChange={(event) => setEditing((value) => value ? { ...value, content: event.target.value } : value)} /><div><Button variant="secondary" onClick={() => setEditing(null)}>取消</Button><Button onClick={async () => { if (!editing?.content.trim()) return; await run(() => api.update("dailyMetacognitions", editing.id, { content: editing.content })); setEditing(null); }}>保存修改</Button></div></div>
    </Modal>
  </div>;
}

function DaySummary({ date, entries, active, onClick }: { date: string; entries: Entry[]; active: boolean; onClick: () => void }) {
  const latest = entries[0];
  return <button type="button" className={classNames("metacognition-day-summary", active && "active")} onClick={onClick}>
    <span>{formatShortDate(date)}</span><strong className="metacognition-record-count">{entries.length ? `${entries.length} 条` : "未记录"}</strong><p>{latest ? truncate(String(latest.content), 42) : "今天留一点空白也没关系。"}</p>
  </button>;
}

function ExpandedCalendar({ month, selectedDate, byDate, onMonthChange, onSelect, maxMonth }: { month: string; selectedDate: string; byDate: Record<string, Entry[]>; onMonthChange: (value: string) => void; onSelect: (date: string) => void; maxMonth: string }) {
  return <div className="metacognition-calendar"><div className="metacognition-month-bar"><Button variant="ghost" size="sm" onClick={() => onMonthChange(offsetMonth(month, -1))} aria-label="查看上个月"><CaretLeft size={16} /></Button><strong>{formatMonth(month)}</strong><Button variant="ghost" size="sm" onClick={() => onMonthChange(offsetMonth(month, 1))} aria-label="查看下个月" disabled={month >= maxMonth}><CaretRight size={16} /></Button></div><div className="metacognition-calendar-grid"><div className="metacognition-weekdays">{["一", "二", "三", "四", "五", "六", "日"].map((day) => <span key={day}>{day}</span>)}</div><div className="metacognition-calendar-days">{monthCells(month).map((date, index) => date ? <DaySummary key={date} date={date} entries={byDate[date] ?? []} active={date === selectedDate} onClick={() => onSelect(date)} /> : <span key={`blank-${index}`} />)}</div></div></div>;
}

function EntryCard({ entry, onEdit, onDelete }: { entry: Entry; onEdit: () => void; onDelete: () => void }) {
  const source = entry.source_type === "daily_review" ? "当日复盘" : entry.source_type === "quick_memo" ? "快速备忘转化" : "主动记录";
  const changed = entry.updated_at && entry.created_at && String(entry.updated_at).slice(0, 16) !== String(entry.created_at).slice(0, 16);
  return <article className="metacognition-entry"><div className="metacognition-entry-time"><Clock size={15} /><time dateTime={entry.created_at}>{formatMinute(entry.created_at)}</time></div><div className="metacognition-entry-copy"><div><span className="metacognition-source">{source}</span>{changed ? <small>更新于 {formatDateTime(entry.updated_at)}</small> : null}</div><p>{entry.content}</p></div><div className="metacognition-entry-actions"><Button variant="ghost" size="sm" onClick={onEdit} aria-label="编辑记录"><PencilSimple size={15} /></Button><Button variant="ghost" size="sm" className="danger-text" onClick={onDelete} aria-label="删除记录"><Trash size={15} /></Button></div></article>;
}

function formatMinute(value: string): string { return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value)); }
function truncate(value: string, length: number): string { return value.length > length ? `${value.slice(0, length)}…` : value; }
function formatShortDate(date: string): string { return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", weekday: "short" }).format(new Date(`${date}T12:00:00`)); }
function formatMonth(month: string): string { const [year, value] = month.split("-"); return `${year}年${Number(value)}月`; }
function offsetMonth(month: string, offset: number): string { const [year, value] = month.split("-").map(Number); const next = new Date(year, value - 1 + offset, 1); return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`; }
function monthCells(month: string): Array<string | null> { const [year, value] = month.split("-").map(Number); const first = new Date(year, value - 1, 1); const leading = (first.getDay() + 6) % 7; const count = new Date(year, value, 0).getDate(); return [...Array(leading).fill(null), ...Array.from({ length: count }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`)]; }
