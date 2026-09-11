// 端到端：本地假 OpenAI 兼容服务按轮次返回工具调用，走完整个智能整理流程并验证撤销。
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const SRC = path.resolve('.output/chrome-mv3');
const AI_HOST = 'ai.test';

// ---------- 假模型：按请求里已有的助手消息数决定下一步 ----------
const lastToolText = (messages, name) => {
  const calls = new Map();
  for (const m of messages) if (m.role === 'assistant') for (const c of m.tool_calls ?? []) calls.set(c.id, c.function.name);
  const result = [...messages].reverse().find((m) => m.role === 'tool' && calls.get(m.tool_call_id) === name);
  return typeof result?.content === 'string' ? result.content : (result?.content ?? []).map((c) => c.text ?? '').join('');
};

function nextToolCall(messages) {
  const step = messages.filter((m) => m.role === 'assistant').length;
  const folders = lastToolText(messages, 'list_folders').split('\n').map((l) => l.split(' | '));
  const idOf = (name) => folders.find(([, p]) => p === name)?.[0];
  const listing = lastToolText(messages, 'list_bookmarks').split('\n').filter((l) => /^b\d+ \|/.test(l));
  const refsWhere = (re) => listing.filter((l) => re.test(l)).map((l) => l.split(' | ')[0]);
  switch (step) {
    case 0: return ['list_folders', {}];
    case 1: return ['ask_user', { question: '这次整理哪些目录？', options: ['其他书签'] }];
    case 2: return ['set_scope', { folderIds: [idOf('其他书签')], rootFolderId: idOf('书签栏') }];
    case 3: return ['list_bookmarks', { folderId: idOf('其他书签') }];
    case 4: return ['propose_taxonomy', { categories: ['文档 / 前端', '教程'] }];
    case 5: return ['assign', { refs: refsWhere(/React|Vue/), category: '文档 / 前端' }];
    case 6: return ['assign', { refs: refsWhere(/Go|Rust/), category: '教程' }];
    case 7: return ['finish', { summary: '分成「文档 / 前端」和「教程」两类' }];
    default: return null;
  }
}

const chunk = (delta, finish = null) =>
  `data: ${JSON.stringify({ id: 'c', object: 'chat.completion.chunk', created: 0, model: 'mock', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;

const server = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const { messages } = JSON.parse(raw || '{}');
    const call = nextToolCall(messages ?? []);
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    if (call) {
      const [name, args] = call;
      res.write(chunk({ role: 'assistant', content: null, tool_calls: [{ index: 0, id: `call_${messages.length}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }));
      res.write(chunk({}, 'tool_calls'));
    } else {
      res.write(chunk({ role: 'assistant', content: '好的。' }));
      res.write(chunk({}, 'stop'));
    }
    res.end('data: [DONE]\n\n');
  });
});

const fail = (message) => {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
};

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

// 测试副本：直接授予网站权限，免去自动化里无法点击的授权框
const extDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-e2e-ext-'));
fs.cpSync(SRC, extDir, { recursive: true });
const manifestPath = path.join(extDir, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
manifest.host_permissions = ['<all_urls>'];
fs.writeFileSync(manifestPath, JSON.stringify(manifest));

const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'bh-e2e-')), {
  headless: false,
  args: [
    `--disable-extensions-except=${extDir}`,
    `--load-extension=${extDir}`,
    `--host-resolver-rules=MAP ${AI_HOST} 127.0.0.1`,
    '--no-proxy-server',
  ],
});

try {
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const page = await ctx.newPage();
  page.setDefaultTimeout(30_000);
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`chrome-extension://${new URL(sw.url()).host}/dashboard.html`);

  const otherId = await page.evaluate(async (baseUrl) => {
    await chrome.storage.local.set({ aiConfig: { baseUrl, apiKey: 'sk-test', model: 'mock', privacy: 'title_domain' } });
    for (const [title, url] of [['React 文档', 'https://react.dev/'], ['Vue 指南', 'https://vuejs.org/guide/'], ['Go 教程', 'https://go.dev/tour/'], ['Rust 教程', 'https://doc.rust-lang.org/book/']]) {
      await chrome.bookmarks.create({ parentId: '2', title, url });
    }
    return '2';
  }, `http://${AI_HOST}:${port}/v1`);
  await page.reload();

  await page.getByRole('button', { name: '智能整理' }).click();
  await page.getByRole('button', { name: '开始整理' }).click();
  await page.getByRole('button', { name: '其他书签', exact: true }).click();
  await page.getByText('已完成，去右侧预览并确认').waitFor();
  await page.getByRole('button', { name: '预览并确认整理' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '确认整理' }).click();
  await page.getByText(/已移动 4 个书签/).waitFor();

  const after = await page.evaluate(async () => {
    const [bar] = await chrome.bookmarks.getSubTree('1');
    const find = (node, title) => node.children?.find((c) => c.title === title);
    const docs = find(bar, '文档');
    const titles = (node) => (node?.children ?? []).map((c) => c.title).sort();
    return { frontend: titles(find(docs ?? {}, '前端')), tutorials: titles(find(bar, '教程')) };
  });
  if (JSON.stringify(after) !== JSON.stringify({ frontend: ['React 文档', 'Vue 指南'], tutorials: ['Go 教程', 'Rust 教程'] })) {
    fail(`整理结果不对：${JSON.stringify(after)}`);
  } else console.log('PASS: 书签已按体系移动');

  await page.getByRole('button', { name: '操作记录' }).click();
  await page.getByRole('button', { name: '撤销' }).first().click();
  // 提示「已撤销 N 项操作」和列表里的「已撤销」会同时出现，取第一个避免严格模式报错
  await page.getByText(/已撤销/).first().waitFor();
  const restored = await page.evaluate(async (id) => {
    const back = (await chrome.bookmarks.getChildren(id)).map((c) => c.title).sort();
    const barFolders = (await chrome.bookmarks.getChildren('1')).filter((c) => !c.url).map((c) => c.title);
    return { back, barFolders };
  }, otherId);
  if (restored.back.length !== 4 || restored.barFolders.length !== 0) fail(`撤销后未恢复：${JSON.stringify(restored)}`);
  else console.log('PASS: 撤销后书签回到原处，新建目录已删除');
} finally {
  await ctx.close();
  server.close();
}
