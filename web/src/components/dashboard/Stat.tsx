import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/** 统计卡片网格（响应式：2→3→4 列） */
export function StatGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4', className)}>
      {children}
    </div>
  );
}

export function Stat({
  value,
  label,
  sublabel,
  icon: Icon,
}: {
  value: React.ReactNode;
  label: string;
  sublabel?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
        {Icon && <Icon className="text-muted-foreground" aria-hidden />}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tracking-tight tnum">{value}</div>
        {sublabel && <div className="mt-1 text-xs text-muted-foreground truncate">{sublabel}</div>}
      </CardContent>
    </Card>
  );
}
