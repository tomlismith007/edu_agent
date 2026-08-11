import { useEffect, useState } from 'react';
import { Database, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { getJson } from '@/api/client';
import { clearFetchCache } from '@/hooks/use-fetch';
import { Panel } from '@/components/dashboard';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

interface CacheStats {
  ok: boolean;
  stats?: { key: string; cachedAt: number; ageSec: number }[];
}

export function CacheSection() {
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [clearing, setClearing] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);

  const loadStats = () => {
    setStatsLoading(true);
    getJson<unknown, CacheStats>('/api/cache')
      .then((r) => setCacheStats(r))
      .catch(() => setCacheStats(null))
      .finally(() => setStatsLoading(false));
  };

  const handleClear = async () => {
    setClearing(true);
    clearFetchCache();
    try {
      await getJson('/api/cache/clear', { method: 'POST' } as RequestInit);
      toast.success('已清空前后端缓存');
      loadStats();
    } catch (e) {
      toast.error(`清空失败: ${(e as Error).message}`);
    } finally {
      setClearing(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  return (
    <Panel title="缓存">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          <span className="flex items-center gap-2 text-muted-foreground">
            <Database className="size-4" aria-hidden />
            后端缓存条目
          </span>
          {statsLoading ? (
            <Spinner className="text-muted-foreground" />
          ) : (
            <span className="font-semibold text-foreground tnum">
              {cacheStats?.stats?.length ?? '—'}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={loadStats} disabled={statsLoading}>
            {statsLoading ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
            刷新统计
          </Button>
          <Button variant="destructive" size="sm" onClick={handleClear} disabled={clearing}>
            {clearing ? <Spinner data-icon="inline-start" /> : <Trash2 data-icon="inline-start" />}
            {clearing ? '清空中…' : '清空全部缓存'}
          </Button>
        </div>
      </div>
    </Panel>
  );
}
