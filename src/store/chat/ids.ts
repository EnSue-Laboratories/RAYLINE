let msgCounter = 0;

/** Process-unique message / part id (`m<n>-<ts>`), same scheme as before the store split. */
export function uid(): string {
  msgCounter += 1;
  return `m${msgCounter}-${Date.now()}`;
}
