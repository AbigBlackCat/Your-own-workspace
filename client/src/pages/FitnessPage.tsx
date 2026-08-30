import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";
import { Check, Barbell, TrendUp, CalendarPlus, ArrowsClockwise, ArrowCounterClockwise, CaretLeft, CaretRight, PencilSimple } from "../icons";
import { api } from "../api";
import { useWorkspace } from "../WorkspaceContext";
import { MonthCalendar } from "../components/MonthCalendar";
import { formatDate, localDate } from "../workspace-utils";
import { Badge, Button, EmptyState, EntityForm, Modal, PageHeader, Section, type FieldDefinition } from "../components/workspace-ui";
import { ModuleArtwork } from "../components/ModuleArtwork";

export function FitnessPage() {
  const { data, run } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const [dialog, setDialog] = useState<{ type: string; item?: Record<string, any> } | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(localDate().slice(0, 7));
  const [templateStatsMonth, setTemplateStatsMonth] = useState(localDate().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(localDate());
  const [xunjiSyncing, setXunjiSyncing] = useState(false);
  const [xunjiError, setXunjiError] = useState("");
  useEffect(() => { const value = params.get("new"); if (value) setDialog({ type: value }); }, [params]);
  const close = () => { setDialog(null); setParams({}); };
  const recentWorkouts = [...data.workouts].sort((a, b) => b.workout_date.localeCompare(a.workout_date));
  const activeWorkout = recentWorkouts.find((item) => item.status === "in_progress");
  const activeExercises = data.workoutExercises.filter((item) => item.workout_id === activeWorkout?.id).sort((a, b) => a.sort_order - b.sort_order);
  const selectedWorkouts = recentWorkouts.filter((item) => item.workout_date === selectedDate);
  const weightChart = [...data.bodyMetrics].sort((a, b) => a.metric_date.localeCompare(b.metric_date)).slice(-12).map((item) => ({ date: item.metric_date.slice(5), weight: item.weight }));
  const latestXunjiSync = data.xunjiSyncs[0];
  const currentMonth = localDate().slice(0, 7);
  const templateMonthlyStats = useMemo(() => {
    const counts = new Map<string, { name: string; count: number }>();
    for (const workout of data.workouts) {
      if (workout.status !== "completed" || !String(workout.workout_date ?? "").startsWith(templateStatsMonth)) continue;
      const template = data.workoutTemplates.find((item) => item.id === workout.template_id);
      const key = workout.template_id ? `template:${workout.template_id}` : `workout:${workout.name}`;
      const prior = counts.get(key) ?? { name: template?.name || workout.name || "未命名训练", count: 0 };
      prior.count += 1;
      counts.set(key, prior);
    }
    return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN"));
  }, [data.workoutTemplates, data.workouts, templateStatsMonth]);
  const syncXunji = async () => {
    setXunjiSyncing(true);
    setXunjiError("");
    try {
      await run(() => api.syncXunji());
    } catch (error) {
      setXunjiError(error instanceof Error ? error.message : "训记训练数据暂时无法同步。");
    } finally {
      setXunjiSyncing(false);
    }
  };
  return (
    <div>
      <PageHeader icon={<ModuleArtwork module="fitness" />} eyebrow="训练与身体数据" title="健身计划" description={latestXunjiSync ? `训记最近同步于 ${new Date(latestXunjiSync.synced_at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}，已导入 ${latestXunjiSync.train_count} 次训练。` : "同步训练、记录感受，并回看身体数据与训练节奏。"} actions={<><Button variant="secondary" loading={xunjiSyncing} onClick={() => void syncXunji()}><ArrowsClockwise size={17} />同步训记 · 近90天</Button><Button variant="secondary" onClick={() => setDialog({ type: "metric" })}><TrendUp size={17} />记录身体数据</Button></>} />
      {xunjiError ? <p className="fitness-sync-error" role="alert">{xunjiError}</p> : null}
      {activeWorkout ? <Section title={`正在训练 · ${activeWorkout.name}`} description={`开始于 ${new Date(activeWorkout.started_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`} action={<Button onClick={() => void run(() => api.update("workouts", activeWorkout.id, { status: "completed", completed_at: new Date().toISOString() }))}><Check size={16} />完成训练</Button>}>
        <div className="active-workout">{activeExercises.map((exercise) => {
          const sets = data.workoutSets.filter((item) => item.workout_exercise_id === exercise.id).sort((a, b) => a.set_number - b.set_number);
          const previous = findPrevious(data, exercise.name, activeWorkout.id);
          return <article className="exercise-block" key={exercise.id}><header><div><Barbell size={19} /><h3>{exercise.name}</h3></div><small>{previous ? `上次：${previous.weight ?? 0} kg × ${previous.reps ?? 0}` : "第一次记录"}</small></header><div className="sets-table"><span>组</span><span>次数</span><span>重量 kg</span><span>完成</span>{sets.map((set) => <SetRow key={set.id} set={set} run={run} />)}</div></article>;
        })}</div>
      </Section> : null}
      <Section title="训练日历" description="已完成训练以高对比标记呈现，点击日期查看当日摘要。" className="fitness-calendar-section">
        <MonthCalendar month={calendarMonth} selectedDate={selectedDate} onMonthChange={setCalendarMonth} onSelectDate={(date) => { setSelectedDate(date); setCalendarMonth(date.slice(0, 7)); }} renderDay={(date) => <WorkoutCalendarDay date={date} data={data} />} />
        <div className="calendar-selected-detail"><header><div><span>选中日期</span><strong>{formatDate(selectedDate)}</strong></div><Badge tone={selectedWorkouts.some((item) => item.status === "completed") ? "success" : "neutral"}>{selectedWorkouts.length} 次训练</Badge></header>{selectedWorkouts.length ? <div className="calendar-detail-list">{selectedWorkouts.map((workout) => <article key={workout.id}><div><strong>{getWorkoutBodyPart(data, workout)}</strong><small>{workout.name}</small></div><p>{getWorkoutExerciseSummaries(data, workout).join(" · ") || "尚未记录动作和次数"}</p></article>)}</div> : <p className="quiet-line">这一天没有训练安排或记录。</p>}</div>
      </Section>
      <Section title="月度训练统计" description="只统计已完成训练，按所选月份查看训练频率。" className="template-monthly-section" action={<div className="template-month-controls"><Button variant="ghost" size="sm" onClick={() => setTemplateStatsMonth(offsetMonth(templateStatsMonth, -1))} aria-label="查看上个月"><CaretLeft size={16} /></Button><strong>{formatMonthKey(templateStatsMonth)}</strong><Button variant="ghost" size="sm" onClick={() => setTemplateStatsMonth(offsetMonth(templateStatsMonth, 1))} aria-label="查看下个月" disabled={templateStatsMonth >= currentMonth}><CaretRight size={16} /></Button><Button variant="ghost" size="sm" onClick={() => setTemplateStatsMonth(currentMonth)} disabled={templateStatsMonth === currentMonth}><ArrowCounterClockwise size={14} />本月</Button></div>}>
        <details className="template-monthly-disclosure"><summary><span><Barbell size={18} />查看 {formatMonthKey(templateStatsMonth)} 的训练分布</span><small>{templateMonthlyStats.reduce((total, item) => total + item.count, 0)} 次已完成训练</small></summary>{templateMonthlyStats.length ? <div className="template-monthly-chart">{templateMonthlyStats.map((item) => <article key={item.name}><div className="template-monthly-label"><strong>{item.name}</strong><span>{item.count} 次</span></div><div className="template-monthly-icons" aria-label={`${item.name}，${item.count} 次训练`}>{Array.from({ length: Math.min(item.count, 8) }, (_, index) => <Barbell key={index} size={17} />)}{item.count > 8 ? <small>+{item.count - 8}</small> : null}</div></article>)}</div> : <EmptyState title="这个月还没有已完成训练" description="完成一次训练后，会按照训练类型计入这里。" />}</details>
      </Section>
      <div className="fitness-grid">
        <Section title="体重趋势" description="最近十二次身体数据记录">
          {weightChart.length ? <div className="chart-wrap"><ResponsiveContainer width="100%" height={240}><LineChart data={weightChart}><XAxis dataKey="date" tickLine={false} axisLine={false} /><YAxis domain={["dataMin - 2", "dataMax + 2"]} tickLine={false} axisLine={false} /><Tooltip /><Line type="monotone" dataKey="weight" stroke="var(--accent)" strokeWidth={2.5} dot={{ fill: "var(--surface)", stroke: "var(--accent)", strokeWidth: 2 }} /></LineChart></ResponsiveContainer></div> : <EmptyState title="还没有身体数据" description="记录体重后，这里会出现趋势。" />}
        </Section>
      </div>
      <Section title="训练日记" description="历史训练保留当时的动作与组数据" action={<Button variant="ghost" size="sm" onClick={() => setDialog({ type: "workout" })}><CalendarPlus size={15} />安排训练</Button>}>
        {recentWorkouts.length ? <div className="history-table">{recentWorkouts.slice(0, 10).map((item) => <article key={item.id}><div><strong>{item.name}</strong><small>{formatDate(item.workout_date)}</small></div><Badge tone={item.status === "completed" ? "success" : item.status === "in_progress" ? "warning" : "neutral"}>{item.status === "completed" ? "已完成" : item.status === "in_progress" ? "进行中" : "已计划"}</Badge><p>{item.feeling || "还没有训练感受"}</p><Button variant="ghost" size="sm" className="workout-feeling-edit" onClick={() => setDialog({ type: "workoutFeeling", item })}><PencilSimple size={14} />{item.feeling ? "编辑感受" : "添加感受"}</Button></article>)}</div> : <p className="quiet-line">还没有训练记录。</p>}
      </Section>
      <FitnessDialog dialog={dialog} close={close} run={run} />
    </div>
  );
}

function SetRow({ set, run }: any) {
  const [reps, setReps] = useState(set.reps ?? ""); const [weight, setWeight] = useState(set.weight ?? "");
  return <><strong>{set.set_number}</strong><input aria-label={`第${set.set_number}组次数`} type="number" value={reps} onChange={(event) => setReps(event.target.value)} onBlur={() => void run(() => api.update("workoutSets", set.id, { reps: reps === "" ? null : Number(reps) }))} /><input aria-label={`第${set.set_number}组重量`} type="number" step="0.5" value={weight} onChange={(event) => setWeight(event.target.value)} onBlur={() => void run(() => api.update("workoutSets", set.id, { weight: weight === "" ? null : Number(weight) }))} /><button className={`set-check ${set.completed ? "active" : ""}`} onClick={() => void run(() => api.update("workoutSets", set.id, { completed: set.completed ? 0 : 1 }))}><Check size={14} /></button></>;
}

function findPrevious(data: any, name: string, currentWorkoutId: string) {
  const exercise = data.workoutExercises.find((item: any) => item.name === name && item.workout_id !== currentWorkoutId);
  if (!exercise) return null;
  return data.workoutSets.find((item: any) => item.workout_exercise_id === exercise.id && item.completed) ?? null;
}

function FitnessDialog({ dialog, close, run }: any) {
  if (!dialog) return null;
  const configs: Record<string, { title: string; collection: any; fields: FieldDefinition[]; defaults: any }> = {
    workout: { title: "安排一次训练", collection: "workouts", fields: [{ name: "name", label: "训练名称", required: true }, { name: "body_part", label: "训练部位", required: true, placeholder: "例如：胸部、背部、腿部" }, { name: "workout_date", label: "日期", type: "date", required: true }, { name: "feeling", label: "备注", type: "textarea" }], defaults: { name: "自主训练", body_part: "", workout_date: localDate(), status: "planned" } },
    workoutFeeling: { title: "训练感受", collection: "workouts", fields: [{ name: "feeling", label: "训练感受", type: "textarea", placeholder: "记录当日状态、体感或下次调整……" }], defaults: {} },
    metric: { title: "记录身体数据", collection: "bodyMetrics", fields: [{ name: "metric_date", label: "日期", type: "date", required: true }, { name: "weight", label: "体重 kg", type: "number", step: "0.1" }, { name: "waist", label: "腰围 cm", type: "number", step: "0.1" }, { name: "chest", label: "胸围 cm", type: "number", step: "0.1" }, { name: "body_fat", label: "体脂 %", type: "number", step: "0.1" }, { name: "notes", label: "备注", type: "textarea" }], defaults: { metric_date: localDate() } },
  };
  const config = configs[dialog.type] ?? configs.workout;
  return <Modal open title={config.title} onClose={close}><EntityForm fields={config.fields} initial={{ ...config.defaults, ...dialog.item }} submitLabel={dialog.type === "workoutFeeling" ? "保存感受" : "保存"} onCancel={close} onSubmit={async (values) => { if (dialog.type === "workoutFeeling" && dialog.item?.id) await run(() => api.update("workouts", dialog.item.id, { feeling: values.feeling })); else await run(() => api.create(config.collection, { ...config.defaults, ...values })); close(); }} /></Modal>;
}

function WorkoutCalendarDay({ date, data }: { date: string; data: any }) {
  const workouts = data.workouts.filter((item: any) => item.workout_date === date);
  if (!workouts.length) return null;
  return <>{workouts.sort((a: any, b: any) => Number(b.status === "completed") - Number(a.status === "completed")).slice(0, 2).map((workout: any) => {
    const label = getWorkoutTemplateLabel(data, workout);
    return <div className={`calendar-entry workout-${workout.status}`} key={workout.id}><strong>{workout.status === "completed" ? <Check size={12} aria-label="已完成" /> : null}<b>{label.slice(0, 2)}</b><span>{workout.status === "completed" ? "已完成" : "已安排"}</span></strong><span>{getWorkoutBodyPart(data, workout)}</span></div>;
  })}{workouts.length > 2 ? <small className="calendar-more">另有 {workouts.length - 2} 次</small> : null}</>;
}

function getWorkoutTemplateLabel(data: any, workout: any): string {
  return data.workoutTemplates.find((item: any) => item.id === workout.template_id)?.name || workout.name || "训练";
}

function getWorkoutBodyPart(data: any, workout: any): string {
  const template = data.workoutTemplates.find((item: any) => item.id === workout.template_id);
  return workout.body_part || template?.body_part || workout.name || "训练";
}

function getWorkoutExerciseSummaries(data: any, workout: any): string[] {
  const actualExercises = data.workoutExercises.filter((item: any) => item.workout_id === workout.id).sort((a: any, b: any) => a.sort_order - b.sort_order);
  if (actualExercises.length) return actualExercises.map((exercise: any) => {
    const sets = data.workoutSets.filter((item: any) => item.workout_exercise_id === exercise.id);
    const completedSets = sets.filter((item: any) => Boolean(item.completed));
    const countedSets = completedSets.length ? completedSets : workout.status === "completed" ? sets : [];
    const repetitions = countedSets.reduce((sum: number, set: any) => sum + Number(set.reps || 0), 0);
    return repetitions ? `${exercise.name} ${repetitions}次` : exercise.name;
  });
  return data.workoutTemplateExercises.filter((item: any) => item.template_id === workout.template_id).sort((a: any, b: any) => a.sort_order - b.sort_order).map((exercise: any) => `${exercise.name} ${exercise.target_sets || 1}×${exercise.target_reps || "自定"}`);
}

function offsetMonth(month: string, offset: number): string { const [year, value] = month.split("-").map(Number); const next = new Date(year, value - 1 + offset, 1); return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`; }
function formatMonthKey(month: string): string { const [year, value] = month.split("-"); return `${year}年${Number(value)}月`; }
