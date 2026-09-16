// 商店截图：灌入演示书签和扫描结果，按商店要求的 1280×800 逐页截图。
// 用法：node e2e/screenshots.mjs [输出目录]（默认 .output/store/edge）
import fs from 'node:fs';
import path from 'node:path';
import { launchExtension, nav } from './helpers.mjs';

const OUT = path.resolve(process.argv[2] ?? '.output/store/edge');
const SIZE = { width: 1280, height: 800 };

fs.mkdirSync(OUT, { recursive: true });
const { page, close } = await launchExtension();

try {
  await page.setViewportSize(SIZE);
  await page.evaluate(async () => {
    // 两级目录：一级目录下分子目录，书签分布和目录树才有层次
    const folders = {
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
    for (const [name, subs] of Object.entries(folders)) {
      const folder = await chrome.bookmarks.create({ parentId: '1', title: name });
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
    const allUrls = [
      ...new Set(Object.values(folders).flatMap((subs) => Object.values(subs).flat().map(([, url]) => url))),
    ];
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
  });
  await page.reload();
  await page.getByRole('navigation', { name: '主导航' }).waitFor();

  const setTheme = (mode) =>
    page.getByRole('radiogroup', { name: '主题' }).getByRole('radio', { name: mode }).click();

  const shot = async (file, view) => {
    if (view) await nav(page, view);
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, file) });
    console.log(`已保存 ${file}`);
  };

  await shot('1-overview.png', '总览');

  // 选中一条，右侧详情面板才有内容可看
  await nav(page, '全部书签');
  await page.getByRole('option').filter({ hasText: 'MDN Web 文档' }).first().click();
  await shot('2-bookmarks.png');
  await shot('3-scan.png', '健康扫描');
  await shot('4-broken.png', '失效链接');
  await shot('5-duplicates.png', '重复书签');

  await nav(page, '书签导航');
  await setTheme('深色');
  await shot('6-launcher-dark.png');
  await setTheme('浅色');
} finally {
  await close();
}
