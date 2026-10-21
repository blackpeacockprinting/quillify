import type { Field, FieldNaming } from './api.js';
import type { QualifiedField } from './types.js';

/** The engine reads `max:` as a u32, and a cap of 0 takes nothing. */
const capped = (max: number | undefined): max is number =>
	max !== undefined && Number.isInteger(max) && max > 0 && max <= 0xffffffff;

export function typed(
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

/**
 * The value a field takes, which fields that share a name agree on. A signature
 * takes none, and a radio button's is one answer of its group, which no other
 * field gives.
 */
export function shape(field: Field, text: FieldNaming['text']): string | null {
	if (field.kind === 'signature' || field.kind === 'radio') return null;
	const { type, multiline, options } = typed(field, text);
	return JSON.stringify([type, multiline, options ?? []]);
}
