import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import {
  CalendarDays,
  Clock,
  Grid3X3,
  List,
  MapPin,
  User,
} from 'lucide-react';
import {
  DAYS,
  TIME_SLOTS,
  getCourseColor,
  isCourseInWeek,
  type TimetableEntry,
  type TimetableItem,
} from './types';
import { CourseDetailDialog } from './CourseDetailDialog';

export interface TimetableGridProps {
  entries: TimetableEntry[];
}

export function TimetableGrid({ entries }: TimetableGridProps) {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showWeekend, setShowWeekend] = useState(true);
  const [selectedWeek, setSelectedWeek] = useState<number | 'all'>('all');
  const [activeCourse, setActiveCourse] = useState<{
    entry: TimetableEntry;
    item: TimetableItem;
  } | null>(null);

  const todayDayNum = new Date().getDay() === 0 ? 7 : new Date().getDay();
  const visibleDays = DAYS.filter((d) => showWeekend || d.num <= 5);

  // 将后端 entry 转换为 (dayNum, sectionStart) 对应的矩阵 Lookup
  const cellMap = new Map<string, { entry: TimetableEntry; item: TimetableItem }[]>();

  entries.forEach((entry) => {
    const dayNum = entry.dayNum || DAYS.find((d) => d.label === entry.day)?.num || 1;
    const secStart = entry.sectionStart || parseInt(entry.section.slice(0, 2), 10) || 1;
    const key = `${dayNum}-${secStart}`;

    const items = entry.items && entry.items.length > 0
      ? entry.items
      : [{ name: entry.detail[0] || '未知课程', rawText: entry.detail.join(' / ') }];

    if (!cellMap.has(key)) {
      cellMap.set(key, []);
    }
    items.forEach((item) => {
      cellMap.get(key)!.push({ entry, item });
    });
  });

  return (
    <div className="flex flex-col gap-4">
      {/* 顶部操控条：视图切换、工作日/全周、周次筛选 */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-full border bg-muted/60 p-1">
              <Button
                size="sm"
                variant={viewMode === 'grid' ? 'default' : 'ghost'}
                className="h-7 rounded-full px-3 text-xs"
                onClick={() => setViewMode('grid')}
              >
                <Grid3X3 data-icon="inline-start" />
                周表矩阵
              </Button>
              <Button
                size="sm"
                variant={viewMode === 'list' ? 'default' : 'ghost'}
                className="h-7 rounded-full px-3 text-xs"
                onClick={() => setViewMode('list')}
              >
                <List data-icon="inline-start" />
                列表模式
              </Button>
            </div>

            {viewMode === 'grid' && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 rounded-full text-xs"
                onClick={() => setShowWeekend(!showWeekend)}
              >
                {showWeekend ? '仅看工作日 (周一至五)' : '显示全周 (周一至日)'}
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium">周次筛选：</span>
            <Select
              value={String(selectedWeek)}
              onChange={(e) =>
                setSelectedWeek(e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10))
              }
              className="h-8 w-auto rounded-lg text-xs"
            >
              <option value="all">全学期课程</option>
              {Array.from({ length: 20 }, (_, i) => i + 1).map((w) => (
                <option key={w} value={w}>
                  第 {w} 周
                </option>
              ))}
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* 周矩阵视图 */}
      {viewMode === 'grid' && (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
          <div className="min-w-[720px]">
            {/* 星期表头 */}
            <div
              className="grid border-b bg-muted/50 text-xs font-semibold text-muted-foreground"
              style={{
                gridTemplateColumns: `72px repeat(${visibleDays.length}, minmax(0, 1fr))`,
              }}
            >
              <div className="sticky left-0 z-10 flex items-center justify-center border-r bg-muted/80 backdrop-blur p-2.5 text-center">
                节次 \ 星期
              </div>
              {visibleDays.map((d) => {
                const isToday = d.num === todayDayNum;
                return (
                  <div
                    key={d.num}
                    className={`flex flex-col items-center justify-center border-r p-2.5 text-center last:border-r-0 ${
                      isToday ? 'bg-primary/10 text-primary font-bold' : ''
                    }`}
                  >
                    <div className="flex items-center gap-1">
                      <span>{d.label}</span>
                      {isToday && (
                        <Badge variant="default" className="px-1 py-0 text-[10px]">
                          今天
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 课表网格 */}
            <div className="divide-y divide-border">
              {TIME_SLOTS.map((slot) => (
                <div
                  key={slot.start}
                  className="grid min-h-[96px]"
                  style={{
                    gridTemplateColumns: `72px repeat(${visibleDays.length}, minmax(0, 1fr))`,
                  }}
                >
                  {/* 节次时间轴 */}
                  <div className="sticky left-0 z-10 flex flex-col justify-center border-r bg-muted/80 backdrop-blur p-2 text-center text-xs">
                    <span className="font-bold text-foreground">{slot.label}</span>
                    <span className="mt-0.5 text-[10px] text-muted-foreground leading-tight tnum">
                      {slot.time}
                    </span>
                  </div>

                  {/* 每天对应单元格 */}
                  {visibleDays.map((d) => {
                    const key = `${d.num}-${slot.start}`;
                    const courseList = cellMap.get(key) || [];
                    const isToday = d.num === todayDayNum;

                    return (
                      <div
                        key={d.num}
                        className={`flex flex-col gap-1.5 border-r p-1.5 last:border-r-0 ${
                          isToday ? 'bg-primary/[0.02]' : ''
                        }`}
                      >
                        {courseList.map(({ entry, item }, idx) => {
                          const palette = getCourseColor(item.name);
                          const activeInWeek = isCourseInWeek(item.weeks, selectedWeek);

                          return (
                            <button
                              key={idx}
                              onClick={() => setActiveCourse({ entry, item })}
                              className={`group relative flex flex-col justify-between rounded-lg border p-2 text-left transition-all hover:scale-[1.02] hover:shadow-xs focus:outline-none ${
                                palette.bg
                              } ${!activeInWeek ? 'opacity-40 border-dashed' : ''}`}
                            >
                              <div>
                                <div className="line-clamp-2 text-xs font-semibold leading-snug">
                                  {item.name}
                                </div>
                                {item.room && (
                                  <div className="mt-1 flex items-center gap-1 text-[11px] font-medium opacity-90">
                                    <MapPin className={`size-3 shrink-0 ${palette.icon}`} />
                                    <span className="truncate">{item.room}</span>
                                  </div>
                                )}
                              </div>

                              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                                {item.teacher && (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] opacity-80">
                                    <User className="size-2.5" />
                                    {item.teacher}
                                  </span>
                                )}
                                {item.weeks && (
                                  <span className="text-[10px] opacity-75 tnum">
                                    {item.weeks.replace('(周)', '周')}
                                  </span>
                                )}
                              </div>

                              {!activeInWeek && (
                                <Badge
                                  variant="outline"
                                  className="absolute top-1 right-1 text-[9px] px-1 py-0 border-current opacity-75"
                                >
                                  非本周
                                </Badge>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 列表模式视图 */}
      {viewMode === 'list' && (
        <div className="flex flex-col gap-3">
          {DAYS.map((d) => {
            const dayEntries = entries.filter((e) => (e.dayNum || 0) === d.num || e.day === d.label);
            if (dayEntries.length === 0) return null;
            const isToday = d.num === todayDayNum;

            return (
              <Card key={d.num} className={isToday ? 'border-primary/50 shadow-xs' : ''}>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="size-4 text-primary" />
                    <CardTitle className="text-sm">{d.label}</CardTitle>
                    {isToday && <Badge variant="default" className="text-xs">今天</Badge>}
                  </div>
                  <span className="text-xs text-muted-foreground">{dayEntries.length} 门课程</span>
                </CardHeader>
                <CardContent className="p-3 flex flex-col gap-2">
                  {dayEntries.map((e, idx) => {
                    const items = e.items && e.items.length > 0
                      ? e.items
                      : [{ name: e.detail[0] || '未知课程', rawText: e.detail.join(' / ') }];

                    return (
                      <div key={idx} className="flex flex-col gap-2">
                        {items.map((item, itemIdx) => {
                          const palette = getCourseColor(item.name);
                          const activeInWeek = isCourseInWeek(item.weeks, selectedWeek);

                          return (
                            <div
                              key={itemIdx}
                              className={`flex items-start justify-between rounded-xl border p-3 ${palette.bg} ${
                                !activeInWeek ? 'opacity-50' : ''
                              }`}
                            >
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className={`text-xs ${palette.badge}`}>
                                    {e.section}
                                  </Badge>
                                  <span className="font-bold text-sm">{item.name}</span>
                                </div>
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs opacity-90 pt-1">
                                  {item.teacher && (
                                    <span className="flex items-center gap-1">
                                      <User className="size-3.5" />
                                      {item.teacher}
                                    </span>
                                  )}
                                  {item.room && (
                                    <span className="flex items-center gap-1">
                                      <MapPin className="size-3.5" />
                                      {item.room}
                                    </span>
                                  )}
                                  {item.weeks && (
                                    <span className="flex items-center gap-1 tnum">
                                      <Clock className="size-3.5" />
                                      {item.weeks}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* 课程详情弹窗 Dialog */}
      <CourseDetailDialog course={activeCourse} onClose={() => setActiveCourse(null)} />
    </div>
  );
}
