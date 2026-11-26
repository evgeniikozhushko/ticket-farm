/** @param {string | undefined} uri */
export function isLocalTestUri(uri) {
  return typeof uri === "string" && /^mongodb:\/\/(?:127\.0\.0\.1|localhost):\d+(?:[/?]|$)/.test(uri);
}
