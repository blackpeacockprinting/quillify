import { Refused, type Refusal } from './refusal.js';
import type { XfaPage } from './xfa-layer.js';

/** RGB in the 0..1 the PDF operators take. */
export type Colour = [number, number, number];

export interface Edge {
	width: number;
	colour: Colour;
}

export interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
	fill: Colour | null;
	/** Top, right, bottom, left. A null edge is not drawn. */
	edges: [Edge | null, Edge | null, Edge | null, Edge | null];
}

export interface Line {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	width: number;
	colour: Colour;
}

/** One visual line of text, with the box the browser gave it. */
export interface Run {
	text: string;
	x: number;
	/** Distance from the page top to the baseline. */
	baseline: number;
	size: number;
	family: string;
	bold: boolean;
	italic: boolean;
	colour: Colour;
	letterSpacing: number;
	/** What the browser measured, which `drawRuns` scales the run to. */
	width: number;
}

export interface DisplayList {
	boxes: Box[];
	lines: Line[];
	runs: Run[];
	width: number;
	height: number;
}

const TRANSPARENT = /rgba\(.*,\s*0\)$/;
const PAINTED_BORDER = new Set(['solid', 'double', 'groove', 'ridge', 'inset', 'outset']);

function opaque(colour: string): boolean {
	return !!colour && colour !== 'transparent' && !TRANSPARENT.test(colour);
}

function rgb(colour: string): Colour {
	const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(colour);
	return m ? [+m[1] / 255, +m[2] / 255, +m[3] / 255] : [0, 0, 0];
}

/** A stroke the browser does not paint. `stroke-width: 0` computes to `0px`. */
function stroked(style: CSSStyleDeclaration): Edge | null {
	const width = parseFloat(style.strokeWidth);
	if (!Number.isFinite(width) || width <= 0) return null;
	if (style.stroke === 'none' || !opaque(style.stroke)) return null;
	return { width, colour: rgb(style.stroke) };
}

/**
 * Turn a laid-out XFA page into primitives in page points. The browser solved
 * the layout, and the rects here are read off it.
 *
 * What it can express is text, CSS backgrounds and borders, and inline SVG
 * `line` and `rect`. An image, a background image, another SVG shape, a border
 * style it cannot draw and a transform it cannot carry are refused with the
 * construct named: a background that is silently incomplete is worse than not
 * taking the form. A hidden element, an SVG `line` or `rect` with no stroke
 * and an element under 0.3 pt on a side are passed over.
 */
export function displayList(page: XfaPage, pageNumber: number): DisplayList {
	const { layer, origin } = page;
	const view = layer.ownerDocument.defaultView!;
	const boxes: Box[] = [];
	const lines: Line[] = [];
	const runs: Run[] = [];
	const X = (v: number) => +(v - origin.left).toFixed(2);
	const Y = (v: number) => +(v - origin.top).toFixed(2);
	const refuse = (
		construct: Extract<Refusal, { code: 'unpaintable' }>['construct'],
		detail?: string
	): never => {
		throw new Refused({ code: 'unpaintable', page: pageNumber - 1, construct, detail });
	};

	for (const el of layer.querySelectorAll<HTMLElement>('*')) {
		const tag = el.tagName.toLowerCase();
		if (tag === 'svg' || tag === 'option' || tag === 'g' || tag === 'defs') continue;
		if (tag === 'img' || el.classList.contains('xfaImage')) refuse('image');

		const style = view.getComputedStyle(el);
		if (style.visibility === 'hidden' || style.display === 'none') continue;

		if (tag === 'line' || tag === 'rect') {
			const svg = (el as unknown as SVGElement).ownerSVGElement;
			if (!svg) continue;
			const edge = stroked(style);
			if (!edge) continue;
			const svgRect = svg.getBoundingClientRect();
			if (tag === 'line') {
				// pdf.js writes these as percentages of the svg box ("100%", "50%").
				const at = (key: string, span: number): number => {
					const raw = el.getAttribute(key) ?? '0';
					const value = parseFloat(raw);
					if (!Number.isFinite(value)) return 0;
					return raw.trim().endsWith('%') ? (span * value) / 100 : value;
				};
				lines.push({
					x1: X(svgRect.x + at('x1', svgRect.width)),
					y1: Y(svgRect.y + at('y1', svgRect.height)),
					x2: X(svgRect.x + at('x2', svgRect.width)),
					y2: Y(svgRect.y + at('y2', svgRect.height)),
					width: edge.width,
					colour: edge.colour
				});
			} else {
				const r = el.getBoundingClientRect();
				boxes.push({
					x: X(r.x),
					y: Y(r.y),
					w: +r.width.toFixed(2),
					h: +r.height.toFixed(2),
					fill: style.fill !== 'none' && opaque(style.fill) ? rgb(style.fill) : null,
					edges: [edge, edge, edge, edge]
				});
			}
			continue;
		}
		if (svgOnly(tag)) refuse('svg', tag);

		const rect = el.getBoundingClientRect();
		if (rect.width < 0.3 || rect.height < 0.3) continue;

		// A control's own chrome belongs to the browser, and an AcroForm widget is
		// stamped where the control was. The printed square a checkmark goes in is
		// the exception: nothing else draws it. It is square and top-aligned inside
		// the field box, which is taller than the painted control.
		const type = el.getAttribute('type')?.toLowerCase();
		if (tag === 'input' || tag === 'textarea' || tag === 'select') {
			if (type === 'checkbox' || type === 'radio') {
				const side = Math.min(rect.width, rect.height);
				const hair: Edge = { width: 1, colour: [0, 0, 0] };
				boxes.push({
					x: X(rect.x),
					y: Y(rect.y),
					w: +side.toFixed(2),
					h: +side.toFixed(2),
					fill: null,
					edges: [hair, hair, hair, hair]
				});
			}
			continue;
		}

		if (style.backgroundImage !== 'none') refuse('background_image');
		if (unrepresentable(style.transform)) refuse('transform');

		const sides = ['Top', 'Right', 'Bottom', 'Left'] as const;
		const edges = sides.map((side) => {
			const width = parseFloat(style.getPropertyValue(`border-${side.toLowerCase()}-width`)) || 0;
			const kind = style.getPropertyValue(`border-${side.toLowerCase()}-style`);
			const colour = style.getPropertyValue(`border-${side.toLowerCase()}-color`);
			if (width <= 0 || kind === 'none' || kind === 'hidden' || !opaque(colour)) return null;
			if (!PAINTED_BORDER.has(kind)) refuse('border', kind);
			return { width, colour: rgb(colour) };
		}) as Box['edges'];
		const fill = opaque(style.backgroundColor) ? rgb(style.backgroundColor) : null;
		if (fill || edges.some(Boolean))
			boxes.push({
				x: X(rect.x),
				y: Y(rect.y),
				w: +rect.width.toFixed(2),
				h: +rect.height.toFixed(2),
				fill,
				edges
			});
	}

	collectText(layer, X, Y, runs);
	return { boxes, lines, runs, width: page.width, height: page.height };
}

/**
 * True for a transform the primitives cannot carry. XFA offsets caption
 * wrappers with a translation, which the rects already hold. A positive
 * horizontal scale is carried too: `getClientRects` reports the scaled width and
 * `drawRuns` puts it back as `Tz`, which is how LiveCycle's
 * `xfa-font-horizontal-scale` reaches the page. A rotation, a skew, a mirror or
 * a vertical scale changes glyph shape or height, and a run carries neither.
 */
export function unrepresentable(transform: string): boolean {
	if (transform === 'none') return false;
	const parts = /^matrix\(([^)]*)\)$/.exec(transform)?.[1].split(',').map(Number);
	if (!parts || parts.length !== 6) return true;
	const [a, b, c, d] = parts;
	return b !== 0 || c !== 0 || d !== 1 || a <= 0;
}

/** SVG shapes pdf.js can emit that the primitives above have no form for. */
function svgOnly(tag: string): boolean {
	return ['path', 'polygon', 'polyline', 'circle', 'ellipse', 'image', 'use', 'text'].includes(tag);
}

/**
 * One run per visual line, with the box the browser measured it into. Splitting
 * where the rect top changes is what keeps a wrapped paragraph's second line at
 * its own baseline.
 */
function collectText(
	layer: HTMLElement,
	X: (v: number) => number,
	Y: (v: number) => number,
	runs: Run[]
): void {
	const owner = layer.ownerDocument;
	const view = owner.defaultView!;
	const measure = owner.createElement('canvas').getContext('2d')!;
	const walker = owner.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
	const range = owner.createRange();
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		const text = node.nodeValue;
		const parent = node.parentElement;
		if (!text || !text.trim() || !parent) continue;
		// A <select> is de-chromed above; only the option the form shows is drawn.
		if (parent.tagName === 'OPTION' && !(parent as HTMLOptionElement).selected) continue;
		const style = view.getComputedStyle(parent);
		if (style.visibility === 'hidden' || style.display === 'none') continue;

		const size = parseFloat(style.fontSize);
		measure.font = `${style.fontStyle} ${style.fontWeight} ${size}px ${style.fontFamily}`;
		const descent = measure.measureText('Hg').fontBoundingBoxDescent ?? size * 0.21;
		const common = {
			size: +size.toFixed(2),
			family: style.fontFamily,
			bold: parseInt(style.fontWeight, 10) >= 600 || style.fontWeight === 'bold',
			italic: style.fontStyle === 'italic' || style.fontStyle === 'oblique',
			colour: rgb(style.color),
			letterSpacing: parseFloat(style.letterSpacing) || 0
		};

		let start = 0;
		let top: number | null = null;
		let box: { x: number; bottom: number; right: number } | null = null;
		const flush = (end: number): void => {
			const slice = text.slice(start, end);
			if (end <= start || !box || !slice.trim()) return;
			runs.push({
				text: slice,
				x: X(box.x),
				baseline: Y(box.bottom - descent),
				width: +(box.right - box.x).toFixed(2),
				...common
			});
		};
		for (let i = 0; i < text.length; i++) {
			range.setStart(node, i);
			range.setEnd(node, i + 1);
			const glyph = range.getClientRects()[0];
			if (!glyph) continue;
			if (top === null || Math.abs(glyph.top - top) < 0.6) {
				top ??= glyph.top;
				box = box
					? {
							x: Math.min(box.x, glyph.x),
							bottom: Math.max(box.bottom, glyph.bottom),
							right: Math.max(box.right, glyph.right)
						}
					: { x: glyph.x, bottom: glyph.bottom, right: glyph.right };
			} else {
				flush(i);
				start = i;
				top = glyph.top;
				box = { x: glyph.x, bottom: glyph.bottom, right: glyph.right };
			}
		}
		flush(text.length);
	}
}
