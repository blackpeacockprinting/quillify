/**
 * A dynamic form is laid out apart from the page that asked for it. No rule of
 * the host page applies inside the frame's document, and the form's rules and
 * fonts do not reach the host.
 */

import {
	PDFArray,
	PDFDict,
	PDFDocument,
	PDFName,
	PDFObjectCopier,
	PDFRawStream,
	PDFRef,
	PDFString,
	decodePDFRawStream
} from 'pdf-lib';
import { afterEach, expect, it, vi } from 'vitest';
import { commands } from 'vitest/browser';
import saarUrl from '../test/fixtures/DD2875_System_Authorization_Access_Request.pdf?url';
import trainingUrl from '../test/fixtures/SF182_Authorization_Agreement_and_Certification_of_Training.pdf?url';
import { displayList } from './display-list.js';
import { inventoryPdf } from './inventory.js';
import { normalizePdf } from './normalize.js';
import { sanitize } from './sanitize.js';
import { xfaToAcroForm } from './xfa.js';
import { XfaStage } from './xfa-layer.js';
import { harvestWidgets } from './xfa-widgets.js';
import type { FieldInventory } from './types.js';

const [golden] = Object.values(
	import.meta.glob<FieldInventory>('../test/goldens/DD2875.inventory.json', {
		import: 'default',
		eager: true
	})
);

const published = async (url: string) => new Uint8Array(await (await fetch(url)).arrayBuffer());
const inventory = async (pdf: Uint8Array) =>
	inventoryPdf(await xfaToAcroForm(await normalizePdf(pdf)));

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

it('lays DD 2875 out as on a bare page when the host restyles input, div and *', async () => {
	const saar = await published(saarUrl);
	const hostile = document.createElement('style');
	hostile.textContent = `
		* { box-sizing: content-box; font-size: 20px }
		div { padding: 2px; border: 1px solid }
		input { padding: 6px; border: 3px solid }`;
	document.head.append(hostile);
	try {
		const { pages, widgets } = await inventory(saar);
		expect({ pages, widgets }).toEqual(golden);
	} finally {
		hostile.remove();
	}
}, 120_000);

const name = PDFName.of;

/**
 * DD 2875 with the Calibri subset SF 182 embeds added to its form's fonts,
 * which is where pdf.js finds the faces of a dynamic form. No committed dynamic
 * fixture embeds one.
 */
async function withEmbeddedFace(): Promise<Uint8Array> {
	const saar = await PDFDocument.load(await published(saarUrl), { updateMetadata: false });
	const training = await PDFDocument.load(await published(trainingUrl), {
		updateMetadata: false
	});
	const [, embedded] = training.context
		.enumerateIndirectObjects()
		.find(
			([, object]) =>
				object instanceof PDFDict &&
				object.get(name('Subtype')) === name('TrueType') &&
				object.lookupMaybe(name('FontDescriptor'), PDFDict)?.has(name('FontFile2'))
		)!;
	const font = PDFObjectCopier.for(training.context, saar.context).copy(embedded) as PDFDict;
	// pdf.js passes over a font whose descriptor names no family.
	font.lookup(name('FontDescriptor'), PDFDict).set(name('FontFamily'), PDFString.of('Calibri'));
	saar.catalog
		.lookup(name('AcroForm'), PDFDict)
		.lookup(name('DR'), PDFDict)
		.lookup(name('Font'), PDFDict)
		.set(name('Embedded'), saar.context.register(font));
	return saar.save();
}

const families = (owner: Document) => [...owner.fonts].map((face) => face.family);
const rootProperty = () =>
	getComputedStyle(document.documentElement).getPropertyValue('--xfa-unfocused-field-background');
const host = () => ({
	elements: document.querySelectorAll('*').length,
	fonts: families(document),
	styleSheets: document.styleSheets.length,
	adoptedStyleSheets: document.adoptedStyleSheets.length,
	rootProperty: rootProperty()
});

it('gives the host document no rule and no font face, and leaves it as it was', async () => {
	const pdf = await withEmbeddedFace();
	const before = host();
	expect(before).toMatchObject({ fonts: [], rootProperty: '' });

	const taken: string[] = [];
	const observer = new MutationObserver(() => taken.push(rootProperty()));
	observer.observe(document.body, { childList: true, subtree: true });
	const laidOut: { stage: string[]; host: string[] }[] = [];
	const lay = XfaStage.prototype.lay;
	vi.spyOn(XfaStage.prototype, 'lay').mockImplementation(async function (this: XfaStage, page) {
		const laid = await lay.call(this, page);
		taken.push(rootProperty());
		laidOut.push({ stage: families(laid.layer.ownerDocument), host: families(document) });
		return laid;
	});
	try {
		expect((await inventory(pdf)).widgets).toHaveLength(78);
	} finally {
		observer.disconnect();
	}

	expect(new Set(taken)).toEqual(new Set(['']));
	expect(laidOut).toEqual(Array(3).fill({ stage: ['"Calibri"'], host: [] }));
	expect(host()).toEqual(before);
}, 120_000);

it("requests nothing but the package's own files while sanitize reads a form", async () => {
	const byFrame: string[] = [];
	const lay = XfaStage.prototype.lay;
	vi.spyOn(XfaStage.prototype, 'lay').mockImplementation(async function (this: XfaStage, page) {
		const laid = await lay.call(this, page);
		const timing = laid.layer.ownerDocument.defaultView!.performance;
		byFrame.push(...timing.getEntriesByType('resource').map((entry) => entry.name));
		return laid;
	});
	// The form is fetched inside the window and named below. Fetched just before
	// it, the request can still be reported once the listening has begun.
	await commands.listen();
	expect(await sanitize(await published(saarUrl))).toMatchObject({ ok: true });
	const requested = (await commands.heard()).map((url) => new URL(url));

	const own = [
		/^\/assets\/(pdf\.worker\.js|qpdf\.wasm)$/,
		/^\/node_modules\/\.vite\/vitest\/[0-9a-f]+\/deps\/(pdfjs-dist|@neslinesli93_qpdf-wasm)\.js$/
	];
	// The test server adds its client to the module a worker starts from.
	const server = ['/@vite/client', '/node_modules/vite/dist/client/env.mjs'];
	const form = new URL(saarUrl, location.href).pathname;
	const paths = requested.map((url) => url.pathname);
	expect(paths).toContain('/assets/pdf.worker.js');
	expect(requested.filter((url) => url.origin !== location.origin)).toEqual([]);
	expect(
		paths.filter((path) => !own.some((file) => file.test(path)) && !server.includes(path))
	).toEqual([form]);
	expect(byFrame.filter((url) => /^https?:/.test(url))).toEqual([]);
}, 120_000);

it('lays a form out in a document that loads no file and runs no script', async () => {
	const saar = await published(saarUrl);
	const refused: string[] = [];
	let ran: string | undefined;
	const lay = XfaStage.prototype.lay;
	vi.spyOn(XfaStage.prototype, 'lay').mockImplementationOnce(async function (this: XfaStage, page) {
		const laid = await lay.call(this, page);
		const owner = laid.layer.ownerDocument;
		owner.addEventListener('securitypolicyviolation', (event) =>
			refused.push(event.effectiveDirective)
		);
		const script = owner.createElement('script');
		script.textContent = 'document.body.dataset.ran = "yes"';
		const image = owner.createElement('img');
		const answered = new Promise((resolve) => (image.onerror = resolve));
		image.src = saarUrl;
		owner.body.append(script, image);
		await answered;
		ran = owner.body.dataset.ran;
		script.remove();
		image.remove();
		return laid;
	});
	await inventory(saar);

	expect(ran).toBeUndefined();
	// The sandbox stops the script before the policy is asked about it.
	expect(refused).toEqual(['img-src']);
}, 120_000);

it('lays a form out in a hidden, sandboxed frame of no size, under a policy that loads nothing', async () => {
	const saar = await published(saarUrl);
	const refused: string[] = [];
	let frame:
		{ sandbox: string; size: number[]; shown: string; policy: string; mode: string } | undefined;
	const lay = XfaStage.prototype.lay;
	vi.spyOn(XfaStage.prototype, 'lay').mockImplementationOnce(async function (this: XfaStage, page) {
		const laid = await lay.call(this, page);
		const element = document.querySelector('iframe')!;
		const owner = laid.layer.ownerDocument;
		const box = element.getBoundingClientRect();
		frame = {
			sandbox: element.sandbox.value,
			size: [box.width, box.height],
			shown: getComputedStyle(element).visibility,
			policy: owner.querySelector('meta')!.content,
			mode: owner.compatMode
		};
		owner.addEventListener('securitypolicyviolation', (event) =>
			refused.push(event.effectiveDirective)
		);
		const sheet = owner.createElement('link');
		sheet.rel = 'stylesheet';
		sheet.href = saarUrl;
		const inner = owner.createElement('iframe');
		inner.src = saarUrl;
		owner.body.append(sheet, inner);
		await vi
			.waitFor(() => expect(refused).toHaveLength(2), { timeout: 2000 })
			.catch(() => undefined);
		sheet.remove();
		inner.remove();
		return laid;
	});
	await inventory(saar);

	expect(frame!.sandbox).toBe('allow-same-origin');
	expect(frame!.size).toEqual([0, 0]);
	expect(frame!.shown).toBe('hidden');
	expect(frame!.policy).toBe("default-src 'none'; img-src blob: data:");
	// Standards mode, as in the viewer the XFA stylesheet was written for.
	expect(frame!.mode).toBe('CSS1Compat');
	expect(refused.sort()).toEqual(['frame-src', 'style-src-elem']);
}, 120_000);

it("waits on the frame's fonts, and never the host's, before it reads a page", async () => {
	const saar = await published(saarUrl);
	const reads = { frame: 0, host: 0 };
	// A read of `ready` that nothing awaits is no wait, so the count is of `then`.
	const counted = (fonts: FontFaceSet, of: keyof typeof reads) => {
		const ready = fonts.ready;
		Object.defineProperty(fonts, 'ready', {
			configurable: true,
			get: () => ({
				then: (...settle: Parameters<typeof ready.then>) => (reads[of]++, ready.then(...settle))
			})
		});
	};
	counted(document.fonts, 'host');
	const lay = XfaStage.prototype.lay;
	vi.spyOn(XfaStage.prototype, 'lay').mockImplementationOnce(function (this: XfaStage, page) {
		counted(document.querySelector('iframe')!.contentDocument!.fonts, 'frame');
		return lay.call(this, page);
	});
	try {
		await inventory(saar);
	} finally {
		Reflect.deleteProperty(document.fonts, 'ready');
	}

	expect(reads).toEqual({ frame: 3, host: 0 });
}, 120_000);

it('adds nothing to what the host page lays out or can scroll, whichever way it reads', async () => {
	const saar = await published(saarUrl);
	const root = document.documentElement;
	const measured = () => [
		root.scrollWidth,
		root.scrollHeight,
		document.body.offsetWidth,
		document.body.offsetHeight
	];
	// A transform on the body makes it the containing block of a fixed frame,
	// and a flex body makes every child in its flow an item with a gap before it.
	const hosts = [
		'html { direction: rtl }',
		'html { direction: rtl } body { transform: translateX(0) }',
		'html { writing-mode: vertical-rl } body { transform: translateX(0) }',
		'body { display: flex; flex-direction: column; gap: 50px; height: auto !important }'
	];
	const child = document.createElement('p');
	document.body.append(child);
	const lay = XfaStage.prototype.lay;
	for (const rules of hosts) {
		const host = document.createElement('style');
		host.textContent = rules;
		document.head.append(host);
		const before = measured();
		const during: number[][] = [];
		vi.spyOn(XfaStage.prototype, 'lay').mockImplementation(async function (this: XfaStage, page) {
			const laid = await lay.call(this, page);
			during.push(measured());
			return laid;
		});
		try {
			await inventory(saar);
		} finally {
			host.remove();
			vi.restoreAllMocks();
		}
		expect(during, rules).toEqual(Array(3).fill(before));
	}
	child.remove();
}, 120_000);

it('removes the frame when the file is not a dynamic form', async () => {
	const training = await normalizePdf(await published(trainingUrl));
	expect(await xfaToAcroForm(training)).toBe(training);
	expect(document.querySelector('iframe')).toBeNull();
}, 120_000);

it('removes the frame when the file is refused as it opens', async () => {
	await expect(xfaToAcroForm(new Uint8Array([1, 2, 3, 4]))).rejects.toMatchObject({
		refusal: { code: 'not_pdf' }
	});
	expect(document.querySelector('iframe')).toBeNull();
});

it('removes the frame when the document does not close', async () => {
	const normalized = await normalizePdf(await published(saarUrl));
	vi.stubGlobal(
		'Worker',
		class extends Worker {
			terminate() {
				super.terminate();
				throw new Error('The worker did not end.');
			}
		}
	);
	await expect(xfaToAcroForm(normalized)).rejects.toThrow('The worker did not end.');
	expect(document.querySelector('iframe')).toBeNull();
}, 120_000);

/** DD 2875 with every page of its XFA template `short` wide. */
async function withPageWidth(short: string): Promise<Uint8Array> {
	const saar = await PDFDocument.load(await published(saarUrl), { updateMetadata: false });
	const packets = saar.catalog.lookup(name('AcroForm'), PDFDict).lookup(name('XFA'), PDFArray);
	const at = packets.asArray().findIndex((part) => String(part) === '(template)') + 1;
	const template = new TextDecoder().decode(
		decodePDFRawStream(packets.lookup(at, PDFRawStream)).decode()
	);
	expect(template).toContain('short="612pt"');
	saar.context.assign(
		packets.get(at) as PDFRef,
		saar.context.flateStream(
			new TextEncoder().encode(template.replaceAll('short="612pt"', `short="${short}"`))
		)
	);
	return saar.save();
}

it('refuses a form whose pages are under a point wide, which is no hidden frame', async () => {
	expect(await sanitize(await withPageWidth('0.4pt'))).toEqual({
		ok: false,
		refusal: { code: 'layout', detail: 'a page has no size' }
	});
}, 120_000);

it('ends a conversion with an error when the host page hides the frame', async () => {
	const saar = await published(saarUrl);
	const hiding = document.createElement('style');
	hiding.textContent = 'iframe { display: none !important }';
	document.head.append(hiding);
	try {
		await expect(sanitize(saar)).rejects.toThrow(
			'The host page hid or removed the frame the form is laid out in.'
		);
	} finally {
		hiding.remove();
	}
	expect(document.querySelector('iframe')).toBeNull();
}, 120_000);

it('ends a conversion with the same error when the host page takes the frame out', async () => {
	const saar = await published(saarUrl);
	const lay = XfaStage.prototype.lay;
	vi.spyOn(XfaStage.prototype, 'lay').mockImplementationOnce(function (this: XfaStage, page) {
		document.querySelector('iframe')!.remove();
		return lay.call(this, page);
	});
	await expect(sanitize(saar)).rejects.toThrow(
		'The host page hid or removed the frame the form is laid out in.'
	);
}, 120_000);

function countWorkers() {
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
	return count;
}

function countObservers() {
	const count = { started: 0, live: new Set<MutationObserver>() };
	vi.stubGlobal(
		'MutationObserver',
		class extends MutationObserver {
			observe(target: Node, options?: MutationObserverInit) {
				super.observe(target, options);
				count.live.add(this);
				count.started++;
			}
			disconnect() {
				count.live.delete(this);
				super.disconnect();
			}
		}
	);
	return count;
}

/** A host page that takes a frame out of its body: in the task that put it there, or as it loads. */
function sweepFrames(when: 'at once' | 'loaded') {
	const append = document.body.append;
	vi.spyOn(document.body, 'append').mockImplementation(function (this: HTMLElement, ...nodes) {
		append.apply(this, nodes);
		for (const node of nodes) {
			if (!(node instanceof HTMLIFrameElement)) continue;
			if (when === 'at once') node.remove();
			else node.addEventListener('load', () => node.remove());
		}
	});
}

const REMOVED = 'The host page removed the frame the form is laid out in before it had loaded.';

it('rejects `ready` when the frame leaves the document in the task that made it', async () => {
	const watching = countObservers();
	const stage = new XfaStage();
	document.querySelector('iframe')!.remove();

	await expect(stage.ready).rejects.toThrow(REMOVED);
	expect(watching.started).toBe(1);
	expect(watching.live.size).toBe(0);
}, 20_000);

it('rejects `ready` when the frame leaves for another document before it loads', async () => {
	const watching = countObservers();
	const stage = new XfaStage();
	document.implementation.createHTMLDocument('').body.append(document.querySelector('iframe')!);

	await expect(stage.ready).rejects.toThrow(REMOVED);
	expect(watching.live.size).toBe(0);
}, 20_000);

it('throws on a page with no body, and leaves nothing watching', async () => {
	const pdf = await published(trainingUrl);
	const watching = countObservers();
	vi.spyOn(document, 'body', 'get').mockReturnValue(null as never);

	await expect(sanitize(pdf)).rejects.toThrow(TypeError);
	expect(watching.live.size).toBe(0);
}, 20_000);

it.each([
	['a static form', trainingUrl],
	['a dynamic form', saarUrl]
])(
	'ends sanitize with an error, and no worker, when the frame is removed before it loads: %s',
	async (_, url) => {
		const pdf = await published(url);
		const count = countWorkers();
		sweepFrames('at once');

		await expect(sanitize(pdf)).rejects.toThrow(REMOVED);
		expect(count.live.size).toBe(0);
		expect(document.querySelector('iframe')).toBeNull();
	},
	20_000
);

it('ends with the error for a hidden frame, and no worker, when the frame is removed as it loads', async () => {
	const saar = await published(saarUrl);
	const count = countWorkers();
	sweepFrames('loaded');

	await expect(sanitize(saar)).rejects.toThrow(
		'The host page hid or removed the frame the form is laid out in.'
	);
	expect(count.started).toBe(1);
	expect(count.live.size).toBe(0);
}, 120_000);

it('watches the host document no longer than the frame takes to load', async () => {
	const watching = countObservers();

	expect(await sanitize(await published(saarUrl))).toMatchObject({ ok: true });
	expect(watching.started).toBe(1);
	expect(watching.live.size).toBe(0);
}, 120_000);

/** The fields of DD 2875, and what the two readers return for each of its pages. */
async function readers(saar: Uint8Array) {
	const pages: unknown[] = [];
	const lay = XfaStage.prototype.lay;
	vi.spyOn(XfaStage.prototype, 'lay').mockImplementation(async function (this: XfaStage, page) {
		const laid = await lay.call(this, page);
		pages.push([displayList(laid, page.pageNumber), harvestWidgets(laid, page.pageNumber)]);
		return laid;
	});
	const { pages: sizes, widgets } = await inventory(saar);
	vi.restoreAllMocks();
	return { fields: { pages: sizes, widgets }, pages };
}

async function under<T>(rules: string, read: () => Promise<T>): Promise<T> {
	const host = document.createElement('style');
	host.textContent = rules;
	document.head.append(host);
	try {
		return await read();
	} finally {
		host.remove();
	}
}

it("reads DD 2875 as on a bare page, text, boxes and fields, under a host page's zoom", async () => {
	const saar = await published(saarUrl);
	const bare = await readers(saar);
	expect(bare.fields).toEqual(golden);
	expect(bare.pages).toHaveLength(3);

	for (const rules of [
		'html { zoom: 1.5 }',
		'body { zoom: 2 }',
		'iframe { zoom: 1.5 }',
		'iframe { zoom: 2 }',
		'html { zoom: 0.9 }',
		'body { zoom: 1.1 }',
		'html { zoom: 1.1 } body { zoom: 1.25 } iframe { zoom: 2 }'
	])
		expect(await under(rules, () => readers(saar)), rules).toEqual(bare);
}, 120_000);

const ZOOMED = "The host page's zoom scales the frame the form is laid out in.";

// The frame's zoom times its ancestors' is a 32-bit float. At 1.7 no zoom on
// the frame makes the product 1, and the layout differs at any other product.
it.each([
	'iframe { zoom: 1.5 !important }',
	'html { zoom: 1.5 } iframe { zoom: 1 !important }',
	'html { zoom: 1.7 }'
])(
	'ends a conversion with an error when the zoom of %s cannot be undone',
	async (rules) => {
		const saar = await published(saarUrl);
		await expect(under(rules, () => sanitize(saar))).rejects.toThrow(ZOOMED);
		expect(document.querySelector('iframe')).toBeNull();
	},
	120_000
);

it('ends a conversion with the same error when the zoom is set once the frame is made', async () => {
	const saar = await published(saarUrl);
	const lay = XfaStage.prototype.lay;
	vi.spyOn(XfaStage.prototype, 'lay').mockImplementationOnce(function (this: XfaStage, page) {
		return under('html { zoom: 1.5 }', () => lay.call(this, page));
	});
	await expect(sanitize(saar)).rejects.toThrow(ZOOMED);
}, 120_000);

it('reads DD 2875 as its golden where the browser has no currentCSSZoom', async () => {
	vi.spyOn(Element.prototype, 'currentCSSZoom', 'get').mockReturnValue(undefined as never);
	const { pages, widgets } = await inventory(await published(saarUrl));
	expect({ pages, widgets }).toEqual(golden);
}, 120_000);
