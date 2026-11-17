<script lang="ts">
	import './layout.css';
	import 'skullet/styles.css';
	import { ModeWatcher, mode } from 'mode-watcher';
	import { SkulletProvider } from 'skullet/svelte';
	import { onNavigate } from '$app/navigation';
	import { Toaster } from '$lib/components/ui/sonner';
	import { APP_NAME } from '$lib/constants';
	import { TAB_PATHS, tabFor } from '$lib/nav';
	import favicon from '$lib/assets/favicon.svg';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	onNavigate((navigation) => {
		if (!document.startViewTransition) return;
		const from = navigation.from?.url.pathname ?? '';
		const to = navigation.to?.url.pathname ?? '';
		if (from === to) return;

		// Switching tabs cuts, even from deep inside one; drilling in slides forward; going back or
		// up slides back.
		const kind =
			TAB_PATHS.includes(to) && tabFor(from) !== to
				? 'tab'
				: navigation.type === 'popstate' || from.startsWith(to)
					? 'back'
					: 'forward';
		document.documentElement.dataset.nav = kind;

		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});
</script>

<svelte:head>
	<title>{APP_NAME}</title>
	<link rel="icon" href={favicon} />
</svelte:head>

<ModeWatcher />
<Toaster position="top-center" />
<!-- Follows the app's chosen theme, not only the system's. -->
<SkulletProvider mode={mode.current ?? 'system'}>
	{@render children()}
</SkulletProvider>
