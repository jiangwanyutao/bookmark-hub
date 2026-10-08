// 端到端：网页存档、阅读视图、全文搜索。本地服务冒充一个文章站。GBK 解码在单元测试里覆盖。
import http from 'node:http';
import { check, launchExtension, nav, waitUntil } from './helpers.mjs';

const HOST = 'news.archive-test.example';
const PARAGRAPH = '归档测试正文，用来让可读性算法认出这是文章主体。'.repeat(20);
const ARTICLE = `<html><head><meta charset="utf-8"><title>存档测试文章</title></head><body>
<nav>导航</nav><article><h1>存档测试文章</h1><p>${PARAGRAPH}</p><p>独特关键词鲸落</p>
<p><img src="x" onerror="window.__pwned = true"><a href="/next">下一篇</a></p></article></body></html>`;

const server = http.createServer((req, res) => {
  if (req.url === '/post') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(ARTICLE);
    return;
  }
  res.writeHead(404, { 'content-type': 'text/html' });
  res.end('<h1>Not Found</h1>');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://${HOST}:${server.address().port}`;

const { page, close } = await launchExtension([`--host-resolver-rules=MAP ${HOST} 127.0.0.1`]);

const archivedCount = () =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open('bookmark-hub');
        req.onsuccess = () => {
          const count = req.result.transaction('archives').objectStore('archives').count();
          count.onsuccess = () => {
            resolve(count.result);
            req.result.close();
          };
        };
      }),
  );

try {
  await page.evaluate(async (b) => {
    await chrome.bookmarks.create({ parentId: '1', title: '存档测试文章', url: `${b}/post` });
    await chrome.bookmarks.create({ parentId: '1', title: '已经没了的页面', url: `${b}/gone` });
  }, base);
  await page.reload();
  await nav(page, '全部书签');

  // ---------- 单个存档 ----------
  await page.getByRole('option', { name: /存档测试文章/ }).click();
  await page.getByRole('button', { name: '存档', exact: true }).click();
  await page.getByText(/^已存档 1 个网页$/).waitFor();
  check((await archivedCount()) === 1, '存档成功写入本地');
  check((await page.getByRole('button', { name: '重新存档' }).count()) === 1, '存档后按钮变成「重新存档」');

  // ---------- 阅读视图 ----------
  await page.getByRole('button', { name: '阅读' }).click();
  const reader = page.getByRole('dialog');
  await reader.locator('article.reader').waitFor();
  check((await reader.getByRole('heading', { name: '存档测试文章' }).count()) >= 1, '阅读视图显示存档标题');
  check((await reader.locator('article.reader').innerText()).includes('独特关键词鲸落'), '阅读视图显示存档正文');
  check((await reader.locator('[onerror]').count()) === 0 && !(await page.evaluate(() => window.__pwned)), '存档里的事件脚本被清除、没有执行');
  check((await reader.getByRole('link', { name: '下一篇' }).getAttribute('target')) === '_blank', '正文链接在新标签页打开');
  await page.keyboard.press('Escape');

  // ---------- 失败提示 ----------
  await page.getByRole('option', { name: /已经没了的页面/ }).click();
  await page.getByRole('button', { name: '存档', exact: true }).click();
  await page.getByText('存档失败：网页返回 404').waitFor();
  check(true, '存档失败时提示具体原因');
  check((await archivedCount()) === 1, '失败的页面不写入存档');

  // ---------- 批量存档：列表里只剩失败的那个 ----------
  await waitUntil(async () => (await page.getByRole('button', { name: /存档列表里未存档的 1 个/ }).count()) === 1, '批量存档按钮只算未存档的');
  check(true, '批量存档按钮只算未存档的');

  // ---------- 全文搜索：关键词只在存档正文里 ----------
  await page.locator('#search').fill('鲸落');
  const hits = page.locator('[role=listbox][aria-label="书签"] [role=option]');
  await waitUntil(async () => (await hits.count()) === 1, '搜索存档正文命中');
  check((await hits.first().textContent()).includes('存档测试文章'), '搜索只在存档正文里出现的词能找到书签');
  await page.locator('#search').fill('');
} catch (e) {
  check(false, e instanceof Error ? e.message : String(e));
} finally {
  await close();
  server.close();
}
