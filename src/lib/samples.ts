// Stand-ins that shape a skeleton before a page's real data has ever loaded.
const rows = <T>(n: number, row: (i: number) => T) => Array.from({ length: n }, (_, i) => row(i));

export const sampleEquipment = (n = 8) =>
	rows(n, (i) => ({
		id: `sample-${i}`,
		name: 'Equipment item name',
		status: 'active',
		locationName: 'Location name',
		coverId: null,
		due: null
	}));

export const sampleLogs = (n = 6) =>
	rows(n, (i) => ({
		id: `sample-${i}`,
		equipmentId: '',
		type: 'service',
		summary: 'Maintenance summary',
		description: 'What was done, in a line or two of text.',
		performedBy: null,
		performedOn: '2026-01-01',
		author: { name: 'Someone' },
		photos: [],
		equipment: { name: 'Equipment item name' }
	}));
