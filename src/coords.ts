import type { Rect } from './types.js';

/**
 * A PDF-space rectangle `[x0, y0, x1, y1]` (bottom-left origin) mapped into the
 * frame pdf.js paints the page in: `view` is the page's CropBox∩MediaBox and
 * `rotate` its /Rotate, the transform `PageViewport` applies at scale 1.
 */
export function toTopLeftRect(
	rect: [number, number, number, number],
	view: [number, number, number, number],
	rotate: number
): Rect {
	const [vx0, vy0, vx1, vy1] = view;
	const map = (x: number, y: number): [number, number] => {
		switch (((rotate % 360) + 360) % 360) {
			case 90:
				return [y - vy0, x - vx0];
			case 180:
				return [vx1 - x, y - vy0];
			case 270:
				return [vy1 - y, vx1 - x];
			default:
				return [x - vx0, vy1 - y];
		}
	};
	const [ax, ay] = map(rect[0], rect[1]);
	const [bx, by] = map(rect[2], rect[3]);
	return {
		x: Math.min(ax, bx),
		y: Math.min(ay, by),
		w: Math.abs(bx - ax),
		h: Math.abs(by - ay)
	};
}
