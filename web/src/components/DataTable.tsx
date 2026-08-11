import * as React from 'react';
import { Table2 } from 'lucide-react';
import {
  Table as TablePrimitive,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/dashboard/EmptyState';

export interface DataTableProps {
  headers?: string[];
  rows: React.ReactNode[][];
  empty?: string;
}

/** 通用数据表格（基于 shadcn Table 原语） */
export function DataTable({ headers, rows, empty = '暂无数据' }: DataTableProps) {
  if (!rows.length) {
    return <EmptyState title={empty} icon={Table2} />;
  }
  const colCount = headers?.length ?? Math.max(...rows.map((r) => r.length), 0);
  return (
    <div className="overflow-hidden rounded-xl border">
      <TablePrimitive>
        {headers && (
          <TableHeader className="bg-muted/50">
            <TableRow className="hover:bg-transparent">
              {headers.map((h, i) => (
                <TableHead key={i} className="h-9 px-3 text-xs font-semibold text-muted-foreground">
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
        )}
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={i}>
              {Array.from({ length: colCount }).map((_, j) => (
                <TableCell key={j} className="px-3 py-2.5 text-sm tnum">
                  {r[j] ?? ''}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </TablePrimitive>
    </div>
  );
}
