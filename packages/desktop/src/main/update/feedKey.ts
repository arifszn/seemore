/**
 * The public half of the Ed25519 key that signs `latest-mac.json` (DESKTOP-SPEC §10.3, §14.3).
 * The private half is the `DESKTOP_UPDATE_KEY` secret, used only by `scripts/sign-feed.mjs` in
 * the release job. Replacing this key strands every macOS install built with the old one:
 * they can verify no further update and must reinstall by hand.
 */
export const FEED_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAflY6GKej2R2bcUqyuKCYbHpWI1y/cSELYr3ygOhyLwg=
-----END PUBLIC KEY-----
`;
