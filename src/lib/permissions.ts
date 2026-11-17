export const PERMISSIONS = [
	{ value: 'admin', label: 'Admin', hint: 'Everything here, plus managing users and locations' },
	{ value: 'users.create', label: 'Create users', hint: 'New users start with no flags' },
	{ value: 'ai.use', label: 'Use AI chat', hint: '' },
	{ value: 'ai.modify', label: 'AI changes', hint: 'Also needs the matching flag below' },
	{ value: 'equipment.create', label: 'Create equipment', hint: '' },
	{ value: 'equipment.update', label: 'Update equipment', hint: '' },
	{ value: 'equipment.delete', label: 'Delete equipment', hint: '' },
	{ value: 'log.create', label: 'Create logs', hint: '' },
	{ value: 'log.update', label: 'Update logs', hint: '' },
	{ value: 'log.delete', label: 'Delete logs', hint: '' }
] as const;

export type Permission = (typeof PERMISSIONS)[number]['value'];

export const can = (user: { permissions: string[] } | null, permission: Permission) =>
	!!user && (user.permissions.includes('admin') || user.permissions.includes(permission));

export const toPermissions = (values: unknown[]) =>
	PERMISSIONS.map((p) => p.value).filter((p) => values.includes(p));
