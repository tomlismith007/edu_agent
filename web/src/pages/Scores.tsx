import { useMemo, useState } from 'react';
import { AlertCircle, BookOpen, CheckCircle2 } from 'lucide-react';
import { useFetch } from '@/hooks/use-fetch';
import { gradeToScore } from '@/lib/grade';
import { DataTable } from '@/components/DataTable';
import {
  StatGrid,
  Stat,
  ViewSkeleton,
  ErrorAlert,
  Panel,
  CacheBar,
} from '@/components/dashboard';
import { Button } from '@/components/ui/button';
import type { ScoreItem } from '@/types/dashboard';

export default function ScoresPage() {
  const { result, error, loading, refreshing, refresh } = useFetch<ScoreItem[]>('scores');
  const [selectedTerm, setSelectedTerm] = useState('all');

  const allCourses = result?.data ?? [];

  const { termsWithScores, courses, weightAvg, failed } = useMemo(() => {
    const terms = Array.from(new Set(allCourses.map((c) => c.term))).filter(Boolean);
    const cs = selectedTerm === 'all' ? allCourses : allCourses.filter((c) => c.term === selectedTerm);
    const scored = cs.filter((c) => gradeToScore(c.grade) != null && c.credit > 0);
    const avg = scored.length
      ? scored.reduce((s, c) => s + gradeToScore(c.grade)! * c.credit, 0) /
        scored.reduce((s, c) => s + c.credit, 0)
      : 0;
    const fail = cs.filter(
      (c) => gradeToScore(c.grade) != null && gradeToScore(c.grade)! < 60,
    );
    return { termsWithScores: terms, courses: cs, weightAvg: avg, failed: fail };
  }, [allCourses, selectedTerm]);

  if (loading && !result) return <ViewSkeleton />;

  return (
    <div className="flex flex-col gap-4">
      <Panel title="学期筛选" description="点击胶囊按钮快速切换与查看各学期 GPA 及成绩明细">
        <div className="flex w-full flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={selectedTerm === 'all' ? 'default' : 'outline'}
            className="rounded-full text-xs"
            onClick={() => setSelectedTerm('all')}
          >
            全部学期 ({allCourses.length})
          </Button>
          {termsWithScores.map((t) => {
            const count = allCourses.filter((c) => c.term === t).length;
            return (
              <Button
                key={t}
                size="sm"
                variant={selectedTerm === t ? 'default' : 'outline'}
                className="rounded-full text-xs"
                onClick={() => setSelectedTerm(t)}
              >
                {t} ({count})
              </Button>
            );
          })}
        </div>
      </Panel>

      <Panel
        title={selectedTerm === 'all' ? '总体统计' : `${selectedTerm} 学期统计`}
        description={selectedTerm === 'all' ? '全部学期成绩汇总与 GPA 基准' : `${selectedTerm} 学期加权平均分与门数统计`}
      >
        <StatGrid>
          <Stat value={courses.length} label="课程总数" icon={BookOpen} />
          <Stat value={weightAvg.toFixed(2)} label="加权平均分" icon={CheckCircle2} />
          <Stat value={failed.length} label="不及格门数" icon={AlertCircle} />
        </StatGrid>
      </Panel>

      <Panel
        title="成绩明细"
        description={selectedTerm === 'all' ? `已查询到 ${courses.length} 门课程记录` : `已展示 ${selectedTerm} 学期 ${courses.length} 门课程明细`}
      >
        <DataTable
          headers={['学期', '课程', '成绩', '学分', '考核', '性质']}
          rows={courses.map((c) => [c.term, c.name, c.grade, c.credit, c.method, c.nature])}
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
