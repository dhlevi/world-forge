import { createApp } from 'vue';
import App from './App.vue';
import './style.css';
import { installErrorHandlers } from './app/errors';

const app = createApp(App);
installErrorHandlers(app);
app.mount('#app');
