/**
 * qpdf runs in a worker of its own for each file, started from the script the
 * package ships and ended with the call. A trap, a grown heap or whatever
 * qpdf's `main` leaves behind goes with the worker, so no file reaches the
 * next, and the page's thread is free while qpdf runs. What the worker
 * answers when qpdf throws is held in `qpdf-handler.browser.test.ts`.
 */

import { PDFDocument, PDFName, type PDFArray, type PDFDict } from 'pdf-lib';
import { afterEach, expect, it, vi } from 'vitest';
import { commands } from 'vitest/browser';
import sampleUrl from '../test/fixtures/acroform-sample.pdf?url';
import { normalizePdf } from './normalize.js';
import { Refused } from './refusal.js';
import { sanitize } from './sanitize.js';

const sample = async () => new Uint8Array(await (await fetch(sampleUrl)).arrayBuffer());
const words = () => new TextEncoder().encode('just words');

afterEach(() => {
	vi.unstubAllGlobals();
});

/** The workers started from `qpdf.worker.js`, and those of them not yet ended. */
function countQpdf() {
	const count = { started: 0, live: new Set<Worker>() };
	vi.stubGlobal(
		'Worker',
		class extends Worker {
			constructor(url: string | URL, options?: WorkerOptions) {
				super(url, options);
				if (!String(url).includes('qpdf.worker.js')) return;
				count.live.add(this);
				count.started++;
			}
			terminate() {
				count.live.delete(this);
				super.terminate();
			}
		}
	);
	return count;
}

/** One page with one text field, and what `more` adds to it. */
async function form(more: (doc: PDFDocument) => void = () => {}) {
	const doc = await PDFDocument.create();
	const sheet = doc.addPage([612, 792]);
	doc.getForm().createTextField('x').addToPage(sheet, { x: 72, y: 700, width: 200, height: 20 });
	more(doc);
	return doc.save();
}

/** A form whose `/Fields` names its one field 30,000 times, which keeps qpdf over a second. */
const slow = () =>
	form((doc) => {
		const fields = (doc.catalog.lookup(PDFName.of('AcroForm')) as PDFDict).lookup(
			PDFName.of('Fields')
		) as PDFArray;
		for (let again = 1; again < 30_000; again++) fields.push(fields.get(0));
	});

/** The bytes outside the trailer's `/ID`, whose second element qpdf makes anew on each run. */
const unstamped = (pdf: Uint8Array) =>
	new TextDecoder('latin1').decode(pdf).replace(/\/ID ?\[<[0-9a-f]+><[0-9a-f]+>\]/, '');

it('starts one qpdf worker for a form that converts, and ends it', async () => {
	const count = countQpdf();

	expect((await sanitize(await sample())).ok).toBe(true);
	expect(count.started).toBe(1);
	expect(count.live.size).toBe(0);
}, 60_000);

it('starts one qpdf worker for a file qpdf writes nothing for, and ends it', async () => {
	const count = countQpdf();

	await expect(normalizePdf(words())).rejects.toMatchObject({ refusal: { code: 'not_pdf' } });
	expect(count.started).toBe(1);
	expect(count.live.size).toBe(0);
}, 60_000);

it('starts one qpdf worker for a file a later stage refuses, and ends it', async () => {
	const doc = await PDFDocument.create();
	doc.addPage([612, 792]);
	const count = countQpdf();

	expect(await sanitize(await doc.save())).toEqual({
		ok: false,
		refusal: { code: 'no_fields', xfa: false }
	});
	expect(count.started).toBe(1);
	expect(count.live.size).toBe(0);
}, 60_000);

it('gives each of two calls at once the answer it gets alone', async () => {
	const alone = await normalizePdf(await sample());
	const refused = await normalizePdf(words()).catch((err: unknown) => err);
	expect(refused).toBeInstanceOf(Refused);

	const [together, beside] = await Promise.all([
		normalizePdf(await sample()),
		normalizePdf(words()).catch((err: unknown) => err)
	]);
	expect(unstamped(together)).toBe(unstamped(alone));
	expect((beside as Refused).refusal).toEqual((refused as Refused).refusal);
}, 60_000);

it("leaves the page's thread free while qpdf rewrites a slow file", async () => {
	const pdf = await slow();
	let ticks = 0;
	const timer = setInterval(() => ticks++, 10);
	const rewritten = await normalizePdf(pdf).finally(() => clearInterval(timer));

	expect(rewritten.byteLength).toBeGreaterThan(pdf.byteLength);
	expect(ticks).toBeGreaterThan(10);
}, 60_000);

it('rejects by name while qpdf.worker.js is missing, and reads once it is back', async () => {
	const bytes = await sample();
	const count = countQpdf();
	await commands.withhold('qpdf.worker.js');
	const missing = await sanitize(bytes).catch((err: unknown) => err);
	await commands.serve('qpdf.worker.js');

	expect(missing).toBeInstanceOf(Error);
	expect(missing).not.toBeInstanceOf(Refused);
	expect((missing as Error).message).toMatch(/^qpdf\.worker\.js did not load from http/);
	expect(count.live.size).toBe(0);
	expect((await sanitize(bytes)).ok).toBe(true);
}, 60_000);
