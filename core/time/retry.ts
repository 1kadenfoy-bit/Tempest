// Asking again after a refusal or an error (Data rule 1): soon at first, then
// less and less often, and not at all after a few tries. The app then says
// so on screen and asks again only when something changes (the pin moves,
// another layer, a new run, the app comes back to the screen, the connection
// returns). Before Nov 27 a dropped pin's forecast was asked every minute for
// as long as the service refused.

/** Waits between tries: 3, 6, 12, 24, 48 and 96 s (about 3 minutes in all), then none. */
export const RETRY_FIRST_MS = 3_000;
export const RETRY_TRIES = 6;

/** How long to wait before try number `tries` (0 = the first retry); null once the tries are used up. */
export function retryDelay(tries: number): number | null {
  return tries < RETRY_TRIES ? RETRY_FIRST_MS * 2 ** tries : null;
}
