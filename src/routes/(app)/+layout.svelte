<script lang="ts">
	import CalendarClock from '@lucide/svelte/icons/calendar-clock';
	import Wrench from '@lucide/svelte/icons/wrench';
	import History from '@lucide/svelte/icons/history';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import CircleUser from '@lucide/svelte/icons/circle-user';
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	import Settings from '@lucide/svelte/icons/settings';
	import LogOut from '@lucide/svelte/icons/log-out';
	import Monitor from '@lucide/svelte/icons/monitor';
	import Sun from '@lucide/svelte/icons/sun';
	import Moon from '@lucide/svelte/icons/moon';
	import { DropdownMenu as MenuPrimitive } from 'bits-ui';
	import { setMode, userPrefersMode } from 'mode-watcher';
	import { navigating, page } from '$app/state';
	import { signOut } from '$lib/auth-client';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { APP_NAME } from '$lib/constants';
	import { tabFor } from '$lib/nav';
	import { can } from '$lib/permissions';

	let { children, data } = $props();

	const themes = [
		{ value: 'system', label: 'System', icon: Monitor },
		{ value: 'light', label: 'Light', icon: Sun },
		{ value: 'dark', label: 'Dark', icon: Moon }
	];

	const tabs = $derived([
		{ href: '/', label: 'Equipment', icon: Wrench },
		{ href: '/due', label: 'Due', icon: CalendarClock },
		...(can(data.user, 'ai.use') ? [{ href: '/chat', label: 'Assistant', icon: Sparkles }] : []),
		{ href: '/activity', label: 'Activity', icon: History },
		{ href: '/account', label: 'Account', icon: CircleUser }
	]);

	const path = $derived(page.url.pathname);
	const isActive = (href: string) => tabFor(path) === href;
	// Focused tasks take the whole screen on phones, like a pushed view.
	const isFocused = (p: string) => /\/(ask|new|edit|label)$/.test(p) || p.startsWith('/manuals/');
	const focused = $derived(isFocused(path));
	// Hide the bar on tap rather than after the next page's data has loaded.
	const hideNav = $derived(focused || isFocused(navigating.to?.url.pathname ?? path));
</script>

<div
	class="min-h-dvh md:pl-56 {focused ? '' : 'pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0'}"
>
	{@render children()}
</div>

<nav
	aria-label="Main"
	style="view-transition-name: tab-bar"
	class="no-print fixed inset-x-0 bottom-0 z-30 {tabs.length === 5
		? 'grid-cols-5'
		: 'grid-cols-4'} grid border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur transition-[translate,visibility] duration-150 ease-in motion-reduce:transition-none md:inset-y-0 md:right-auto md:flex md:w-56 md:flex-col md:gap-1 md:border-t-0 md:border-r md:border-sidebar-border md:bg-sidebar md:p-3 md:transition-none {hideNav
		? 'max-md:invisible max-md:translate-y-full'
		: ''}"
>
	<p class="hidden px-3 py-2 font-semibold md:block">{APP_NAME}</p>
	{#each tabs as tab (tab.href)}
		<a
			href={tab.href}
			aria-current={isActive(tab.href) ? 'page' : undefined}
			class="{tab.href === '/account'
				? 'md:hidden'
				: ''} flex h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-medium md:h-10 md:flex-row md:justify-start md:gap-3 md:rounded-md md:px-3 md:text-sm {isActive(
				tab.href
			)
				? 'text-primary md:bg-sidebar-accent md:text-sidebar-accent-foreground'
				: 'text-muted-foreground md:hover:bg-sidebar-accent/50 md:hover:text-foreground'}"
		>
			<tab.icon class="size-6 md:size-4" />
			{tab.label}
		</a>
	{/each}
	<!-- Desktop only: phones keep Account as a tab. -->
	<div class="mt-auto hidden border-t border-sidebar-border pt-3 md:block">
		<DropdownMenu.Root>
			<DropdownMenu.Trigger
				class="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-sidebar-accent/50 data-[state=open]:bg-sidebar-accent {isActive(
					'/account'
				)
					? 'bg-sidebar-accent'
					: ''}"
			>
				<span
					class="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
					aria-hidden="true"
				>
					{data.user.name.trim().charAt(0).toUpperCase()}
				</span>
				<span class="min-w-0 flex-1">
					<span class="block truncate font-medium">{data.user.name}</span>
					<span class="block truncate text-xs text-muted-foreground">{data.user.email}</span>
				</span>
				<ChevronsUpDown class="size-4 shrink-0 text-muted-foreground" />
			</DropdownMenu.Trigger>
			<DropdownMenu.Content side="top" align="start">
				<div class="flex items-center justify-between gap-2 py-1 pr-1 pl-1.5">
					<span class="text-sm" id="theme-label">Theme</span>
					<!-- Primitive items so the shadcn wrapper's check mark doesn't crowd the icons. -->
					<MenuPrimitive.RadioGroup
						aria-labelledby="theme-label"
						value={userPrefersMode.current}
						onValueChange={(v) => setMode(v as 'light' | 'dark' | 'system')}
						class="flex gap-0.5 rounded-md bg-muted p-0.5"
					>
						{#each themes as theme (theme.value)}
							<MenuPrimitive.RadioItem
								value={theme.value}
								closeOnSelect={false}
								aria-label={theme.label}
								title={theme.label}
								class="flex size-7 items-center justify-center rounded text-muted-foreground outline-hidden data-highlighted:text-foreground data-[state=checked]:bg-background data-[state=checked]:text-foreground data-[state=checked]:shadow-sm"
							>
								<theme.icon class="size-4" />
							</MenuPrimitive.RadioItem>
						{/each}
					</MenuPrimitive.RadioGroup>
				</div>
				<DropdownMenu.Separator />
				<DropdownMenu.Item>
					{#snippet child({ props })}
						<a href="/account" {...props}><CircleUser />Account</a>
					{/snippet}
				</DropdownMenu.Item>
				{#if can(data.user, 'users.create')}
					<DropdownMenu.Item>
						{#snippet child({ props })}
							<a href="/settings" {...props}><Settings />App settings</a>
						{/snippet}
					</DropdownMenu.Item>
				{/if}
				<DropdownMenu.Item variant="destructive" onSelect={signOut}>
					<LogOut />Sign out
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</div>
</nav>
