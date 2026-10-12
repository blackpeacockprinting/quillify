import { afterEach, expect, it, vi } from 'vitest';
import { displayList } from './display-list.js';
import { harvestWidgets } from './xfa-widgets.js';

let frame: HTMLIFrameElement | undefined;

afterEach(() => {
	vi.restoreAllMocks();
	frame?.remove();
});

it("reads a page laid out in another document through that document, and never the host's", async () => {
	frame = document.createElement('iframe');
	frame.srcdoc = `<!doctype html><div style="position:relative;width:612px;height:792px"><div class="xfaLayer"><div class="xfaField" xfaname="rank"><span>Notional</span><input style="position:absolute;left:20px;top:30px;width:100px;height:20px"></div></div></div>`;
	const loaded = new Promise((resolve) => (frame!.onload = resolve));
	document.body.append(frame);
	await loaded;
	const owner = frame.contentDocument!;
	const wrapper = owner.body.firstElementChild!;
	const page = {
		layer: wrapper.firstElementChild as HTMLElement,
		origin: wrapper.getBoundingClientRect(),
		width: 612,
		height: 792
	};

	const canvas = vi.spyOn(document, 'createElement');
	const range = vi.spyOn(document, 'createRange');
	const walker = vi.spyOn(document, 'createTreeWalker');
	const style = vi.spyOn(window, 'getComputedStyle');

	const list = displayList(page, 1);
	const displayStyle = style.mock.calls.length;
	const widgets = harvestWidgets(page, 1);

	expect(list.drawn).toMatchObject([{ text: 'Notional' }]);
	expect(widgets).toMatchObject([{ name: 'p1.rank', x: 20, y: 30 }]);
	expect({
		canvas: canvas.mock.calls.length,
		range: range.mock.calls.length,
		walker: walker.mock.calls.length,
		displayStyle,
		widgetStyle: style.mock.calls.length - displayStyle
	}).toEqual({ canvas: 0, range: 0, walker: 0, displayStyle: 0, widgetStyle: 0 });
});
