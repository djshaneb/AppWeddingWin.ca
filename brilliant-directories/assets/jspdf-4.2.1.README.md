# jsPDF 4.2.1 (pinned browser dependency)

`jspdf-4.2.1.umd.min.js` is the unmodified browser UMD distribution from the
official `jspdf@4.2.1` npm package. Its upstream license notices remain intact;
the package's MIT license is also included as `jspdf-4.2.1.LICENSE`.

- Official release: https://github.com/parallax/jsPDF/releases/tag/v4.2.1
- Official API documentation: https://parallax.github.io/jsPDF/docs/jsPDF.html
- Package: https://www.npmjs.com/package/jspdf/v/4.2.1
- npm tarball SHA-1: `6ba0d263999313f91f369ee80ecf235046b2acd8`
- npm integrity: `sha512-YyAXyvnmjTbR4bHQRLzex3CuINCDlQnBqoSYyjJwTP2x9jDLuKDzy7aKUl0hgx3uhcl7xzg32agn5vlie6HIlQ==`
- UMD file SHA-256: `e6551fcdc32f09d6853b2c5126d18d01d9447e0da618a41a11ebeee0f6c20d54`

The widget builder embeds this local asset before `ww-vendor-qr-pdf.js`.
The generator uses only vector rectangles, locally rendered PNG labels, and
byte output; it never calls the optional HTML, external image, or URL-fetch
APIs. No PDF-generation service, CDN, or uploaded vendor data is involved.
The upstream source-map reference is retained, but the development map is not
bundled into the production widget.
