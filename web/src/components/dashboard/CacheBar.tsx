import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw } from 'lucide-react';

/** 缓存状态条 + 刷新按钮（基于 shadcn Badge + Button） */
export function CacheBar({
  fromCache,
  cachedAt,
  onRefresh,
  refreshing,
}: {
  fromCache?: boolean;
  cachedAt?: string | null;
  onRefresh: () => void;
  refreshing?: boolean;
}) {
  const time = cachedAt
    ? new Date(cachedAt).toLocaleTimeString('zh-CN', { hour12: false })
    : '';
  return (
    <div className="flex items-center justify-between gap-3 pt-1">
      <Badge variant={fromCache ? 'secondary' : 'success'}>
        {fromCache ? `缓存数据 (${time})` : `实时抓取 (${time})`}
      </Badge>
      <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
        {refreshing ? (
          <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden />
        ) : (
          <RefreshCw data-icon="inline-start" aria-hidden />
        )}
        {refreshing ? '刷新中…' : '强制刷新'}
      </Button>
    </div>
  );
}
