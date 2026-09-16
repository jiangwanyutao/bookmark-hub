// 端到端：灌入书签和扫描结果（不发网络请求），走一遍浏览、清理、撤销和设置。
import fs from 'node:fs';
import { check, launchExtension, nav, waitUntil } from './helpers.mjs';

const MDN = 'https://developer.mozilla.org/zh-CN/';

const { page, close } = await launchExtension();

const countByUrl = (url) => page.evaluate(async (u) => (await chrome.bookmarks.search({ url: u })).length, url);

try {
  // ---------- 示例数据 ----------
  await page.evaluate(async (mdn) => {
    const make = (parentId, title, url) => chrome.bookmarks.create({ parentId, title, url });
    const front = await chrome.bookmarks.create({ parentId: '1', title: '前端' });
    const docs = await chrome.bookmarks.create({ parentId: '1', title: '资料' });
    await make(front.id, 'React 文档', 'https://react.dev/learn');
    await make(front.id, '旧版 Webpack 文档', 'https://webpack.github.io/docs/');
    await make(front.id, '某博客文章', 'https://blog.example-dead.com/post/1');
    await make(front.id, '公司内部 Wiki', 'https://wiki.corp-example.com/home');
    await make(front.id, 'GitHub 通知', 'https://github.com/notifications');
    // 同一目录里的完全重复，可以默认保留最早的一条
    for (const title of ['MDN 文档', 'MDN 文档 副本', 'MDN 文档 副本 2']) await make(docs.id, title, mdn);

    const now = Date.now();
    const result = (url, health, extra = {}) => ({
      url, health, failReason: null, redirectTo: null, httpStatus: 200, netError: null, networkMode: 'normal', checkedAt: now, ...extra,
    });
    const results = [
      result('https://react.dev/learn', 'healthy'),
      result(mdn, 'healthy'),
      result('https://webpack.github.io/docs/', 'redirected', { redirectTo: 'https://webpack.js.org/concepts/', httpStatus: 301 }),
      result('https://blog.example-dead.com/post/1', 'broken', { failReason: 'not_found', httpStatus: 404 }),
      result('https://wiki.corp-example.com/home', 'broken', { failReason: 'dns', httpStatus: null, netError: 'net::ERR_NAME_NOT_RESOLVED' }),
      result('https://github.com/notifications', 'suspicious', { failReason: 'need_login', httpStatus: 302 }),
    ];
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('bookmark-hub');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('scanResults', 'readwrite');
      for (const r of results) tx.objectStore('scanResults').put(r);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, MDN);
  await page.reload();
  await page.getByRole('navigation', { name: '主导航' }).waitFor();

  // ---------- 全局快捷键 ----------
  await page.keyboard.press('Control+k');
  check((await page.evaluate(() => document.activeElement?.id)) === 'search', 'Ctrl+K 聚焦顶栏搜索');
  await page.keyboard.press('Escape');

  // ---------- 全部书签：键盘漫游与详情健康状态 ----------
  await nav(page, '全部书签');
  await page.getByRole('listbox', { name: '书签' }).focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  check((await page.getByRole('option', { selected: true }).count()) === 1, '方向键移动选中一条书签');
  check((await page.locator('aside dt').first().textContent()) === '健康状态', '详情第一项是健康状态');

  // ---------- 失效链接：部分选中、行内忽略 ----------
  await nav(page, '失效链接');
  const selectAll = page.locator('#select-all-broken');
  // 默认只勾「页面不存在」，「域名无法解析」可能是内网所以不勾
  check((await selectAll.getAttribute('data-state')) === 'indeterminate', '部分勾选时全选框是半选状态');
  check(await selectAll.locator('.lucide-minus').isVisible(), '半选状态显示横杠而不是对勾');
  const wikiRow = page.locator('main li.group', { hasText: 'wiki.corp-example.com' });
  await wikiRow.hover();
  await wikiRow.getByRole('button', { name: /^忽略 / }).click();
  await page.getByText('已忽略 1 条').first().waitFor();
  check((await page.locator('main li.group', { hasText: 'wiki.corp-example.com' }).count()) === 0, '行内忽略后这一行移到已忽略');

  // 误报纠正：打开看过确认能访问的，标为「其实能用」后离开失效列表
  const deadRow = page.locator('main li.group', { hasText: 'blog.example-dead.com' });
  await deadRow.hover();
  await deadRow.getByRole('button', { name: /其实能用$/ }).click();
  await page.getByText('已标记 1 条为可以访问').first().waitFor();
  check(
    (await page.locator('main li.group', { hasText: 'blog.example-dead.com' }).count()) === 0,
    '标记「其实能用」后这一行离开失效列表',
  );

  // ---------- 重定向：更新网址 ----------
  await nav(page, '重定向');
  await page.getByRole('button', { name: '更新网址' }).click();
  await page.getByText('已更新 1 个网址').first().waitFor();
  check((await countByUrl('https://webpack.js.org/concepts/')) === 1, '重定向书签换成了新网址');

  // ---------- 重复书签：推荐保留与一键清理 ----------
  await nav(page, '重复书签');
  check((await page.getByText('推荐保留', { exact: true }).count()) === 1, '同目录的重复组标出推荐保留');
  await page.getByRole('button', { name: /一键清理/ }).click();
  await waitUntil(async () => (await countByUrl(MDN)) === 1, '一键清理后只剩一条 MDN');
  check(true, '一键清理删除了多余的重复书签');

  // ---------- 操作记录：恢复点与撤销 ----------
  await nav(page, '操作记录');
  await page.getByText(/刚刚 · 当时有 \d+ 个书签/).first().waitFor();
  check(true, '批量删除前创建了恢复点，显示相对时间');
  check((await page.getByText('今天', { exact: true }).count()) === 1, '时间线按天分组');
  // 最新一次（清理重复书签）在最上面
  await page.getByRole('button', { name: '撤销' }).first().click();
  await waitUntil(async () => (await countByUrl(MDN)) === 3, '撤销后三条 MDN 都回来');
  check(true, '撤销清理后重复书签回到原处');

  // 导出备份：拿到浏览器通用格式的书签文件
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '导出书签' }).click(),
  ]);
  check(/^书签备份-\d{4}-\d{2}-\d{2}\.html$/.test(download.suggestedFilename()), `导出的文件名带日期：${download.suggestedFilename()}`);
  const exported = fs.readFileSync(await download.path(), 'utf8');
  check(exported.startsWith('<!DOCTYPE NETSCAPE-Bookmark-file-1>'), '导出的是浏览器通用书签格式');
  check(exported.includes(`<A HREF="${MDN}"`), '导出内容里有书签链接');

  // ---------- 设置：需要 VPN 的网站 ----------
  await nav(page, '设置');
  // 列表是异步读出来的，等空状态出现，不能立刻判断可见（CI 机器快时会先看到加载前的空白）
  await page.getByText('还没有添加网站').waitFor();
  check(true, 'VPN 列表为空时显示空状态');
  await page.getByLabel('网站域名').fill('github.com');
  await page.getByRole('button', { name: '添加', exact: true }).click();
  await page.getByText(/影响 \d+ 条扫描结果/).first().waitFor();
  check(true, 'VPN 网站显示影响的扫描结果条数');
} catch (e) {
  check(false, e instanceof Error ? e.message : String(e));
} finally {
  await close();
}
process.exit(process.exitCode ?? 0);
