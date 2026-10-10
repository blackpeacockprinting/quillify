import css from './xfa-layer.css?inline';
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

/**
 * Somewhere offscreen to lay XFA pages out. `display: none` is not an option: it
 * zeroes every rect, and it does that silently. The container sits off the left
 * edge instead, and the viewer stylesheet is injected beside it rather than into
 * the app's own, because `XfaLayer.render` emits a DOM with no style of its own
 * and the app must not inherit the rules that give it one.
 */
export class XfaStage {
	readonly #root: HTMLDivElement;

	constructor() {
		this.#root = document.createElement('div');
		this.#root.style.cssText = 'position:absolute;left:-99999px;top:0;background:#fff';
		const style = document.createElement('style');
		style.textContent = css;
		this.#root.append(style);
		document.body.append(this.#root);
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

		const host = document.createElement('div');
		host.style.cssText = `position:relative;overflow:hidden;background:#fff;width:${viewport.width}px;height:${viewport.height}px`;
		const layer = document.createElement('div');
		layer.className = 'xfaLayer';
		host.append(layer);
		this.#root.append(host);

		pdfjs.XfaLayer.render({
			viewport: viewport.clone({ dontFlip: true }),
			div: layer,
			xfaHtml: xfa,
			linkService: NO_LINKS as never,
			intent: 'display'
		});
		await document.fonts.ready;

		return {
			layer,
			origin: host.getBoundingClientRect(),
			width: viewport.width,
			height: viewport.height
		};
	}

	close(): void {
		this.#root.remove();
	}
}
