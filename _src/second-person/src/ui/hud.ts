// DOM HUD: progress bar, one status cue, briefing/cleared/failed cards, restart and mute.

import type { Game, Stage } from '../game';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

export class Hud {
  private bar = $('#bar');
  private you = $('#bar-you');
  private it = $('#bar-it');
  private metres = $('#metres');
  private cue = $('#cue');
  private card = $('#card');
  private cardKicker = $('#card-kicker');
  private cardTitle = $('#card-title');
  private cardBody = $('#card-body');
  private cardFoot = $('#card-foot');
  readonly restart = $<HTMLButtonElement>('#restart');
  readonly mute = $<HTMLButtonElement>('#mute');
  private lastCue = '';
  private lastMetres = -1;

  showStage(game: Game, s: Stage) {
    const cfg = game.cfg;
    const set = (kind: string, kicker: string, title: string, body: string[], foot: string) => {
      this.card.dataset.kind = kind;
      this.cardKicker.textContent = kicker;
      this.cardTitle.textContent = title;
      this.cardBody.replaceChildren(...body.map((t) => Object.assign(document.createElement('p'), { textContent: t })));
      this.cardFoot.textContent = foot;
      this.card.classList.add('on');
    };
    const num = String(cfg.n).padStart(2, '0');
    if (s === 'brief') set('brief', `${num} · ${cfg.length} m`, cfg.title, cfg.brief, 'Touch to begin');
    else if (s === 'cleared') set('cleared', num, 'Through', ['It is still walking.'], 'Touch to go on');
    else if (s === 'failed') {
      const caught = game.world.deathCause === 'caught';
      set('failed', num, caught ? 'Caught' : 'Hit', [caught ? 'It reached you.' : 'The road did not slow you.'], 'Touch to try again');
    } else this.card.classList.remove('on');
    document.body.dataset.stage = s;
  }

  update(game: Game) {
    const w = game.world;
    const L = game.cfg.length;
    const clamp = (v: number) => Math.max(0, Math.min(1, v));
    this.you.style.setProperty('--p', clamp(w.distance / L).toFixed(4));
    const itP = -w.chaser.z / L;
    this.it.style.setProperty('--p', clamp(itP).toFixed(4));
    this.it.classList.toggle('behind', itP < 0);
    const m = Math.ceil(w.remaining);
    if (m !== this.lastMetres) {
      this.lastMetres = m;
      this.metres.textContent = `${m} m`;
    }
    let cue = '';
    if (game.stage === 'play') {
      if (w.chaserGap < w.tune.itIsOnYouDist) cue = 'it is on you';
      else if (w.player.cooldown > 0) cue = 'shove recharging';
    }
    if (cue !== this.lastCue) {
      this.lastCue = cue;
      this.cue.textContent = cue;
      this.cue.classList.toggle('on', cue !== '');
      this.cue.classList.toggle('danger', cue === 'it is on you');
    }
    this.bar.classList.toggle('near-end', w.remaining < w.tune.finishGlowDist);
  }

  setMuted(m: boolean) {
    this.mute.setAttribute('aria-pressed', String(m));
    this.mute.textContent = m ? 'Sound off' : 'Sound on';
  }
}
