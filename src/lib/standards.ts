// Fleet product standards: one brand per product, from the cemetery-maintenance skill. These
// only advise. A consumable can still name another brand, and logs record what was installed.

export type Standard = {
	product: string;
	// Comma-separated keywords matched against the consumable's item name.
	matches: string;
	brand: string;
	crossFormat: boolean;
	notes: string | null;
};

const keywords = (s: Standard) =>
	s.matches
		.split(',')
		.map((k) => k.trim().toLowerCase())
		.filter(Boolean);

// Standards whose keywords appear in the item name, e.g. "Engine oil" matches both engine oil
// standards, since the app doesn't know whether a machine is diesel or gasoline.
export function standardsFor(item: string, standards: Standard[]) {
	const name = item.toLowerCase();
	return standards.filter((s) => keywords(s).some((k) => name.includes(k)));
}

// True when the spec names a brand but none of the matching standards' brands. An empty spec is
// "unknown", which is allowed, so it doesn't warn.
export function offStandard(spec: string, matching: Standard[]) {
	if (!spec.trim() || !matching.length) return false;
	const text = spec.toLowerCase();
	return !matching.some((s) => text.includes(s.brand.toLowerCase()));
}

// The skill's three filter forms. Never makes up a number: blanks stay out of the spec.
export function crossSpec(brand: string, number: string, oem: string) {
	const n = number.trim();
	const o = oem.trim();
	const head = n ? `${brand} ${n}` : brand;
	return o ? `${head}, crosses to ${o}` : head;
}
