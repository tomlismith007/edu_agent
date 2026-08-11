import * as React from 'react';
import { type LucideIcon, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

export function EmptyState({
  title = '暂无数据',
  description,
  icon: Icon = Inbox,
  action,
  className,
}: {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-10 px-4 text-center text-sm text-muted-foreground',
        className,
      )}
    >
      <Icon className="size-8 text-muted-foreground/60" aria-hidden />
      <p className="font-medium text-foreground">{title}</p>
      {description && <p className="text-xs text-muted-foreground max-w-sm">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
