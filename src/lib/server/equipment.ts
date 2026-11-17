import { and, asc, eq, isNull, ne, or, sql, type Column } from 'drizzle-orm';
import QRCode from 'qrcode';
import { inUserLocation } from './access';
import { equipment } from './db/schema';

export function contains(column: Column, text: string) {
	const pattern = `%${text.replace(/[\\%_]/g, '\\$&')}%`;
	return sql`${column} LIKE ${pattern} ESCAPE '\\'`;
}

// Sort key for equipment lists: retired items go last.
export const retiredLast = sql`${equipment.status} = 'retired'`;

export const equipmentMatches = (text: string) =>
	or(
		contains(equipment.name, text),
		contains(equipment.manufacturer, text),
		contains(equipment.model, text),
		contains(equipment.serialNumber, text),
		contains(equipment.kind, text)
	);

// Items something can be attached to: visible to the user, not attached themselves, not this one.
export const attachTargets = (locals: App.Locals, selfId?: string) =>
	locals.db
		.select({ id: equipment.id, name: equipment.name, locationId: equipment.locationId })
		.from(equipment)
		.where(
			and(
				inUserLocation(locals, equipment.locationId),
				isNull(equipment.attachedToId),
				ne(equipment.status, 'retired'),
				selfId ? ne(equipment.id, selfId) : undefined
			)
		)
		.orderBy(asc(equipment.name));

// Checks an "attached to" choice from a form. Returns the parent's location, which the attached
// item takes, or an error. One level only, so nothing chains or loops.
export async function checkAttachment(
	locals: App.Locals,
	selfId: string | null,
	attachedToId: string
): Promise<{ locationId: string } | { error: string }> {
	if (attachedToId === selfId) return { error: "An item can't be attached to itself" };
	const [parent] = await locals.db
		.select({ locationId: equipment.locationId, attachedToId: equipment.attachedToId })
		.from(equipment)
		.where(and(eq(equipment.id, attachedToId), inUserLocation(locals, equipment.locationId)));
	if (!parent) return { error: 'Choose what it is attached to' };
	if (parent.attachedToId) return { error: 'That item is attached to something itself' };
	if (selfId) {
		const [child] = await locals.db
			.select({ id: equipment.id })
			.from(equipment)
			.where(eq(equipment.attachedToId, selfId))
			.limit(1);
		if (child) return { error: "Items with attachments can't be attached to something" };
	}
	return { locationId: parent.locationId };
}

// The label's QR code. It encodes /q/<id> on the origin it was made from, so labels printed from
// production point at production.
// Behind a TLS-terminating proxy (tailscale serve) the request arrives as http, so trust its
// x-forwarded-proto. Upgrade only: a spoofed header can't downgrade a label to http.
export const labelSvg = (url: URL, headers: Headers, id: string) => {
	const origin = headers.get('x-forwarded-proto') === 'https' ? `https://${url.host}` : url.origin;
	return QRCode.toString(`${origin}/q/${id}`, {
		type: 'svg',
		errorCorrectionLevel: 'M',
		margin: 2
	});
};

// The downloadable label: grows the QR's square viewBox and writes the id in the strip under it.
export const labelWithId = (svg: string, id: string) => {
	const n = Number(svg.match(/viewBox="0 0 (\d+) \d+"/)![1]);
	const h = Math.round(n * 0.15);
	// Monospace glyphs are about 0.6em wide; fit the id inside the box with 1 module of padding a side.
	const fs = Math.min(h * 0.6, (n - 6) / (id.length * 0.6));
	// The QR has a 2-module quiet zone: the box lines up with the code and keeps that margin below.
	return svg
		.replace(/viewBox="0 0 \d+ \d+"/, `viewBox="0 0 ${n} ${n + h + 2}"`)
		.replace(
			'</svg>',
			`<rect y="${n}" width="${n}" height="${h + 2}" fill="#ffffff"/>` +
				`<rect x="2" y="${n}" width="${n - 4}" height="${h}" fill="#000000"/>` +
				`<text x="${n / 2}" y="${n + h / 2 + fs * 0.35}" text-anchor="middle" font-family="monospace" font-size="${fs}" fill="#ffffff">${id}</text></svg>`
		);
};
