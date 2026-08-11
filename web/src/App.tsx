import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { ThemeProvider } from '@/components/theme-provider';
import { AuthProvider } from '@/contexts/auth-context';
import { AppProvider } from '@/contexts/app-context';
import { Toaster } from '@/components/ui/sonner';

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppProvider>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:rounded-full focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
        >
          跳到主内容
        </a>
        <RouterProvider router={router} />
        <Toaster richColors position="top-center" />
      </AppProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
