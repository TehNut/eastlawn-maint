export { cn } from 'cn';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, 'child'> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, 'children'> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U = HTMLElement> = T & { ref?: U | null };

// Width for list pages that grow with the screen (Equipment, Due); other pages stay max-w-3xl.
// Kept literal so Tailwind generates it; the rem breakpoint is 1800px.
export const WIDE_PAGE = 'max-w-3xl lg:max-w-7xl min-[112.5rem]:max-w-[1640px]';

// Lists are separate cards. CARD_LIST stacks them; CARD_GRID also adds columns on wide pages.
export const CARD = 'rounded-xl border bg-card';
export const CARD_LINK = 'rounded-xl border bg-card hover:bg-muted/50 active:bg-muted';
export const CARD_LIST = 'grid gap-2 px-4';
export const CARD_GRID =
	'grid gap-2 px-4 lg:grid-cols-2 lg:gap-3 xl:grid-cols-3 min-[112.5rem]:grid-cols-4';

// Saved pages default to the name "Page 84", which already says the page; don't repeat it.
export const namesPage = (label: string, page: number) => new RegExp(`\\b${page}\\b`).test(label);
