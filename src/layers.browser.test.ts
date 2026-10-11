/**
 * A background keeps its layers as the file has them (#32). A one-page form
 * with a text field and two optional content groups goes through `sanitize`,
 * `quillify` and the engine's render. The groups and their default state are
 * the same in the source, the background and the rendered file, and pdf.js
 * paints the same page from each: a line in a group that is off stays blank.
 * The engine's own painter leaves it blank too.
 */

import { expect, it } from 'vitest';
import {
	PDFArray,
	PDFDict,
	PDFDocument,
	PDFHexString,
	PDFName,
	PDFOperator,
	PDFOperatorNames,
	PDFString,
	StandardFonts,
	type PDFRef
} from 'pdf-lib';
import { fromTree, open, render } from '../test/engine.js';
import { quillify, sanitize, suggest } from './index.js';

const WORKER = new URL('../assets/pdf.worker.js', import.meta.url);
/** Each line's band on a 612 by 792 page, measured from the top. */
const BANDS = { SHOWN: [50, 100], ALWAYS: [150, 200], HIDDEN: [250, 300] } as const;
type Band = keyof typeof BANDS;
type Intent = 'display' | 'print';

const VARIANTS = [
	// The group is in the default configuration's /OFF.
	{
		name: 'off',
		holds: { off: ['Hidden'] },
		paints: { display: { SHOWN: true, HIDDEN: false } }
	},
	// On for the screen and off for paper, by /AS and /Usage.
	{
		name: 'print-off',
		holds: {
			usage: [
				['Shown', null, null],
				['Hidden', 'ON', 'OFF']
			]
		},
		paints: { display: { SHOWN: true, HIDDEN: true }, print: { SHOWN: true, HIDDEN: false } }
	},
	// The pattern of Acrobat Designer, in 17 published forms, 12 of which put content in the ViewOnly group: /BaseState /OFF, and /AS turns each group on for its event.
	{
		name: 'designer',
		holds: { base: 'OFF', on: ['ViewOnly'] },
		paints: { display: { SHOWN: true, HIDDEN: false }, print: { SHOWN: false } }
	}
] as const;
type Variant = (typeof VARIANTS)[number]['name'];

async function build(variant: Variant): Promise<Uint8Array> {
	const doc = await PDFDocument.create();
	const { context } = doc;
	const page = doc.addPage([612, 792]);
	const font = await doc.embedFont(StandardFonts.Helvetica);
	const usage = (view: string, print: string) =>
		context.obj({ View: { ViewState: view }, Print: { PrintState: print } });
	const group = (name: string, groupUsage?: PDFDict): PDFRef =>
		context.register(context.obj({ Type: 'OCG', Name: PDFString.of(name), Usage: groupUsage }));

	let shown: PDFRef;
	let hidden: PDFRef;
	let config: PDFDict;
	if (variant === 'off') {
		shown = group('Shown');
		hidden = group('Hidden');
		config = context.obj({ Order: [shown, hidden], ON: [shown], OFF: [hidden] });
	} else if (variant === 'print-off') {
		shown = group('Shown');
		hidden = group('Hidden', usage('ON', 'OFF'));
		config = context.obj({
			Order: [shown, hidden],
			ON: [shown, hidden],
			AS: [
				{ Event: 'View', Category: ['View'], OCGs: [hidden] },
				{ Event: 'Print', Category: ['Print'], OCGs: [hidden] }
			]
		});
	} else {
		shown = group('ViewOnly', usage('ON', 'OFF'));
		hidden = group('PrintOnly', usage('OFF', 'ON'));
		config = context.obj({
			BaseState: 'OFF',
			ON: [shown],
			AS: [
				{ Event: 'Print', Category: ['Print'], OCGs: [hidden, shown] },
				{ Event: 'View', Category: ['View'], OCGs: [hidden, shown] }
			]
		});
	}
	doc.catalog.set(PDFName.of('OCProperties'), context.obj({ OCGs: [shown, hidden], D: config }));

	const line = (text: string, y: number, property?: string) => {
		if (property)
			page.pushOperators(
				PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [
					PDFName.of('OC'),
					PDFName.of(property)
				])
			);
		page.drawText(text, { x: 72, y, size: 36, font });
		if (property) page.pushOperators(PDFOperator.of(PDFOperatorNames.EndMarkedContent));
	};
	line('SHOWN', 700, 'MC0');
	line('ALWAYS', 600);
	line('HIDDEN', 500, 'MC1');
	page.node.Resources()!.set(PDFName.of('Properties'), context.obj({ MC0: shown, MC1: hidden }));

	const field = doc.getForm().createTextField('a');
	field.addToPage(page, { x: 72, y: 380, width: 200, height: 20, font });
	return doc.save({ useObjectStreams: false });
}

/** The groups of a file's default configuration, by name, with what each says of the screen and of paper. */
async function layers(bytes: Uint8Array) {
	const doc = await PDFDocument.load(bytes);
	const properties = doc.catalog.lookupMaybe(PDFName.of('OCProperties'), PDFDict);
	const config = properties?.lookupMaybe(PDFName.of('D'), PDFDict);
	if (!properties || !config) return null;
	const name = (ref: unknown) =>
		doc.context
			.lookup(ref as PDFRef, PDFDict)
			.lookup(PDFName.of('Name'), PDFString, PDFHexString)
			.decodeText();
	const names = (key: string) =>
		(config.lookupMaybe(PDFName.of(key), PDFArray)?.asArray() ?? []).map(name);
	const state = (group: PDFDict, category: string, key: string) =>
		group
			.lookupMaybe(PDFName.of('Usage'), PDFDict)
			?.lookupMaybe(PDFName.of(category), PDFDict)
			?.lookupMaybe(PDFName.of(key), PDFName)
			?.decodeText() ?? null;
	const groups = properties.lookup(PDFName.of('OCGs'), PDFArray).asArray();
	return {
		base: config.lookupMaybe(PDFName.of('BaseState'), PDFName)?.decodeText() ?? null,
		on: names('ON'),
		off: names('OFF'),
		events: (config.lookupMaybe(PDFName.of('AS'), PDFArray)?.asArray() ?? []).map((entry) => {
			const dict = doc.context.lookup(entry, PDFDict);
			const event = dict.lookup(PDFName.of('Event'), PDFName).decodeText();
			return `${event}: ${dict
				.lookup(PDFName.of('OCGs'), PDFArray)
				.asArray()
				.map(name)
				.join(', ')}`;
		}),
		usage: groups.map((ref) => {
			const group = doc.context.lookup(ref, PDFDict);
			return [name(ref), state(group, 'View', 'ViewState'), state(group, 'Print', 'PrintState')];
		})
	};
}

/** The dark pixels of each line's band. */
function bands(ctx: CanvasRenderingContext2D): Record<Band, number> {
	const out = { SHOWN: 0, ALWAYS: 0, HIDDEN: 0 };
	for (const [band, [top, bottom]] of Object.entries(BANDS) as [
		Band,
		readonly [number, number]
	][]) {
		const { data } = ctx.getImageData(0, top, ctx.canvas.width, bottom - top);
		for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 0 && data[i] < 128) out[band]++;
	}
	return out;
}

/** What pdf.js paints from a file, at 1 pixel to the point. */
async function ink(bytes: Uint8Array, intent: Intent): Promise<Record<Band, number>> {
	const { AnnotationMode, PDFWorker, getDocument } = await import('pdfjs-dist');
	const port = new Worker(WORKER, { type: 'module' });
	const worker = PDFWorker.create({ port });
	const task = getDocument({ data: bytes.slice(), worker });
	try {
		const pdf = await task.promise;
		const page = await pdf.getPage(1);
		const viewport = page.getViewport({ scale: 1 });
		const canvas = document.createElement('canvas');
		canvas.width = Math.ceil(viewport.width);
		canvas.height = Math.ceil(viewport.height);
		await page.render({
			canvas,
			viewport,
			intent,
			annotationMode: AnnotationMode.DISABLE,
			optionalContentConfigPromise: pdf.getOptionalContentConfig({ intent })
		}).promise;
		return bands(canvas.getContext('2d')!);
	} finally {
		await task.destroy();
		worker.destroy();
		port.terminate();
	}
}

for (const { name, holds, paints } of VARIANTS)
	it(`${name}: the source, the background and the rendered file keep the layers and paint alike`, async () => {
		const source = await build(name);
		const read = await sanitize(source);
		if (!read.ok) throw new Error(read.refusal.code);
		const built = await quillify(read.form, {
			name: `layers_${name.replace('-', '_')}`,
			description: 'Sample',
			fields: suggest(read.form.fields).map((entry) => ({ ...entry, description: 'Sample' }))
		});
		if (!built.ok) throw new Error(JSON.stringify(built.problems));
		const { quill } = await fromTree(built.tree);
		const doc = quill.seedDocument();
		const rendered = await render(quill, doc.toMarkdown());

		const held = await layers(source);
		expect(held, 'the source has layers').toMatchObject(holds);
		expect(await layers(read.form.pdf), 'background').toEqual(held);
		expect(await layers(rendered), 'rendered').toEqual(held);

		const expectPainted = (
			dark: Record<Band, number>,
			where: string,
			painted: Partial<Record<Band, boolean>>
		) => {
			expect(dark.ALWAYS, `${where}: a line in no group`).toBeGreaterThan(0);
			for (const [band, inked] of Object.entries(painted))
				expect(dark[band as Band] > 0, `${where}: ${band}`).toBe(inked);
		};
		for (const [file, bytes] of Object.entries({
			source,
			background: read.form.pdf,
			rendered
		}))
			for (const [intent, painted] of Object.entries(paints) as [
				Intent,
				Partial<Record<Band, boolean>>
			][])
				expectPainted(await ink(bytes, intent), `${file} ${intent}`, painted);

		const session = await open(quill, doc);
		const ctx = document.createElement('canvas').getContext('2d')!;
		session.paint(ctx, 0, 1);
		session.free();
		doc.free();
		expectPainted(bands(ctx), 'the engine paints', paints.display);
	}, 180_000);
