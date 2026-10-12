/**
 * A dynamic form's redraw beside the layout it was read from. The browser
 * paints the layout and pdf.js paints the redraw, and the two pictures of each
 * page are held together on what is not text: rules, borders, fills and
 * pictures.
 *
 * Text is left out of both. The layout is set in the form's faces or a
 * fallback and the redraw in the standard 14, so their glyphs differ.
 */

import { expect, it } from 'vitest';
import css from '../assets/xfa-layer.js';
import { dynamicForm } from '../test/dynamic-form.js';
import { normalizePdf } from './normalize.js';
import { openPdf } from './pdfjs.js';
import { XfaStage } from './xfa-layer.js';
import { harvestWidgets, type XfaWidget } from './xfa-widgets.js';
import { xfaToAcroForm } from './xfa.js';

const fixtures = import.meta.glob<string>('../test/fixtures/D{AF1288,AF988,D2875}_*.pdf', {
	query: '?url',
	import: 'default',
	eager: true
});

const rectangle = (y: number, inner: string) =>
	`<draw x="20pt" y="${y}pt" w="200pt" h="40pt"><value><rectangle>${inner}</rectangle></value></draw>`;
const FILLED = '<edge presence="hidden"/><fill><color value="200,200,200"/></fill>';

/**
 * A PNG in base64, as a template holds a picture: a quarter each of red, green
 * and blue, and the last quarter clear, so no turn or mirror of it is itself.
 */
function png(width: number, height: number): string {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext('2d')!;
	for (const [index, colour] of ['#c00000', '#007800', '#0000a0'].entries()) {
		context.fillStyle = colour;
		context.fillRect(
			((index % 2) * width) / 2,
			(Math.floor(index / 2) * height) / 2,
			width / 2,
			height / 2
		);
	}
	return canvas.toDataURL('image/png').slice('data:image/png;base64,'.length);
}
const picture = (y: number, h: number, aspect: string, base64: string) =>
	`<draw x="20pt" y="${y}pt" w="200pt" h="${h}pt"><value><image contentType="image/png" aspect="${aspect}">${base64}</image></value></draw>`;
/** Forms built here, each for something no dynamic fixture holds. */
const built = {
	'a fill with no border and a thick stroke':
		rectangle(20, FILLED) +
		rectangle(
			100,
			'<edge thickness="6pt"><color value="255,0,0"/></edge><fill><color value="0,0,128"/></fill>'
		),
	// The third has a radius past half its height, which SVG stops there. The
	// last has one below zero, which the browser draws square.
	'rounded corners':
		rectangle(20, '<edge thickness="1pt"/><corner radius="14.4pt" join="round"/>') +
		rectangle(
			100,
			'<edge thickness="6pt"><color value="255,0,0"/></edge><corner radius="10pt" join="round"/><fill><color value="0,0,128"/></fill>'
		) +
		rectangle(
			180,
			'<edge presence="hidden"/><corner radius="30pt" join="round"/><fill><color value="200,200,200"/></fill>'
		) +
		rectangle(260, '<edge thickness="2pt"/><corner radius="-5pt" join="round"/>'),
	// The first is stretched to its box and the second fitted into the top left
	// of one, each at a pixel of its own to a pixel of the comparison. The third
	// lies over a fill, which shows through its clear quarter.
	pictures:
		picture(20, 60, 'none', png(200, 120)) +
		picture(100, 60, 'fit', png(120, 120)) +
		rectangle(180, FILLED) +
		picture(180, 40, 'none', png(400, 80))
};

/**
 * Device pixels to a point, in both pictures. At 1 a rule under a point wide
 * is less than a pixel, and each page of DAF 988 differs by about a thousand
 * pixels with every box in place.
 */
const SCALE = 2;
/**
 * The tolerance, in device pixels: ink of one picture is looked for this far
 * away in the other. One pixel is half a point. The image is laid out at one
 * pixel to the point, where the browser paints a border from a whole pixel,
 * and the redraw has the border where the layout computed it, which can be
 * half a point away. At 0 a fixture's page differs by 7,030 to 41,515 pixels
 * with every box in place, and at 1 by none.
 */
const NEAR = 1;
/**
 * A pixel is ink when its darkest channel is this far below white, a tenth of
 * 255, and it is found in ink at least a third as dark as itself.
 */
const INK = 26;
/** An area is even when no channel varies by more than this over 5 by 5 pixels. */
const EVEN = 8;
/** Two even areas are of one color when no channel differs by more than this. */
const SAME = 12;

/** Text shows in neither picture, and a control is the browser's to paint. */
const NO_TEXT = `.xfaLayer, .xfaLayer * { color: transparent !important; text-decoration-color: transparent !important }
.xfaLayer :is(input, textarea, select) { opacity: 0 !important }`;
const SVG = 'http://www.w3.org/2000/svg';

interface Page {
	picture: ImageData;
	/** The check boxes and radio buttons, where the redraw draws a square of its own. */
	buttons: XfaWidget[];
}

/**
 * Each page of the layout as the browser paints it. A frame's pixels cannot be
 * read, so the page's elements go into an SVG image with the stage's
 * stylesheet, and the image onto a canvas. The image is a document of its own
 * and lays the page out again, with the faces of the machine and no other. It
 * loads nothing from outside itself, so each picture's `blob:` URL is
 * replaced with a `data:` URL of the same bytes.
 */
async function laidOut(bytes: Uint8Array): Promise<Page[]> {
	const stage = new XfaStage();
	let opened: Awaited<ReturnType<typeof openPdf>> | undefined;
	try {
		opened = await openPdf(bytes, { enableXfa: true, ownerDocument: await stage.ready });
		const pages: Page[] = [];
		for (let number = 1; number <= opened.pdf.numPages; number++) {
			const laid = await stage.lay(await opened.pdf.getPage(number));
			const buttons = harvestWidgets(laid, number).filter(
				({ kind }) => kind === 'checkbox' || kind === 'radio'
			);
			for (const img of laid.layer.querySelectorAll('img')) {
				const reader = new FileReader();
				reader.readAsDataURL(await (await fetch(img.src)).blob());
				await new Promise((read) => (reader.onload = read));
				img.src = reader.result as string;
			}
			const svg = document.createElementNS(SVG, 'svg');
			const style = document.createElementNS(SVG, 'style');
			const foreign = document.createElementNS(SVG, 'foreignObject');
			svg.setAttribute('width', String(laid.width));
			svg.setAttribute('height', String(laid.height));
			foreign.setAttribute('width', '100%');
			foreign.setAttribute('height', '100%');
			style.textContent = css + NO_TEXT;
			foreign.append(laid.layer.parentElement!);
			svg.append(style, foreign);
			const image = new Image();
			image.src = `data:image/svg+xml,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
			await image.decode();
			const canvas = document.createElement('canvas');
			canvas.width = Math.ceil(laid.width * SCALE);
			canvas.height = Math.ceil(laid.height * SCALE);
			const context = canvas.getContext('2d')!;
			context.fillStyle = '#fff';
			context.fillRect(0, 0, canvas.width, canvas.height);
			context.drawImage(image, 0, 0, laid.width * SCALE, laid.height * SCALE);
			pages.push({ picture: context.getImageData(0, 0, canvas.width, canvas.height), buttons });
		}
		return pages;
	} finally {
		stage.close();
		await opened?.close();
	}
}

/**
 * Each page of the redraw as pdf.js paints it, with no glyph: the standard 14
 * come with no file, and pdf.js sets such a face through the canvas's own
 * `fillText`.
 */
async function redrawn(bytes: Uint8Array): Promise<ImageData[]> {
	const { AnnotationMode } = await import('pdfjs-dist');
	const { pdf, close } = await openPdf(bytes);
	try {
		const pages: ImageData[] = [];
		for (let number = 1; number <= pdf.numPages; number++) {
			const page = await pdf.getPage(number);
			const viewport = page.getViewport({ scale: SCALE });
			const canvas = document.createElement('canvas');
			canvas.width = Math.ceil(viewport.width);
			canvas.height = Math.ceil(viewport.height);
			const context = canvas.getContext('2d')!;
			context.fillText = () => {};
			await page.render({ canvas, viewport, annotationMode: AnnotationMode.DISABLE }).promise;
			pages.push(context.getImageData(0, 0, canvas.width, canvas.height));
		}
		return pages;
	} finally {
		await close();
	}
}

/**
 * Where two pictures of one size disagree, as two counts of pixels.
 *
 * `ink`: ink of either picture with none within `NEAR` in the other. A rule
 * that is antialiased another way or a fraction of a pixel off has ink beside
 * it. A rule or a border the other picture lacks, or has elsewhere, has none.
 *
 * `fill`: pixels in an even area of both pictures whose colors differ, which
 * is what a fill the other picture lacks leaves, however light it is.
 */
function differ(a: ImageData, b: ImageData, buttons: XfaWidget[]): { ink: number; fill: number } {
	const { width, height } = a;
	const skip = new Uint8Array(width * height);
	for (const { x, y, w, h } of buttons)
		for (let v = Math.floor(y * SCALE) - NEAR; v <= Math.ceil((y + h) * SCALE) + NEAR; v++)
			for (let u = Math.floor(x * SCALE) - NEAR; u <= Math.ceil((x + w) * SCALE) + NEAR; u++)
				if (u >= 0 && v >= 0 && u < width && v < height) skip[v * width + u] = 1;
	const darkness = ({ data }: ImageData) =>
		Uint8Array.from(
			skip,
			(_, at) => 255 - Math.min(data[4 * at], data[4 * at + 1], data[4 * at + 2])
		);
	const darkA = darkness(a);
	const darkB = darkness(b);
	const lone = (own: Uint8Array, other: Uint8Array, x: number, y: number): boolean => {
		const at = y * width + x;
		if (own[at] < INK) return false;
		const need = Math.max(INK, own[at] / 3);
		for (let v = Math.max(0, y - NEAR); v <= Math.min(height - 1, y + NEAR); v++)
			for (let u = Math.max(0, x - NEAR); u <= Math.min(width - 1, x + NEAR); u++)
				if (other[v * width + u] >= need) return false;
		return true;
	};
	const even = ({ data }: ImageData, x: number, y: number): boolean => {
		if (x < 2 || y < 2 || x >= width - 2 || y >= height - 2) return false;
		for (let channel = 0; channel < 3; channel++) {
			let low = 255;
			let high = 0;
			for (let v = y - 2; v <= y + 2; v++)
				for (let u = x - 2; u <= x + 2; u++) {
					const value = data[4 * (v * width + u) + channel];
					if (value < low) low = value;
					if (value > high) high = value;
				}
			if (high - low > EVEN) return false;
		}
		return true;
	};
	const out = { ink: 0, fill: 0 };
	for (let y = 0; y < height; y++)
		for (let x = 0; x < width; x++) {
			const at = y * width + x;
			if (skip[at]) continue;
			if (lone(darkA, darkB, x, y) || lone(darkB, darkA, x, y)) out.ink++;
			const apart = Math.max(
				Math.abs(a.data[4 * at] - b.data[4 * at]),
				Math.abs(a.data[4 * at + 1] - b.data[4 * at + 1]),
				Math.abs(a.data[4 * at + 2] - b.data[4 * at + 2])
			);
			if (apart > SAME && even(a, x, y) && even(b, x, y)) out.fill++;
		}
	return out;
}

type Form = [name: string, bytes: () => Promise<Uint8Array>];
const forms = [
	...Object.entries(fixtures).map(([path, url]): Form => [
		path.slice(path.lastIndexOf('/') + 1).replace(/_.*$/, ''),
		async () => new Uint8Array(await (await fetch(url)).arrayBuffer())
	]),
	...Object.entries(built).map(([name, body]): Form => [name, () => dynamicForm(body)])
];

it.each(forms)(
	'%s: the redraw has the rules, borders, fills and pictures of its layout',
	async (_, read) => {
		const bytes = await normalizePdf(await read());
		const layout = await laidOut(bytes);
		const redraw = await redrawn(await xfaToAcroForm(bytes));

		expect(
			redraw.map(({ width, height }) => [width, height]),
			'the size of each page'
		).toEqual(layout.map(({ picture }) => [picture.width, picture.height]));
		for (const [index, { picture }] of layout.entries())
			expect(
				picture.data.some((value) => value < 255 - INK),
				`page ${index + 1} of the layout has ink`
			).toBe(true);
		expect(
			layout.map(({ picture, buttons }, index) => differ(picture, redraw[index], buttons))
		).toEqual(layout.map(() => ({ ink: 0, fill: 0 })));
	},
	120_000
);

it('a redraw with a rectangle left out differs from its layout in both counts', async () => {
	const pdf = async (body: string) => normalizePdf(await dynamicForm(body));
	const [{ picture, buttons }] = await laidOut(
		await pdf(rectangle(20, FILLED) + rectangle(100, FILLED))
	);
	const [redraw] = await redrawn(await xfaToAcroForm(await pdf(rectangle(20, FILLED))));

	const { ink, fill } = differ(picture, redraw, buttons);
	expect(ink).toBeGreaterThan(0);
	expect(fill).toBeGreaterThan(0);
}, 120_000);
