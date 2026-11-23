import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { statusLabel, statusValues } from '$lib/constants';
import { equipmentDetails, logLines } from './ai';
import { inUserLocation } from './access';
import { excerpt, type Lookup } from './ai-chat';
import { equipment, location, maintenanceLog } from './db/schema';
import { contains, equipmentMatches } from './equipment';
import { searchManual } from './manuals';

const FIND_LIMIT = 25;
const LOG_LIMIT = 15;

export const generalTools = [
	{
		type: 'function',
		function: {
			name: 'find_equipment',
			description:
				'Find equipment by text, status or location. Returns matching items with their status. All filters are optional.',
			parameters: {
				type: 'object',
				properties: {
					query: { type: 'string', description: 'Name, manufacturer, model or serial number' },
					status: { type: 'string', enum: statusValues },
					location: { type: 'string', description: 'Part of a location name' }
				},
				additionalProperties: false
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'get_equipment',
			description: 'Get one item: its details, notes, whether it has a manual, and recent logs.',
			parameters: {
				type: 'object',
				properties: { id: { type: 'string', description: 'Equipment id' } },
				required: ['id'],
				additionalProperties: false
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'search_manual',
			description:
				"Keyword search of one item's operator manual. Returns passages with page numbers. Use the wording a manual would use.",
			parameters: {
				type: 'object',
				properties: {
					id: { type: 'string', description: 'Equipment id' },
					query: { type: 'string', description: 'Search keywords' }
				},
				required: ['id', 'query'],
				additionalProperties: false
			}
		}
	}
];

const Find = z.object({
	query: z.string().nullish(),
	status: z.enum(statusValues).nullish(),
	location: z.string().nullish()
});
const Get = z.object({ id: z.string() });
const Search = Get.extend({ query: z.string() });

const INVALID = 'Those arguments are not valid.';
const NOT_FOUND = 'No equipment with that id is available to this user.';

// These arguments come from the model, which reads notes and logs anyone can write, so each one
// applies the user's location itself. Nothing here changes data.
export function generalLookups(locals: App.Locals): Record<string, Lookup> {
	const inScope = inUserLocation(locals, equipment.locationId);

	const item = (id: string) =>
		locals.db.query.equipment.findFirst({
			where: and(eq(equipment.id, id), inScope),
			with: {
				location: { columns: { name: true } },
				manual: { columns: { id: true, name: true, chunkCount: true } },
				logs: { orderBy: [desc(maintenanceLog.performedOn)], limit: LOG_LIMIT }
			}
		});

	return {
		find_equipment: {
			label: 'Looking up equipment…',
			run: async (args) => {
				const parsed = Find.safeParse(args);
				if (!parsed.success) return { text: INVALID };
				const { query, status, location: place } = parsed.data;
				const rows = await locals.db
					.select({
						id: equipment.id,
						name: equipment.name,
						status: equipment.status,
						location: location.name
					})
					.from(equipment)
					.innerJoin(location, eq(equipment.locationId, location.id))
					.where(
						and(
							inScope,
							query ? equipmentMatches(query) : undefined,
							status ? eq(equipment.status, status) : undefined,
							place ? contains(location.name, place) : undefined
						)
					)
					.orderBy(asc(equipment.name))
					.limit(FIND_LIMIT + 1);
				if (!rows.length) return { text: 'No equipment matches.' };
				const lines = rows
					.slice(0, FIND_LIMIT)
					.map((r) => `${r.id} | ${r.name} | ${r.location} | ${statusLabel(r.status)}`);
				if (rows.length > FIND_LIMIT) lines.push(`Only the first ${FIND_LIMIT} are shown.`);
				return { text: lines.join('\n') };
			}
		},

		get_equipment: {
			label: 'Looking up equipment…',
			run: async (args) => {
				const parsed = Get.safeParse(args);
				if (!parsed.success) return { text: INVALID };
				const found = await item(parsed.data.id);
				if (!found) return { text: NOT_FOUND };
				const logs = logLines(found.logs);
				return {
					text: [
						...equipmentDetails(found),
						`Manual: ${found.manual ? `${found.manual.name}${found.manual.chunkCount ? '' : ' (scanned, cannot be searched)'}` : 'None'}`,
						'',
						`Maintenance history (newest first, ${logs.length} shown):`,
						...(logs.length ? logs : ['None recorded.'])
					].join('\n'),
					source: { id: found.id, name: found.name }
				};
			}
		},

		search_manual: {
			label: 'Searching the manual…',
			run: async (args) => {
				const parsed = Search.safeParse(args);
				if (!parsed.success) return { text: INVALID };
				const found = await item(parsed.data.id);
				if (!found) return { text: NOT_FOUND };
				if (!found.manual?.chunkCount) return { text: 'This item has no searchable manual.' };
				const manualId = found.manual.id;
				const hits = await searchManual(locals.db, manualId, parsed.data.query);
				return {
					text: hits.length
						? hits.map((hit) => `[page ${hit.page}] ${hit.text}`).join('\n\n')
						: 'No matching passages.',
					source: { id: found.id, name: found.name },
					citations: hits.map((hit) => ({
						manualId,
						equipmentId: found.id,
						name: found.name,
						page: hit.page,
						excerpt: excerpt(hit.text)
					}))
				};
			}
		}
	};
}
