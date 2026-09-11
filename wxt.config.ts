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
    permissions: ['bookmarks', 'storage', 'unlimitedStorage'],
    // 扫描所需，首次点击「扫描书签」时再申请
    optional_permissions: ['webRequest'],
    optional_host_permissions: ['<all_urls>'],
    action: { default_title: 'Bookmark Hub' },
  },
});
