/**
 * A one-shot request for the garage screen to open with its door.
 *
 * Onboarding ends on "Entrer dans mon garage", and the door has to roll up over
 * the *garage*, not over the screen the player is leaving — so the animation
 * cannot live where the tap happens. The paywall sits between the two, which
 * rules out passing it as a route param without threading it through a screen
 * that has nothing to do with it.
 *
 * Hence a module flag: armed on the way out of onboarding, consumed by the
 * garage on mount, and impossible to play twice. Deliberately *not* persisted —
 * an app killed between the paywall and the garage should reopen as a normal
 * garage, and a door animation restored from disk days later would be a mystery.
 */
let armed = false;

/** Ask the garage to open with the door, once. */
export function armGarageDoor(): void {
  armed = true;
}

/** True at most once per arming; false forever after. */
export function consumeGarageDoor(): boolean {
  const wanted = armed;
  armed = false;
  return wanted;
}
