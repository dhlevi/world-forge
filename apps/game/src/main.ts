import { createApp } from 'vue';
import App from './App.vue';
import './style.css';
import { installErrorHandlers } from './app/errors';

// Development only: ?tileset-template makes the tileset template (npm run tileset:template).
if (import.meta.env.DEV && new URLSearchParams(location.search).has('tileset-template')) {
  const el = document.getElementById('app')!;
  import('./dev/tileset-template')
    .then((m) => m.runTemplatePage(el, import.meta.env.BASE_URL))
    .catch((e: unknown) => {
      el.textContent = `The tileset template could not be made: ${e instanceof Error ? e.message : String(e)}`;
    });
} else {
  const app = createApp(App);
  installErrorHandlers(app);
  app.mount('#app');
}
