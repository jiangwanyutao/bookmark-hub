import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'Bookmark Hub',
    description: '检测、清理、整理你的浏览器书签',
    // storage：保存 AI 配置（只存本机，不随 Chrome 同步）
    // favicon：新标签页用浏览器缓存的网站图标；search：新标签页回车用默认搜索引擎搜网页
    permissions: ['bookmarks', 'storage', 'unlimitedStorage', 'favicon', 'search'],
    // 扫描所需，首次点击「扫描书签」时再申请
    optional_permissions: ['webRequest'],
    optional_host_permissions: ['<all_urls>'],
    action: { default_title: 'Bookmark Hub' },
  },
});
