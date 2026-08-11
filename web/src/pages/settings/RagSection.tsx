import { useEffect, useState } from 'react';
import { Database, Eye, EyeOff, PlugZap, RefreshCw, Save } from 'lucide-react';
import { toast } from 'sonner';
import {
  getEmbeddingConfig,
  getRagStatus,
  getRerankConfig,
  reindexRag,
  testEmbeddingConfig,
  updateEmbeddingConfig,
  updateRerankConfig,
} from '@/api/client';
import { Panel } from '@/components/dashboard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';

interface EmbeddingView {
  configured: boolean;
  name: string;
  baseUrl: string;
  model: string;
  apiKeyMasked: string;
  dim: number;
}

interface RagStatus {
  ok: boolean;
  chroma: 'ok' | 'unreachable';
  chromaUrl?: string;
  chromaError?: string;
  embeddingConfigured: boolean;
  embeddingModel?: string;
  chunks: number;
  collectionCount?: number | null;
  collection?: string;
  indexedAt?: string;
  stale: boolean;
  staleReason?: string;
  docs: { id: string; title: string; chunks: number; sections: number }[];
}

export function RagSection() {
  const [embView, setEmbView] = useState<EmbeddingView | null>(null);
  const [embForm, setEmbForm] = useState({ name: '', baseUrl: '', model: '', apiKey: '' });
  const [embLoading, setEmbLoading] = useState(true);
  const [embSaving, setEmbSaving] = useState(false);
  const [embTesting, setEmbTesting] = useState(false);
  const [showKey, setShowKey] = useState(false);

  const [rrForm, setRrForm] = useState({ baseUrl: '', model: '', apiKey: '' });
  const [rrSaving, setRrSaving] = useState(false);

  const [rag, setRag] = useState<RagStatus | null>(null);
  const [rebuilding, setRebuilding] = useState(false);

  const loadEmbedding = () => {
    setEmbLoading(true);
    Promise.all([getEmbeddingConfig(), getRerankConfig()])
      .then(([emb, rr]) => {
        setEmbView({
          configured: emb.configured ?? false,
          name: emb.name ?? '',
          baseUrl: emb.baseUrl ?? '',
          model: emb.model ?? '',
          apiKeyMasked: emb.apiKeyMasked ?? '',
          dim: emb.dim ?? 1024,
        });
        setEmbForm((f) => ({
          ...f,
          name: emb.name || '',
          baseUrl: emb.baseUrl || '',
          model: emb.model || '',
        }));
        setRrForm((f) => ({ ...f, baseUrl: rr.baseUrl || '', model: rr.model || '' }));
      })
      .catch(() => setEmbView(null))
      .finally(() => setEmbLoading(false));
  };

  const loadRag = () => {
    getRagStatus()
      .then((r) => setRag(r as unknown as RagStatus))
      .catch(() => setRag(null));
  };

  useEffect(() => {
    loadEmbedding();
    loadRag();
  }, []);

  const handleEmbSave = async () => {
    setEmbSaving(true);
    try {
      const r = await updateEmbeddingConfig(embForm);
      setEmbView((v) =>
        v
          ? {
              ...v,
              configured: true,
              name: r.name,
              baseUrl: r.baseUrl,
              model: r.model,
              apiKeyMasked: r.apiKeyMasked,
            }
          : v,
      );
      toast.success('向量模型已保存，知识库索引需重建后生效');
      loadRag();
    } catch (e) {
      toast.error(`保存失败: ${(e as Error).message}`);
    } finally {
      setEmbSaving(false);
    }
  };

  const handleEmbTest = async () => {
    setEmbTesting(true);
    try {
      const r = await testEmbeddingConfig(embForm);
      toast.success(`连接成功（${r.latencyMs ?? '—'} ms），维度 ${r.dimension} ✓`);
    } catch (e) {
      toast.error(`连接失败: ${(e as Error).message}`);
    } finally {
      setEmbTesting(false);
    }
  };

  const handleRerankSave = async () => {
    setRrSaving(true);
    try {
      await updateRerankConfig(rrForm);
      toast.success('重排模型已保存（留空 baseUrl 即不启用重排）');
    } catch (e) {
      toast.error(`保存失败: ${(e as Error).message}`);
    } finally {
      setRrSaving(false);
    }
  };

  const handleReindex = async () => {
    setRebuilding(true);
    toast('索引重建中，约 10-30 秒…');
    try {
      const r = await reindexRag();
      toast.success(`索引重建完成：${r.chunks} 个知识块（${(r.tookMs / 1000).toFixed(1)}s）`);
    } catch (e) {
      toast.error(`重建失败: ${(e as Error).message}`);
    } finally {
      setRebuilding(false);
      loadRag();
    }
  };

  return (
    <>
      {/* 向量模型 + 重排（RAG 知识库） */}
      <Panel
        title="向量模型"
        description={
          embView?.configured
            ? `已配置：${embView.name || embView.model} · ${embView.model}（${embView.dim} 维）`
            : '未配置：知识库检索不可用（需 1024 维 OpenAI 兼容嵌入模型）'
        }
      >
        {embLoading ? (
          <div className="flex justify-center py-6">
            <Spinner className="text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="emb-name">名称</FieldLabel>
                  <Input
                    id="emb-name"
                    placeholder="如 SiliconFlow / 智谱"
                    value={embForm.name}
                    onChange={(e) => setEmbForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="emb-model">嵌入模型（须输出 1024 维）</FieldLabel>
                  <Input
                    id="emb-model"
                    placeholder="如 BAAI/bge-large-zh-v1.5"
                    value={embForm.model}
                    onChange={(e) => setEmbForm((f) => ({ ...f, model: e.target.value }))}
                  />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="emb-baseurl">Base URL（OpenAI 兼容 /embeddings）</FieldLabel>
                <Input
                  id="emb-baseurl"
                  type="url"
                  placeholder="https://api.siliconflow.cn/v1"
                  value={embForm.baseUrl}
                  onChange={(e) => setEmbForm((f) => ({ ...f, baseUrl: e.target.value }))}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="emb-apikey">API Key</FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    id="emb-apikey"
                    type={showKey ? 'text' : 'password'}
                    placeholder={
                      embView?.configured
                        ? `已保存 ${embView.apiKeyMasked}，留空则不修改`
                        : '必填，仅保存在服务端'
                    }
                    autoComplete="off"
                    value={embForm.apiKey}
                    onChange={(e) => setEmbForm((f) => ({ ...f, apiKey: e.target.value }))}
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
            </FieldGroup>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={handleEmbSave}
                disabled={embSaving || embTesting || !embForm.baseUrl || !embForm.model}
              >
                {embSaving ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" />}
                保存
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleEmbTest}
                disabled={embTesting || embSaving || !embForm.baseUrl || !embForm.model}
              >
                {embTesting ? <Spinner data-icon="inline-start" /> : <PlugZap data-icon="inline-start" />}
                测试连接
              </Button>
            </div>

            <Separator />
            {/* 重排模型（可选）：未配置时检索结果按融合序返回 */}
            <div className="flex flex-col gap-3">
              <p className="text-xs text-muted-foreground">
                重排模型（可选）：配置后对检索结果精排提升准确率；Base URL 留空即不启用。
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="rr-baseurl">重排 Base URL（/rerank）</FieldLabel>
                  <Input
                    id="rr-baseurl"
                    type="url"
                    placeholder="https://api.siliconflow.cn/v1"
                    value={rrForm.baseUrl}
                    onChange={(e) => setRrForm((f) => ({ ...f, baseUrl: e.target.value }))}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="rr-model">重排模型</FieldLabel>
                  <Input
                    id="rr-model"
                    placeholder="如 BAAI/bge-reranker-v2-m3"
                    value={rrForm.model}
                    onChange={(e) => setRrForm((f) => ({ ...f, model: e.target.value }))}
                  />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="rr-apikey">API Key（留空沿用已存）</FieldLabel>
                  <Input
                    id="rr-apikey"
                    type="password"
                    autoComplete="off"
                    value={rrForm.apiKey}
                    onChange={(e) => setRrForm((f) => ({ ...f, apiKey: e.target.value }))}
                  />
                </Field>
                <div className="flex items-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRerankSave}
                    disabled={rrSaving || (!rrForm.baseUrl && !rrForm.model)}
                  >
                    {rrSaving ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" />}
                    保存重排配置
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </Panel>

      {/* 知识库索引 */}
      <Panel
        title="知识库"
        description={
          rag?.chroma === 'ok'
            ? `Chroma 已连接 · ${rag.collection ?? '—'}`
            : `Chroma ${rag?.chroma === 'unreachable' ? `不可达（${rag?.chromaUrl}）` : '检测中…'}`
        }
      >
        <div className="flex flex-col gap-3">
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2">
              <span className="text-muted-foreground">向量模型</span>
              <span className="font-medium">
                {rag?.embeddingConfigured ? rag.embeddingModel ?? '已配置' : '未配置'}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2">
              <span className="text-muted-foreground">知识块</span>
              <span className="font-medium tnum">
                {rag?.collectionCount ?? rag?.chunks ?? '—'}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2">
              <span className="text-muted-foreground">最近索引</span>
              <span className="font-medium tnum">
                {rag?.indexedAt ? new Date(rag.indexedAt).toLocaleString() : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2">
              <span className="text-muted-foreground">索引状态</span>
              {rag?.stale ? (
                <Badge variant="outline" className="text-amber-600 dark:text-amber-400">
                  {rag.staleReason ?? '待更新'}
                </Badge>
              ) : rag?.indexedAt ? (
                <Badge variant="success">最新</Badge>
              ) : (
                <Badge variant="secondary">未建立</Badge>
              )}
            </div>
          </div>
          {(rag?.docs.length ?? 0) > 0 && (
            <div className="flex flex-col gap-1 rounded-lg border px-3 py-2 text-xs text-muted-foreground">
              {rag!.docs.map((d) => (
                <div key={d.id} className="flex items-center justify-between">
                  <span className="truncate">{d.title}</span>
                  <span className="tnum shrink-0">
                    {d.chunks} 块 / {d.sections} 节
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={loadRag}>
              <RefreshCw data-icon="inline-start" />
              刷新状态
            </Button>
            <Button
              size="sm"
              onClick={handleReindex}
              disabled={rebuilding || !rag?.embeddingConfigured}
            >
              {rebuilding ? <Spinner data-icon="inline-start" /> : <Database data-icon="inline-start" />}
              {rebuilding ? '重建中…' : '重建索引'}
            </Button>
          </div>
        </div>
      </Panel>
    </>
  );
}
