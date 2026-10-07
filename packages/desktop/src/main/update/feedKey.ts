/**
 * The public half of the Ed25519 key that signs `latest-mac.json` (DESKTOP-SPEC §10.3, §14.3).
 * The private half is the `DESKTOP_UPDATE_KEY` secret. Empty until the key pair is made
 * (P10); until then every macOS check fails with "This build has no update key".
 */
export const FEED_PUBLIC_KEY = '';
