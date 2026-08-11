import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { useFetch } from '@/hooks/use-fetch';
import { useTerms } from '@/hooks/use-terms';
import { TimetableGrid, type TimetableEntry } from '@/components/timetable';
import {
  Panel,
  CacheBar,
  ViewSkeleton,
  ErrorAlert,
  EmptyState,
} from '@/components/dashboard';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { DEFAULT_CURRENT_TERM } from '@/lib/dashboard-constants';

export default function TimetablePage() {
  const terms = useTerms();
  const [term, setTerm] = useState(DEFAULT_CURRENT_TERM);
  const { result, error, loading, refreshing, refresh } = useFetch<TimetableEntry[]>(
    'timetable',
    { term },
  );
  if (loading && !result) return <ViewSkeleton />;
  const entries = result?.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <Panel title="学期筛选" description="切换不同学期以查看对应的课表矩阵安排">
        <FieldGroup>
          <Field className="max-w-xs">
            <FieldLabel htmlFor="tt-term">当前查询学期</FieldLabel>
            <Select id="tt-term" value={term} onChange={(e) => setTerm(e.target.value)}>
              {terms.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
          </Field>
        </FieldGroup>
      </Panel>

      {entries.length > 0 ? (
        <TimetableGrid entries={entries} />
      ) : (
        <Panel title="课程表">
          <EmptyState
            title="本学期无排课或未查询到课程信息"
            icon={CalendarDays}
            className="py-12"
          />
        </Panel>
      )}

      {error && <ErrorAlert message={error} />}
      <CacheBar
        fromCache={result?.fromCache}
        cachedAt={result?.cachedAt}
        onRefresh={refresh}
        refreshing={refreshing}
      />
    </div>
  );
}
