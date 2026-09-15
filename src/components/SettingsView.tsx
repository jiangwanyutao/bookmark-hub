import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Globe, Plus, X } from 'lucide-react';
import { getHubCtx } from '@/lib/hubContext';
import { hostOf } from '@/lib/scan/classify';
import { addVpnHosts, removeVpnHost, type VpnHost } from '@/lib/scan/scanner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AiSettingsCard } from './AiSettingsCard';
import { PageHeader, pageLayout } from './PageHeader';
import { Panel } from './Panel';

/** 接受「wiki.company.com」或整条网址，取出域名；无效时返回 null。 */
function parseHost(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`).hostname || null;
  } catch {
    return null;
  }
}

export function SettingsView() {
  const [hosts, setHosts] = useState<VpnHost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // host → 标为「可能需要 VPN」的扫描结果数，0 表示这条记录还没起作用
  const [impact, setImpact] = useState<Map<string, number>>(new Map());

  const reload = useCallback(async () => {
    const { db } = await getHubCtx();
    const [vpnHosts, results] = await Promise.all([db.getAll('vpnHosts'), db.getAll('scanResults')]);
    const counts = new Map<string, number>();
    for (const r of results) {
      if (r.failReason !== 'maybe_vpn') continue;
      const host = hostOf(r.url);
      counts.set(host, (counts.get(host) ?? 0) + 1);
    }
    setHosts(vpnHosts);
    setImpact(counts);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const host = parseHost(String(new FormData(form).get('host') ?? ''));
    if (!host) {
      setError('请输入网站域名，例如 wiki.company.com');
      return;
    }
    setError(null);
    const { db } = await getHubCtx();
    const moved = await addVpnHosts(db, [host], Date.now());
    toast.success(moved > 0 ? `已添加 ${host}，${moved} 条相关结果已移到「待确认」` : `已添加 ${host}`);
    form.reset();
    await reload();
  }

  async function handleRemove(host: string) {
    const { db } = await getHubCtx();
    await removeVpnHost(db, host);
    toast.success(`已移除 ${host}，下次扫描起按普通网站判定`);
    await reload();
  }

  return (
    <div className={pageLayout()}>
      <PageHeader title="设置" subtitle="配置 AI 整理服务，以及需要 VPN 才能访问的网站。" />

      {/* 两块等高面板，内容多时各自滚动 */}
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
        <Panel title="AI 服务" bodyClassName="overflow-auto p-5">
          <AiSettingsCard />
        </Panel>

        <Panel title="需要 VPN 的网站" meta={hosts ? `${hosts.length} 个` : undefined} bodyClassName="flex flex-col gap-4 p-5">
          <p className="shrink-0 text-sm text-muted-foreground">
            这些网站在当前网络下连不上时，只会标为「可能需要 VPN」，不会判为失效。适合公司内网系统和需要代理才能访问的网站。
          </p>
          <div className="shrink-0">
            <form onSubmit={(e) => void handleAdd(e)} className="flex gap-2">
              <Label htmlFor="vpn-host" className="sr-only">
                网站域名
              </Label>
              <Input id="vpn-host" name="host" placeholder="wiki.company.com" aria-invalid={error !== null} />
              <Button type="submit">
                <Plus />
                添加
              </Button>
            </form>
            {error && (
              <p role="alert" className="mt-2 text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          {hosts?.length === 0 && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center">
              <Globe className="size-6 text-muted-foreground" />
              <p className="text-sm font-medium">还没有添加网站</p>
              <p className="max-w-xs text-xs text-muted-foreground">上面填一个域名即可。也可以在「失效链接」「待确认」里勾选书签后批量点「需要 VPN」。</p>
            </div>
          )}
          {hosts && hosts.length > 0 && (
            <ul className="min-h-0 flex-1 divide-y overflow-auto rounded-lg border">
              {hosts.map((h) => (
                <li key={h.host} className="flex items-center justify-between gap-4 px-3 py-2 text-sm">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="truncate">{h.host}</span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">影响 {impact.get(h.host) ?? 0} 条扫描结果</span>
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => void handleRemove(h.host)} aria-label={`移除 ${h.host}`}>
                    <X />
                    移除
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
