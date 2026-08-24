import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowsClockwise, BookOpen, CaretLeft, CaretRight, ChartLineUp, Clock, Fire, Quotes, Target } from "../icons";
import { api } from "../api";
import { useWorkspace } from "../WorkspaceContext";
import { formatDateTime } from "../workspace-utils";
import { Button, EmptyState, ErrorState, PageHeader, Section, Skeleton } from "../components/workspace-ui";
import { ModuleArtwork } from "../components/ModuleArtwork";

type ReadingNote = { id: string; quote_text: string; thought_text: string; chapter_title: string; source_created_at: string; book_title: string; book_author: string };
type ReadingBook = { id: string; title: string; author: string; category: string; progress: number | null; finished: number; last_read_at: number | null; deep_link: string; note_count: number };
type BookRecord = { id: string; title: string; author: string; seconds: number | null };
type ReadingDashboard = { goalMinutes: number; today: string; todaySeconds: number; weeklySeconds: number; totalSeconds: number; readDays: number; streak: number; syncedAt: string | null; notes: ReadingNote[]; books: ReadingBook[]; calendar: Record<string, number>; bookRecords: Record<string, BookRecord[]> };

export function ReadingPage() {
  const { refresh } = useWorkspace();
  const dashboard = useQuery<ReadingDashboard>({ queryKey: ["reading-dashboard"], queryFn: api.readingDashboard, staleTime: 15_000 });
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => localDate());
  const [goal, setGoal] = useState(30);
  const calendar = useQuery<{ month: string; days: Record<string, number>; bookRecords: Record<string, BookRecord[]> }>({ queryKey: ["reading-calendar", month], queryFn: () => api.readingCalendar(month), enabled: dashboard.isSuccess, staleTime: 15_000 });

  useEffect(() => { if (dashboard.data) setGoal(dashboard.data.goalMinutes); }, [dashboard.data]);
  useEffect(() => { setSelectedDate(`${month}-01`); }, [month]);

  const sync = async () => {
    setSyncing(true);
    setSyncError("");
    try {
      await api.syncReading();
      await Promise.all([dashboard.refetch(), calendar.refetch(), refresh()]);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "同步没有完成，请稍后重试。");
    } finally {
      setSyncing(false);
    }
  };

  const saveGoal = async () => {
    const next = Math.max(5, Math.min(600, Math.round(Number(goal) || 30)));
    setGoal(next);
    try {
      await api.setReadingPreferences(next);
      await dashboard.refetch();
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "阅读目标没有保存成功。");
    }
  };

  if (dashboard.isLoading) return <><PageHeader icon={<ModuleArtwork module="reading" />} title="阅读桌面" description="正在读取本机已同步的阅读数据。" /><Skeleton lines={9} /></>;
  if (dashboard.error || !dashboard.data) return <ErrorState message={(dashboard.error as Error)?.message ?? "阅读数据暂时不可用"} onRetry={() => void dashboard.refetch()} />;

  const data = dashboard.data;
  const calendarData = calendar.data ?? { month, days: month === data.today.slice(0, 7) ? data.calendar : {}, bookRecords: month === data.today.slice(0, 7) ? data.bookRecords : {} };
  const minutes = Math.floor(data.todaySeconds / 60);
  const remaining = Math.max(0, data.goalMinutes - minutes);
  const progress = Math.min(100, (minutes / data.goalMinutes) * 100);
  const selectedSeconds = Number(calendarData.days[selectedDate] ?? 0);
  const records = calendarData.bookRecords[selectedDate] ?? [];

  return (
    <div className="reading-page">
      <PageHeader
        icon={<ModuleArtwork module="reading" />}
        title="阅读桌面"
        description={data.syncedAt ? `上次同步于 ${formatDateTime(data.syncedAt)}；数据只保存在这台电脑。` : "先同步微信读书数据，再在这里回看书架、进度与笔记。"}
        actions={<div className="reading-header-actions"><label className="reading-goal-control">每日目标<input aria-label="每日阅读目标（分钟）" type="number" min="5" max="600" step="5" value={goal} onChange={(event) => setGoal(Number(event.target.value))} onBlur={() => void saveGoal()} /><span>分钟</span></label><Button loading={syncing} onClick={() => void sync()}><ArrowsClockwise size={17} />同步微信读书数据</Button></div>}
      />

      {syncError ? <ErrorState message={syncError} onRetry={() => void sync()} /> : null}
      {!data.syncedAt ? <EmptyState title="阅读数据尚未同步" description="点击“同步微信读书数据”后，会把书架、进度、统计和笔记导入本机。" action={<Button loading={syncing} onClick={() => void sync()}><ArrowsClockwise size={17} />开始同步</Button>} /> : <>
        <section className="reading-focus" aria-label="今日阅读概览">
          <article className="reading-progress-panel frosted-content">
            <div className="reading-panel-label"><span>今天的阅读</span><Clock size={18} /></div>
            <div className="reading-progress-copy"><strong>{minutes}</strong><span>/ {data.goalMinutes} 分钟</span></div>
            <div className="reading-meter" role="progressbar" aria-valuemin={0} aria-valuemax={data.goalMinutes} aria-valuenow={Math.min(minutes, data.goalMinutes)} aria-label={`今天已阅读 ${minutes} 分钟`}><span style={{ transform: `scaleX(${progress / 100})` }} /></div>
            <p>{remaining ? `再读 ${remaining} 分钟，就完成今天的阅读目标。` : "今天的目标已完成，想读多久都算你的时间。"}</p>
          </article>
          <article className="reading-note-panel frosted-content">
            <div className="reading-panel-label"><span>{data.notes.some((note) => note.source_created_at.slice(0, 10) === data.today) ? "今日回味" : "最近回味"}</span><Quotes size={18} /></div>
            {data.notes.length ? <div className="reading-featured-note"><blockquote>{data.notes[0].quote_text || data.notes[0].thought_text}</blockquote>{data.notes[0].thought_text && data.notes[0].quote_text ? <p>{data.notes[0].thought_text}</p> : null}<footer>{data.notes[0].book_title}{data.notes[0].book_author ? ` · ${data.notes[0].book_author}` : ""}</footer></div> : <p className="reading-empty-copy">同步后，这里会留住你划线或写下想法的句子。</p>}
          </article>
          <aside className="reading-rhythm-panel frosted-content">
            <div><Fire size={19} weight="fill" /><span>连续阅读</span><strong>{data.streak}<small>天</small></strong></div>
            <div><ChartLineUp size={19} /><span>本周已读</span><strong>{formatReadingSeconds(data.weeklySeconds)}</strong></div>
            <div><Target size={19} /><span>累计阅读日</span><strong>{data.readDays}<small>天</small></strong></div>
          </aside>
        </section>

        <div className="reading-content-grid">
          <Section title="最近翻开的书" description="按微信读书中的最后阅读时间排列" className="reading-books-section">
            {data.books.length ? <div className="reading-book-list">{data.books.map((book) => <BookRow key={book.id} book={book} />)}</div> : <p className="quiet-line">同步后会显示最近阅读的书。</p>}
          </Section>
          <Section title="阅读轨迹" description="累计的阅读时长与习惯" className="reading-total-section">
            <div className="reading-total"><span>全部阅读</span><strong>{formatReadingSeconds(data.totalSeconds)}</strong><p>共 {data.readDays} 个有效阅读日。读满 1 分钟会计入一天。</p></div>
          </Section>
        </div>

        <Section title="阅读日历" description="每天的格子记录微信读书提供的真实阅读时长" className="reading-calendar-section" action={<div className="reading-month-controls"><Button variant="ghost" size="sm" onClick={() => setMonth(offsetMonth(month, -1))} aria-label="查看上个月"><CaretLeft size={16} /></Button><strong>{formatMonth(month)}</strong><Button variant="ghost" size="sm" onClick={() => setMonth(offsetMonth(month, 1))} aria-label="查看下个月" disabled={month >= data.today.slice(0, 7)}><CaretRight size={16} /></Button></div>}>
          <div className="reading-calendar-workspace" aria-busy={calendar.isLoading}>
            <div className="reading-calendar-grid"><div className="reading-weekdays">{["一", "二", "三", "四", "五", "六", "日"].map((day) => <span key={day}>{day}</span>)}</div><div className="reading-days">{monthCells(month).map((date, index) => date ? <button type="button" key={date} className={date === selectedDate ? "selected" : ""} data-has-reading={Number(calendarData.days[date] ?? 0) >= 60} onClick={() => setSelectedDate(date)} aria-label={`${date}，${calendarData.days[date] ? formatReadingSeconds(calendarData.days[date]) : "没有阅读记录"}`}><span>{Number(date.slice(-2))}</span>{Number(calendarData.days[date] ?? 0) >= 60 ? <small>{Math.floor(Number(calendarData.days[date]) / 60)} 分</small> : null}</button> : <span key={`empty-${index}`} />)}</div></div>
            <aside className="reading-day-detail"><span>{selectedDate.replace(/-/g, " / ")}</span><h3>{selectedSeconds ? `阅读了 ${formatReadingSeconds(selectedSeconds)}` : "这一天没有阅读记录"}</h3><p>{selectedSeconds ? "时长来自同步后的微信读书统计。" : "选择另一个有阅读时长的日期，回看当天阅读。"}</p><strong>当天阅读过的书</strong>{records.length ? <div className="reading-day-books">{records.slice(0, 5).map((book) => <span key={book.id}><BookOpen size={15} /><b>{book.title}</b><small>{book.seconds ? formatReadingSeconds(book.seconds) : "已记录阅读日期"}</small></span>)}</div> : <p className="reading-detail-empty">微信读书没有为这一天定位到书籍。</p>}</aside>
          </div>
        </Section>

        <Section title="笔记与划线" description="同步保存的划线与个人想法；书签只保留数量。" className="reading-notes-section">
          {data.notes.length ? <div className="reading-note-list">{data.notes.slice(0, 12).map((note) => <NoteRow key={note.id} note={note} />)}</div> : <p className="quiet-line">还没有可显示的笔记。</p>}
        </Section>
      </>}
    </div>
  );
}

function BookRow({ book }: { book: ReadingBook }) {
  const contents = <><span className="reading-book-symbol"><BookOpen size={22} weight="duotone" /></span><span className="reading-book-copy"><strong>{book.title}</strong><small>{book.author || book.category || "微信读书"}</small></span>{book.progress !== null ? <span className="reading-book-progress">{book.progress}%</span> : null}</>;
  return book.deep_link ? <a className="reading-book-row" href={book.deep_link}>{contents}</a> : <div className="reading-book-row">{contents}</div>;
}

function NoteRow({ note }: { note: ReadingNote }) {
  return <article className="reading-note-row"><Quotes size={17} aria-hidden="true" /><div>{note.quote_text ? <blockquote>{note.quote_text}</blockquote> : null}{note.thought_text ? <p>{note.thought_text}</p> : null}<footer>{note.book_title}{note.book_author ? ` · ${note.book_author}` : ""}{note.chapter_title ? ` · ${note.chapter_title}` : ""}</footer></div></article>;
}

function formatReadingSeconds(seconds = 0): string { const minutes = Math.floor(Number(seconds) / 60); return minutes < 60 ? `${minutes} 分钟` : `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟`; }
function localDate(): string { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function monthKey(date: Date): string { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; }
function formatMonth(month: string): string { const [year, value] = month.split("-"); return `${year}年${Number(value)}月`; }
function offsetMonth(month: string, offset: number): string { const [year, value] = month.split("-").map(Number); return monthKey(new Date(year, value - 1 + offset, 1)); }
function monthCells(month: string): Array<string | null> { const [year, value] = month.split("-").map(Number); const first = new Date(year, value - 1, 1); const leading = (first.getDay() + 6) % 7; const count = new Date(year, value, 0).getDate(); return [...Array(leading).fill(null), ...Array.from({ length: count }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`)]; }
