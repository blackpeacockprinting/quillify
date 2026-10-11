/**
 * `sanitize` waits on a worker until 60 s after the call and then refuses the
 * file as `too_slow`. The wait is one signal, made with `AbortSignal.timeout`,
 * and a stage that waits on a worker ends the worker when the signal fires. A
 * test here shortens the wait by standing in for `AbortSignal.timeout`, so the
 * source has one way to set it. A worker that never answers is a stand-in
 * too, one that is handed none of its messages or none of one kind: no file
 * here makes qpdf trap or loop.
 */

import { PDFDocument, PDFName, type PDFArray, type PDFDict, type PDFRef } from 'pdf-lib';
import { afterEach, expect, it, vi } from 'vitest';
import sampleUrl from '../test/fixtures/acroform-sample.pdf?url';
import dynamicUrl from '../test/fixtures/DD2875_System_Authorization_Access_Request.pdf?url';
import { sanitize } from './sanitize.js';

const fetched = async (url: string) => new Uint8Array(await (await fetch(url)).arrayBuffer());
const sample = () => fetched(sampleUrl);
const dynamic = () => fetched(dynamicUrl);
/** qpdf writes no file for it, so pdf.js is asked to open it. */
const notPdf = async () => new TextEncoder().encode('x');
const TOO_SLOW = { ok: false, refusal: { code: 'too_slow', limit: 60 } };
const frames = () => document.querySelectorAll('iframe');

const live = new Set<Worker>();
afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	// A call that does not settle leaves its worker and its frame to the next test.
	for (const worker of live) worker.terminate();
	for (const frame of frames()) frame.remove();
});

/**
 * The script of each worker started, in order, with those not yet ended in
 * `live`. A worker of `deaf` is handed no message, or with `to` no message
 * of pdf.js's with that action from the `nth` on, so it never answers one,
 * and `dropped` is called for each message it is not handed. With `loud` it
 * reports an error when it is ended.
 */
function workers(
	deaf?: '/pdf.worker.js' | '/qpdf.worker.js',
	{
		to,
		nth = 1,
		loud = false,
		dropped
	}: { to?: string; nth?: number; loud?: boolean; dropped?: () => void } = {}
) {
	const started: string[] = [];
	vi.stubGlobal(
		'Worker',
		class extends Worker {
			readonly #deaf: boolean;
			#asked = 0;
			constructor(url: string | URL, options?: WorkerOptions) {
				super(url, options);
				this.#deaf = !!deaf && String(url).includes(deaf);
				started.push(String(url).replace(/^.*\/|\?.*$/g, ''));
				live.add(this);
			}
			postMessage(
				message: { action?: string },
				transfer: Transferable[] & StructuredSerializeOptions
			) {
				if (this.#deaf && (!to || (message.action === to && ++this.#asked >= nth)))
					return void dropped?.();
				super.postMessage(message, transfer);
			}
			terminate() {
				live.delete(this);
				super.terminate();
				if (loud) this.onerror?.(new ErrorEvent('error'));
			}
		}
	);
	return started;
}

/**
 * A stand-in for `AbortSignal.timeout`, and the listeners on the signal it
 * gave. The signal fires `ms` after it is asked for, in place of the time
 * asked. With `held` it fires `ms` after `start` is first called: a test of a
 * worker that goes silent starts the wait where the worker does, so that it
 * does not turn on how fast the machine got that far.
 */
function deadline(ms?: number, held = false) {
	const real = AbortSignal.timeout.bind(AbortSignal);
	const listening = new Set<unknown>();
	const late = new AbortController();
	let timer: ReturnType<typeof setTimeout> | undefined;
	const start = () =>
		void (timer ??= setTimeout(() => late.abort(new DOMException('', 'TimeoutError')), ms));
	const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation((asked) => {
		const signal = held ? late.signal : real(ms ?? asked);
		const { addEventListener, removeEventListener } = signal;
		signal.addEventListener = (...args: Parameters<typeof addEventListener>) => {
			listening.add(args[1]);
			addEventListener.apply(signal, args);
		};
		signal.removeEventListener = (...args: Parameters<typeof removeEventListener>) => {
			listening.delete(args[1]);
			removeEventListener.apply(signal, args);
		};
		return signal;
	});
	return { timeout, listening, start };
}

/** One page with one text field, and what `more` does to it. */
async function form(more: (doc: PDFDocument, fields: PDFArray) => void) {
	const doc = await PDFDocument.create();
	const sheet = doc.addPage([612, 792]);
	doc.getForm().createTextField('x').addToPage(sheet, { x: 72, y: 700, width: 200, height: 20 });
	more(
		doc,
		(doc.catalog.lookup(PDFName.of('AcroForm')) as PDFDict).lookup(PDFName.of('Fields')) as PDFArray
	);
	return doc.save({ updateFieldAppearances: false });
}

/** A form whose `/Fields` names its one field 30,000 times, which keeps qpdf over a second. */
const listedOften = () =>
	form((_, fields) => {
		for (let again = 1; again < 30_000; again++) fields.push(fields.get(0));
	});

/** A form whose one field lies under 8,000 nodes, each the one kid of the next, which keeps pdf.js over four seconds. */
const deep = () =>
	form((doc, fields) => {
		let kid = fields.get(0) as PDFRef;
		for (let level = 0; level < 8_000; level++) {
			const parent = doc.context.register(doc.context.obj({ Kids: [kid] }));
			(doc.context.lookup(kid) as PDFDict).set(PDFName.of('Parent'), parent);
			kid = parent;
		}
		fields.set(0, kid);
	});

/** A form whose catalog has a `/Collection` that holds something, which is a portfolio to pdf.js. */
const portfolio = () =>
	form((doc) => doc.catalog.set(PDFName.of('Collection'), doc.context.obj({ View: 'D' })));

const QPDF = '/qpdf.worker.js';
const PDFJS = '/pdf.worker.js';

it.each([
	['the sample', 'qpdf never answers', sample, QPDF, undefined, 1],
	['the sample', 'pdf.js never answers', sample, PDFJS, undefined, 2],
	['a file qpdf writes nothing for', 'pdf.js never answers', notPdf, PDFJS, undefined, 2],
	['a dynamic form', 'pdf.js gives no page of it', dynamic, PDFJS, 'GetPage', 2],
	['the sample', 'pdf.js gives no metadata of it', sample, PDFJS, 'GetMetadata', 3],
	['a portfolio', 'pdf.js gives no attachment of it', portfolio, PDFJS, 'GetAttachments', 3],
	['the sample', 'pdf.js gives no page of it', sample, PDFJS, 'GetPage', 3],
	['the sample', "pdf.js gives no page's annotations", sample, PDFJS, 'GetAnnotations', 3],
	['the sample', "pdf.js gives a page's annotations once", sample, PDFJS, 'GetAnnotations', 3, 2],
	['the sample', 'pdf.js does not answer that it has closed', sample, PDFJS, 'Terminate', 2]
] as const)(
	'refuses %s as too_slow when %s, and leaves nothing behind',
	async (_, __, file, script, to, started, nth?: number) => {
		const pdf = await file();
		const { timeout, listening, start } = deadline(100, true);
		const count = workers(script, { to, nth, dropped: start });

		expect(await sanitize(pdf)).toEqual(TOO_SLOW);
		expect(timeout).toHaveBeenCalledExactlyOnceWith(60_000);
		expect(count).toEqual(['qpdf.worker.js', 'pdf.worker.js', 'pdf.worker.js'].slice(0, started));
		expect(live.size).toBe(0);
		expect(frames()).toHaveLength(0);
		expect(listening.size).toBe(0);
	},
	10_000
);

it.each([
	['pdf.js', PDFJS],
	['qpdf', QPDF]
] as const)(
	'refuses as too_slow, and not with an error, when the worker of %s reports one as it is ended',
	async (_, script) => {
		const { start } = deadline(100, true);
		const count = workers(script, { loud: true, dropped: start });

		expect(await sanitize(await sample())).toEqual(TOO_SLOW);
		expect(count.at(-1)).toBe(script.slice(1));
		expect(live.size).toBe(0);
	},
	10_000
);

it('refuses a form qpdf is still rewriting at the limit, and converts the sample after it', async () => {
	const pdf = await listedOften();
	deadline(250);
	const count = workers();

	expect(await sanitize(pdf)).toEqual(TOO_SLOW);
	expect(count).toEqual(['qpdf.worker.js']);
	expect(live.size).toBe(0);

	vi.restoreAllMocks();
	expect((await sanitize(await sample())).ok).toBe(true);
	expect(live.size).toBe(0);
}, 60_000);

it('refuses a form pdf.js is still reading at the limit, and converts the sample after it', async () => {
	const pdf = await deep();
	deadline(1_500);
	const count = workers();
	const began = performance.now();

	expect(await sanitize(pdf)).toEqual(TOO_SLOW);
	expect(performance.now() - began).toBeLessThan(2_500);
	expect(count.at(-1)).toBe('pdf.worker.js');
	expect(live.size).toBe(0);
	expect(frames()).toHaveLength(0);

	vi.restoreAllMocks();
	expect((await sanitize(await sample())).ok).toBe(true);
	expect(live.size).toBe(0);
}, 60_000);

it('leaves no listener on its signal and no timer of its own once a form converts', async () => {
	const { timeout, listening } = deadline();
	const timers = new Set<unknown>();
	const { setTimeout: set, clearTimeout: clear } = globalThis;
	vi.stubGlobal('setTimeout', (handler: () => void, ms?: number) => {
		const timer = set(() => {
			timers.delete(timer);
			handler();
		}, ms);
		timers.add(timer);
		return timer;
	});
	vi.stubGlobal('clearTimeout', (timer: number) => {
		timers.delete(timer);
		clear(timer);
	});

	expect((await sanitize(await sample())).ok).toBe(true);
	expect(timeout).toHaveBeenCalledExactlyOnceWith(60_000);
	expect(listening.size).toBe(0);
	expect(timers.size).toBe(0);
}, 60_000);
