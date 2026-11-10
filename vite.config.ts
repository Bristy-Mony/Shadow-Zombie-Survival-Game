import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/Shadow-Zombie-Survival-Game/' : '/',
}));
