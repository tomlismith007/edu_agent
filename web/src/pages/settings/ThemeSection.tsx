import { useTheme } from 'next-themes';
import { Monitor, Moon, Sun } from 'lucide-react';
import { Panel } from '@/components/dashboard';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

export type Theme = 'light' | 'dark' | 'system';

export function ThemeSection() {
  const { theme, setTheme } = useTheme();
  const themes = [
    { value: 'light', label: '浅色', icon: Sun },
    { value: 'dark', label: '深色', icon: Moon },
    { value: 'system', label: '跟随系统', icon: Monitor },
  ] as const;

  return (
    <Panel title="外观">
      <FieldGroup>
        <Field>
          <FieldLabel>主题模式</FieldLabel>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            className="justify-start"
            value={theme}
            onValueChange={(v) => v && setTheme(v as Theme)}
          >
            {themes.map((t) => (
              <ToggleGroupItem key={t.value} value={t.value} aria-label={t.label}>
                <t.icon data-icon="inline-start" />
                {t.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
      </FieldGroup>
    </Panel>
  );
}
