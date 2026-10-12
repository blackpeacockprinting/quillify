import type { XfaPage } from './xfa-layer.js';

export type XfaKind = 'text' | 'multiline' | 'checkbox' | 'radio' | 'choice' | 'signature';

export interface XfaWidget {
	/**
	 * `p<page>.<SOM path>`, with `#n` where that repeats. It is the AcroForm field
	 * name of every control but a radio, whose field is its group's.
	 */
	name: string;
	kind: XfaKind;
	page: number;
	/** Points, top-left origin, page-relative: the rect `form.json` wants. */
	x: number;
	y: number;
	w: number;
	h: number;
	/** The exclusion group this radio belongs to, as a SOM path. */
	group?: string;
	/** This radio's own on-state, which is how the group tells its options apart. */
	on?: string;
	tooltip?: string;
	options: string[];
}

/**
 * Where the browser paints a check box or a radio button. pdf.js gives the
 * control the width its template sets and the height of what is left of its
 * row, and the browser paints the largest square centered in that box.
 */
export function square(box: DOMRect): Pick<DOMRect, 'left' | 'top' | 'width' | 'height'> {
	const side = Math.min(box.width, box.height);
	return {
		left: box.left + (box.width - side) / 2,
		top: box.top + (box.height - side) / 2,
		width: side,
		height: side
	};
}

/**
 * Every control on a laid-out page, named after what the form called it.
 *
 * What the form called it is its SOM path: the `xfaname` attributes from the
 * layer root down to the control. Its `id` or `name` is read only when there
 * is none.
 */
export function harvestWidgets(page: XfaPage, pageNumber: number): XfaWidget[] {
	const { layer, origin } = page;
	const view = layer.ownerDocument.defaultView!;
	const widgets: XfaWidget[] = [];
	const seen = new Map<string, number>();

	// A signature field is read after every control, so a control that shares its
	// SOM path keeps the occurrence count it has without it.
	for (const el of [
		...layer.querySelectorAll<HTMLElement>('input, select, textarea'),
		...layer.querySelectorAll<HTMLElement>('.xfaSignature')
	]) {
		const style = view.getComputedStyle(el);
		if (style.visibility === 'hidden' || style.display === 'none') continue;
		const box = el.getBoundingClientRect();
		if (box.width <= 0 || box.height <= 0) continue;

		const type = el.getAttribute('type')?.toLowerCase();
		const tag = el.tagName.toLowerCase();
		const kind: XfaKind =
			tag === 'div'
				? 'signature'
				: tag === 'select'
					? 'choice'
					: tag === 'textarea'
						? 'multiline'
						: type === 'checkbox'
							? 'checkbox'
							: type === 'radio'
								? 'radio'
								: 'text';

		const rect = kind === 'checkbox' || kind === 'radio' ? square(box) : box;

		const path = somPath(el, layer);
		// A SOM path can recur: nine do on DAF 1288, six of them within a page, and
		// every field on its second page starts `Page1.`. The page and an occurrence
		// count make the AcroForm name unique without losing what the form called it.
		const base = `p${pageNumber}.${path}`;
		const count = (seen.get(base) ?? 0) + 1;
		seen.set(base, count);

		const excl = kind === 'radio' ? exclusion(el, layer) : null;
		widgets.push({
			name: count === 1 ? base : `${base}#${count}`,
			kind,
			page: pageNumber - 1,
			x: +(rect.left - origin.left).toFixed(2),
			y: +(rect.top - origin.top).toFixed(2),
			w: +rect.width.toFixed(2),
			h: +rect.height.toFixed(2),
			group: excl ? `p${pageNumber}.${somPath(excl, layer)}` : undefined,
			// The leaf of the SOM path is what the form calls this option. It becomes
			// the widget's on-state, which is the only thing telling one member of an
			// exclusion group from another.
			on: excl ? path.slice(path.lastIndexOf('.') + 1) : undefined,
			tooltip: tooltipOf(el),
			options:
				tag === 'select'
					? [...(el as HTMLSelectElement).options]
							.map((o) => o.textContent?.trim() ?? '')
							.filter(Boolean)
					: []
		});
	}
	return widgets;
}

/** `Page1.form1.page1.TypeRequest.type_of_request`, root-first. */
function somPath(el: HTMLElement, layer: HTMLElement): string {
	const parts: string[] = [];
	for (let node: HTMLElement | null = el; node && node !== layer; node = node.parentElement) {
		const name = node.getAttribute('xfaname');
		if (name) parts.unshift(name);
	}
	return parts.length ? parts.join('.') : el.id || el.getAttribute('name') || 'field';
}

function exclusion(el: HTMLElement, layer: HTMLElement): HTMLElement | null {
	const found = el.closest<HTMLElement>('.xfaExclgroup[xfaname]');
	return found && layer.contains(found) ? found : null;
}

/** The hover text a filler reads. */
function tooltipOf(el: HTMLElement): string | undefined {
	const field = el.closest<HTMLElement>('.xfaField');
	const direct =
		el.getAttribute('aria-label') || el.getAttribute('title') || field?.getAttribute('title');
	if (direct?.trim()) return direct.trim();
	// pdf.js rewrites the caption's class for a check-button UI, which is every
	// radio and every checkbox, so the one selector misses both.
	return (
		field?.querySelector('.xfaCaption, .xfaCaptionForCheckButton')?.textContent?.trim() || undefined
	);
}
