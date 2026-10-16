// DOM HUD: course label, APPETITE / FRESH pips, one cue line, the floating stick, the throw
// button, and the paper-slip cards (title, menu slip, bill, itadakimasu).

import type { Game, Stage } from '../game';
import { LAST_AUTHORED } from '../sim/courses';
import type { Input } from '../input';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return m > 0 ? `${m}:${r.toFixed(1).padStart(4, '0')}` : `${r.toFixed(1)} s`;
}

export class Hud {
  private course = $('#course');
  private appetite = $('#appetite');
  private fresh = $('#fresh');
  private cue = $('#cue');
  private stick = $('#stick');
  private shot = $('#shot');
  private knob = this.stick.firstElementChild as HTMLElement;
  private card = $('#card');
  private cardKicker = $('#card-kicker');
  private cardTitle = $('#card-title');
  private cardBody = $('#card-body');
  private cardBill = $('#card-bill') as HTMLTableElement;
  private cardStamp = $('#card-stamp');
  private cardFoot = $('#card-foot');
  readonly throwBtn = $<HTMLButtonElement>('#throw');
  readonly restart = $<HTMLButtonElement>('#restart');
  readonly mute = $<HTMLButtonElement>('#mute');
  private lastKey = '';
  private cueText = '';
  private cueClass = '';
  private cueT = 0;

  showStage(game: Game, s: Stage) {
    const cfg = game.cfg;
    const set = (kind: string, kicker: string, title: string, body: string[], foot: string, bill: [string, string][] = [], stamp = '') => {
      this.card.dataset.kind = kind;
      this.cardKicker.textContent = kicker;
      this.cardTitle.textContent = title;
      this.cardBody.replaceChildren(...body.map((t) => Object.assign(document.createElement('p'), { textContent: t })));
      this.cardBill.replaceChildren(
        ...bill.map(([a, b]) => {
          const tr = document.createElement('tr');
          tr.append(Object.assign(document.createElement('td'), { textContent: a }), Object.assign(document.createElement('td'), { textContent: b }));
          return tr;
        }),
      );
      this.cardStamp.textContent = stamp;
      this.cardStamp.classList.toggle('show', !!stamp);
      this.cardFoot.textContent = foot;
      this.card.classList.remove('on');
      void this.card.offsetWidth; // restart the slip's entrance
      this.card.classList.add('on');
    };
    const w = game.world;
    if (s === 'title') {
      const r = Math.min(game.progress.reached, LAST_AUTHORED + 20);
      set('title', 'nigiri vs chopsticks', 'The Last Piece', ['One piece left on the plate. You.'], r > 1 ? `Tap to continue · course ${r}` : 'Tap to start');
    } else if (s === 'brief') set('brief', cfg.kicker, cfg.title, cfg.brief, 'Tap to begin');
    else if (s === 'cleared') {
      const st = w.stats;
      const last = game.course === LAST_AUTHORED;
      set(
        'cleared',
        cfg.kicker,
        'Check, please',
        [last ? 'He paid and went home. You are still on the plate.' : `${cfg.diner.name} gives up.`],
        last ? 'Tap for seconds' : 'Tap for the next course',
        [
          ['Time at the table', fmtTime(st.time)],
          ['Freshness', `${w.hp} / ${cfg.freshness}`],
          ['Wasabi thrown', `${st.throws}`],
          ['In the eye', `${st.hits}`],
        ],
        'ご馳走様',
      );
    } else if (s === 'failed') {
      set(
        'failed',
        cfg.kicker,
        'Itadakimasu',
        [w.hits > 0 ? `${w.hits} of ${cfg.hitsToWin} in the eye. Not enough.` : 'He never even blinked.'],
        'Tap to try again',
        [],
        '頂きます',
      );
    } else this.card.classList.remove('on');
    document.body.dataset.stage = s;
    this.lastKey = '';
    this.cueT = 0;
  }

  /** A one-line cue; `ttl` seconds, or until replaced. */
  say(text: string, cls = '', ttl = 1.6) {
    this.cueText = text;
    this.cueClass = cls;
    this.cueT = ttl;
  }

  /** Brackets around the sushi while you hold wasabi: green = the shot is on, otherwise why not. */
  updateShot(game: Game, outcome: 'hit' | 'clip' | 'wide' | null, rect: { x0: number; y0: number; x1: number; y1: number } | null, side: number) {
    const el = this.shot;
    const show = game.stage === 'play' && outcome !== null && rect !== null;
    el.classList.toggle('show', show);
    if (!show || !rect) return;
    const pad = 6;
    const x = rect.x0 - pad;
    const y = rect.y0 - pad;
    el.style.width = `${rect.x1 - rect.x0 + pad * 2}px`;
    el.style.height = `${rect.y1 - rect.y0 + pad * 2}px`;
    const tf = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    el.style.setProperty('--tf', tf);
    el.style.transform = tf;
    el.classList.toggle('on', outcome === 'hit');
    el.classList.toggle('blocked', outcome === 'clip');
    el.classList.toggle('wide', outcome === 'wide');
    el.classList.toggle('left', side < 0);
    el.classList.toggle('right', side > 0);
  }

  update(game: Game, input: Input, dt: number, shotOn: boolean) {
    const w = game.world;
    const cfg = game.cfg;
    const key = `${game.course}|${w.hits}|${w.hp}|${game.stage}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.course.innerHTML = '';
      this.course.append(cfg.kicker, Object.assign(document.createElement('b'), { textContent: cfg.title }));
      const pips = (el: HTMLElement, n: number, f: (i: number) => string) => {
        el.replaceChildren(...Array.from({ length: n }, (_, i) => Object.assign(document.createElement('i'), { className: f(i) })));
      };
      pips(this.appetite, cfg.hitsToWin, (i) => (i < w.hits ? 'hit' : ''));
      pips(this.fresh, cfg.freshness, (i) => (i < w.hp ? '' : 'off'));
    }
    // cue line
    this.cueT -= dt;
    const on = this.cueT > 0 && game.stage === 'play';
    if (this.cue.textContent !== this.cueText) this.cue.textContent = this.cueText;
    this.cue.className = `cue${on ? ' on' : ''}${this.cueClass ? ' ' + this.cueClass : ''}`;
    // stick
    const s = input.stick;
    this.stick.classList.toggle('on', s.on && game.stage === 'play');
    if (s.on) {
      this.stick.style.transform = `translate(${s.ox}px, ${s.oy}px)`;
      this.knob.style.transform = `translate(${s.x - s.ox}px, ${s.y - s.oy}px)`;
    }
    // throw button: armed when you hold wasabi, lit when the shot is on
    this.throwBtn.classList.toggle('armed', w.carry);
    this.throwBtn.classList.toggle('on', w.carry && shotOn);
  }

  setMuted(m: boolean) {
    this.mute.setAttribute('aria-pressed', String(m));
    this.mute.textContent = m ? 'Sound' : 'Sound';
  }
}
