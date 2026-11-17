// The tab bar's pages. Shared by the tab bar and the page transitions so they agree on what a
// tab switch is.
export const TAB_PATHS = ['/', '/due', '/chat', '/activity', '/account'];

// The tab a page sits under, if any: an equipment page is under Equipment, App settings under Account.
export function tabFor(path: string) {
	if (path === '/' || path.startsWith('/equipment')) return '/';
	if (path.startsWith('/settings')) return '/account';
	return TAB_PATHS.find((tab) => tab !== '/' && path.startsWith(tab));
}
