export const stillMs = 1000;
export const breathMs = 2400;

/**
 * Where a placeholder that mounts at `now` joins the shared wave: the wave's start (a new
 * wave begins when none is breathing and none has been for more than `stillMs`) and the
 * animation delay that puts the placeholder in step with it.
 */
export function joinWave(now: number, breathing: number, emptiedAt: number, waveStart: number): { start: number; delay: string } {
  const start = breathing === 0 && now - emptiedAt > stillMs ? now : waveStart;
  const elapsed = now - start;
  return { start, delay: `${elapsed < stillMs ? stillMs - elapsed : -((elapsed - stillMs) % breathMs)}ms` };
}
