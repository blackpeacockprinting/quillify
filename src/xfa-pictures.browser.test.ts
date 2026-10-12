/** What a dynamic form's pictures may come to, and what a picture that cannot be read does. */

import { expect, it } from 'vitest';
import { dynamicForm, templateForm } from '../test/dynamic-form.js';
import { sanitize } from './index.js';

const picture = (base64: string, y = 20) =>
	`<draw x="20pt" y="${y}pt" w="40pt" h="10pt"><value><image contentType="image/png">${base64}</image></value></draw>`;
const FIELD = '<field name="a" x="20pt" y="60pt" w="200pt" h="20pt"><ui><textEdit/></ui></field>';

/** A dynamic form with a field and two pictures of `width` by `height` clear pixels. */
function twoPictures(width: number, height: number): Promise<Uint8Array> {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const base64 = canvas.toDataURL('image/png').slice('data:image/png;base64,'.length);
	return dynamicForm(picture(base64) + picture(base64, 30) + FIELD);
}

/**
 * A dynamic form of 8 pages that prints one picture on every page: 1,000 by
 * 1,000 pixels of noise, in color and in alpha, which nothing deflates. A
 * picture costs the redraw no more than this, four bytes a pixel.
 */
function noisyPages(): Promise<Uint8Array> {
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = 1000;
	const context = canvas.getContext('2d')!;
	const data = context.createImageData(1000, 1000);
	const pixels = new Uint32Array(data.data.buffer);
	let seed = 1;
	for (let at = 0; at < pixels.length; at++) {
		seed ^= seed << 13;
		seed ^= seed >>> 17;
		seed ^= seed << 5;
		pixels[at] = seed;
	}
	context.putImageData(data, 0, 0);
	const base64 = canvas.toDataURL('image/png').slice('data:image/png;base64,'.length);
	return templateForm(
		`<template xmlns="http://www.xfa.org/schema/xfa-template/3.3/"><subform name="form1" layout="tb"><pageSet><pageArea name="Page1"><contentArea w="612pt" h="792pt"/><medium short="612pt" long="792pt"/>${picture(base64)}</pageArea></pageSet>${`<subform layout="position" w="612pt" h="792pt">${FIELD}</subform>`.repeat(8)}</subform></template>`
	);
}

/**
 * A PNG one row high, of `width` black pixels at a bit each, in base64. It is
 * written out here because no canvas is as wide as the one this is for.
 */
async function wide(width: number): Promise<string> {
	const chunk = (type: string, data: Uint8Array): Uint8Array => {
		const out = new Uint8Array(12 + data.length);
		const view = new DataView(out.buffer);
		view.setUint32(0, data.length);
		out.set(new TextEncoder().encode(type), 4);
		out.set(data, 8);
		let crc = ~0;
		for (const byte of out.subarray(4, 8 + data.length)) {
			crc ^= byte;
			for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
		}
		view.setUint32(8 + data.length, ~crc);
		return out;
	};
	const header = new Uint8Array(13);
	new DataView(header.buffer).setUint32(0, width);
	header.set([0, 0, 0, 1, 1], 4);
	const row = new Blob([new Uint8Array(1 + Math.ceil(width / 8))]);
	const deflated = await new Response(
		row.stream().pipeThrough(new CompressionStream('deflate'))
	).bytes();
	let binary = '';
	for (const part of [
		[137, 80, 78, 71, 13, 10, 26, 10],
		chunk('IHDR', header),
		chunk('IDAT', deflated),
		chunk('IEND', new Uint8Array())
	])
		for (const byte of part) binary += String.fromCharCode(byte);
	return btoa(binary);
}

it('takes a dynamic form whose pictures come to 8,000,000 pixels', async () => {
	expect(await sanitize(await twoPictures(4000, 1000))).toMatchObject({
		ok: true,
		form: { fields: { length: 1 } }
	});
}, 120_000);

it('refuses a dynamic form whose pictures come to more than 8,000,000 pixels', async () => {
	expect(await sanitize(await twoPictures(4000, 1001))).toEqual({
		ok: false,
		refusal: { code: 'unpaintable', page: 0, construct: 'image', detail: 'pixels' }
	});
}, 120_000);

it('gives 8,000,000 pixels of noise a background of four bytes a pixel', async () => {
	const file = await noisyPages();
	expect(file.length).toBeLessThan(5_000_000);
	const sanitized = await sanitize(file);
	if (!sanitized.ok) throw new Error(`refused as ${sanitized.refusal.code}`);
	expect(sanitized.form.pages).toHaveLength(8);
	expect(sanitized.form.pdf.length / 8_000_000).toBeCloseTo(4, 1);
}, 120_000);

it.each([
	['the browser does not load', async () => btoa('no picture')],
	['is wider than a canvas can be', () => wide(70_000)]
])(
	'refuses a dynamic form with a picture that %s',
	async (_, base64) => {
		expect(await sanitize(await dynamicForm(picture(await base64()) + FIELD))).toEqual({
			ok: false,
			refusal: { code: 'unpaintable', page: 0, construct: 'image' }
		});
	},
	120_000
);
