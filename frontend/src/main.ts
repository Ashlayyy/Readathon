import './assets/main.css';

import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import { useTheme } from './composables/useTheme';
import { initPostHog } from './lib/posthog';
import * as Sentry from '@sentry/vue';

// Apply saved theme preference before first paint so branding never flashes over it.
useTheme().applyTheme();
initPostHog();

const app = createApp(App);

app.use(router);

Sentry.init({
	app,
	dsn: 'https://a87be47375e3fd696f9936f24e17fe4e@o4512284365946880.ingest.de.sentry.io/4512284373876816',
	integrations: [
		Sentry.browserTracingIntegration({ router }),
		Sentry.replayIntegration(),
	],
	tracesSampleRate: 1.0,
	tracePropagationTargets: ['localhost', /^https:\/\/bookbaddies\.net\/api/],
	replaysSessionSampleRate: 0.1,
	replaysOnErrorSampleRate: 1.0,
});

app.mount('#app');

void import('./router').then(({ prefetchAppRoutes }) => {
	prefetchAppRoutes();
});

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
	window.addEventListener('load', () => {
		navigator.serviceWorker.register('/sw.js').catch((err) => {
			console.warn('Service worker registration failed:', err);
		});
	});
}
