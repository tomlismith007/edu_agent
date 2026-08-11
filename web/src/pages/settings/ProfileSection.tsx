import { RefreshCw, User } from 'lucide-react';
import { useApp } from '@/contexts/app-context';
import { Panel } from '@/components/dashboard';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

export function ProfileSection() {
  const { user, deptMap, metaError, refreshMeta } = useApp();

  return (
    <Panel title="个人信息">
      <div className="flex items-center gap-3">
        <Avatar className="size-12">
          <AvatarFallback className="bg-primary text-base font-semibold text-primary-foreground">
            {user?.name?.slice(0, 1) ?? <User aria-hidden />}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-0.5">
          <span className="text-base font-semibold leading-none">{user?.name ?? '未登录'}</span>
          <span className="text-xs text-muted-foreground tnum">{user?.studentId ?? '—'}</span>
        </div>
        <div className="ml-auto">
          {user ? (
            <Badge variant="success">已登录</Badge>
          ) : metaError ? (
            <Badge variant="destructive">连接异常</Badge>
          ) : (
            <Badge variant="secondary">未登录</Badge>
          )}
        </div>
      </div>
      <Separator />
      <div className="flex flex-col gap-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">学院数据源</span>
          <span className="font-medium text-foreground">
            {deptMap.length > 0 ? `${deptMap.length} 个学院` : '使用本地兜底'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">连接状态</span>
          <Button variant="outline" size="sm" onClick={refreshMeta}>
            <RefreshCw data-icon="inline-start" />
            重新检测
          </Button>
        </div>
      </div>
    </Panel>
  );
}
