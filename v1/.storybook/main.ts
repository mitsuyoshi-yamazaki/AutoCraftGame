import type { StorybookConfig } from '@storybook/html-vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const config: StorybookConfig = {
  stories: ['../ui/stories/**/*.stories.ts'],
  addons: [],
  framework: '@storybook/html-vite',
  viteFinal: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': resolve(__dirname, '..', 'src'),
    };
    return config;
  },
};
export default config;
