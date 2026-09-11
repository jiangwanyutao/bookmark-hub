import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { loadAiConfig, normalizeBaseUrl, requestAiHostPermission, saveAiConfig, type AiConfig } from '@/lib/ai/config';
import { testConnection } from '@/lib/ai/client';
import { PRIVACY_LABEL, type Privacy } from '@/lib/ai/prompt';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function AiSettingsCard() {
  const [saved, setSaved] = useState<AiConfig | null | undefined>(undefined);
  const [privacy, setPrivacy] = useState<Privacy>('title_domain');
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    void loadAiConfig().then((config) => {
      setSaved(config);
      if (config) setPrivacy(config.privacy);
    });
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const baseUrl = normalizeBaseUrl(String(data.get('baseUrl') ?? ''));
    const apiKey = String(data.get('apiKey') ?? '').trim() || saved?.apiKey || '';
    const model = String(data.get('model') ?? '').trim();

    if (!baseUrl) return setError('Base URL 需要是完整的 http(s) 地址，例如 https://api.deepseek.com/v1');
    if (!apiKey) return setError('请填写 API Key');
    if (!model) return setError('请填写模型名');
    setError(null);

    // 授权须是点击后的第一个 await
    const access = await requestAiHostPermission(baseUrl);
    if (access !== 'granted') {
      if (access === 'denied') setError('没有获得访问这个地址的权限，无法调用 AI');
      return;
    }

    const config: AiConfig = { baseUrl, apiKey, model, privacy };
    setTesting(true);
    try {
      await testConnection(config);
      await saveAiConfig(config);
      setSaved(config);
      toast.success('连接成功，已保存');
    } catch (err) {
      setError(`连接测试失败：${errorMessage(err)}`);
    } finally {
      setTesting(false);
    }
  }

  if (saved === undefined) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI 服务</CardTitle>
        <CardDescription>
          使用任何 OpenAI 兼容接口（如 DeepSeek、通义千问、Kimi）。Key 只保存在本机，只会发给你填写的地址；费用由你的账户承担。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form key={saved?.baseUrl ?? 'new'} onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ai-base-url">Base URL</Label>
            <Input
              id="ai-base-url"
              name="baseUrl"
              defaultValue={saved?.baseUrl}
              placeholder="https://api.deepseek.com/v1"
            />
            <p className="text-xs text-muted-foreground">填到 /v1 这一级，不用加 /chat/completions。</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ai-api-key">API Key</Label>
            <Input
              id="ai-api-key"
              name="apiKey"
              type="password"
              autoComplete="off"
              placeholder={saved ? '已保存，留空则不修改' : 'sk-…'}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ai-model">模型名</Label>
            <Input id="ai-model" name="model" defaultValue={saved?.model} placeholder="deepseek-chat" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ai-privacy">发给 AI 的信息</Label>
            <Select value={privacy} onValueChange={(v) => setPrivacy(v as Privacy)}>
              <SelectTrigger id="ai-privacy" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PRIVACY_LABEL) as Privacy[]).map((p) => (
                  <SelectItem key={p} value={p}>
                    {PRIVACY_LABEL[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">内网地址的书签一律不发送。</p>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={testing}>
            {testing && <Loader2 className="animate-spin" />}
            {testing ? '正在测试连接…' : '保存并测试连接'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
