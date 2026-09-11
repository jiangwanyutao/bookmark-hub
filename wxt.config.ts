import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Bookmark Hub',
    description: '检测、清理、整理你的浏览器书签',
    permissions: ['bookmarks'],
    action: { default_title: 'Bookmark Hub' },
  },
});
