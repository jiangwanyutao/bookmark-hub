import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Plus, X } from 'lucide-react';
import { getHubCtx } from '@/lib/hubContext';
import { addVpnHosts, removeVpnHost, type VpnHost } from '@/lib/scan/scanner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AiSettingsCard } from './AiSettingsCard';

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

  const reload = useCallback(async () => {
    const { db } = await getHubCtx();
    setHosts(await db.getAll('vpnHosts'));
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

  // 两个段落用分隔线隔开，不套卡片
  return (
    <section className="mx-auto max-w-3xl p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">设置</h1>
        <p className="mt-1 text-sm text-muted-foreground">配置 AI 整理服务，以及需要 VPN 才能访问的网站。</p>
      </div>

      <AiSettingsCard />

      <div className="mt-12 border-t pt-8">
        <h2 className="text-lg font-semibold tracking-tight">需要 VPN 的网站</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          这些网站在当前网络下连不上时，只会标为「可能需要 VPN」，不会判为失效。适合公司内网系统和需要代理才能访问的网站。
        </p>
        <form onSubmit={(e) => void handleAdd(e)} className="mt-5 flex gap-2">
          <Label htmlFor="vpn-host" className="sr-only">
            网站域名
          </Label>
          <Input id="vpn-host" name="host" placeholder="wiki.company.com" aria-invalid={error !== null} className="bg-card" />
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

        {hosts?.length === 0 && (
          <p className="mt-4 text-sm text-muted-foreground">还没有添加。也可以在「失效链接」「待确认」里勾选书签后点「需要 VPN」。</p>
        )}
        {hosts && hosts.length > 0 && (
          <ul className="mt-4 divide-y rounded-xl border bg-card">
            {hosts.map((h) => (
              <li key={h.host} className="flex items-center justify-between gap-4 px-4 py-2 text-sm">
                <span className="min-w-0 truncate">{h.host}</span>
                <Button size="sm" variant="ghost" onClick={() => void handleRemove(h.host)} aria-label={`移除 ${h.host}`}>
                  <X />
                  移除
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
