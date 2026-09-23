/** Nothing the wizard prints is allowed to grow without a bound. */
export const MAX_CONSENT_LINES = 80;
export const MAX_CONSENT_LINKS = 6;
export const MAX_AGREEMENT_CHARS = 2000;

/** Keys one consent drive may send before it gives up and hands over. */
export const MAX_CONSENT_KEYS = 12;
export const MAX_CONSENT_TOGGLES = 2;
/** Identical screens seen after acting before the keypress is judged a no-op. */
export const MAX_STALE_SIGHTINGS = 6;
