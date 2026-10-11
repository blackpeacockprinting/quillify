/** Why a PDF is not taken. A `page` is zero-based, as a `Place`'s is. */
export type Refusal =
	| { code: 'too_large'; bytes: number; limit: number }
	| { code: 'not_pdf' }
	| { code: 'password' }
	| { code: 'encryption' }
	| { code: 'damaged' }
	| { code: 'rotated'; page: number }
	| { code: 'portfolio'; attachment?: string }
	| { code: 'no_fields'; xfa: boolean }
	| { code: 'too_many_pages'; pages: number; limit: number }
	| { code: 'too_many_fields'; fields: number; limit: number }
	| { code: 'layout'; detail: string }
	| {
			code: 'unpaintable';
			page: number;
			construct: 'image' | 'background_image' | 'svg' | 'border' | 'transform' | 'glyph';
			detail?: string;
	  };

/** Thrown where a stage declines a PDF. */
export class Refused extends Error {
	readonly refusal: Refusal;
	constructor(refusal: Refusal) {
		super(refusal.code);
		this.refusal = refusal;
	}
}
