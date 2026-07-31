/** Small collision-resistant id — no uuid dependency needed for local rows. */
export function createId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
