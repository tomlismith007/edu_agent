import { Panel } from './Panel';
import { Skeleton } from '@/components/ui/skeleton';

/** 初始加载占位（骨架屏） */
export function ViewSkeleton({ cards = 3, rows = 6 }: { cards?: number; rows?: number }) {
  return (
    <div className="flex flex-col gap-4">
      <Panel title="统计加载中">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: cards }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </Panel>
      <Panel title="明细加载中">
        <div className="flex flex-col gap-2">
          {Array.from({ length: rows }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full rounded-lg" />
          ))}
        </div>
      </Panel>
    </div>
  );
}
