/**
 * What onboarding asks the garage to do on arrival: open with its door, and carry
 * the paywall it no longer shows itself.
 *
 * Neither can happen where the tap happens. The door has to roll up over the
 * *garage*, and the offer has to arrive once the player is standing in it — but
 * the screen that decided both is gone by the time the garage mounts. A route
 * param would have to be read by the tabs layout anyway, since that is what owns
 * the door (it covers the dock too) and what outlives every tab change, so the
 * request travels as two module flags instead: armed on the way out of
 * onboarding, consumed once on mount, impossible to play twice.
 *
 * Deliberately *not* persisted. An app killed on the way through should reopen as
 * a normal garage — a door animation restored from disk days later would be a
 * mystery, and a paywall ambushing a cold start is worse.
 */
let doorArmed = false;
let paywallArmed = false;

/** Ask the garage to open with the door, once. */
export function armGarageDoor(): void {
  doorArmed = true;
}

/** True at most once per arming; false forever after. */
export function consumeGarageDoor(): boolean {
  const wanted = doorArmed;
  doorArmed = false;
  return wanted;
}

/** Ask the garage to raise the paywall shortly after the door opens, once. */
export function armWelcomePaywall(): void {
  paywallArmed = true;
}

/** True at most once per arming; false forever after. */
export function consumeWelcomePaywall(): boolean {
  const wanted = paywallArmed;
  paywallArmed = false;
  return wanted;
}

/**
 * How long the player gets the garage to themselves before the offer arrives.
 *
 * The paywall used to sit *between* onboarding and the garage, which made
 * dismissing a price list the last thing a player did with their brand-new
 * sticker, and the first thing they did with the app. Counted from the moment the
 * door finishes opening rather than from arrival — the door owns the first second
 * and a half, and five seconds spent behind it is not five seconds of garage.
 */
export const WELCOME_PAYWALL_DELAY = 5000;
