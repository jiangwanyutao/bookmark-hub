// 端到端：WebDAV 备份与恢复。本地服务冒充 WebDAV，校验账号并保存上传的文件。
import http from 'node:http';
import { check, launchExtension, nav, waitUntil } from './helpers.mjs';

const HOST = 'dav.backup-test.example';
const AUTH = `Basic ${Buffer.from('me:secret').toString('base64')}`;
const LOCAL = 'https://local-only.example.com/';
const ELSEWHERE = 'https://from-other-browser.example.com/';

let stored = null;
const server = http.createServer((req, res) => {
  if (req.headers.authorization !== AUTH) return res.writeHead(401).end();
  if (req.url !== '/dav/books/bookmark-checkup.html') return res.writeHead(409).end();
  if (req.method === 'PUT') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      stored = body;
      res.writeHead(201).end();
    });
    return;
  }
  if (stored === null) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(stored);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const folder = `http://${HOST}:${server.address().port}/dav/books/`;

const { page, close } = await launchExtension([`--host-resolver-rules=MAP ${HOST} 127.0.0.1`]);
const countByUrl = (url) => page.evaluate(async (u) => (await chrome.bookmarks.search({ url: u })).length, url);

try {
  await page.evaluate((u) => chrome.bookmarks.create({ parentId: '1', title: '本机书签', url: u }), LOCAL);
  await nav(page, '操作记录');
  await page.getByRole('button', { name: 'WebDAV 备份' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('文件夹地址').fill(folder);
  await dialog.getByLabel('用户名').fill('me');

  // ---------- 密码错 ----------
  await dialog.getByLabel('密码').fill('wrong');
  await dialog.getByRole('button', { name: '备份', exact: true }).click();
  await dialog.getByRole('alert').filter({ hasText: '用户名或密码不对' }).waitFor();
  check(stored === null, '密码错时提示原因，不上传');

  // ---------- 备份 ----------
  await dialog.getByLabel('密码').fill('secret');
  await dialog.getByRole('button', { name: '备份', exact: true }).click();
  await page.getByText(/^已备份 \d+ 个书签到 WebDAV$/).waitFor();
  check(stored?.includes(LOCAL), '书签以 HTML 备份文件上传');
  check((await dialog.getByText(/^上次备份：/).count()) === 1, '显示上次备份时间');

  // ---------- 远端有本机没有的书签：先确认，再恢复 ----------
  stored = stored.replace('</DL>', `<DT><A HREF="${ELSEWHERE}">别的浏览器收藏的</A>\n</DL>`);
  await dialog.getByRole('button', { name: '备份', exact: true }).click();
  const confirm = page.getByRole('alertdialog');
  await confirm.getByText(/有 1 个书签这里没有/).waitFor();
  check(true, '远端备份里有本机没有的书签时，覆盖前先确认');
  await confirm.getByRole('button', { name: '先恢复' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '导入 1 个书签' }).click();
  await waitUntil(async () => (await countByUrl(ELSEWHERE)) === 1, '恢复后导入远端的书签');
  check((await countByUrl(LOCAL)) === 1, '恢复只导入没有的，不产生重复');

  // ---------- 恢复后再备份就不用确认 ----------
  await page.getByRole('button', { name: 'WebDAV 备份' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '备份', exact: true }).click();
  await page.getByText(/^已备份 \d+ 个书签到 WebDAV$/).last().waitFor();
  check(stored.includes(LOCAL) && stored.includes(ELSEWHERE), '恢复后再备份，文件里两边的书签都有');
} catch (e) {
  check(false, e instanceof Error ? e.message : String(e));
} finally {
  await close();
  server.close();
}
