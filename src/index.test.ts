import { expect, it } from 'vitest';
import type {
	Field,
	FieldNaming,
	Form,
	Naming,
	Place,
	Problem,
	Quillified,
	Rect,
	Refusal,
	Sanitized,
	Size
} from './index.js';

// The import compiles every module behind the entry point, which takes seconds on a loaded machine.
it('imports where there is no DOM, and exports the public functions and nothing else', async () => {
	expect(Object.keys(await import('./index.js')).sort()).toEqual([
		'check',
		'quillify',
		'sanitize',
		'suggest'
	]);
}, 60_000);

it('exports each type a caller has to name', () => {
	// Compiles only while the entry point exports every one.
	const types: [
		Field,
		FieldNaming,
		Form,
		Naming,
		Place,
		Problem,
		Quillified,
		Rect,
		Refusal,
		Sanitized,
		Size
	][] = [];
	expect(types).toEqual([]);
});
