import { init, isQuillmarkError } from '@quillmark/wasm';
import { assembleQuill } from './assemble.js';
import { check } from './naming.js';
import type { Field, FieldNaming, Form, Naming, Problem } from './api.js';
import type { QualifiedField } from './types.js';

export type Quillified =
	{ ok: true; tree: Map<string, Uint8Array> } | { ok: false; problems: readonly Problem[] };

/** The inventory's code for each kind, which is how the assembly tells a signature from a field. */
const WIDGET = {
	text: 'Tx',
	checkbox: 'Btn',
	radio: 'Btn',
	choice: 'Ch',
	signature: 'Sig'
} as const;

/** The engine reads `max:` as a u32, and a cap of 0 takes nothing. */
const capped = (max: number | undefined): max is number =>
	max !== undefined && Number.isInteger(max) && max > 0 && max <= 0xffffffff;

function typed(
	field: Field,
	text: FieldNaming['text']
): Pick<QualifiedField, 'type' | 'multiline' | 'options' | 'max'> {
	switch (field.kind) {
		case 'text':
			if (text === 'lines') return { type: 'array', multiline: true };
			return {
				type: 'string',
				multiline: text ? text === 'paragraph' : field.multiline,
				...(capped(field.maxLength) ? { max: field.maxLength } : {})
			};
		case 'choice':
			return { type: 'enum', multiline: false, options: [...field.options] };
		case 'checkbox':
		case 'radio':
			return { type: 'boolean', multiline: false };
		case 'signature':
			return { type: 'string', multiline: false };
	}
}

/** A choice shows one of its options even when the naming gives none, so its list is seen in the example. */
function shown(field: Field, suggested: string | undefined): string | undefined {
	const value = suggested?.trim() || undefined;
	if (field.kind === 'choice')
		return value !== undefined && field.options.includes(value) ? value : field.options[0];
	if (field.kind !== 'text') return undefined;
	return value && field.maxLength ? [...value].slice(0, field.maxLength).join('') : value;
}

/**
 * A quill's files from a sanitized form and a naming of its fields, or the
 * problems that stop one being built: `check`'s, and then the engine's.
 */
export async function quillify(form: Form, naming: Naming): Promise<Quillified> {
	const problems = check(form.fields, naming);
	if (problems.length > 0) return { ok: false, problems };

	const byId = new Map(form.fields.map((field) => [field.id, field]));
	const tree = assembleQuill(
		{
			quill: { name: naming.name, description: naming.description },
			fields: naming.fields.map((entry) => {
				const field = byId.get(entry.id)!;
				const example = shown(field, entry.example);
				return {
					widget: entry.id,
					name: entry.name,
					...(entry.title === undefined ? {} : { title: entry.title }),
					description: entry.description,
					...typed(field, entry.text),
					...(example === undefined ? {} : { example }),
					keep: entry.keep && !field.readOnly,
					required: field.required
				};
			})
		},
		{
			widgets: form.fields.map(({ id, kind, places, tooltip }) => ({
				id,
				kind: WIDGET[kind],
				places: [...places],
				tooltip
			}))
		},
		form.pdf
	);

	const { Quill } = await init();
	try {
		Quill.fromTree(tree).free();
	} catch (err) {
		if (!isQuillmarkError(err)) throw err;
		return {
			ok: false,
			problems: err.diagnostics.map(({ code, message }) => ({
				code: 'engine',
				diagnostic: code,
				message
			}))
		};
	}
	return { ok: true, tree };
}
