import { AlertCircle, BookOpen, CheckCircle2, GraduationCap } from 'lucide-react';
import { useFetch } from '@/hooks/use-fetch';
import { DataTable } from '@/components/DataTable';
import {
  StatGrid,
  Stat,
  ViewSkeleton,
  ErrorAlert,
  Panel,
  CacheBar,
} from '@/components/dashboard';
import { Badge } from '@/components/ui/badge';
import type { CreditsData } from '@/types/dashboard';

export default function CreditsPage() {
  const { result, error, loading, refreshing, refresh } = useFetch<CreditsData>('credits');
  if (loading && !result) return <ViewSkeleton cards={4} rows={4} />;
  const c = result?.data;
  const conclusion = c?.studyCompletion?.conclusion || '—';
  const isOk = conclusion.includes('达标') || conclusion.includes('完成') || conclusion.includes('毕业');

  return (
    <div className="flex flex-col gap-4">
      {c && (
        <>
          <Panel title="学分汇总" description="累计学分与方案差距">
            <StatGrid>
              <Stat value={c.summary?.totalEarned ?? '—'} label="已修总学分" icon={CheckCircle2} />
              <Stat value={c.summary?.planCredit ?? '—'} label="方案要求学分" icon={BookOpen} />
              <Stat
                value={
                  c.summary?.gap != null
                    ? c.summary.gap >= 0
                      ? `已达标 (+${c.summary.gap.toFixed(1)})`
                      : `尚缺 ${Math.abs(c.summary.gap).toFixed(1)}`
                    : '—'
                }
                label="学分差距"
                icon={AlertCircle}
              />
              <Stat
                value={
                  <Badge variant={isOk ? 'success' : 'secondary'}>{conclusion}</Badge>
                }
                label="毕业结论"
                icon={GraduationCap}
              />
            </StatGrid>
          </Panel>

          <Panel
            title="培养方案学分分布"
            description={
              c.planStats?.source === 'plan'
                ? '培养方案明细页暂不可用，当前为执行计划降级口径，数字仅供参考'
                : '按官方《毕业合格标准及学分要求》逐模块对照，与毕业进度页同源；选修类模块只考核学分，方案池学分为可选总量'
            }
          >
            <DataTable
              headers={['模块', '类别', '考核规则', '要求学分', '已获学分', '方案池学分', '已修门数', '状态']}
              rows={(c.planStats?.modules || []).map((m) => [
                m.name,
                m.categories,
                m.ruleText,
                m.requiredCredit,
                m.doneCredit,
                m.poolCredit || '—',
                m.poolCount ? `${m.doneCount}/${m.poolCount}` : `${m.doneCount}`,
                m.ok ? (
                  <Badge key="ok" variant="success">达标</Badge>
                ) : (
                  <Badge key="pending" variant="secondary">未达标</Badge>
                ),
              ])}
            />
          </Panel>

          {c.innovation && c.innovation.records && c.innovation.records.length > 0 && (
            <Panel title={`创新与技能学分 (${c.innovation.totalCredit} 学分)`} description="四六级、竞赛及课外实践活动">
              <DataTable
                headers={['学期', '项目名称', '学分', '类型', '备注']}
                rows={c.innovation.records.map((r) => [r.term, r.name, r.credit, r.type, r.note || '—'])}
              />
            </Panel>
          )}
        </>
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
