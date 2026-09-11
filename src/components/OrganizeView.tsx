import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Sparkles, X } from 'lucide-react';
import { listFolders, type BookmarkIndex, type TreeNode } from '@/lib/bookmarks';
import { bookmarksBarId, isUncategorized } from '@/lib/health';
import { loadAiConfig, requestAiHostPermission, type AiConfig } from '@/lib/ai/config';
import { chatCompletion } from '@/lib/ai/client';
import { PRIVACY_LABEL } from '@/lib/ai/prompt';
import { confidenceLevel, estimateRequests, runOrganize, type ConfidenceLevel, type OrganizeResult } from '@/lib/ai/organize';
import type { Suggestion } from '@/lib/ai/parse';
import { runBatch } from '@/lib/actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

const LEVEL_LABEL: Record<ConfidenceLevel, string> = { high: '高置信度', medium: '中置信度', low: '低置信度' };

interface Props {
  index: BookmarkIndex;
  roots: TreeNode[];
  onOpenSettings: () => void;
}

export function OrganizeView({ index, roots, onOpenSettings }: Props) {
  const [config, setConfig] = useState<AiConfig | null | undefined>(undefined);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [result, setResult] = useState<OrganizeResult | null>(null);
  const [level, setLevel] = useState<ConfidenceLevel | 'all'>('all');
  // 用户改过的目录、忽略的建议、勾选（null 表示按默认：高置信度勾选）
  const [folderOverrides, setFolderOverrides] = useState<Record<string, string>>({});
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [confirming, setConfirming] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    void loadAiConfig().then(setConfig);
  }, []);

  const folders = useMemo(() => listFolders(roots), [roots]);
  const folderPathById = useMemo(() => new Map(folders.map((f) => [f.id, f.path])), [folders]);
  const bookmarkById = useMemo(() => new Map(index.bookmarks.map((b) => [b.id, b])), [index]);
  const targets = useMemo(() => {
    const barId = bookmarksBarId(roots);
    return index.bookmarks.filter((b) => isUncategorized(b, barId));
  }, [index, roots]);

  const folderOf = (s: Suggestion) => folderOverrides[s.bookmarkId] ?? s.folderId;
  // 书签已被删除，或已经在建议的目录里（比如刚移动过）的，不再显示
  const open = (result?.suggestions ?? []).filter((s) => {
    const b = bookmarkById.get(s.bookmarkId);
    return b && !dismissed.has(s.bookmarkId) && b.ancestorIds.at(-1) !== folderOf(s);
  });
  const shown = level === 'all' ? open : open.filter((s) => confidenceLevel(s.confidence) === level);
  const selection = picked ?? new Set(open.filter((s) => confidenceLevel(s.confidence) === 'high').map((s) => s.bookmarkId));
  const selected = shown.filter((s) => selection.has(s.bookmarkId));

  const toggle = (id: string, on: boolean) => {
    const next = new Set(selection);
    if (on) next.add(id);
    else next.delete(id);
    setPicked(next);
  };

  async function start() {
    if (!config) return;
    // 授权须是点击后的第一个 await
    const access = await requestAiHostPermission(config.baseUrl);
    if (access !== 'granted') {
      if (access === 'denied') toast.error('没有获得访问 AI 服务地址的权限');
      return;
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    setRunning(true);
    setResult(null);
    setPicked(null);
    setDismissed(new Set());
    setFolderOverrides({});
    try {
      const res = await runOrganize(
        (messages) => chatCompletion(config, messages, { signal: controller.signal }),
        { bookmarks: targets, folders, privacy: config.privacy },
        { signal: controller.signal, onProgress: (done, total) => setProgress([done, total]) },
      );
      setResult(res);
      if (res.failures.length > 0) toast.warning(`${res.failures.length} 批请求失败：${res.failures[0]}`);
      else if (!controller.signal.aborted) toast.success(`发现 ${res.suggestions.length} 个整理建议`);
    } finally {
      setRunning(false);
      controllerRef.current = null;
    }
  }

  async function apply() {
    const ok = await runBatch(
      'AI 整理',
      selected.map((s) => ({ type: 'move', id: s.bookmarkId, parentId: folderOf(s) })),
      `已移动 ${selected.length} 个书签`,
    );
    if (ok) setPicked(null);
  }

  if (config === undefined) return null;

  if (!config) {
    return (
      <section className="mx-auto max-w-3xl space-y-4 p-8">
        <h1 className="text-2xl font-semibold">智能整理</h1>
        <p className="text-sm text-muted-foreground">
          AI 会参考你现有的目录，为「未分类」书签建议合适的位置。先在设置里配置一个 OpenAI 兼容的 AI 服务。
        </p>
        <Button onClick={onOpenSettings}>去设置</Button>
      </section>
    );
  }

  const levelCounts = (['high', 'medium', 'low'] as const).map(
    (l) => [l, open.filter((s) => confidenceLevel(s.confidence) === l).length] as const,
  );

  return (
    <section className="mx-auto max-w-4xl space-y-5 p-8">
      <div>
        <h1 className="text-2xl font-semibold">智能整理</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          AI 只给出建议，确认后才会移动书签，执行前自动创建恢复点。当前发送给 AI：{PRIVACY_LABEL[config.privacy]}。
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">
            {targets.length > 0 ? `有 ${targets.length} 个未分类书签可以整理` : '没有未分类的书签'}
          </CardTitle>
          {running ? (
            <Button variant="outline" onClick={() => controllerRef.current?.abort()}>
              停止
            </Button>
          ) : (
            <Button disabled={targets.length === 0} onClick={() => void start()}>
              <Sparkles />
              {result ? '重新整理' : '开始整理'}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            约 {estimateRequests(targets.length)} 次请求，模型 {config.model}，费用由你的 API 账户承担。
          </p>
          {running && progress && (
            <div className="space-y-2">
              <Progress value={(progress[0] / progress[1]) * 100} aria-label="整理进度" />
              <p className="tabular-nums">
                第 {progress[0]} / {progress[1]} 批
              </p>
            </div>
          )}
          {result && result.skipped > 0 && <p>{result.skipped} 个内网书签没有发送给 AI。</p>}
        </CardContent>
      </Card>

      {result && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant={level === 'all' ? 'secondary' : 'ghost'} onClick={() => setLevel('all')}>
              全部 {open.length}
            </Button>
            {levelCounts.map(([l, count]) => (
              <Button key={l} size="sm" variant={level === l ? 'secondary' : 'ghost'} onClick={() => setLevel(l)}>
                {LEVEL_LABEL[l]} {count}
              </Button>
            ))}
            <Button className="ml-auto" disabled={selected.length === 0} onClick={() => setConfirming(true)}>
              移动选中的 {selected.length} 个书签
            </Button>
          </div>

          {shown.length === 0 ? (
            <p className="text-sm text-muted-foreground">没有待处理的建议。</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {shown.map((s) => {
                const b = bookmarkById.get(s.bookmarkId)!;
                const id = `suggestion-${s.bookmarkId}`;
                return (
                  <li key={s.bookmarkId} className="flex items-start gap-3 px-4 py-3">
                    <Checkbox
                      id={id}
                      className="mt-1"
                      checked={selection.has(s.bookmarkId)}
                      onCheckedChange={(on) => toggle(s.bookmarkId, on === true)}
                    />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <label htmlFor={id} className="block cursor-pointer truncate text-sm font-medium">
                        {b.title || b.url}
                      </label>
                      <p className="text-xs text-muted-foreground">当前：{b.folderPath}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-muted-foreground">移到</span>
                        <Select
                          value={folderOf(s)}
                          onValueChange={(folderId) => setFolderOverrides((prev) => ({ ...prev, [s.bookmarkId]: folderId }))}
                        >
                          <SelectTrigger size="sm" className="max-w-full" aria-label={`${b.title} 的目标目录`}>
                            <SelectValue>{folderPathById.get(folderOf(s))}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {folders.map((f) => (
                              <SelectItem key={f.id} value={f.id}>
                                {f.path}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Badge variant="outline" className="tabular-nums">
                          {Math.round(s.confidence * 100)}%
                        </Badge>
                      </div>
                      {s.reason && <p className="text-xs text-muted-foreground">{s.reason}</p>}
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="shrink-0"
                      aria-label={`忽略 ${b.title} 的建议`}
                      onClick={() => setDismissed((prev) => new Set(prev).add(s.bookmarkId))}
                    >
                      <X />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>移动 {selected.length} 个书签？</AlertDialogTitle>
            <AlertDialogDescription>
              执行前会自动创建恢复点，可以在「操作记录」里撤销。开启了 Chrome 同步时，改动会同步到你的其他设备。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void apply()}>确认整理</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
