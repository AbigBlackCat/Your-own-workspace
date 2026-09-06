import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { useWorkspace } from '../WorkspaceContext';
import { Button, ErrorState, Section, Skeleton } from './workspace-ui';

const drafts = new Map<string, string>();

export function PlanReview({ date }: { date: string }) {
  const { run, registerSaveHandler } = useWorkspace();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['daily-review', date], queryFn: () => api.getReview(date) });
  const [draft, setDraft] = useState<string | undefined>(() => drafts.get(date));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const inFlight = useRef<Promise<void> | null>(null);
  const content = draft ?? String(query.data?.content ?? '');
  const dirty = draft !== undefined && draft !== String(query.data?.content ?? '');
  const persist = useCallback(async () => {
    if (inFlight.current) return inFlight.current;
    if (!dirty || !query.isSuccess) return;
    setSaving(true);
    setError('');
    const savingPromise = (async () => {
      try {
        while (drafts.has(date)) {
          const value = drafts.get(date)!;
          const saved = await run(() => api.setReview(date, value));
          queryClient.setQueryData(['daily-review', date], saved);
          if (drafts.get(date) === value) drafts.delete(date);
        }
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : '复盘未保存，请重试');
        throw failure;
      } finally { setSaving(false); inFlight.current = null; }
    })();
    inFlight.current = savingPromise;
    return savingPromise;
  }, [content, date, dirty, query.isSuccess, queryClient, run]);
  const latestSave = useRef(persist);
  latestSave.current = persist;
  useEffect(() => registerSaveHandler(persist), [persist, registerSaveHandler]);
  useEffect(() => {
    if (!dirty || saving || error) return;
    const timer = window.setTimeout(() => void persist().catch(() => undefined), 700);
    return () => window.clearTimeout(timer);
  }, [dirty, saving, error, persist]);
  useEffect(() => () => { void latestSave.current().catch(() => undefined); }, []);
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);

  return <Section title="当日复盘" description="停顿后自动保存，与每日元认知保持一致。" className="plan-review-v2">
    {query.isLoading ? <Skeleton lines={2} /> : query.error
      ? <ErrorState message="复盘暂时无法读取，草稿仍保留。" onRetry={() => void query.refetch()} />
      : <><label className="sr-only" htmlFor={`review-${date}`}>这一天的复盘</label>
        <textarea id={`review-${date}`} className="review-input" value={content}
          onChange={(event) => { setDraft(event.target.value); drafts.set(date, event.target.value); setError(''); }}
          onBlur={() => void persist().catch(() => undefined)} placeholder="记录进展、问题或下一步调整…" />
        <div className="plan-review-status" role="status">{error ? <>
          <span className="danger-text">保存失败：{error}。草稿已保留。</span>
          <Button size="sm" variant="secondary" onClick={() => void persist().catch(() => undefined)}>重试保存</Button>
        </> : saving ? '保存中…' : dirty ? '有未保存的修改' : '已保存'}</div>
      </>}
  </Section>;
}
