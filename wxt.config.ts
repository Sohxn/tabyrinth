import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Tabyrinth',
    description: 'Vertical tabs but better',
    version: '1.0.0',
    permissions: [
      'tabs',
      'storage',
      'sidePanel',
      'alarms',
      'contextMenus',
      'idle',
      'downloads',
      'scripting',
      'activeTab'
    ],
    action: {},
    commands: {
      "open-tabyrinth": {
        "suggested_key": {
          "default": "Ctrl+Shift+Y"
        },
        "description": "Open Tabyrinth Sidebar"
      },
    },
    side_panel: {
      default_path: 'sidepanel.html'
    },
    runner: {
      startUrls: ['https://www.google.com'],
    }
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
