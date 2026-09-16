// 截图脚本：灌入演示书签和扫描结果，逐页截图。
//   node e2e/screenshots.mjs            商店截图，1280×800，出到 .output/store/edge
//   node e2e/screenshots.mjs --readme   README 截图，1440×900，出到 docs/images
// 演示数据全是假的，不含真实书签。
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { launchExtension, nav } from './helpers.mjs';

const README = process.argv.includes('--readme');
const OUT = path.resolve(process.argv.find((a) => !a.startsWith('-') && a.endsWith('images')) ?? (README ? 'docs/images' : '.output/store/edge'));
const SIZE = README ? { width: 1440, height: 900 } : { width: 1280, height: 800 };
const AI_HOST = 'ai.test';

// 两级目录：一级目录下分子目录，书签分布和目录树才有层次
const FOLDERS = {
  前端: {
    框架: [
      ['React 官方文档', 'https://react.dev/learn'],
      ['Vue 3 文档', 'https://cn.vuejs.org/guide/introduction.html'],
      ['Svelte 教程', 'https://svelte.dev/tutorial'],
      ['Next.js 文档', 'https://nextjs.org/docs'],
      ['Nuxt 文档', 'https://nuxt.com/docs'],
    ],
    基础: [
      ['MDN Web 文档', 'https://developer.mozilla.org/zh-CN/'],
      ['TypeScript 手册', 'https://www.typescriptlang.org/docs/'],
      ['Can I use', 'https://caniuse.com/'],
      ['JavaScript 信息', 'https://zh.javascript.info/'],
      ['MDN Web 文档 副本', 'https://developer.mozilla.org/zh-CN/'],
    ],
    工程化: [
      ['Vite 指南', 'https://vitejs.dev/guide/'],
      ['Tailwind CSS', 'https://tailwindcss.com/docs'],
      ['ESLint 规则', 'https://eslint.org/docs/latest/rules/'],
      ['旧版 Webpack 文档', 'https://webpack.github.io/docs/'],
      ['pnpm 文档', 'https://pnpm.io/zh/motivation'],
    ],
  },
  设计: {
    灵感: [
      ['Dribbble', 'https://dribbble.com/'],
      ['Behance', 'https://www.behance.net/'],
      ['Awwwards', 'https://www.awwwards.com/'],
      ['某设计博客', 'https://blog.example-defunct.dev/posts/1'],
    ],
    素材: [
      ['Figma 社区', 'https://www.figma.com/community'],
      ['配色参考', 'https://coolors.co/'],
      ['字体搭配', 'https://fontpair.co/'],
      ['Unsplash', 'https://unsplash.com/'],
      ['Lucide 图标', 'https://lucide.dev/icons/'],
    ],
  },
  工具: {
    在线工具: [
      ['正则测试', 'https://regex101.com/'],
      ['JSON 格式化', 'https://jsonformatter.org/'],
      ['Cron 表达式', 'https://crontab.guru/'],
      ['颜色对比度', 'https://webaim.org/resources/contrastchecker/'],
      ['Excalidraw', 'https://excalidraw.com/'],
    ],
    公司内网: [
      ['内部 Wiki', 'https://wiki.corp-example.com/home'],
      ['监控台', 'https://grafana.corp-example.com/'],
      ['代码仓库', 'https://git.corp-example.com/'],
      ['云控制台', 'https://console.cloud.example.com/'],
    ],
    账号: [
      ['GitHub 通知', 'https://github.com/notifications'],
      ['GitLab 待办', 'https://gitlab.com/dashboard/todos'],
      ['Jira 面板', 'https://jira.example.com/secure/Dashboard.jspa'],
    ],
  },
  阅读: {
    中文: [
      ['少数派', 'https://sspai.com/'],
      ['知乎专栏', 'https://zhuanlan.zhihu.com/'],
      ['阮一峰的网络日志', 'https://www.ruanyifeng.com/blog/'],
      ['酷壳', 'https://coolshell.cn/'],
      ['美团技术团队', 'https://tech.meituan.com/'],
    ],
    英文: [
      ['Hacker News', 'https://news.ycombinator.com/'],
      ['Lobsters', 'https://lobste.rs/'],
      ['Smashing Magazine', 'https://www.smashingmagazine.com/'],
      ['CSS-Tricks', 'https://css-tricks.com/'],
      ['Hacker News 副本', 'https://news.ycombinator.com/'],
    ],
  },
  工作: {
    协作: [
      ['团队看板', 'https://trello.com/'],
      ['会议纪要', 'https://www.notion.so/'],
      ['飞书文档', 'https://www.feishu.cn/'],
      ['语雀', 'https://www.yuque.com/'],
    ],
    求职: [
      ['LinkedIn', 'https://www.linkedin.com/feed/'],
      ['Boss 直聘', 'https://www.zhipin.com/'],
    ],
  },
  学习: {
    课程: [
      ['Coursera', 'https://www.coursera.org/'],
      ['MIT 公开课', 'https://ocw.mit.edu/'],
      ['freeCodeCamp', 'https://www.freecodecamp.org/'],
    ],
    算法: [
      ['LeetCode', 'https://leetcode.cn/'],
      ['算法可视化', 'https://visualgo.net/zh'],
      ['LeetCode 副本', 'https://leetcode.cn/'],
    ],
  },
  资讯: {
    科技: [
      ['The Verge', 'https://www.theverge.com/'],
      ['Ars Technica', 'https://arstechnica.com/'],
      ['36 氪', 'https://36kr.com/'],
      ['某科技媒体', 'https://news.example-gone.net/latest'],
    ],
  },
  生活: {
    日常: [
      ['豆瓣', 'https://www.douban.com/'],
      ['下厨房', 'https://www.xiachufang.com/'],
      ['B 站', 'https://www.bilibili.com/'],
      ['高德地图', 'https://www.amap.com/'],
      ['豆瓣 副本', 'https://www.douban.com/'],
    ],
  },
};

// ---------- 假模型：智能整理那张截图需要一轮完整对话 ----------
const lastToolText = (messages, name) => {
  const calls = new Map();
  for (const m of messages) if (m.role === 'assistant') for (const c of m.tool_calls ?? []) calls.set(c.id, c.function.name);
  const result = [...messages].reverse().find((m) => m.role === 'tool' && calls.get(m.tool_call_id) === name);
  return typeof result?.content === 'string' ? result.content : (result?.content ?? []).map((c) => c.text ?? '').join('');
};

const REASONING = [
  '先看看这个目录里都收藏了什么，再决定怎么分类。',
  '12 条里有在线小工具、公司内网系统，还有几个需要登录的账号页，按用途分三类比较清楚。',
  '正则、JSON、Cron 这些都是打开即用的小工具，归到「在线工具」。',
  '内网的 Wiki、监控台、代码仓库和云控制台放一起，连上 VPN 时可以集中打开。',
  'GitHub 通知、GitLab 待办、Jira 面板都是要登录才看得到的待办入口，单独一类。',
  '三类都分配完了，没有漏下的，可以交给用户确认。',
];

function nextToolCall(messages, folderId) {
  const step = messages.filter((m) => m.role === 'assistant').length;
  const listing = lastToolText(messages, 'list_bookmarks').split('\n').filter((l) => /^b\d+ \|/.test(l));
  const refsWhere = (re) => listing.filter((l) => re.test(l)).map((l) => l.split(' | ')[0]);
  switch (step) {
    case 0: return ['list_bookmarks', { folderId }];
    case 1: return ['propose_taxonomy', { categories: ['开发 / 在线工具', '开发 / 内网系统', '账号与待办'] }];
    case 2: return ['assign', { refs: refsWhere(/正则|JSON|Cron|对比度|Excalidraw/), category: '开发 / 在线工具' }];
    case 3: return ['assign', { refs: refsWhere(/Wiki|监控台|代码仓库|云控制台/), category: '开发 / 内网系统' }];
    case 4: return ['assign', { refs: refsWhere(/GitHub|GitLab|Jira/), category: '账号与待办' }];
    case 5: return ['finish', { summary: '按用途分成「在线工具」「内网系统」「账号与待办」三类，内网系统单独归在一起，方便连上 VPN 时集中打开。' }];
    default: return null;
  }
}

const chunk = (delta, finish = null) =>
  `data: ${JSON.stringify({ id: 'c', object: 'chat.completion.chunk', created: 0, model: 'mock', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;

let toolFolderId = '1';
const server = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const { messages } = JSON.parse(raw || '{}');
    const step = (messages ?? []).filter((m) => m.role === 'assistant').length;
    const call = nextToolCall(messages ?? [], toolFolderId);
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    if (call) {
      const [name, args] = call;
      res.write(chunk({ role: 'assistant', reasoning_content: REASONING[step] ?? REASONING.at(-1) }));
      res.write(chunk({ role: 'assistant', content: null, tool_calls: [{ index: 0, id: `call_${messages.length}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }));
      res.write(chunk({}, 'tool_calls'));
    } else {
      res.write(chunk({ role: 'assistant', content: '好的。' }));
      res.write(chunk({}, 'stop'));
    }
    res.end('data: [DONE]\n\n');
  });
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

fs.mkdirSync(OUT, { recursive: true });
const { page, close } = await launchExtension([`--host-resolver-rules=MAP ${AI_HOST} 127.0.0.1`]);

try {
  await page.setViewportSize(SIZE);
  toolFolderId = await page.evaluate(async ({ folders, baseUrl }) => {
    await chrome.storage.local.set({ aiConfig: { baseUrl, apiKey: 'sk-test', model: 'mock', privacy: 'title_domain' } });
    let toolsId = '1';
    for (const [name, subs] of Object.entries(folders)) {
      const folder = await chrome.bookmarks.create({ parentId: '1', title: name });
      if (name === '工具') toolsId = folder.id;
      for (const [subName, items] of Object.entries(subs)) {
        const sub = await chrome.bookmarks.create({ parentId: folder.id, title: subName });
        for (const [title, url] of items) await chrome.bookmarks.create({ parentId: sub.id, title, url });
      }
    }

    const now = Date.now();
    const result = (url, health, extra = {}) => ({
      url, health, failReason: null, redirectTo: null, httpStatus: 200, netError: null,
      networkMode: 'normal', checkedAt: now, ...extra,
    });
    const allUrls = [...new Set(Object.values(folders).flatMap((subs) => Object.values(subs).flat().map(([, url]) => url)))];
    const special = {
      'https://webpack.github.io/docs/': ['redirected', { redirectTo: 'https://webpack.js.org/concepts/', httpStatus: 301 }],
      'https://jira.example.com/secure/Dashboard.jspa': ['redirected', { redirectTo: 'https://jira.example.com/login', httpStatus: 301 }],
      'https://blog.example-defunct.dev/posts/1': ['broken', { failReason: 'not_found', httpStatus: 404 }],
      'https://news.example-gone.net/latest': ['broken', { failReason: 'not_found', httpStatus: 404 }],
      'https://console.cloud.example.com/': ['broken', { failReason: 'dns', httpStatus: null, netError: 'net::ERR_NAME_NOT_RESOLVED' }],
      'https://coolshell.cn/': ['broken', { failReason: 'timeout', httpStatus: null, netError: null }],
      'https://github.com/notifications': ['unknown', { failReason: 'need_login', httpStatus: 302 }],
      'https://gitlab.com/dashboard/todos': ['unknown', { failReason: 'need_login', httpStatus: 401 }],
      'https://www.linkedin.com/feed/': ['unknown', { failReason: 'need_login', httpStatus: 403 }],
      'https://www.zhipin.com/': ['unknown', { failReason: 'rate_limited', httpStatus: 429 }],
      'https://wiki.corp-example.com/home': ['unknown', { failReason: 'maybe_vpn', httpStatus: null, netError: 'net::ERR_NAME_NOT_RESOLVED' }],
      'https://grafana.corp-example.com/': ['unknown', { failReason: 'maybe_vpn', httpStatus: null, netError: 'net::ERR_NAME_NOT_RESOLVED' }],
      'https://git.corp-example.com/': ['unknown', { failReason: 'maybe_vpn', httpStatus: null, netError: 'net::ERR_NAME_NOT_RESOLVED' }],
    };
    // 少数几条留空不写结果，扫描页才有「还没检查」可展示
    const unscanned = new Set(['https://visualgo.net/zh', 'https://ocw.mit.edu/', 'https://www.amap.com/']);
    const results = allUrls
      .filter((url) => !unscanned.has(url))
      .map((url) => (special[url] ? result(url, special[url][0], special[url][1]) : result(url, 'healthy')));

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
    return toolsId;
  }, { folders: FOLDERS, baseUrl: `http://${AI_HOST}:${port}/v1` });

  await page.reload();
  await page.getByRole('navigation', { name: '主导航' }).waitFor();

  const setTheme = (mode) => page.getByRole('radiogroup', { name: '主题' }).getByRole('radio', { name: mode }).click();

  const shot = async (file, view) => {
    if (view) await nav(page, view);
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, file) });
    console.log(`已保存 ${file}`);
  };

  const selectBookmark = async () => {
    await nav(page, '全部书签');
    await page.getByRole('option').filter({ hasText: 'MDN Web 文档' }).first().click();
  };

  if (README) {
    await shot('overview.png', '总览');
    await setTheme('深色');
    await shot('overview-dark.png');
    await setTheme('浅色');
    await shot('launcher.png', '书签导航');
    await selectBookmark();
    await shot('bookmarks.png');
    await shot('scan.png', '健康扫描');
    await shot('broken.png', '失效链接');
    await shot('duplicates.png', '重复书签');
    // 智能整理：勾范围 → 假模型跑完 → 停在「去右侧预览」这一步，不真的移动书签
    await nav(page, '智能整理');
    await page.getByRole('checkbox', { name: /^工具/ }).click();
    await page.getByRole('button', { name: '开始整理' }).click();
    await page.getByText('已完成，去右侧预览并确认').waitFor({ timeout: 60_000 });
    await shot('organize.png');
  } else {
    await shot('1-overview.png', '总览');
    await selectBookmark();
    await shot('2-bookmarks.png');
    await shot('3-scan.png', '健康扫描');
    await shot('4-broken.png', '失效链接');
    await shot('5-duplicates.png', '重复书签');
    await nav(page, '书签导航');
    await setTheme('深色');
    await shot('6-launcher-dark.png');
    await setTheme('浅色');
  }
} finally {
  await close();
  // 浏览器留下的 keep-alive 连接会让 close() 一直等，先断开
  server.closeAllConnections();
  server.close();
}
