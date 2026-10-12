import { Refused, type Refusal } from './refusal.js';
import type { XfaPage } from './xfa-layer.js';
import { square } from './xfa-widgets.js';

/** RGB in the 0..1 the PDF operators take. */
export type Colour = [number, number, number];

export interface Edge {
	width: number;
	colour: Colour;
	dashed?: true;
}

export interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
	fill: Colour | null;
	/** Top, right, bottom, left. A null edge is not drawn. */
	edges: [Edge | null, Edge | null, Edge | null, Edge | null];
	/**
	 * The radius of an SVG rect's corners, along the middle of its border. An
	 * ellipse has one that reaches the middle of its longer side.
	 */
	radius?: number;
}

/** A picture, at the box the browser paints its pixels in. */
export interface Picture {
	x: number;
	y: number;
	w: number;
	h: number;
	image: HTMLImageElement;
}

export interface Line {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	width: number;
	colour: Colour;
}

/** One visual line of text, or the part of one between tabs, with the box the browser gave it. */
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
	/** What the browser measured, which `drawRun` scales the run to. */
	width: number;
	/** Quarter turns counter-clockwise about the start of the baseline, when the run is turned. */
	turn?: number;
}

export type Drawn = Box | Picture | Line | Run;

export interface DisplayList {
	/** What the page shows, in the order the browser paints it. */
	drawn: Drawn[];
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
 * What it can express is text, CSS backgrounds and borders, pictures, and
 * inline SVG `line`, `rect`, `ellipse` and `circle`. A picture that did not
 * load, a background image, a shape filled with a gradient or a pattern,
 * another SVG shape, a border style it cannot draw and a transform it cannot
 * carry are refused with the construct named: a background that is silently
 * incomplete is worse than not taking the form. An element hidden by its own
 * style, an SVG `line` with no stroke, a shape with neither stroke nor fill
 * or of no width or height, and an HTML element under 0.3 pt on a side are
 * passed over.
 */
export function displayList(page: XfaPage, pageNumber: number): DisplayList {
	const { layer, origin } = page;
	const view = layer.ownerDocument.defaultView!;
	const drawn: Drawn[] = [];
	// The quarter turns each element is laid out under, its own and its ancestors'.
	const turns = new Map<Element, number>([[layer, 0]]);
	const X = (v: number) => +(v - origin.left).toFixed(2);
	const Y = (v: number) => +(v - origin.top).toFixed(2);
	const refuse = (
		construct: Extract<Refusal, { code: 'unpaintable' }>['construct'],
		detail?: string
	): never => {
		throw new Refused({ code: 'unpaintable', page: pageNumber - 1, construct, detail });
	};

	// CSS paints the boxes of what is in the flow under a positioned element,
	// then its text, pictures and SVG shapes, then the positioned elements
	// under it in tree order, each the same way.
	const order: Node[] = [];
	const under = (root: Element): void => {
		const front: Node[] = [];
		const positioned: Element[] = [];
		const flow = (parent: Element): void => {
			for (const node of parent.childNodes) {
				if (node.nodeType === Node.TEXT_NODE) front.push(node);
				if (node.nodeType !== Node.ELEMENT_NODE) continue;
				const el = node as Element;
				if (view.getComputedStyle(el).position !== 'static') positioned.push(el);
				else {
					(/^(img|line|rect|ellipse|circle|input)$/i.test(el.tagName) ? front : order).push(el);
					flow(el);
				}
			}
		};
		flow(root);
		for (const node of front) order.push(node);
		for (const el of positioned) {
			order.push(el);
			under(el);
		}
	};
	under(layer);

	for (const node of order) {
		if (node.nodeType === Node.TEXT_NODE) {
			collectText(node, X, Y, drawn, turns);
			continue;
		}
		const el = node as HTMLElement;
		const tag = el.tagName.toLowerCase();
		const style = view.getComputedStyle(el);
		const own = quarterTurns(style.transform);
		const turn = (turns.get(el.parentElement!)! + own) % 4;
		turns.set(el, turn);
		if (tag === 'svg' || tag === 'option' || tag === 'g' || tag === 'defs') continue;
		if (style.visibility === 'hidden' || style.display === 'none') continue;

		if (tag === 'img' || el.classList.contains('xfaImage')) {
			const image = el as HTMLImageElement;
			// A picture that did not load has no size.
			if (!image.naturalWidth || !image.naturalHeight) refuse('image');
			if (turn || unrepresentable(style.transform)) refuse('transform');
			const rect = image.getBoundingClientRect();
			if (rect.width < 0.3 || rect.height < 0.3) continue;
			// pdf.js stretches a picture to its box where the template says so. Any
			// other the stylesheet fits into the box whole, from the top left.
			const fit =
				style.objectFit === 'contain'
					? Math.min(rect.width / image.naturalWidth, rect.height / image.naturalHeight)
					: 0;
			drawn.push({
				x: X(rect.x),
				y: Y(rect.y),
				w: +(fit ? image.naturalWidth * fit : rect.width).toFixed(2),
				h: +(fit ? image.naturalHeight * fit : rect.height).toFixed(2),
				image
			});
			continue;
		}

		if (tag === 'line' || tag === 'rect' || tag === 'ellipse' || tag === 'circle') {
			const svg = (el as unknown as SVGElement).ownerSVGElement;
			if (!svg) continue;
			const edge = stroked(style);
			if (tag === 'line') {
				if (!edge) continue;
				if (turn) refuse('transform');
				const svgRect = svg.getBoundingClientRect();
				// pdf.js writes these as percentages of the svg box ("100%", "50%").
				const at = (key: string, span: number): number => {
					const raw = el.getAttribute(key) ?? '0';
					const value = parseFloat(raw);
					if (!Number.isFinite(value)) return 0;
					return raw.trim().endsWith('%') ? (span * value) / 100 : value;
				};
				drawn.push({
					x1: X(svgRect.x + at('x1', svgRect.width)),
					y1: Y(svgRect.y + at('y1', svgRect.height)),
					x2: X(svgRect.x + at('x2', svgRect.width)),
					y2: Y(svgRect.y + at('y2', svgRect.height)),
					width: edge.width,
					colour: edge.colour
				});
			} else {
				// pdf.js writes every shape a fill, and the browser drops one that is no
				// color: a gradient or a pattern. What is left computes to black.
				if (!el.style.fill && !el.hasAttribute('fill')) refuse('background_image');
				// A shape whose edge is hidden has a stroke of no width.
				const fill = style.fill !== 'none' && opaque(style.fill) ? rgb(style.fill) : null;
				if (!edge && !fill) continue;
				// SVG centers a stroke on the shape's edge, and a box's border is
				// drawn inside it, so the box is half a stroke larger all round. What
				// that adds to the fill lies under the stroke.
				const half = (edge?.width ?? 0) / 2;
				const r = el.getBoundingClientRect();
				// The browser paints no shape of no width or height, whatever its stroke.
				if (!r.width || !r.height) continue;
				// The browser draws a rect square when its rx is below zero. An ellipse
				// is a rect whose corners meet.
				const radius = tag === 'rect' ? parseFloat(style.rx) : Math.max(r.width, r.height) / 2;
				drawn.push({
					x: X(r.x - half),
					y: Y(r.y - half),
					w: +(r.width + 2 * half).toFixed(2),
					h: +(r.height + 2 * half).toFixed(2),
					fill,
					edges: [edge, edge, edge, edge],
					radius: radius > 0 ? radius : undefined
				});
			}
			continue;
		}
		if (svgOnly(tag)) refuse('svg', tag);

		const rect = el.getBoundingClientRect();
		if (rect.width < 0.3 || rect.height < 0.3) continue;

		// A control's own chrome belongs to the browser, and an AcroForm widget is
		// stamped where the control was. The printed square a checkmark goes in is
		// the exception: nothing else draws it. It is drawn where the browser
		// paints the control, which is where the widget is stamped.
		const type = el.getAttribute('type')?.toLowerCase();
		if (tag === 'input' || tag === 'textarea' || tag === 'select') {
			// A field is stamped upright, so a turned one would fill the wrong way.
			if (turn) refuse('transform');
			if (type === 'checkbox' || type === 'radio') {
				const painted = square(rect);
				const hair: Edge = { width: 1, colour: [0, 0, 0] };
				drawn.push({
					x: X(painted.left),
					y: Y(painted.top),
					w: +painted.width.toFixed(2),
					h: +painted.height.toFixed(2),
					fill: null,
					edges: [hair, hair, hair, hair]
				});
			}
			continue;
		}

		if (style.backgroundImage !== 'none') refuse('background_image');
		// pdf.js turns an element about its top left corner, which is where a
		// template turns one it places. One a row or a column flows is left where
		// it flowed, turned out of its cell.
		if (own ? style.position !== 'absolute' : unrepresentable(style.transform)) refuse('transform');

		const sides = ['Top', 'Right', 'Bottom', 'Left'] as const;
		const edges = sides.map((side) => {
			const width = parseFloat(style.getPropertyValue(`border-${side.toLowerCase()}-width`)) || 0;
			const kind = style.getPropertyValue(`border-${side.toLowerCase()}-style`);
			const colour = style.getPropertyValue(`border-${side.toLowerCase()}-color`);
			if (width <= 0 || kind === 'none' || kind === 'hidden' || !opaque(colour)) return null;
			if (kind === 'dashed') return { width, colour: rgb(colour), dashed: true };
			if (!PAINTED_BORDER.has(kind)) refuse('border', kind);
			return { width, colour: rgb(colour) };
		}) as Box['edges'];
		// A quarter turn counter-clockwise has the element's right edge at the top.
		for (let quarter = turn; quarter > 0; quarter--) edges.push(edges.shift()!);
		const fill = opaque(style.backgroundColor) ? rgb(style.backgroundColor) : null;
		if (fill || edges.some(Boolean))
			drawn.push({
				x: X(rect.x),
				y: Y(rect.y),
				w: +rect.width.toFixed(2),
				h: +rect.height.toFixed(2),
				fill,
				edges
			});
	}
	return { drawn, width: page.width, height: page.height };
}

/**
 * How many quarter turns counter-clockwise a transform is, and 0 for any
 * other. pdf.js writes a template's `rotate="90"` as `rotate(-90deg)`.
 */
function quarterTurns(transform: string): number {
	return (
		[
			'matrix(0, -1, 1, 0, 0, 0)',
			'matrix(-1, 0, 0, -1, 0, 0)',
			'matrix(0, 1, -1, 0, 0, 0)'
		].indexOf(transform) + 1
	);
}

/**
 * True for a transform a run's box cannot carry. XFA offsets caption
 * wrappers with a translation, which the rects already hold. A positive
 * horizontal scale is carried too: `getClientRects` reports the scaled width and
 * `drawRun` puts it back as `Tz`, which is how LiveCycle's
 * `xfa-font-horizontal-scale` reaches the page. A rotation, a skew, a mirror or
 * a vertical scale changes glyph shape or height, and a run carries neither. A
 * quarter turn is read apart, by `quarterTurns`.
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
	return ['path', 'polygon', 'polyline', 'image', 'use', 'text'].includes(tag);
}

/**
 * One run per visual line, with the box the browser measured it into. Splitting
 * where the rect top changes is what keeps a wrapped paragraph's second line at
 * its own baseline. A tab ends a run too and is in none: the text after it
 * starts a run at the box the layout moved it to.
 */
function collectText(
	node: Node,
	X: (v: number) => number,
	Y: (v: number) => number,
	drawn: Drawn[],
	turns: Map<Element, number>
): void {
	const text = node.nodeValue;
	const parent = node.parentElement;
	if (!text || !text.trim() || !parent) return;
	// A <select> is de-chromed above; only the option the form shows is drawn.
	if (parent.tagName === 'OPTION' && !(parent as HTMLOptionElement).selected) return;
	const owner = node.ownerDocument!;
	const style = owner.defaultView!.getComputedStyle(parent);
	if (style.visibility === 'hidden' || style.display === 'none') return;
	const measure = owner.createElement('canvas').getContext('2d')!;
	const range = owner.createRange();

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

	// Under a turn each rect is read in the frame the text is upright in, and
	// the start of each line's baseline is turned back to the page.
	const turn = turns.get(parent)!;
	const [cos, sin] = [
		[1, 0],
		[0, -1],
		[-1, 0],
		[0, 1]
	][turn];
	const upright = ({ left, right, top, bottom }: DOMRect) => {
		const [x1, x2] = [cos * left + sin * top, cos * right + sin * bottom];
		const [y1, y2] = [cos * top - sin * left, cos * bottom - sin * right];
		return {
			x: Math.min(x1, x2),
			right: Math.max(x1, x2),
			top: Math.min(y1, y2),
			bottom: Math.max(y1, y2)
		};
	};

	let start = 0;
	let top: number | null = null;
	let box: { x: number; bottom: number; right: number } | null = null;
	const flush = (end: number): void => {
		const slice = text.slice(start, end);
		if (end <= start || !box || !slice.trim()) return;
		const base = box.bottom - descent;
		drawn.push({
			text: slice,
			x: X(cos * box.x - sin * base),
			baseline: Y(sin * box.x + cos * base),
			width: +(box.right - box.x).toFixed(2),
			turn: turn || undefined,
			...common
		});
	};
	for (let i = 0; i < text.length; i++) {
		if (text[i] === '\t') {
			flush(i);
			start = i + 1;
			top = null;
			box = null;
			continue;
		}
		range.setStart(node, i);
		range.setEnd(node, i + 1);
		const rect = range.getClientRects()[0];
		if (!rect) continue;
		const glyph = upright(rect);
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
