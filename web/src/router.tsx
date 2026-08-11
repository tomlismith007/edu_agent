import { createBrowserRouter, Navigate } from 'react-router-dom';
import AppLayout from '@/layouts/AppLayout';
import { RequireAuth } from '@/components/RequireAuth';
import LoginPage from '@/pages/Login';
import ScoresPage from '@/pages/Scores';
import TimetablePage from '@/pages/Timetable';
import TeacherTimetablePage from '@/pages/TeacherTimetable';
import CalendarPage from '@/pages/Calendar';
import GraduationPage from '@/pages/Graduation';
import CreditsPage from '@/pages/Credits';
import AssistantPage from '@/pages/Assistant';
import SettingsPage from '@/pages/Settings';

export const router = createBrowserRouter([
  // 登录页独立于主布局（无侧边栏/头部）
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/scores" replace /> },
      { path: 'scores', element: <ScoresPage /> },
      { path: 'timetable', element: <TimetablePage /> },
      { path: 'teacher', element: <TeacherTimetablePage /> },
      { path: 'calendar', element: <CalendarPage /> },
      { path: 'graduation', element: <GraduationPage /> },
      { path: 'credits', element: <CreditsPage /> },
      { path: 'assistant', element: <AssistantPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <Navigate to="/scores" replace /> },
    ],
  },
]);
