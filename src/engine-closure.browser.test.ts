/**
 * What the importer writes in `form.json` is what the engine stamps: every
 * entry is in the rendered PDF under the same name, on the same page and at
 * the same rect, on a page the size the inventory measured, and the PDF has no
 * field `form.json` does not name. qpdf reads the stamped fields back.
 */

import wasmUrl from '@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url';
import { expect, it } from 'vitest';
import { fromTree, render } from '../test/engine.js';
import { assembleQuill } from './assemble.js';
import { toTopLeftRect } from './coords.js';
import { inventoryPdf } from './inventory.js';
import { normalizePdf } from './normalize.js';
import { stripAcroForm } from './strip.js';
import { xfaToAcroForm } from './xfa.js';
import type { FieldInventory, QualifiedForm, Rect } from './types.js';

type Box = [x0: number, y0: number, x1: number, y1: number];

/** The part of `qpdf --json=2` this test reads. */
interface QpdfJson {
	acroform: {
		fields: { fullname: string; pageposfrom1: number; annotation: { object: string } }[];
	};
	pages: { object: string }[];
	qpdf: [unknown, Record<string, { value: { '/Rect': Box; '/MediaBox': Box } }>];
}

interface Qpdf {
	callMain(args: string[]): number;
	FS: {
		writeFile(path: string, data: Uint8Array): void;
		readFile(path: string, options: { encoding: 'utf8' }): string;
	};
}

const qpdf = import('@neslinesli93/qpdf-wasm').then((mod) =>
	(mod.default as unknown as (options: { locateFile: () => string }) => Promise<Qpdf>)({
		locateFile: () => wasmUrl
	})
);

/** Each form field of a PDF with its page, its rect and that page's media box, in PDF space. */
async function stamped(pdf: Uint8Array) {
	const { callMain, FS } = await qpdf;
	FS.writeFile('/stamped.pdf', pdf);
	callMain([
		'--json=2',
		'--json-key=acroform',
		'--json-key=pages',
		'--json-key=qpdf',
		'/stamped.pdf',
		'/stamped.json'
	]);
	const out: QpdfJson = JSON.parse(FS.readFile('/stamped.json', { encoding: 'utf8' }));
	const dict = (ref: string) => out.qpdf[1][`obj:${ref}`].value;
	return out.acroform.fields.map((field) => ({
		name: field.fullname,
		page: field.pageposfrom1 - 1,
		rect: dict(field.annotation.object)['/Rect'],
		mediaBox: dict(out.pages[field.pageposfrom1 - 1].object)['/MediaBox']
	}));
}

/** Every widget kept, under a name of no meaning, typed by its kind as the fork's `qualify()` types it. */
const named = (inventory: FieldInventory): QualifiedForm => ({
	quill: { name: 'closure', title: 'Closure', description: 'Every widget of a fixture.' },
	fields: inventory.widgets.map((widget, index) => ({
		widget: widget.id,
		name: `field_${index}`,
		label: widget.name,
		description: '',
		type: ({ Tx: 'string', Btn: 'boolean', Ch: 'enum', Sig: 'string' } as const)[widget.kind],
		multiline: widget.multiLine,
		...(widget.kind === 'Tx' ? { example: 'x' } : {}),
		...(widget.kind === 'Ch' ? { options: widget.options, example: widget.options[0] } : {}),
		...(widget.radioButton ? { group: widget.name } : {}),
		keep: true,
		required: widget.required
	}))
});

const fixtures = import.meta.glob<string>('../test/fixtures/*.pdf', {
	query: '?url',
	import: 'default',
	eager: true
});

for (const [path, url] of Object.entries(fixtures)) {
	const form = path.slice(path.lastIndexOf('/') + 1).split(/[_.]/)[0];
	it(`${form} renders with every form.json entry where it was placed, and no other field`, async () => {
		const bytes = await xfaToAcroForm(
			await normalizePdf(new Uint8Array(await (await fetch(url)).arrayBuffer()))
		);
		const inventory = await inventoryPdf(bytes);
		const tree = assembleQuill(named(inventory), inventory, await stripAcroForm(bytes));
		const { fields, widgets }: Record<string, { name: string; page: number; rect: Rect }[]> =
			JSON.parse(new TextDecoder().decode(tree.get('form.json')));
		const placed = [...fields, ...widgets];

		const { quill } = await fromTree(tree);
		const example = quill.exampleDocument()!;
		const markdown = example.toMarkdown();
		example.free();
		const found = await stamped(await render(quill, markdown));

		expect(found.map((field) => field.name).sort()).toEqual(
			placed.map((entry) => entry.name).sort()
		);
		for (const { name, page, rect } of placed) {
			const got = found.find((field) => field.name === name)!;
			expect(got.page, name).toBe(page);
			// The engine's page is the one the inventory measured, or a rect means nothing.
			const [x0, y0, x1, y1] = got.mediaBox;
			expect(x1 - x0, `${name} page width`).toBeCloseTo(inventory.pages[page].width, 3);
			expect(y1 - y0, `${name} page height`).toBeCloseTo(inventory.pages[page].height, 3);
			const read = toTopLeftRect(got.rect, got.mediaBox, 0);
			for (const side of ['x', 'y', 'w', 'h'] as const)
				expect(Math.abs(read[side] - rect[side]), `${name} ${side}`).toBeLessThanOrEqual(0.01);
		}
	}, 120_000);
}
