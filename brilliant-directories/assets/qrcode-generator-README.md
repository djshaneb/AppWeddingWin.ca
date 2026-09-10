# QR encoder

`qrcode-generator-1.4.4.js` is the unmodified `qrcode.js` distributed in
`qrcode-generator@1.4.4`, by Kazuhiko Arase, under the MIT license.

Upstream: https://github.com/kazuhikoarase/qrcode-generator

This pinned, self-hosted copy creates the Vendor Bingo directory's QR images
in the browser. Vendor URLs are never sent to an external QR-image service.
Publish the source followed by `widgets/ww-vendor-bingo-qr-codes.js` together
inside the new widget's `widget_javascript` script wrapper; do not put scripts
inside `widget_data` (Brilliant Directories strips backslashes in that field).
Keep the license with the source and its copyright header when bundling.
