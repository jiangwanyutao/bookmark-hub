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
  const listing = lastToolText(messages, 'list_bookmarks').split('\n').filter((l) => /^b\d+ \|/.test(l));
  const refsWhere = (re) => listing.filter((l) => re.test(l)).map((l) => l.split(' | ')[0]);
  switch (step) {
    // 范围在界面上勾选（其他书签 id 2），模型从第一条消息拿到 id
    case 0: return ['list_bookmarks', { folderId: '2' }];
    case 1: return ['propose_taxonomy', { categories: ['文档 / 前端', '教程'] }];
    case 2: return ['assign', { refs: refsWhere(/React|Vue/), category: '文档 / 前端' }];
    case 3: return ['assign', { refs: refsWhere(/Go|Rust/), category: '教程' }];
    case 4: return ['finish', { summary: '分成「文档 / 前端」和「教程」两类' }];
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
      // 带上思考内容，验证界面显示「思考过程」
      res.write(chunk({ role: 'assistant', reasoning_content: `先想想怎么调用 ${name}。` }));
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

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-e2e-'));
const ctx = await chromium.launchPersistentContext(userDataDir, {
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
    for (const [title, url] of [['React 文档', 'https://react.dev/'], ['Vue 指南', 'https://vuejs.org/guide/'], ['Go 教程', 'https://go.dev/tour/']]) {
      await chrome.bookmarks.create({ parentId: '2', title, url });
    }
    // 书签全被移走后应自动删除、撤销后应恢复的旧目录
    const old = await chrome.bookmarks.create({ parentId: '2', title: '旧目录' });
    await chrome.bookmarks.create({ parentId: old.id, title: 'Rust 教程', url: 'https://doc.rust-lang.org/book/' });
    return '2';
  }, `http://${AI_HOST}:${port}/v1`);
  await page.reload();

  await page.getByRole('button', { name: '智能整理' }).click();
  await page.getByRole('checkbox', { name: /^其他书签/ }).click();
  await page.getByRole('button', { name: '开始整理' }).click();
  await page.getByText('已完成，去右侧预览并确认').waitFor();
  await page.getByText(/思考过程/).first().waitFor();
  console.log('PASS: 显示了步骤链和思考过程');
  await page.getByRole('button', { name: '预览并确认整理' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '确认整理' }).click();
  await page.getByText(/已移动 4 个书签/).waitFor();

  const after = await page.evaluate(async () => {
    const [bar] = await chrome.bookmarks.getSubTree('1');
    const find = (node, title) => node.children?.find((c) => c.title === title);
    const docs = find(bar, '文档');
    const titles = (node) => (node?.children ?? []).map((c) => c.title).sort();
    const left = (await chrome.bookmarks.getChildren('2')).map((c) => c.title);
    return { frontend: titles(find(docs ?? {}, '前端')), tutorials: titles(find(bar, '教程')), left };
  });
  if (JSON.stringify(after) !== JSON.stringify({ frontend: ['React 文档', 'Vue 指南'], tutorials: ['Go 教程', 'Rust 教程'], left: [] })) {
    fail(`整理结果不对：${JSON.stringify(after)}`);
  } else console.log('PASS: 书签已按体系移动，移空的旧目录已删除');

  await page.getByRole('button', { name: '操作记录' }).click();
  await page.getByRole('button', { name: '撤销' }).first().click();
  // 提示「已撤销 N 项操作」和列表里的「已撤销」会同时出现，取第一个避免严格模式报错
  await page.getByText(/已撤销/).first().waitFor();
  const restored = await page.evaluate(async (id) => {
    const back = (await chrome.bookmarks.getChildren(id)).map((c) => c.title).sort();
    const barFolders = (await chrome.bookmarks.getChildren('1')).filter((c) => !c.url).map((c) => c.title);
    const old = (await chrome.bookmarks.getChildren(id)).find((c) => c.title === '旧目录');
    const oldChildren = old ? (await chrome.bookmarks.getChildren(old.id)).map((c) => c.title) : [];
    return { back, barFolders, oldChildren };
  }, otherId);
  if (restored.back.length !== 4 || restored.barFolders.length !== 0 || restored.oldChildren.join() !== 'Rust 教程') fail(`撤销后未恢复：${JSON.stringify(restored)}`);
  else console.log('PASS: 撤销后书签和旧目录回到原处，新建目录已删除');
} finally {
  await ctx.close();
  server.close();
  fs.rmSync(extDir, { recursive: true, force: true });
  fs.rmSync(userDataDir, { recursive: true, force: true });
}
