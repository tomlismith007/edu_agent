import { useEffect, useState } from 'react';
import {
  Check,
  Eye,
  EyeOff,
  PlugZap,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  createLlmProvider,
  deleteLlmProvider,
  getLlmSettings,
  setActiveLlmProvider,
  testLlmSettings,
  updateLlmProvider,
  type LlmProviderView,
  type LlmSettingsView,
} from '@/api/client';
import { Panel } from '@/components/dashboard';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

interface LlmForm {
  name: string;
  baseUrl: string;
  model: string;
  apiKey: string;
}

const PROVIDER_PRESETS: { label: string; value: string; name: string; baseUrl: string; model: string }[] = [
  {
    label: 'DeepSeek 官方',
    value: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
  },
  {
    label: 'SiliconFlow (硅基流动)',
    value: 'siliconflow',
    name: 'SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'deepseek-ai/DeepSeek-V3',
  },
  {
    label: '阿里百炼 (DashScope)',
    value: 'bailian',
    name: '百炼',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
  },
  {
    label: '火山引擎 (Ark)',
    value: 'volcengine',
    name: '火山引擎',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    model: 'ep-xxxxxxxx',
  },
  {
    label: '自定义 OpenAI 兼容接口',
    value: 'custom',
    name: '',
    baseUrl: '',
    model: '',
  },
];

const EMPTY_LLM_FORM: LlmForm = { name: '', baseUrl: '', model: '', apiKey: '' };
type LlmSelection = string | 'new';

export function LlmSection() {
  const [llmView, setLlmView] = useState<LlmSettingsView | null>(null);
  const [llmSelection, setLlmSelection] = useState<LlmSelection>('new');
  const [llmForm, setLlmForm] = useState<LlmForm>(EMPTY_LLM_FORM);
  const [llmPreset, setLlmPreset] = useState('');
  const [llmLoading, setLlmLoading] = useState(true);
  const [llmSaving, setLlmSaving] = useState(false);
  const [llmTesting, setLlmTesting] = useState(false);
  const [llmDeleting, setLlmDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LlmProviderView | null>(null);
  const [showKey, setShowKey] = useState(false);

  const applyLlmView = (v: LlmSettingsView) => {
    setLlmView(v);
    setLlmSelection((cur) => (cur === 'new' || v.providers.some((p) => p.id === cur) ? cur : 'new'));
  };

  const fillFormFromProvider = (p?: LlmProviderView) => {
    setShowKey(false);
    if (p) {
      setLlmForm({ name: p.name, baseUrl: p.baseUrl, model: p.model, apiKey: '' });
      setLlmPreset(PROVIDER_PRESETS.find((x) => x.name === p.name)?.value ?? '');
    } else {
      setLlmForm(EMPTY_LLM_FORM);
      setLlmPreset('');
    }
  };

  const chooseLlm = (key: LlmSelection) => {
    setLlmSelection(key);
    fillFormFromProvider(key !== 'new' ? llmView?.providers.find((x) => x.id === key) : undefined);
  };

  const loadLlm = () => {
    setLlmLoading(true);
    getLlmSettings()
      .then((r) => applyLlmView(r))
      .catch(() => setLlmView(null))
      .finally(() => setLlmLoading(false));
  };

  useEffect(() => {
    loadLlm();
  }, []);

  const applyPreset = (value: string) => {
    setLlmPreset(value);
    const p = PROVIDER_PRESETS.find((x) => x.value === value);
    if (!p || p.value === 'custom') return;
    setLlmForm((f) => ({ ...f, name: p.name, baseUrl: p.baseUrl, model: p.model }));
  };

  const editingProvider =
    llmSelection !== 'new' ? llmView?.providers.find((p) => p.id === llmSelection) : undefined;
  const activeProvider = llmView?.providers.find((p) => p.id === llmView.activeId);

  const handleLlmSave = async () => {
    setLlmSaving(true);
    try {
      if (editingProvider) {
        const r = await updateLlmProvider(editingProvider.id, llmForm);
        applyLlmView(r);
        toast.success('供应商配置已保存');
      } else {
        const r = await createLlmProvider(llmForm);
        applyLlmView(r);
        const added = r.providers[r.providers.length - 1];
        setLlmSelection(added ? added.id : 'new');
        fillFormFromProvider(added);
        toast.success(`已添加供应商「${added?.name ?? ''}」`);
      }
    } catch (e) {
      toast.error(`保存失败: ${(e as Error).message}`);
    } finally {
      setLlmSaving(false);
    }
  };

  const handleActivate = async () => {
    if (!editingProvider) return;
    setLlmSaving(true);
    try {
      const r = await setActiveLlmProvider(editingProvider.id);
      applyLlmView(r);
      toast.success(`已切换使用「${editingProvider.name}」`);
    } catch (e) {
      toast.error(`切换失败: ${(e as Error).message}`);
    } finally {
      setLlmSaving(false);
    }
  };

  const handleLlmTest = async () => {
    setLlmTesting(true);
    try {
      const input = { ...llmForm, ...(editingProvider ? { providerId: editingProvider.id } : {}) };
      const r = await testLlmSettings(input);
      toast.success(`连接成功（${r.latencyMs ?? '—'} ms）${r.reply ? `：${r.reply}` : ''}`);
    } catch (e) {
      toast.error(`连接失败: ${(e as Error).message}`);
    } finally {
      setLlmTesting(false);
    }
  };

  const handleLlmDelete = async () => {
    const target = deleteTarget;
    if (!target) return;
    setLlmDeleting(true);
    try {
      const r = await deleteLlmProvider(target.id);
      applyLlmView(r);
      toast.success(`已删除「${target.name}」`);
    } catch (e) {
      toast.error(`删除失败: ${(e as Error).message}`);
    } finally {
      setLlmDeleting(false);
      setDeleteTarget(null);
    }
  };

  const keyPlaceholder = editingProvider?.apiKeyMasked
    ? `已保存 ${editingProvider.apiKeyMasked}，留空则不修改`
    : '必填，仅保存在服务端';

  const listEntryCls = (selected: boolean) =>
    cn(
      'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-accent',
      selected && 'bg-accent',
    );

  return (
    <>
      <Panel
        title="模型服务"
        description={
          activeProvider
            ? `当前使用：${activeProvider.name} · ${activeProvider.model}`
            : '未配置：请添加并启用供应商（OpenAI 兼容接口）'
        }
      >
        {llmLoading ? (
          <div className="flex justify-center py-6">
            <Spinner className="text-muted-foreground" />
          </div>
        ) : !llmView ? (
          <div className="flex items-center justify-between rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            配置加载失败
            <Button variant="outline" size="sm" onClick={loadLlm}>
              <RefreshCw data-icon="inline-start" />
              重试
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-[200px_minmax(0,1fr)] md:items-start">
            {/* 左：供应商列表 */}
            <div className="flex flex-col gap-1 md:border-r md:pr-4">
              {llmView.providers.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => chooseLlm(p.id)}
                  className={listEntryCls(llmSelection === p.id)}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{p.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{p.model}</span>
                  </span>
                  {p.id === llmView.activeId && (
                    <Badge variant="success" className="shrink-0">
                      使用中
                    </Badge>
                  )}
                </button>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="mt-1 justify-start"
                onClick={() => chooseLlm('new')}
              >
                <Plus data-icon="inline-start" />
                添加供应商
              </Button>
            </div>

            {/* 右：详情 / 编辑表单 */}
            <div className="flex min-w-0 flex-col gap-4">
              <FieldGroup>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="llm-preset">供应商预设</FieldLabel>
                    <Select
                      id="llm-preset"
                      value={llmPreset}
                      onChange={(e) => applyPreset(e.target.value)}
                    >
                      <option value="">不使用预设</option>
                      {PROVIDER_PRESETS.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="llm-name">供应商名称</FieldLabel>
                    <Input
                      id="llm-name"
                      placeholder="如 DeepSeek"
                      value={llmForm.name}
                      onChange={(e) => setLlmForm((f) => ({ ...f, name: e.target.value }))}
                    />
                  </Field>
                </div>

                <Field>
                  <FieldLabel htmlFor="llm-baseurl">Base URL（OpenAI 兼容）</FieldLabel>
                  <Input
                    id="llm-baseurl"
                    type="url"
                    placeholder="https://api.deepseek.com/v1"
                    value={llmForm.baseUrl}
                    onChange={(e) => setLlmForm((f) => ({ ...f, baseUrl: e.target.value }))}
                  />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="llm-model">模型名称</FieldLabel>
                    <Input
                      id="llm-model"
                      placeholder="如 deepseek-chat"
                      value={llmForm.model}
                      onChange={(e) => setLlmForm((f) => ({ ...f, model: e.target.value }))}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="llm-apikey">API Key</FieldLabel>
                    <InputGroup>
                      <InputGroupInput
                        id="llm-apikey"
                        type={showKey ? 'text' : 'password'}
                        placeholder={keyPlaceholder}
                        autoComplete="off"
                        value={llmForm.apiKey}
                        onChange={(e) => setLlmForm((f) => ({ ...f, apiKey: e.target.value }))}
                      />
                      <InputGroupAddon align="inline-end">
                        <InputGroupButton
                          size="icon-xs"
                          variant="ghost"
                          onClick={() => setShowKey((s) => !s)}
                          aria-label={showKey ? '隐藏 API Key' : '显示 API Key'}
                        >
                          {showKey ? <EyeOff /> : <Eye />}
                        </InputGroupButton>
                      </InputGroupAddon>
                    </InputGroup>
                  </Field>
                </div>
              </FieldGroup>

              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={handleLlmSave} disabled={llmSaving || llmTesting}>
                  {llmSaving ? (
                    <Spinner data-icon="inline-start" />
                  ) : editingProvider ? (
                    <Save data-icon="inline-start" />
                  ) : (
                    <Plus data-icon="inline-start" />
                  )}
                  {editingProvider ? '保存修改' : '添加'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleLlmTest}
                  disabled={llmTesting || llmSaving}
                >
                  {llmTesting ? <Spinner data-icon="inline-start" /> : <PlugZap data-icon="inline-start" />}
                  测试连接
                </Button>
                {editingProvider && editingProvider.id !== llmView.activeId && (
                  <Button size="sm" variant="outline" onClick={handleActivate} disabled={llmSaving}>
                    <Check data-icon="inline-start" />
                    设为使用中
                  </Button>
                )}
                {editingProvider && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setDeleteTarget(editingProvider)}
                    disabled={llmDeleting}
                  >
                    <Trash2 data-icon="inline-start" />
                    删除
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </Panel>

      {/* 删除供应商确认 */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除供应商「{deleteTarget?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>
              将删除该供应商的配置及已保存的 API Key，此操作不可撤销。
              {deleteTarget?.id === llmView?.activeId
                ? ' 删除后模型服务将处于未配置状态，AI 助手将不可用。'
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={llmDeleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: 'destructive' })}
              disabled={llmDeleting}
              onClick={handleLlmDelete}
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
