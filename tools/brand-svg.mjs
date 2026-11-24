// Text assets can use CRLF locally and LF in CI. Encode a canonical SVG so
// embedded CSS masks remain identical across Git checkout configurations.
export const canonicalSvg = svg => svg.replace(/\r\n?/g, '\n').trim();
export const svgDataUri = svg => 'data:image/svg+xml;base64,' +
  Buffer.from(canonicalSvg(svg), 'utf8').toString('base64');
