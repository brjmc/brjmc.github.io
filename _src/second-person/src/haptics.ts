// navigator.vibrate where it exists; silently nothing where it doesn't (iOS Safari, desktop).

import type { SimEvent } from './sim/world';

const can = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

function buzz(p: number | number[]) {
  if (!can) return;
  try {
    navigator.vibrate(p);
  } catch {
    /* some browsers throw without a recent user gesture */
  }
}

export function haptics(events: SimEvent[], muted: boolean) {
  if (!can || muted) return;
  for (const e of events) {
    switch (e.t) {
      case 'bump':
        if (e.tier === 0) buzz(18);
        else if (e.tier === 1) buzz(8);
        break;
      case 'dash':
        buzz(14);
        break;
      case 'nearMiss':
        buzz([10, 40, 10]);
        break;
      case 'death':
        buzz(e.cause === 'car' ? [70, 40, 140] : [220]);
        break;
      case 'cleared':
        buzz([12, 80, 12]);
        break;
    }
  }
}
