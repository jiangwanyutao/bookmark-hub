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
    permissions: ['bookmarks'],
    action: { default_title: 'Bookmark Hub' },
  },
});
