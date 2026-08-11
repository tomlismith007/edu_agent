import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTheme } from 'next-themes';
import {
  BookOpen,
  CalendarDays,
  CircleCheck,
  ClipboardList,
  GraduationCap,
  LogOut,
  Moon,
  PanelRightClose,
  PanelRightOpen,
  ScrollText,
  Settings as SettingsIcon,
  Sparkles,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
  SidebarRail,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useApp } from '@/contexts/app-context';
import { useAuth } from '@/contexts/auth-context';
import { AssistantPanel } from '@/components/AssistantPanel';

interface NavGroup {
  label: string;
  items: {
    title: string;
    to: string;
    icon: LucideIcon;
  }[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: '学业管理',
    items: [
      { title: '成绩明细', to: '/scores', icon: BookOpen },
      { title: '毕业进度', to: '/graduation', icon: GraduationCap },
      { title: '学分概况', to: '/credits', icon: CircleCheck },
    ],
  },
  {
    label: '课程安排',
    items: [
      { title: '我的课表', to: '/timetable', icon: CalendarDays },
      { title: '教师课表', to: '/teacher', icon: ClipboardList },
      { title: '教学周历', to: '/calendar', icon: ScrollText },
    ],
  },
  {
    label: '系统管理',
    items: [{ title: '系统设置', to: '/settings', icon: SettingsIcon }],
  },
];

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8 rounded-full"
      title="切换主题"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
    >
      <Sun className="size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">切换主题</span>
    </Button>
  );
}

function PageTitle({ pathname }: { pathname: string }) {
  const allItems = NAV_GROUPS.flatMap((g) => g.items);
  const current = allItems.find((item) => pathname.startsWith(item.to));
  return (
    <h1 className="text-sm font-semibold text-foreground">
      {current?.title ?? '教务数据助手'}
    </h1>
  );
}

export default function AppLayout() {
  const location = useLocation();
  const { user, metaError } = useApp();
  const { logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const [showAiDesktop, setShowAiDesktop] = useState(true);
  const [mobileAiOpen, setMobileAiOpen] = useState(false);
  // /assistant 路由已有全宽聊天面板，隐藏 aside 与头部入口，避免两个聊天 UI 并存
  const isAssistantRoute = location.pathname.startsWith('/assistant');

  return (
    <SidebarProvider>
      {/* 专用的 shadcn/ui Sidebar (variant="inset") */}
      <Sidebar variant="inset" collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild tooltip="edu-agent 教务数据智能助手">
                <a href="#main" onClick={(e) => e.preventDefault()} className="flex items-center gap-2">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-2xs">
                    <svg viewBox="0 0 32 32" className="size-5 shrink-0 fill-current" role="img" aria-label="edu-agent 标志">
                      <path d="M16 6 4 12l12 6 9-4.5V20h2v-8.5L16 6Zm-7 9.2L5 16l4 2 4-2-4-1.8Zm14 0L19 16l4 2 4-2-4-1.8ZM16 19l-4 2 4 2 4-2-4-2Z" />
                    </svg>
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-bold">edu-agent</span>
                      <Badge variant="outline" className="px-1 py-0 text-[9px] font-normal">v0.1</Badge>
                    </div>
                    <span className="truncate text-xs text-muted-foreground">教务数据智能助手</span>
                  </div>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          {NAV_GROUPS.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarMenu>
                {group.items.map((item) => {
                  const isActive = location.pathname.startsWith(item.to);
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={item.title}
                      >
                        <NavLink to={item.to}>
                          <Icon />
                          <span>{item.title}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroup>
          ))}
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    size="lg"
                    tooltip={user?.name ? `${user.name} (${user.studentId ?? '已连接'})` : '教务账号'}
                  >
                    <div className="relative flex shrink-0">
                      <Avatar className="size-8 rounded-lg shrink-0">
                        <AvatarFallback className="rounded-lg bg-primary text-primary-foreground font-bold text-xs">
                          {user?.name ? user.name.slice(0, 1) : '准'}
                        </AvatarFallback>
                      </Avatar>
                      {user && (
                        <span
                          className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full bg-success ring-2 ring-sidebar shrink-0"
                          title="在教务系统在线"
                        />
                      )}
                    </div>
                    <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                      <span className="truncate font-semibold">{user?.name ?? '教务账号'}</span>
                      <span className="truncate text-xs text-muted-foreground tnum">
                        {user?.studentId ?? (metaError ? '连接异常' : '就绪')}
                      </span>
                    </div>
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" className="w-56">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-semibold">{user?.name ?? '教务账号'}</span>
                      <span className="text-xs text-muted-foreground tnum">{user?.studentId ?? '—'}</span>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    disabled={loggingOut}
                    onClick={() => {
                      setLoggingOut(true);
                      logout().finally(() => setLoggingOut(false));
                    }}
                  >
                    <LogOut />
                    退出登录
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>

      {/* shadcn SidebarInset Main Shell */}
      <SidebarInset className="h-[calc(100svh-theme(spacing.4))] max-h-[calc(100svh-theme(spacing.4))] overflow-hidden">
        {/* 顶部 Header */}
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <PageTitle pathname={location.pathname} />
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />

            {/* 桌面端 AI Copilot 展开/折叠按钮（/assistant 路由下隐藏） */}
            {!isAssistantRoute && (
              <Button
                variant={showAiDesktop ? 'default' : 'outline'}
                size="sm"
                className="hidden lg:flex items-center gap-1.5 rounded-full px-3 text-xs font-medium"
                onClick={() => setShowAiDesktop(!showAiDesktop)}
              >
                <Sparkles data-icon="inline-start" />
                <span>AI 助手</span>
                {showAiDesktop ? (
                  <PanelRightClose data-icon="inline-end" />
                ) : (
                  <PanelRightOpen data-icon="inline-end" />
                )}
              </Button>
            )}

            {/* 移动端 AI Copilot 触发按钮（/assistant 路由下隐藏） */}
            {!isAssistantRoute && (
              <Button
                variant="default"
                size="sm"
                className="flex lg:hidden items-center gap-1 rounded-full px-3 text-xs"
                onClick={() => setMobileAiOpen(true)}
              >
                <Sparkles data-icon="inline-start" />
                <span>AI 助手</span>
              </Button>
            )}
          </div>
        </header>

        {/* 页面区域：数据 View + 右侧 AI Copilot */}
        <div className="flex flex-1 min-h-0 w-full overflow-hidden p-3 md:p-4 gap-4">
          <main id="main" className="flex-1 min-w-0 overflow-y-auto overscroll-contain">
            <Outlet />
          </main>

          {!isAssistantRoute && showAiDesktop && (
            <aside className="hidden lg:flex w-[380px] xl:w-[430px] shrink-0 h-full min-h-0 flex-col overflow-hidden">
              <AssistantPanel />
            </aside>
          )}
        </div>

        {/* 移动端 AI 助手 Sheet 抽屉 */}
        <Sheet open={mobileAiOpen} onOpenChange={setMobileAiOpen}>
          <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col h-full">
            <SheetHeader className="sr-only">
              <SheetTitle>AI 助手</SheetTitle>
            </SheetHeader>
            <div className="h-full w-full">
              <AssistantPanel onClose={() => setMobileAiOpen(false)} showCloseButton />
            </div>
          </SheetContent>
        </Sheet>
      </SidebarInset>
    </SidebarProvider>
  );
}
