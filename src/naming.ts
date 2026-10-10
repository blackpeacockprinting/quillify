import { SNAKE_CASE } from './types.js';
import type { Field, FieldNaming, Naming, Problem } from './api.js';

const MAX_LENGTH = 40;

const snake = (text: string) =>
	text
		.replace(/([a-z0-9])([A-Z])/g, '$1_$2')
		.replace(/[^A-Za-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '')
		.toLowerCase();

/** The last segment of the LiveCycle id `form1[0].page1[0].Header[0].dateReq[0]` is `dateReq`. */
const lastSegment = (path: string) => path.slice(path.lastIndexOf('.') + 1).replace(/\[\d+\]$/, '');

export function suggest(fields: readonly Field[]): FieldNaming[] {
	const taken = new Set<string>();
	return fields.map((field) => {
		const words =
			snake(field.tooltip ?? '') ||
			snake(
				field.kind === 'radio'
					? `${lastSegment(field.group)} ${field.on ?? ''}`
					: lastSegment(field.id)
			);
		let base = /^[a-z]/.test(words) ? words : words ? `field_${words}` : 'field';
		if (base.length > MAX_LENGTH) {
			const whole = base.slice(0, Math.max(0, base.lastIndexOf('_', MAX_LENGTH)));
			base = whole && whole !== 'field' ? whole : base.slice(0, MAX_LENGTH);
		}
		let name = base;
		for (let n = 2; taken.has(name); n++) name = `${base}_${n}`;
		taken.add(name);
		return { id: field.id, keep: !field.readOnly, name, description: field.tooltip ?? '' };
	});
}

export function check(fields: readonly Field[], naming: Naming): Problem[] {
	const problems: Problem[] = [];
	if (!SNAKE_CASE.test(naming.name)) problems.push({ code: 'quill_name' });
	if (/^\p{White_Space}*$/u.test(naming.description)) problems.push({ code: 'quill_description' });

	const ids = new Set(fields.map((field) => field.id));
	const entries = Map.groupBy(naming.fields, (entry) => entry.id);
	for (const id of entries.keys()) if (!ids.has(id)) problems.push({ code: 'unknown_field', id });
	for (const [id, sharing] of entries)
		if (sharing.length > 1) problems.push({ code: 'repeated_field', id });
	for (const id of ids) if (!entries.has(id)) problems.push({ code: 'unnamed_field', id });

	const kept = naming.fields.filter((entry) => entry.keep && ids.has(entry.id));
	if (kept.length === 0) problems.push({ code: 'nothing_kept' });
	for (const { id, name } of kept)
		if (!SNAKE_CASE.test(name)) problems.push({ code: 'field_name', id });
	for (const [name, sharing] of Map.groupBy(kept, (entry) => entry.name))
		if (sharing.length > 1) problems.push({ code: 'duplicate_name', name });
	for (const { id, kind } of fields)
		if (kind !== 'text' && entries.get(id)?.some((entry) => entry.text))
			problems.push({ code: 'text_on_non_text', id });
	return problems;
}
