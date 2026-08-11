import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Clock, MapPin, Sparkles, User } from 'lucide-react';
import type { TimetableEntry, TimetableItem } from './types';

interface CourseDetailDialogProps {
  course: { entry: TimetableEntry; item: TimetableItem } | null;
  onClose: () => void;
}

export function CourseDetailDialog({ course, onClose }: CourseDetailDialogProps) {
  return (
    <Dialog open={!!course} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md p-5">
        {course && (
          <>
            <DialogHeader className="flex-row items-center gap-2 pr-6">
              <Sparkles className="size-5 text-primary shrink-0" />
              <DialogTitle className="text-lg font-bold text-foreground">
                {course.item.name}
              </DialogTitle>
              <DialogDescription className="sr-only">课程详细排课与地点信息</DialogDescription>
            </DialogHeader>

            <div className="mt-4 flex flex-col gap-3 text-sm">
              <div className="flex items-center justify-between rounded-xl bg-muted/50 p-3">
                <span className="text-muted-foreground">上课时间</span>
                <span className="font-semibold text-foreground tnum">
                  {course.entry.day} {course.entry.section}
                </span>
              </div>

              {course.item.room && (
                <div className="flex items-center justify-between rounded-xl bg-muted/50 p-3">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <MapPin className="size-4 text-primary" />
                    教室地点
                  </span>
                  <span className="font-semibold text-foreground">{course.item.room}</span>
                </div>
              )}

              {course.item.teacher && (
                <div className="flex items-center justify-between rounded-xl bg-muted/50 p-3">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <User className="size-4 text-primary" />
                    任课教师
                  </span>
                  <span className="font-semibold text-foreground">{course.item.teacher}</span>
                </div>
              )}

              {course.item.weeks && (
                <div className="flex items-center justify-between rounded-xl bg-muted/50 p-3">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Clock className="size-4 text-primary" />
                    上课周次
                  </span>
                  <span className="font-semibold text-foreground tnum">{course.item.weeks}</span>
                </div>
              )}

              {course.item.rawText && (
                <div className="mt-1 rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">原始排课信息：</span>
                  <p className="mt-1 leading-relaxed">{course.item.rawText}</p>
                </div>
              )}
            </div>

            <DialogFooter className="mt-5 sm:justify-end">
              <Button onClick={onClose} className="rounded-full px-6">
                关闭
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
