// 端到端测试的公共部分：复制扩展、授予网站权限、启动浏览器、限时关闭。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const SRC = path.resolve('.output/chrome-mv3');

/** 断言失败只记录不中断，跑完后统一以非 0 退出。 */
export function check(ok, message) {
  if (ok) console.log(`PASS: ${message}`);
  else {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  }
}

/** 轮询直到 predicate 返回真值，超时抛错。 */
export async function waitUntil(predicate, message, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`等待超时：${message}`);
}

/**
 * 启动加载了扩展的浏览器并打开管理页。默认无头，HEADED=1 时显示窗口便于调试。
 * extraArgs 追加到浏览器启动参数（例如把假域名解析到本地服务）。
 */
export async function launchExtension(extraArgs = []) {
  // 测试副本：直接授予网站权限，免去自动化里无法点击的授权框
  const extDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-e2e-ext-'));
  fs.cpSync(SRC, extDir, { recursive: true });
  const manifestPath = path.join(extDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.host_permissions = ['<all_urls>'];
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-e2e-'));
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    headless: !process.env.HEADED,
    // 完整版 Chromium 的新无头模式才支持加载扩展
    channel: 'chromium',
    viewport: { width: 1440, height: 900 },
    // 固定中文界面：书签根目录名（书签栏 / 其他书签）跟随浏览器语言，CI 默认是英文
    locale: 'zh-CN',
    args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`, '--no-proxy-server', ...extraArgs],
  });

  const close = async () => {
    // 关闭 persistent context 在 Windows 上偶尔挂住，限时 5 秒
    await Promise.race([ctx.close().catch(() => {}), new Promise((r) => setTimeout(r, 5000))]);
    fs.rmSync(extDir, { recursive: true, force: true });
    // 浏览器没退干净时用户目录可能被占用，留在临时目录即可
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {}
  };

  try {
    let [sw] = ctx.serviceWorkers();
    if (!sw) sw = await ctx.waitForEvent('serviceworker');
    const page = await ctx.newPage();
    page.setDefaultTimeout(30_000);
    page.on('pageerror', (e) => check(false, `页面报错：${e.message}`));
    await page.goto(`chrome-extension://${new URL(sw.url()).host}/dashboard.html`);
    await page.getByRole('navigation', { name: '主导航' }).waitFor();
    return { page, close };
  } catch (e) {
    await close();
    throw e;
  }
}

/** 点侧栏导航；按名称开头匹配，避开数量角标。 */
export const nav = (page, name) =>
  page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: new RegExp(`^${name}`) }).click();
