// Stub for `sharp`. @huggingface/transformers imports it eagerly, but
// ContextShifter only embeds text, so the image path is never exercised.
function sharp() {
  throw new Error('sharp stub: image processing is not available in ContextShifter');
}
module.exports = sharp;
module.exports.default = sharp;
