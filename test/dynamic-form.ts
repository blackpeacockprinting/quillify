import { PDFBool, PDFDocument, PDFName, PDFString } from 'pdf-lib';

/** A one-page dynamic form whose page holds `body`, placed in points from its top left. */
export async function dynamicForm(body: string): Promise<Uint8Array> {
	const doc = await PDFDocument.create();
	doc.addPage([612, 792]);
	const packet = (xml: string) =>
		doc.context.register(doc.context.flateStream(new TextEncoder().encode(xml)));
	doc.catalog.set(
		PDFName.of('AcroForm'),
		doc.context.obj({
			Fields: [],
			XFA: [
				PDFString.of('preamble'),
				packet('<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/">'),
				PDFString.of('template'),
				packet(
					`<template xmlns="http://www.xfa.org/schema/xfa-template/3.3/"><subform name="form1" layout="tb"><pageSet><pageArea name="Page1"><contentArea w="612pt" h="792pt"/><medium short="612pt" long="792pt"/></pageArea></pageSet><subform layout="position" w="612pt" h="792pt">${body}</subform></subform></template>`
				),
				PDFString.of('datasets'),
				packet(
					'<xfa:datasets xmlns:xfa="http://www.xfa.org/schema/xfa-data/1.0/"><xfa:data><form1/></xfa:data></xfa:datasets>'
				),
				PDFString.of('postamble'),
				packet('</xdp:xdp>')
			]
		})
	);
	doc.catalog.set(PDFName.of('NeedsRendering'), PDFBool.True);
	return doc.save();
}
