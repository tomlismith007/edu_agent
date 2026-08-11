import { AlertCircle, Award, BookOpen, GraduationCap } from 'lucide-react';
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
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import type { GraduationData } from '@/types/dashboard';

function credit(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export default function GraduationPage() {
  const { result, error, loading, refreshing, refresh } = useFetch<GraduationData>('graduation');
  if (loading && !result) return <ViewSkeleton cards={3} rows={6} />;
  const g = result?.data;
  return (
    <div className="flex flex-col gap-4">
      {g && (
        <>
          <Panel
            title="总体完成进度"
            description={
              g.source === 'detail'
                ? '按培养方案《毕业合格标准及学分要求》官方口径统计'
                : '培养方案明细页不可用，当前为执行计划降级口径'
            }
          >
            <StatGrid>
              <Stat
                value={g.summary.conclusion ?? (g.summary.ok ? '达标' : '未达标')}
                label="教务毕业结论"
                icon={Award}
              />
              <Stat
                value={`${credit(g.summary.totalEarnedCredit)}/${credit(g.summary.totalRequiredCredit)}`}
                label="已获/要求总学分"
                icon={GraduationCap}
              />
              <Stat
                value={`${g.summary.doneCount}/${g.summary.planCount}`}
                label="已修/方案门数"
                icon={BookOpen}
              />
              <Stat value={g.summary.missCount} label="未修课程门数" icon={AlertCircle} />
            </StatGrid>
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs font-medium text-muted-foreground">
                <span>总学分完成度（已获学分 / 要求总学分）</span>
                <span className="tnum font-semibold text-foreground">{g.summary.earnedPct.toFixed(1)}%</span>
              </div>
              <Progress value={Math.min(100, g.summary.earnedPct)} className="h-2" />
            </div>
          </Panel>

          <Panel
            title="官方毕业标准对照"
            description="必修类模块须全部修完；选修类模块只考核学分（专业选修=限选+任选合并，公选课不在方案池内）"
          >
            <DataTable
              headers={['模块', '类别', '考核规则', '要求学分', '已获学分', '方案池学分', '已修门数', '状态']}
              rows={g.groups.map((a) => [
                a.name,
                a.categories,
                a.ruleText,
                credit(a.requiredCredit),
                credit(a.doneCredit),
                a.poolCredit ? credit(a.poolCredit) : '—',
                a.poolCount ? `${a.doneCount}/${a.poolCount}` : `${a.doneCount}`,
                a.ok ? (
                  <Badge key="ok" variant="success">达标</Badge>
                ) : (
                  <Badge key="pending" variant="secondary">未达标</Badge>
                ),
              ])}
            />
          </Panel>

          <Panel title={`必修/实践未修 (${g.mustMiss.length})`} description="全部修完类模块中尚未修读的课程（真实毕业缺口）">
            <DataTable
              headers={['学期', '课程编号', '课程名称', '学分', '模块']}
              rows={g.mustMiss.map((m) => [m.term, m.code, m.name, m.credit, m.system])}
              empty="无未修必修课程"
            />
          </Panel>

          <Panel title={`0 学分待核对 (${g.zeroMiss.length})`} description="未计入标准学分的课程">
            <DataTable
              headers={['学期', '课程编号', '课程名称']}
              rows={g.zeroMiss.map((m) => [m.term, m.code, m.name])}
              empty="无待核对课程"
            />
          </Panel>

          <Panel title="公共选修课明细" description="通识教育课（选修）：修满 10 学分即可，课程来自教务毕业审核">
            <DataTable
              headers={['学期', '课程编号', '课程名称', '学分', '成绩', '学分状态']}
              rows={g.publicElectives.map((p) => [
                p.term,
                p.code,
                p.name,
                p.credit,
                p.grade,
                p.earned ? (
                  <Badge key="ok" variant="success">已获</Badge>
                ) : (
                  <Badge key="pending" variant="secondary">未获</Badge>
                ),
              ])}
              empty="暂无公共选修课记录"
            />
          </Panel>
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
