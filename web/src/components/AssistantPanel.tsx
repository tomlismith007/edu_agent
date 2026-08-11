import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { chatStream, type ChatMsg } from '@/api/client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Check,
  Loader2,
  Send,
  Sparkles,
  Square,
  Trash2,
  X,
} from 'lucide-react';

interface ToolActivity {
  id: number;
  name: string;
  input: unknown;
  status: 'running' | 'done' | 'error';
  output?: unknown;
}

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  activities?: ToolActivity[];
  streaming?: boolean;
}

const TOOL_LABEL: Record<string, string> = {
  get_user_info: '查询用户信息',
  get_scores: '查询成绩',
  get_timetable: '查询课表',
  get_teacher_timetable: '查询教师课表',
  get_calendar: '查询教学周历',
  get_graduation_progress: '查询毕业进度',
  get_credits: '查询学分',
  search_school_knowledge: '检索校内知识库',
};

const SAMPLE_QUESTIONS = [
  '我这学期的成绩怎么样？加权平均分多少？',
  '今天第几周？学期还剩几周？',
  '我还差哪些必修课？',
  '我这个学期有什么课？',
  '我还差多少学分毕业？',
];

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1" role="status" aria-label="正在思考">
      {[0, 1, 2].map((i) => (
        <span key={i} className="typing-dot" style={{ animationDelay: `${i * 0.16}s` }} />
      ))}
    </span>
  );
}

export function AssistantPanel({
  onClose,
  showCloseButton = false,
}: {
  onClose?: () => void;
  showCloseButton?: boolean;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const handleStop = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      setBusy(false);
      setMessages((prev) => {
        if (!prev.length) return prev;
        const last = prev[prev.length - 1];
        if (last.role === 'assistant' && last.streaming) {
          return [
            ...prev.slice(0, -1),
            { ...last, streaming: false, content: last.content || '（已取消生成）' },
          ];
        }
        return prev;
      });
    }
  };

  const clearHistory = () => {
    handleStop();
    setMessages([]);
  };

  const sendText = async (textToSend: string) => {
    const text = textToSend.trim();
    if (!text || busy) return;
    setInput('');

    const history: ChatMsg[] = messages
      .filter((m) => m.content.trim().length > 0)
      .map((m) => ({ role: m.role, content: m.content }));
    history.push({ role: 'user', content: text });

    setMessages((prev) => [
      ...prev,
      { role: 'user', content: text },
      { role: 'assistant', content: '', activities: [], streaming: true },
    ]);
    setBusy(true);

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const patch = (fn: (m: Msg) => Msg) => {
      setMessages((prev) => {
        if (!prev.length) return prev;
        const next = [...prev];
        const last = next[next.length - 1];
        next[next.length - 1] = fn(last);
        return next;
      });
    };

    const addActivity = (
      id: number,
      name: string,
      input: unknown,
      status: ToolActivity['status'],
      output?: unknown,
    ) => {
      patch((m) => ({
        ...m,
        activities: [...(m.activities ?? []), { id, name, input, status, output }],
      }));
    };

    try {
      await chatStream(
        history,
        {
          onToken: (t) => patch((m) => ({ ...m, content: m.content + t })),
          onToolStart: (id, name, input) => addActivity(id, name, input, 'running'),
          onToolEnd: (id, _name, output, status) => {
            patch((m) => {
              const acts = m.activities ?? [];
              return {
                ...m,
                activities: acts.map((a) =>
                  a.id === id
                    ? { ...a, status: status === 'error' ? ('error' as const) : ('done' as const), output }
                    : a,
                ),
              };
            });
          },
          onDone: (full) => patch((m) => ({ ...m, content: full, streaming: false })),
          onError: (msg) =>
            patch((m) => ({
              ...m,
              streaming: false,
              content: m.content || `⚠️ ${msg}`,
            })),
        },
        ac.signal,
      );
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        patch((m) => ({
          ...m,
          streaming: false,
          content: m.content || `⚠️ ${(e as Error).message}`,
        }));
      }
    } finally {
      if (!ac.signal.aborted) setBusy(false);
    }
  };

  const send = () => sendText(input);

  return (
    <div className="flex h-full w-full min-h-0 flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm">
      {/* 顶栏 Header */}
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-3 bg-muted/30">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="size-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold leading-none text-foreground">教务 AI 助手</h2>
            <p className="mt-1 text-[11px] text-muted-foreground">实时查成绩·课表·学分</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-foreground"
              title="清空对话历史"
              onClick={clearHistory}
            >
              <Trash2 className="size-4" />
            </Button>
          )}
          {showCloseButton && onClose && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-foreground"
              onClick={onClose}
            >
              <X className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {/* 消息滚动区 Container */}
      <div ref={scrollAreaRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain chat-scroll-area p-4">
        <div className="flex flex-col gap-4">
          {messages.length === 0 && (
            <div className="flex flex-col gap-3 rounded-xl border border-dashed bg-muted/20 p-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-2 font-semibold text-foreground">
                <Sparkles className="size-4 text-primary" />
                <span>你可以这样问我：</span>
              </div>
              <div className="flex flex-col gap-2 pt-1">
                {SAMPLE_QUESTIONS.map((q, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="flex w-full items-center justify-between rounded-xl border bg-background px-3 py-2.5 text-left text-xs text-foreground shadow-2xs transition-all hover:border-primary/50 hover:bg-primary/5 active:scale-[0.99]"
                    onClick={() => sendText(q)}
                  >
                    <span>{q}</span>
                    <Send className="size-3 shrink-0 text-muted-foreground opacity-50" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={cn('flex gap-2.5', m.role === 'user' && 'flex-row-reverse')}>
              <Avatar className="size-7 shrink-0">
                <AvatarFallback
                  className={cn(
                    'text-xs font-semibold',
                    m.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground border',
                  )}
                >
                  {m.role === 'user' ? '我' : 'AI'}
                </AvatarFallback>
              </Avatar>

              <div
                className={cn(
                  'bubble max-w-[88%] rounded-2xl px-3.5 py-3 text-xs md:text-sm leading-relaxed shadow-2xs',
                  m.role === 'user'
                    ? 'rounded-tr-xs bg-primary text-primary-foreground'
                    : 'rounded-tl-xs border bg-card text-foreground',
                )}
              >
                {m.activities && m.activities.length > 0 && (
                  <div className="mb-2.5 flex flex-col gap-1.5">
                    {m.activities.map((a) => (
                      <div
                        key={a.id}
                        className={cn(
                          'flex items-center gap-2 rounded-lg border-l-2 bg-muted/60 px-2.5 py-1.5 text-xs text-muted-foreground',
                          a.status === 'running' && 'border-l-primary',
                          a.status === 'done' && 'border-l-success',
                          a.status === 'error' && 'border-l-destructive',
                        )}
                      >
                        <span className="inline-flex size-3.5 shrink-0 items-center justify-center">
                          {a.status === 'running' ? (
                            <Loader2 className="animate-spin text-primary size-3.5" />
                          ) : a.status === 'done' ? (
                            <Check className="text-success size-3.5" />
                          ) : (
                            <X className="text-destructive size-3.5" />
                          )}
                        </span>
                        <span className="font-medium text-foreground">
                          {TOOL_LABEL[a.name] ?? a.name}
                        </span>
                        {a.status === 'done' && (
                          <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0">
                            已就绪
                          </Badge>
                        )}
                        {a.status === 'error' && (
                          <Badge variant="destructive" className="ml-auto text-[10px] px-1.5 py-0">
                            失败
                          </Badge>
                        )}
                        {a.status === 'error' && typeof a.output === 'string' && (
                          <span className="basis-full truncate text-[11px] text-destructive">
                            {a.output.replace(/^Error:\s*/i, '')}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {m.content ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                ) : (
                  m.streaming && (
                    <div className="flex items-center gap-2 py-1 text-muted-foreground" aria-live="polite">
                      <TypingDots />
                      <span className="text-xs">正在查询教务数据…</span>
                    </div>
                  )
                )}
                {m.streaming && m.content && <span className="cursor">▋</span>}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* 底部 Input Footer */}
      <div className="shrink-0 border-t p-3 bg-muted/20">
        <div className="flex items-end gap-2 rounded-xl border bg-background p-1.5 pl-3 shadow-2xs focus-within:ring-2 focus-within:ring-primary/40">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="输入教务问题（按 Enter 发送）…"
            rows={1}
            className="min-h-[38px] max-h-28 flex-1 resize-none border-0 bg-transparent py-1.5 text-xs md:text-sm shadow-none focus-visible:ring-0 focus-visible:outline-none"
          />
          {busy ? (
            <Button
              size="icon"
              variant="destructive"
              className="size-9 shrink-0 rounded-xl"
              onClick={handleStop}
              title="停止生成"
            >
              <Square className="size-4 fill-current" />
            </Button>
          ) : (
            <Button
              size="icon"
              className="size-9 shrink-0 rounded-xl"
              onClick={send}
              disabled={!input.trim()}
            >
              <Send className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
