import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/auth-context';

/** 登录页：不套 AppLayout；已登录时直接回到来源页 */
export default function LoginPage() {
  const { status, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || '/';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (status === 'authed') {
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setError('');
    if (!username.trim() || !password) {
      setError('请输入学号和密码');
      return;
    }
    setSubmitting(true);
    try {
      await login(username, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError((err as Error).message || '登录失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex h-svh w-full items-center justify-center overflow-hidden p-4">
      {/* 背景壁纸 + 压暗遮罩，保证前景文字可读 */}
      <div aria-hidden className="absolute inset-0">
        <img src="/login-bg.jpg" alt="" draggable={false} className="size-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/25 to-black/45" />
      </div>
      <div className="relative w-full max-w-sm">
        {/* 品牌区 */}
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg">
            <svg viewBox="0 0 32 32" className="size-7 fill-current" role="img" aria-label="edu-agent 标志">
              <path d="M16 6 4 12l12 6 9-4.5V20h2v-8.5L16 6Zm-7 9.2L5 16l4 2 4-2-4-1.8Zm14 0L19 16l4 2 4-2-4-1.8ZM16 19l-4 2 4 2 4-2-4-2Z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white drop-shadow-sm">edu-agent</h1>
          <p className="text-sm text-white/80">教务数据智能助手</p>
        </div>

        <Card className="border-white/10 bg-card/70 py-6 shadow-xl backdrop-blur-md">
          <CardHeader className="px-6">
            <CardTitle className="text-lg">登录</CardTitle>
            <CardDescription>使用学校统一身份认证账号</CardDescription>
          </CardHeader>
          <CardContent className="px-6">
            <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
              <Field>
                <FieldLabel htmlFor="login-username">学号</FieldLabel>
                <Input
                  id="login-username"
                  className="h-9"
                  autoComplete="username"
                  inputMode="numeric"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={submitting}
                  autoFocus
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="login-password">密码</FieldLabel>
                <div className="relative">
                  <Input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={submitting}
                    className="h-9 pr-10"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                    aria-label={showPassword ? '隐藏密码' : '显示密码'}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </Field>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle aria-hidden />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button
                type="submit"
                size="lg"
                className="w-full shadow-lg shadow-primary/40 hover:shadow-primary/30"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 data-icon="inline-start" className="animate-spin" />
                    登录中…
                  </>
                ) : (
                  '登录'
                )}
              </Button>
            </form>

            <p className="mt-5 text-center text-xs text-muted-foreground">本机不保存密码</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
