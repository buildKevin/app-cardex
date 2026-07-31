import { pullGarage, pushEntry } from './sync';
import { useGameStore } from '../store/useGameStore';

/**
 * Reconciles the device with the server after signing in.
 *
 * Pulls first so a reinstall gets its collection back, then pushes anything the
 * device holds that never made it up — entries scanned while signed out, or
 * whose push failed. Best-effort throughout: called on a background path, and
 * a failure only means the next sign-in tries again.
 */
export async function restoreGarage(userId: string): Promise<{ pulled: number; pushed: number }> {
  const store = useGameStore.getState();

  const remote = await pullGarage(userId);
  store.mergeRemote(remote);

  const unsynced = useGameStore.getState().garage.filter((entry) => !entry.remoteId);
  let pushed = 0;

  for (const entry of unsynced) {
    const result = await pushEntry(userId, entry);
    if (!result) continue;
    useGameStore.getState().markSynced(entry.id, result.remoteId, result.photoPath);
    pushed += 1;
  }

  return { pulled: remote.length, pushed };
}
