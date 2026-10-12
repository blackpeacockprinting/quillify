import css from '../assets/xfa-layer.js';
import { Refused } from './refusal.js';
import type { PDFPageProxy } from 'pdfjs-dist';

/** One page after the browser has solved its layout. */
export interface XfaPage {
	layer: HTMLElement;
	/** The page box in client coordinates. Every harvested rect is read against it. */
	origin: DOMRect;
	/** Page size in points. pdf.js normalizes XFA to points and emits CSS px, so 1px is 1pt. */
	width: number;
	height: number;
}

/** `XfaLayer.render` reads these off a link service; XFA forms here carry no links. */
const NO_LINKS = {
	addLinkAttributes() {},
	externalLinkTarget: 0,
	externalLinkRel: '',
	externalLinkEnabled: true,
	getDestinationHash: () => '',
	getAnchorUrl: () => ''
};

const SHELL = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src blob: data:">`;

/**
 * Somewhere out of sight to lay XFA pages out: a frame, whose document takes no
 * rule from the host page and gives it none. `display: none` is not an option:
 * it zeroes every rect, and it does that silently. The frame is hidden, out of
 * the flow and of no size instead, so the host page shows, lays out and
 * scrolls as it did, and the form inside is laid out all the same. A host page
 * can still take the frame's boxes away, and `lay` throws when one has. It can
 * take the frame out before it has loaded, and `ready` then rejects. And it
 * can zoom the frame, which the frame undoes, or `lay` throws.
 *
 * The frame runs no script, and its policy lets its document load only an
 * image from `blob:` or `data:`, which is how pdf.js hands it a form's images
 * and the stylesheet its field background. A face of the form is not the
 * document's to load: pdf.js makes it in the host page's realm, from the
 * file's bytes, a `local()` name or a face the package ships.
 */
export class XfaStage {
	readonly #frame = document.createElement('iframe');
	/** The frame's document, once the stylesheet `XfaLayer.render` counts on applies in it. */
	readonly ready: Promise<Document>;

	constructor() {
		const frame = this.#frame;
		frame.sandbox.add('allow-same-origin');
		frame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden';
		frame.srcdoc = SHELL;
		this.ready = new Promise<void>((loaded, removed) => {
			// A frame that leaves the document before it has loaded never loads.
			const left = () => {
				if (document.contains(frame)) return;
				watch.disconnect();
				removed(
					new Error('The host page removed the frame the form is laid out in before it had loaded.')
				);
			};
			const watch = new MutationObserver(left);
			frame.onload = () => {
				watch.disconnect();
				loaded();
			};
			document.body.append(frame);
			// A zoom on the frame or an ancestor scales the layout inside it. The
			// frame's own zoom undoes its ancestors', where the browser tells it.
			const zoom = document.body.currentCSSZoom;
			if (zoom) frame.style.zoom = String(1 / zoom);
			watch.observe(document, { childList: true, subtree: true });
			left();
		}).then(() => {
			const frameDocument = frame.contentDocument!;
			const view = frameDocument.defaultView!;
			const sheet = new view.CSSStyleSheet();
			sheet.replaceSync(css);
			// pdf.js's sheet gives a field out of focus a background from a data: URL,
			// which nothing here reads and a host's policy may refuse, a logged error
			// for each field.
			sheet.insertRule(':root { --xfa-unfocused-field-background: none; }', sheet.cssRules.length);
			frameDocument.adoptedStyleSheets = [sheet];

			// A sheet that did not apply leaves every field at its content size,
			// and the rects read off it are wrong with no error.
			const probe = frameDocument.createElement('div');
			probe.className = 'xfaLayer';
			frameDocument.body.append(probe);
			const applies = view.getComputedStyle(probe).position === 'absolute';
			probe.remove();
			if (!applies) throw new Error('The XFA stylesheet did not apply to the stage.');

			// pdf.js names a face with its family in quotes. Chromium keeps the quotes
			// as part of the name, and no rule of the form then asks for that face.
			const faces = frameDocument.fonts;
			const add = faces.add.bind(faces);
			faces.add = (face) => {
				if (/^".*"$/.test(face.family)) face.family = face.family.slice(1, -1);
				return add(face);
			};
			return frameDocument;
		});
	}

	/**
	 * Lay one page out. Each page gets its own relative wrapper: `.xfaLayer` is
	 * absolutely positioned, so sibling layers would stack at the initial
	 * containing block and every page after the first would measure against the
	 * wrong origin.
	 */
	async lay(page: PDFPageProxy): Promise<XfaPage> {
		const pdfjs = await import('pdfjs-dist');
		const xfa = await page.getXfa();
		if (!xfa) throw new Error(`XFA page ${page.pageNumber} laid out to nothing.`);
		const viewport = pdfjs.XfaLayer.getPageViewport(xfa, { scale: 1, rotation: 0 });
		// pdf.js lays out a page area whose medium has no size, and gives the page
		// a side of nothing, a negative one, or no number at all.
		if (!(viewport.width > 0 && viewport.height > 0))
			throw new Refused({ code: 'layout', detail: 'a page has no size' });

		const frameDocument = await this.ready;
		const host = frameDocument.createElement('div');
		// On Linux Chromium fits text to the pixel grid and rounds each advance to
		// a whole pixel, unless the text asks for geometric precision.
		host.style.cssText = `position:relative;overflow:hidden;background:#fff;text-rendering:geometricPrecision;width:${viewport.width}px;height:${viewport.height}px`;
		const layer = frameDocument.createElement('div');
		layer.className = 'xfaLayer';
		host.append(layer);
		frameDocument.body.append(host);

		pdfjs.XfaLayer.render({
			viewport: viewport.clone({ dontFlip: true }),
			div: layer,
			xfaHtml: xfa,
			linkService: NO_LINKS as never,
			intent: 'display'
		});
		await frameDocument.fonts.ready;
		// A picture has a size once it has loaded, and one that fails to has none.
		await Promise.all(
			Array.from(
				layer.querySelectorAll('img'),
				(img) => img.complete || new Promise((done) => (img.onload = img.onerror = done))
			)
		);

		// A frame the host page hid or took out gives the wrapper no box.
		if (!host.getClientRects().length)
			throw new Error('The host page hid or removed the frame the form is laid out in.');
		// The frame's zoom times its ancestors' is a 32-bit float, and for some
		// zooms no value brings it to 1. A rule marked `!important` beats the
		// frame's own.
		if ((this.#frame.currentCSSZoom ?? 1) !== 1)
			throw new Error("The host page's zoom scales the frame the form is laid out in.");
		return {
			layer,
			origin: host.getBoundingClientRect(),
			width: viewport.width,
			height: viewport.height
		};
	}

	close(): void {
		this.#frame.remove();
	}
}
