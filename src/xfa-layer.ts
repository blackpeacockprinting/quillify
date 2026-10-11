import css from '../assets/xfa-layer.js';
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
 * take the frame out before it has loaded, and `ready` then rejects.
 *
 * The frame runs no script, and its policy lets its document load only an
 * image from `blob:` or `data:`, which is how pdf.js hands it a form's images
 * and the stylesheet its field background. A face of the form is not the
 * document's to load: pdf.js makes it in the host page's realm, from the
 * file's bytes or a `local()` name.
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
			watch.observe(document, { childList: true, subtree: true });
			left();
		}).then(() => {
			const frameDocument = frame.contentDocument!;
			const view = frameDocument.defaultView!;
			const sheet = new view.CSSStyleSheet();
			sheet.replaceSync(css);
			frameDocument.adoptedStyleSheets = [sheet];

			// A sheet that did not apply leaves every field at its content size,
			// and the rects read off it are wrong with no error.
			const probe = frameDocument.createElement('div');
			probe.className = 'xfaLayer';
			frameDocument.body.append(probe);
			const applies = view.getComputedStyle(probe).position === 'absolute';
			probe.remove();
			if (!applies) throw new Error('The XFA stylesheet did not apply to the stage.');
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

		const frameDocument = await this.ready;
		const host = frameDocument.createElement('div');
		host.style.cssText = `position:relative;overflow:hidden;background:#fff;width:${viewport.width}px;height:${viewport.height}px`;
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

		// A frame the host page hid or took out gives the wrapper no box. A box of
		// no width is the file's: a page under a point wide.
		if (!host.getClientRects().length)
			throw new Error('The host page hid or removed the frame the form is laid out in.');
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
