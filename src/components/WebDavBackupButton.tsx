import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CloudUpload, Loader2 } from 'lucide-react';
import { browser } from 'wxt/browser';
import { buildIndex } from '@/lib/bookmarks';
import { buildBookmarkHtml } from '@/lib/exportHtml';
import { parseBookmarkHtml, planImport } from '@/lib/importHtml';
import { clockTime, dayLabel } from '@/lib/relativeTime';
import {
  downloadBackup,
  loadWebDavConfig,
  normalizeFolderUrl,
  requestWebDavPermission,
  saveWebDavConfig,
  uploadBackup,
  type WebDavConfig,
} from '@/lib/webdav';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
import { ImportDialog, prepareImport, type ImportSource } from './ImportBookmarksButton';

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function readBookmarks() {
  const [root] = await browser.bookmarks.getTree();
  const roots = root?.children ?? [];
  return { roots, urls: new Set(buildIndex(roots).bookmarks.map((b) => b.url)) };
}

/**
 * 备份到自己的 WebDAV（坚果云、Nextcloud、群晖等），在别的电脑或浏览器上再恢复。
 * 恢复走「导入书签」：只导入没有的，不删东西，可以撤销。
 */
export function WebDavBackupButton() {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<WebDavConfig | null>(null);
  const [folderUrl, setFolderUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'backup' | 'restore' | null>(null);
  // 远端备份里有、本机没有的书签数；大于 0 时先确认再覆盖
  const [missing, setMissing] = useState(0);
  const [importSource, setImportSource] = useState<ImportSource | null>(null);

  useEffect(() => {
    void loadWebDavConfig().then((config) => {
      setSaved(config);
      setFolderUrl(config?.folderUrl ?? '');
      setUsername(config?.username ?? '');
    });
  }, []);

  function readForm(): WebDavConfig | null {
    const url = normalizeFolderUrl(folderUrl);
    const pass = password || saved?.password || '';
    const problem = !url
      ? '文件夹地址需要是完整的 http(s) 地址，例如 https://dav.jianguoyun.com/dav/书签/'
      : !username.trim() || !pass
        ? '请填写用户名和密码'
        : null;
    setError(problem);
    if (!url || problem) return null;
    return { folderUrl: url, username: username.trim(), password: pass, backedUpAt: saved?.folderUrl === url ? saved.backedUpAt : undefined };
  }

  async function remember(config: WebDavConfig) {
    await saveWebDavConfig(config);
    setSaved(config);
    setPassword('');
  }

  /** overwrite 为 true 时不再检查远端备份里有没有本机没有的书签。 */
  async function backup(overwrite = false) {
    const config = readForm();
    if (!config) return;
    // 授权须是点击后的第一个 await
    const access = await requestWebDavPermission(config.folderUrl);
    if (access !== 'granted') {
      if (access === 'denied') setError('没有获得访问这个地址的权限，无法备份');
      return;
    }
    setBusy('backup');
    try {
      const { roots, urls } = await readBookmarks();
      if (!overwrite) {
        const remote = await downloadBackup(config);
        const notHere = remote ? planImport(parseBookmarkHtml(remote), urls, { skipExisting: true }).newCount : 0;
        if (notHere > 0) return setMissing(notHere);
      }
      await uploadBackup(config, buildBookmarkHtml(roots));
      await remember({ ...config, backedUpAt: Date.now() });
      toast.success(`已备份 ${urls.size.toLocaleString('zh-CN')} 个书签到 WebDAV`);
    } catch (e) {
      setError(`备份失败：${errorMessage(e)}`);
    } finally {
      setBusy(null);
    }
  }

  async function restore() {
    const config = readForm();
    if (!config) return;
    const access = await requestWebDavPermission(config.folderUrl);
    if (access !== 'granted') {
      if (access === 'denied') setError('没有获得访问这个地址的权限，无法恢复');
      return;
    }
    setBusy('restore');
    try {
      const html = await downloadBackup(config);
      if (!html) return setError('这个文件夹里还没有备份，请先在有书签的浏览器里点「备份」');
      await remember(config);
      const source = await prepareImport('WebDAV 备份', html);
      if (!source) return;
      setOpen(false);
      setImportSource(source);
    } catch (e) {
      setError(`恢复失败：${errorMessage(e)}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <CloudUpload />
        WebDAV 备份
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>WebDAV 备份</DialogTitle>
            <DialogDescription>
              把全部书签存成一个文件放到你自己的网盘（坚果云、Nextcloud、群晖等），换电脑或换浏览器时再恢复。书签只发到你填写的地址，账号密码只保存在本机。
            </DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={(e) => e.preventDefault()}>
            <div className="space-y-1.5">
              <Label htmlFor="webdav-url">文件夹地址</Label>
              <Input id="webdav-url" value={folderUrl} onChange={(e) => setFolderUrl(e.target.value)} placeholder="https://dav.jianguoyun.com/dav/书签/" />
              <p className="text-xs text-muted-foreground">文件夹要先在网盘里建好，备份文件名是 bookmark-checkup.html。</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="webdav-user">用户名</Label>
                <Input id="webdav-user" autoComplete="off" value={username} onChange={(e) => setUsername(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="webdav-pass">密码</Label>
                <Input
                  id="webdav-pass"
                  type="password"
                  autoComplete="off"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={saved ? '已保存，留空则不修改' : '坚果云填第三方应用密码'}
                />
              </div>
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </form>
          <DialogFooter className="items-center sm:justify-between">
            <span className="text-xs text-muted-foreground tabular-nums">
              {saved?.backedUpAt ? `上次备份：${dayLabel(saved.backedUpAt)} ${clockTime(saved.backedUpAt)}` : '这台浏览器还没备份过'}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" disabled={busy !== null} onClick={() => void restore()}>
                {busy === 'restore' && <Loader2 className="animate-spin" />}
                从 WebDAV 恢复
              </Button>
              <Button disabled={busy !== null} onClick={() => void backup()}>
                {busy === 'backup' && <Loader2 className="animate-spin" />}
                备份
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={missing > 0} onOpenChange={(o) => !o && setMissing(0)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>WebDAV 上的备份里有 {missing.toLocaleString('zh-CN')} 个书签这里没有</AlertDialogTitle>
            <AlertDialogDescription>
              直接备份会覆盖那份文件，这些书签就从备份里没了（多半是在别的浏览器里收藏的）。建议先「从 WebDAV 恢复」把它们导进来，再备份。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => {
                setMissing(0);
                void restore();
              }}
            >
              先恢复
            </Button>
            <AlertDialogAction variant="destructive" onClick={() => void backup(true)}>
              仍然覆盖
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ImportDialog source={importSource} onClose={() => setImportSource(null)} />
    </>
  );
}
