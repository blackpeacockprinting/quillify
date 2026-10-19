/**
 * A dynamic form's text stays in the boxes the layout gives it, on the lines
 * its designer broke it into. The template records those lines in its render
 * cache, laid out in the faces it names.
 */

import {
	PDFArray,
	PDFDict,
	PDFDocument,
	PDFHexString,
	PDFName,
	PDFRawStream,
	PDFString,
	decodePDFRawStream
} from 'pdf-lib';
import { afterEach, expect, it, vi } from 'vitest';
import eprUrl from '../test/fixtures/AF716_Enlisted_Performance_Brief.pdf?url';
import { displayList, type Run } from './display-list.js';
import { normalizePdf } from './normalize.js';
import { xfaToAcroForm } from './xfa.js';
import { XfaStage, type XfaPage } from './xfa-layer.js';

afterEach(() => {
	vi.restoreAllMocks();
});

const words = (text: string) => text.replace(/\s+/g, ' ').trim();
const published = async (url: string) => new Uint8Array(await (await fetch(url)).arrayBuffer());

/** Text a page shows outside the box of the draw, field or caption that holds it. */
function spilled({ layer }: XfaPage): string[] {
	const doc = layer.ownerDocument;
	const out: string[] = [];
	const walker = doc.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
	const range = doc.createRange();
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		const text = node.nodeValue ?? '';
		const box = node.parentElement?.closest('.xfaCaption, .xfaDraw, .xfaField');
		if (!text.trim() || !box || node.parentElement!.closest('input, select, textarea')) continue;
		const { left, right, top, bottom } = box.getBoundingClientRect();
		for (let i = 0; i < text.length; i++) {
			range.setStart(node, i);
			range.setEnd(node, i + 1);
			const glyph = range.getBoundingClientRect();
			const [x, y] = [(glyph.left + glyph.right) / 2, (glyph.top + glyph.bottom) / 2];
			if (text[i].trim() && Math.max(left - x, x - right, top - y, y - bottom) > 0.5) {
				out.push(words(text));
				break;
			}
		}
	}
	return out;
}

/** A form laid out: what spills on its pages, and their runs. */
async function laid(file: Uint8Array) {
	const spills: string[] = [];
	const runs: Run[] = [];
	const lay = XfaStage.prototype.lay;
	vi.spyOn(XfaStage.prototype, 'lay').mockImplementation(async function (this: XfaStage, page) {
		const out = await lay.call(this, page);
		spills.push(...spilled(out));
		runs.push(...displayList(out, page.pageNumber).drawn.filter((item) => 'text' in item));
		return out;
	});
	const bytes = await normalizePdf(file);
	await xfaToAcroForm(bytes);
	return { spills, runs, bytes };
}

/** The lines the template's render cache records. */
async function cached(bytes: Uint8Array): Promise<string[]> {
	const doc = await PDFDocument.load(bytes);
	const xfa = doc.catalog
		.lookup(PDFName.of('AcroForm'), PDFDict)
		.lookup(PDFName.of('XFA'), PDFArray);
	let template = '';
	for (let i = 0; i < xfa.size(); i += 2) {
		const name = xfa.lookup(i);
		if (
			(name instanceof PDFString || name instanceof PDFHexString) &&
			name.decodeText() === 'template'
		)
			template = new TextDecoder().decode(
				decodePDFRawStream(xfa.lookup(i + 1, PDFRawStream)).decode()
			);
	}
	return [...template.matchAll(/<\?renderCache\.textRun (\d+) /g)].map((m) =>
		words(template.slice(m.index + m[0].length, m.index + m[0].length + Number(m[1])))
	);
}

/** How many lines a form's render cache records, and those no run of its layout shows whole. */
async function lines(file: Uint8Array) {
	const { runs, bytes } = await laid(file);
	const designed = await cached(bytes);
	const shown = runs.map((run) => words(run.text));
	const broken: string[] = [];
	// A run shows one line whole, so a line the form prints twice takes two.
	for (const line of designed.filter(Boolean)) {
		const at = shown.indexOf(line);
		if (at === -1) broken.push(line);
		else shown.splice(at, 1);
	}
	return { designed: designed.length, broken };
}

it('lays out no text of AF 716 outside the box that holds it', async () => {
	const { spills } = await laid(await published(eprUrl));
	expect(spills).toEqual([]);
}, 120_000);

it("breaks AF 716's text into the lines its designer did", async () => {
	expect(await lines(await published(eprUrl))).toEqual({ designed: 57, broken: [] });
}, 120_000);
