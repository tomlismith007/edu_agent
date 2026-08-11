import { useState } from 'react';
import { useFetch } from '@/hooks/use-fetch';
import { useTerms } from '@/hooks/use-terms';
import { useApp } from '@/contexts/app-context';
import { DataTable } from '@/components/DataTable';
import {
  Panel,
  CacheBar,
  ViewSkeleton,
  ErrorAlert,
} from '@/components/dashboard';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { DEPT_OPTIONS, TITLE_OPTIONS, DEFAULT_CURRENT_TERM } from '@/lib/dashboard-constants';
import type { TeacherTimetable } from '@/types/dashboard';

export default function TeacherTimetablePage() {
  const terms = useTerms();
  const { deptMap } = useApp();
  // 服务端 deptMap 为空时回退到本地 DEPT_OPTIONS
  const deptOptions = deptMap.length > 0 ? deptMap : DEPT_OPTIONS;

  const [term, setTerm] = useState(DEFAULT_CURRENT_TERM);
  const [dept, setDept] = useState(deptOptions[0]?.[0] ?? '00005');
  const [jszc, setJszc] = useState('');
  const [name, setName] = useState('');
  const { result, error, loading, refreshing, refresh } = useFetch<TeacherTimetable[]>(
    'teacher',
    { term, dept, name, jszc },
  );
  if (loading && !result) return <ViewSkeleton rows={8} />;
  const teachers = result?.data ?? [];
  const rows: (string | number)[][] = [];
  for (const t of teachers) {
    for (const cell of t.cells) {
      for (const c of cell.courses) {
        rows.push([t.name, cell.day, cell.jc, c.course, c.klass, c.weeks, c.room]);
      }
    }
  }
  return (
    <div className="flex flex-col gap-4">
      <Panel title="检索条件">
        <FieldGroup className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field>
            <FieldLabel htmlFor="tc-term">学期</FieldLabel>
            <Select id="tc-term" value={term} onChange={(e) => setTerm(e.target.value)}>
              {terms.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="tc-dept">学院 / 部门</FieldLabel>
            <Select id="tc-dept" value={dept} onChange={(e) => setDept(e.target.value)}>
              {deptOptions.map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="tc-jszc">职称分类</FieldLabel>
            <Select id="tc-jszc" value={jszc} onChange={(e) => setJszc(e.target.value)}>
              {TITLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="tc-name">教师姓名 (可选)</FieldLabel>
            <Input
              id="tc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="搜索教师姓名"
            />
          </Field>
        </FieldGroup>
      </Panel>
      <Panel title="教师课表" description={`已查询到 ${teachers.length} 位教师课表`}>
        <DataTable
          headers={['教师', '星期', '节次', '课程', '班级', '周次', '教室']}
          rows={rows}
          empty="未找到符合条件的教师课表"
        />
      </Panel>
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
