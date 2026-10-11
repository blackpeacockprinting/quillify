import { expect, it } from 'vitest';
import { dynamicFlow } from '../test/dynamic-form.js';
import { sanitize } from './index.js';
import { MAX_PAGES } from './types.js';

/** A dynamic form of `count` pages, each a subform as tall as the page with one field on it. */
const paged = (count: number) =>
	dynamicFlow(
		'<subform layout="position" w="612pt" h="792pt"><field name="a" x="20pt" y="20pt" w="200pt" h="20pt"><ui><textEdit/></ui></field></subform>'.repeat(
			count
		)
	);

/**
 * What `sanitize` returns for a file, and how many pages the stage laid out on
 * the way: the wrappers its frame's document was given, each around a layer.
 */
async function watched(pdf: Uint8Array) {
	let laid = 0;
	const count = (records: MutationRecord[]) => {
		for (const { addedNodes } of records)
			for (const node of addedNodes)
				if ((node as Element).firstElementChild?.classList.contains('xfaLayer')) laid++;
	};
	const pages = new MutationObserver(count);
	const frames = new MutationObserver((records) => {
		for (const { addedNodes } of records)
			for (const node of addedNodes)
				if (node instanceof HTMLIFrameElement)
					node.addEventListener('load', () =>
						pages.observe(node.contentDocument!.body, { childList: true })
					);
	});
	frames.observe(document.body, { childList: true });
	try {
		const read = await sanitize(pdf);
		count(pages.takeRecords());
		return { read, laid };
	} finally {
		frames.disconnect();
		pages.disconnect();
	}
}

it('lays out every page of a dynamic form at the page cap', async () => {
	const { read, laid } = await watched(await paged(MAX_PAGES));
	expect(read).toMatchObject({ ok: true, form: { pages: { length: MAX_PAGES } } });
	expect(laid).toBe(MAX_PAGES);
}, 120_000);

it('refuses a dynamic form over the page cap before the stage lays out a page', async () => {
	const { read, laid } = await watched(await paged(MAX_PAGES + 1));
	expect(read).toEqual({
		ok: false,
		refusal: { code: 'too_many_pages', pages: MAX_PAGES + 1, limit: MAX_PAGES }
	});
	expect(laid).toBe(0);
}, 120_000);
