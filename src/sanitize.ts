import { inventoryPdf } from './inventory.js';
import { normalizePdf } from './normalize.js';
import { Refused, type Refusal } from './refusal.js';
import { stripAcroForm } from './strip.js';
import { xfaToAcroForm } from './xfa.js';
import type { Field, Form } from './api.js';
import type { InventoryWidget } from './types.js';

export type Sanitized = { ok: true; form: Form } | { ok: false; refusal: Refusal };

function field(widget: InventoryWidget): Field {
	const [place, ...more] = widget.places;
	const { id, required, readOnly, tooltip } = widget;
	const common = {
		id,
		places: [place, ...more] as const,
		...(tooltip === undefined ? {} : { tooltip }),
		required,
		readOnly
	};
	switch (widget.kind) {
		case 'Tx':
			return {
				...common,
				kind: 'text',
				multiline: widget.multiLine,
				...(widget.maxLen > 0 ? { maxLength: widget.maxLen } : {})
			};
		case 'Btn':
			// The inventory keeps no push button, so a button that is no radio is a checkbox.
			if (!widget.radioButton) return { ...common, kind: 'checkbox' };
			return {
				...common,
				kind: 'radio',
				group: widget.name,
				...(widget.buttonValue === undefined ? {} : { on: widget.buttonValue })
			};
		case 'Ch':
			return { ...common, kind: 'choice', options: widget.options };
		case 'Sig':
			return { ...common, kind: 'signature' };
	}
}

/**
 * A PDF form as its fields and a background with no form layer, or the reason
 * the file is not taken. Nothing else in the package reads the file.
 */
export async function sanitize(pdf: Uint8Array): Promise<Sanitized> {
	// Handing it anything but a Uint8Array is a mistake in the call and no fault of a file, so the call throws.
	// The tag, not instanceof, so that a Uint8Array made in another window is taken.
	if (Object.prototype.toString.call(pdf) !== '[object Uint8Array]')
		throw new TypeError('sanitize takes a Uint8Array.');
	try {
		const bytes = await xfaToAcroForm(await normalizePdf(pdf));
		const { pages, widgets } = await inventoryPdf(bytes);
		return {
			ok: true,
			form: { pdf: await stripAcroForm(bytes), pages, fields: widgets.map(field) }
		};
	} catch (err) {
		if (err instanceof Refused) return { ok: false, refusal: err.refusal };
		throw err;
	}
}
