/**
 * A dynamic form pdf.js cannot lay out is refused as `layout`, with the message
 * of the exception pdf.js's layout threw. One it lays out to a page of no size,
 * or with a field off its page, is refused under the same code.
 */

import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import type { PDFRef } from 'pdf-lib';
import { afterEach, expect, it, vi } from 'vitest';
import saarUrl from '../test/fixtures/DD2875_System_Authorization_Access_Request.pdf?url';
import sampleUrl from '../test/fixtures/acroform-sample.pdf?url';
import { dynamicForm, templateForm } from '../test/dynamic-form.js';
import { openPdf } from './pdfjs.js';
import { sanitize } from './sanitize.js';
import { xfaToAcroForm } from './xfa.js';

const published = async (url: string) => new Uint8Array(await (await fetch(url)).arrayBuffer());

afterEach(() => {
	vi.unstubAllGlobals();
});

/** DD 2875 with `from` rewritten to `to` wherever its XFA template has it. */
async function saarWith(from: string, to: string): Promise<Uint8Array> {
	const saar = await PDFDocument.load(await published(saarUrl), { updateMetadata: false });
	const packets = saar.catalog
		.lookup(PDFName.of('AcroForm'), PDFDict)
		.lookup(PDFName.of('XFA'), PDFArray);
	const at = packets.asArray().findIndex((part) => String(part) === '(template)') + 1;
	const template = new TextDecoder().decode(
		decodePDFRawStream(packets.lookup(at, PDFRawStream)).decode()
	);
	expect(template).toContain(from);
	saar.context.assign(
		packets.get(at) as PDFRef,
		saar.context.flateStream(new TextEncoder().encode(template.replaceAll(from, to)))
	);
	return saar.save();
}

/** A page-high subform with one text field. */
const sheet = (name: string) =>
	`<subform name="${name}" layout="position" w="612pt" h="792pt"><field name="f" x="72pt" y="72pt" w="200pt" h="20pt"><ui><textEdit/></ui></field></subform>`;

/** Two pages of content for a page set that may occur once, as its one page area may. */
const spentPageSet = () =>
	templateForm(
		`<template xmlns="http://www.xfa.org/schema/xfa-template/3.3/"><subform name="form1" layout="tb"><pageSet><occur max="1"/><pageArea name="Page1"><contentArea w="612pt" h="792pt"/><medium short="612pt" long="792pt"/><occur max="1"/></pageArea></pageSet>${sheet('a')}${sheet('b')}</subform></template>`
	);

// The layout reads a content area the page does not have. In this Chromium the
// detail is "Cannot read properties of undefined (reading 'children')".
it.each([
	['0.4 pt long', 'long="792pt"', 'long="0.4pt"'],
	['0 pt short', 'short="612pt"', 'short="0pt"']
])(
	'refuses DD 2875 with every medium %s as layout, with what pdf.js threw',
	async (_, from, to) => {
		const read = await sanitize(await saarWith(from, to));
		expect(read).toEqual({
			ok: false,
			refusal: { code: 'layout', detail: expect.stringMatching(/^(?!XFA layout).*undefined/) }
		});
	},
	120_000
);

// The page set asks itself for the next page until the stack ends. In this
// Chromium the detail is "Maximum call stack size exceeded".
it('refuses a page set that is used up, as its page area is, with the stack overflow', async () => {
	const read = await sanitize(await spentPageSet());
	expect(read).toEqual({
		ok: false,
		refusal: { code: 'layout', detail: expect.stringMatching(/^(?!XFA layout).*(stack|recursion)/) }
	});
}, 60_000);

// pdf.js lays these out and throws nothing. It gives the page no number for a
// side, or a side that is not above zero.
it.each([
	['0 pt short', 'short="0pt" long="792pt"'],
	['longer than a number holds', `short="612pt" long="2${'0'.repeat(308)}pt"`],
	['less than nothing short', 'short="-612pt" long="792pt"']
])(
	'refuses a page area whose medium is %s as layout, for a page of no size',
	async (_, medium) => {
		const form = await templateForm(
			`<template xmlns="http://www.xfa.org/schema/xfa-template/3.3/"><subform name="form1" layout="tb"><pageSet><pageArea name="Page1"><contentArea w="612pt" h="792pt"/><medium ${medium}/></pageArea></pageSet>${sheet('a')}</subform></template>`
		);
		expect(await sanitize(form)).toEqual({
			ok: false,
			refusal: { code: 'layout', detail: 'a page has no size' }
		});
	},
	60_000
);

/** A one-page dynamic form with one text field, `x` points from the left of its 612 pt page. */
const fieldAt = (x: number) =>
	dynamicForm(
		`<field name="f" x="${x}pt" y="72pt" w="200pt" h="20pt"><ui><textEdit/></ui></field>`
	);

// pdf.js gives a field the place its layout comes to, on the page or not, and
// a quill has no place for a field that is off it.
it('refuses a field laid out off its page as layout, and keeps one that crosses the edge', async () => {
	expect(await sanitize(await fieldAt(612))).toMatchObject({
		refusal: { code: 'layout', detail: 'a field is off its page' }
	});
	const read = await sanitize(await fieldAt(500));
	expect(read.ok && read.form.fields.map(({ places }) => places[0].rect.x)).toEqual([500]);
}, 60_000);

it('leaves no worker and no frame when it refuses a layout', async () => {
	const count = { started: 0, live: new Set<Worker>() };
	vi.stubGlobal(
		'Worker',
		class extends Worker {
			constructor(url: string | URL, options?: WorkerOptions) {
				super(url, options);
				count.live.add(this);
				count.started++;
			}
			terminate() {
				count.live.delete(this);
				super.terminate();
			}
		}
	);

	expect(await sanitize(await spentPageSet())).toMatchObject({ refusal: { code: 'layout' } });
	expect(count.started).toBeGreaterThan(0);
	expect(count.live.size).toBe(0);
	expect(document.querySelector('iframe')).toBeNull();
}, 60_000);

it('refuses the layout where the file is opened with XFA on, and opens it with XFA off', async () => {
	const bytes = await spentPageSet();
	await expect(openPdf(bytes, { enableXfa: true })).rejects.toMatchObject({
		refusal: { code: 'layout' }
	});

	const { pdf, close } = await openPdf(bytes);
	expect(pdf.numPages).toBe(1);
	await close();
}, 60_000);

it('still converts DD 2875 as published', async () => {
	const read = await sanitize(await published(saarUrl));
	expect(read, JSON.stringify(read.ok || read.refusal)).toMatchObject({ ok: true });
	expect(read.ok && [read.form.pages.length, read.form.fields.length]).toEqual([3, 85]);
}, 120_000);

it('hands a static form on as it came', async () => {
	const sample = await published(sampleUrl);
	expect(await xfaToAcroForm(sample)).toBe(sample);
}, 60_000);
