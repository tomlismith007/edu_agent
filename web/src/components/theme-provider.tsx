import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ReactNode } from 'react';

/** 主题 Provider：基于 next-themes，class 策略以匹配 index.css 的 .dark 变量。 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
