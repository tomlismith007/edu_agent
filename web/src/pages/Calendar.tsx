import { useState } from 'react';
import { CalendarDays, CheckCircle2, ScrollText } from 'lucide-react';
import { useFetch } from '@/hooks/use-fetch';
import { useTerms } from '@/hooks/use-terms';
import { DataTable } from '@/components/DataTable';
import {
  StatGrid,
  Stat,
  ViewSkeleton,
  ErrorAlert,
  Panel,
  CacheBar,
} from '@/components/dashboard';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { DEFAULT_CURRENT_TERM } from '@/lib/dashboard-constants';
import type { CalendarWeek, CalendarToday } from '@/types/dashboard';

export default function CalendarPage() {
  const terms = useTerms();
  const [term, setTerm] = useState(DEFAULT_CURRENT_TERM);
  const { result, error, loading, refreshing, refresh } = useFetch<
    CalendarWeek[],
    { today?: CalendarToday }
  >('calendar', { term });
  if (loading && !result) return <ViewSkeleton rows={7} />;
  const weeks = result?.data ?? [];
  const today = result?.today;
  return (
    <div className="flex flex-col gap-4">
      <Panel title="学期筛选">
        <FieldGroup>
          <Field className="max-w-xs">
            <FieldLabel htmlFor="cal-term">当前学期</FieldLabel>
            <Select id="cal-term" value={term} onChange={(e) => setTerm(e.target.value)}>
              {terms.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
          </Field>
        </FieldGroup>
      </Panel>
      {today && (
        <Panel title="今日概况" description={`日期：${today.date}`}>
          <StatGrid>
            <Stat value={today.date} label="今天" sublabel={today.weekday} icon={CalendarDays} />
            <Stat
              value={today.inTerm ? `第 ${today.week} 周` : '假期'}
              label="周次"
              sublabel={
                today.inTerm && today.weekRange
                  ? `${today.weekRange[0]} ~ ${today.weekRange[1]}`
                  : '不在教学学期内'
              }
              icon={ScrollText}
            />
            {today.progress != null && (
              <Stat
                value={`${today.progress.toFixed(1)}%`}
                label="学期进度"
                sublabel={`剩余 ${today.remaining} 周`}
                icon={CheckCircle2}
              />
            )}
          </StatGrid>
        </Panel>
      )}
      <Panel title="教学周历" description={`共 ${weeks.length} 周安排`}>
        <DataTable
          headers={['周次', '周一', '周二', '周三', '周四', '周五', '周六', '周日', '备注']}
          rows={weeks.map((w) => [w.week, ...w.dates, w.note])}
        />
      </Panel>
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
