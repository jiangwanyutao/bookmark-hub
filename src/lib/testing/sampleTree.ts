import type { TreeNode } from '../bookmarks';

/**
 * 仅供非扩展环境（如 v0 预览、Storybook）渲染界面用的示例书签树，
 * 结构对齐 chrome.bookmarks.getTree()：depth 0 是无标题根，depth 1 是内置目录。
 * 真实扩展里读取的是浏览器书签，这份数据不会被用到。
 */
let clock = 1_600_000_000_000;
const day = 86_400_000;

function link(id: string, title: string, url: string): TreeNode {
  clock -= day;
  return { id, title, url, dateAdded: clock };
}

function folder(id: string, title: string, children: TreeNode[]): TreeNode {
  return { id, title, children };
}

export const sampleTree: TreeNode[] = [
  {
    id: '0',
    title: '',
    children: [
      folder('1', '书签栏', [
        folder('10', '开发', [
          folder('100', '文档', [
            link('1000', 'MDN Web Docs', 'https://developer.mozilla.org/'),
            link('1001', 'React 官方文档', 'https://react.dev/'),
            link('1002', 'TypeScript 手册', 'https://www.typescriptlang.org/docs/'),
            link('1003', 'Tailwind CSS', 'https://tailwindcss.com/docs'),
            link('1004', 'Node.js API', 'https://nodejs.org/api/'),
            link('1005', 'Vite 指南', 'https://vitejs.dev/guide/'),
          ]),
          folder('101', '工具', [
            link('1010', 'GitHub', 'https://github.com/'),
            link('1011', 'Vercel Dashboard', 'https://vercel.com/dashboard'),
            link('1012', 'Regex101', 'https://regex101.com/'),
            link('1013', 'Can I use', 'https://caniuse.com/'),
            link('1014', 'Excalidraw', 'https://excalidraw.com/'),
          ]),
          folder('102', '灵感', [
            link('1020', 'Dribbble', 'https://dribbble.com/'),
            link('1021', 'Awwwards', 'https://www.awwwards.com/'),
            link('1022', 'Godly · Web Design', 'https://godly.website/'),
          ]),
        ]),
        folder('11', '阅读', [
          link('110', 'Hacker News', 'https://news.ycombinator.com/'),
          link('111', 'Stack Overflow', 'https://stackoverflow.com/'),
          link('112', 'Smashing Magazine', 'https://www.smashingmagazine.com/'),
          link('113', 'CSS-Tricks', 'https://css-tricks.com/'),
          link('114', 'Overreacted', 'https://overreacted.io/'),
          // 与 101 里的 GitHub 重复，触发「重复书签」
          link('115', 'GitHub', 'https://github.com/'),
        ]),
        link('12', 'Google', 'https://www.google.com/'),
        link('13', 'YouTube', 'https://www.youtube.com/'),
        link('14', 'Figma', 'https://www.figma.com/'),
      ]),
      folder('2', '其他书签', [
        folder('20', '待读', [
          link('200', '深入理解 HTTP/3', 'https://http3-explained.haxx.se/'),
          link('201', 'The Rust Book', 'https://doc.rust-lang.org/book/'),
          link('202', '一个已失效的旧博客', 'https://example-defunct-blog.dev/post/42'),
          link('203', 'Postgres 文档', 'https://www.postgresql.org/docs/'),
        ]),
        folder('21', '购物', [
          link('210', '京东', 'https://www.jd.com/'),
          link('211', '淘宝', 'https://www.taobao.com/'),
        ]),
        link('22', '知乎', 'https://www.zhihu.com/'),
        link('23', 'Notion', 'https://www.notion.so/'),
        link('24', 'Linear', 'https://linear.app/'),
      ]),
    ],
  },
];
