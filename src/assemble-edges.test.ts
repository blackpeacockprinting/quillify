/**
 * What `assembleQuill` writes where the carried test does not look: a
 * signature's tooltip, an example on a field that shows none, and the end of
 * `form.json`.
 */

import { expect, it } from 'vitest';
import { assembleQuill, quillYaml } from './assemble.js';

const QUILL = { name: 'sample', description: 'Sample.' };
const FIELD = {
	widget: 'a',
	name: 'a',
	description: 'A.',
	type: 'string',
	multiline: false,
	keep: true,
	required: false
} as const;
const RECT = { x: 1, y: 2, w: 3, h: 4 };
const placed = (id: string, kind: 'Tx' | 'Btn' | 'Sig', tooltip?: string) => ({
	id,
	kind,
	tooltip,
	places: [{ page: 0, rect: RECT }]
});
const text = (tree: Map<string, Uint8Array>, name: string) =>
	new TextDecoder().decode(tree.get(name));

it('gives a signature its tooltip, and ends form.json with a line feed', () => {
	const tree = assembleQuill(
		{ quill: QUILL, fields: [{ ...FIELD, widget: 'sig', name: 'sig' }] },
		{ widgets: [placed('sig', 'Sig', 'Sign here')] },
		new Uint8Array()
	);
	expect(JSON.parse(text(tree, 'form.json')).widgets).toEqual([
		{ name: 'sig', type: 'signature', page: 0, rect: RECT, tooltip: 'Sign here' }
	]);
	expect(text(tree, 'form.json').endsWith('}\n')).toBe(true);
});

it('writes no example for a boolean, and none for a signature', () => {
	const tree = assembleQuill(
		{
			quill: QUILL,
			fields: [
				{ ...FIELD, example: 'x' },
				{ ...FIELD, widget: 'tick', name: 'tick', type: 'boolean', example: 'true' },
				{ ...FIELD, widget: 'sig', name: 'sig', example: 'A-1' }
			]
		},
		{ widgets: [placed('a', 'Tx'), placed('tick', 'Btn'), placed('sig', 'Sig')] },
		new Uint8Array()
	);
	expect(text(tree, 'example.md')).toBe('~~~\n$quill: "sample"\n"a": "x"\n~~~\n');
});

it('writes a character the engine refuses as four hex digits', () => {
	const yaml = quillYaml({ quill: { ...QUILL, name: 'a\u007fb\u0085' }, fields: [] }, []);
	expect(yaml).toContain('name: "a\\u007fb\\u0085"');
});

it('writes no fields key for a form with no field', () => {
	expect(quillYaml({ quill: QUILL, fields: [] }, []).endsWith('    enabled: false\n')).toBe(true);
});

it('marks a text box that takes lines', () => {
	const yaml = quillYaml({ quill: QUILL, fields: [] }, [{ ...FIELD, multiline: true }]);
	expect(yaml).toContain('      default: ""\n      ui:\n        multiline: true\n');
});

it('makes a dropdown a text box when any one value holds what the engine refuses', () => {
	const yaml = quillYaml({ quill: QUILL, fields: [] }, [
		{ ...FIELD, type: 'enum', options: ['', 'a;b', 'c'] }
	]);
	expect(yaml).toContain('      type: string\n      default: ""\n      description');
});

it('gives a dropdown and a list a default unless they are required', () => {
	const yaml = (type: 'enum' | 'array', required: boolean) =>
		quillYaml({ quill: QUILL, fields: [] }, [{ ...FIELD, type, options: ['a'], required }]);
	expect(yaml('enum', false)).toContain('        - "a"\n      default: ""\n');
	expect(yaml('enum', true)).not.toContain('default:');
	expect(yaml('array', false)).toContain('      default: []\n');
	expect(yaml('array', true)).not.toContain('default:');
});

it('names the second place of a field after the first, with its tooltip, two spaces a level', () => {
	const places = [0, 1].map((page) => ({ page, rect: RECT }));
	const tree = assembleQuill(
		{ quill: QUILL, fields: [FIELD] },
		{ widgets: [{ id: 'a', kind: 'Tx', tooltip: 'Name', places }] },
		new Uint8Array()
	);
	expect(JSON.parse(text(tree, 'form.json')).fields).toEqual(
		[0, 1].map((page) => ({
			name: page ? 'a#2' : 'a',
			schema_field: 'a',
			page,
			rect: RECT,
			tooltip: 'Name'
		}))
	);
	expect(text(tree, 'form.json')).toContain('{\n  "schema": "quillmark/form@0.2.0",\n');
});
