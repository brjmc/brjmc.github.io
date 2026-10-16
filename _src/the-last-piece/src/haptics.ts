// navigator.vibrate where it exists; silently nothing where it doesn't (iOS Safari, desktop).

import type { SimEvent } from './sim/world';

const can = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

function buzz(p: number | number[]) {
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
      case 'pickup':
        buzz(8);
        break;
      case 'throw':
        buzz(10);
        break;
      case 'hit':
        buzz([18, 40, 26]);
        break;
      case 'stab':
        if (!e.hit && e.near < 1.5) buzz(6);
        break;
      case 'hurt':
        buzz([60, 30, 90]);
        break;
      case 'won':
        buzz([20, 60, 20, 60, 40]);
        break;
      case 'eaten':
        buzz([40, 600, 220]);
        break;
    }
  }
}
