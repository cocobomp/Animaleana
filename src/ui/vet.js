// Mini-jeu du vétérinaire : examen, température, soin.

import { h } from './dom.js';
import { t } from '../i18n.js';
import { SPECIES } from '../sim/species.js';
import { ILLNESSES } from '../sim/animal.js';
import { canAfford } from '../sim/profile.js';

const ZONES = ['head', 'ears', 'back', 'belly', 'legs', 'tail'];
const TREATMENTS = ['drops', 'bandage', 'syrup', 'shampoo', 'injection'];
const TREAT_EMOJI = { drops: '💧', bandage: '🩹', syrup: '💊', shampoo: '🧴', injection: '💉' };
const ZONE_EMOJI = { head: '🧠', ears: '👂', back: '🔙', belly: '🫃', legs: '🦵', tail: '〰️' };
const NORMAL = { min: 37.8, max: 39.4 };

export function openVet(ui, a, atClinic) {
  const g = ui.game;
  const cost = g.vetCost(atClinic);
  if (!canAfford(g.profile, cost)) {
    ui.toast(t('r_money'));
    return;
  }
  const ill = a.sick ? ILLNESSES[a.sick] : null;
  const state = { step: 1, found: false, checked: new Set(), wrong: new Set(), msg: '', temp: null, raf: 0, done: false };

  const stopGauge = () => cancelAnimationFrame(state.raf);

  const render = () => {
    const out = [];
    out.push(h('p', { class: 'vet-who' }, `${SPECIES[a.species].emoji} ${a.name}`, !atClinic ? h('small', {}, ` — ${t('vetHome', { n: cost })}`) : null));
    if (state.done) {
      out.push(
        h('div', { class: 'vet-done' }, '💚'),
        h('p', { class: 'big-text' }, t(ill ? 'vetCured' : 'vetCheckupDone', { name: a.name, g: a.sex })),
        ill ? h('p', { class: 'note' }, t('diagnosis', { ill: t(`ill_${Object.keys(ILLNESSES).find((k) => ILLNESSES[k] === ill)}`) })) : null,
        h('button', { class: 'primary big', onClick: () => ui.closePanel() }, t('close')),
      );
      return out;
    }

    if (state.step === 1) {
      out.push(h('h3', {}, ill ? t('vetExam') : t('vetExamCheckup')));
      if (ill) out.push(h('p', { class: 'hint' }, t('vetHint', { hint: t(`hint_${a.sick}`, { g: a.sex }) })));
      out.push(h('div', { class: 'grid zones' }, ZONES.map((z) => {
        const ok = state.checked.has(z);
        const wrong = state.wrong.has(z);
        return h('button', {
          class: `act zone ${ok ? 'done' : ''} ${wrong ? 'wrong' : ''} ${state.found && ill?.zone === z ? 'found' : ''}`,
          onClick: () => {
            if (ill) {
              if (z === ill.zone) {
                state.found = true;
                state.msg = t('vetFound');
              } else {
                state.wrong.add(z);
                state.msg = t('vetNotHere');
              }
            } else {
              state.checked.add(z);
              state.msg = t('vetOk');
            }
            ui.renderPanel();
          },
        }, `${ZONE_EMOJI[z]} ${t(`zone_${z}`)}`);
      })));
      if (state.msg) out.push(h('p', { class: 'vet-msg' }, state.msg));
      const ready = ill ? state.found : state.checked.size === ZONES.length;
      out.push(h('button', { class: 'primary big', disabled: !ready, onClick: () => { state.step = 2; state.msg = ''; ui.renderPanel(); startGauge(); } }, '➡️'));
      return out;
    }

    if (state.step === 2) {
      out.push(h('h3', {}, t('vetTemp')));
      const gauge = h('div', { class: 'gauge' },
        h('div', { class: 'gauge-green', style: { left: `${pct(NORMAL.min)}%`, width: `${pct(NORMAL.max) - pct(NORMAL.min)}%` } }),
        h('div', { class: 'gauge-cursor', id: 'gauge-cursor' }));
      out.push(gauge, h('div', { class: 'gauge-scale' }, h('span', {}, '36 °C'), h('span', {}, '42 °C')));
      if (state.msg) out.push(h('p', { class: 'vet-msg' }, state.msg));
      if (state.temp === null) {
        out.push(h('button', { class: 'primary big', onClick: () => stopAt() }, `🌡️ ${t('vetStop')}`));
      } else {
        out.push(h('button', { class: 'primary big', onClick: () => { state.step = 3; state.msg = ''; ui.renderPanel(); } }, '➡️'));
      }
      return out;
    }

    // Étape 3 : le bon soin
    if (ill) {
      out.push(h('h3', {}, t('vetTreat')), h('div', { class: 'grid' }, TREATMENTS.map((x) => h('button', {
        class: 'act',
        onClick: () => {
          if (x === ill.treatment) finish();
          else {
            state.msg = t('vetWrong');
            ui.renderPanel();
          }
        },
      }, `${TREAT_EMOJI[x]} ${t(`treat_${x}`)}`))));
    } else {
      out.push(h('h3', {}, t('vetVaccine')), h('button', { class: 'primary big', onClick: () => finish() }, `💉 ${t('treat_injection')}`));
    }
    if (state.msg) out.push(h('p', { class: 'vet-msg' }, state.msg));
    return out;
  };

  const pct = (temp) => ((temp - 36) / 6) * 100;
  let cursorTemp = 36;
  let dir = 1;
  function startGauge() {
    state.temp = null;
    let last = performance.now();
    const loop = (now) => {
      const dt = (now - last) / 1000;
      last = now;
      cursorTemp += dir * dt * 2;
      if (cursorTemp > 42) { cursorTemp = 42; dir = -1; }
      if (cursorTemp < 36) { cursorTemp = 36; dir = 1; }
      const el = document.getElementById('gauge-cursor');
      if (!el) return;
      el.style.left = `${pct(cursorTemp)}%`;
      state.raf = requestAnimationFrame(loop);
    };
    state.raf = requestAnimationFrame(loop);
  }
  function stopAt() {
    const inZone = cursorTemp >= NORMAL.min && cursorTemp <= NORMAL.max;
    if (inZone) {
      stopGauge();
      const real = ill?.fever ? 40.1 : 38.6;
      state.temp = real;
      state.msg = t('vetTempGood', { t: real.toFixed(1) });
      ui.renderPanel();
      const el = document.getElementById('gauge-cursor');
      if (el) el.style.left = `${pct(real)}%`;
    } else {
      state.msg = t('vetTempBad', { t: cursorTemp.toFixed(1) });
      const msgEl = document.querySelector('#panel .vet-msg');
      // La jauge continue de bouger : elle retrouve son curseur même si le panneau est redessiné.
      if (msgEl) msgEl.textContent = state.msg;
      else ui.renderPanel();
    }
  }
  function finish() {
    state.done = true;
    g.vetDone(a, atClinic);
    ui.renderPanel();
  }

  ui.openPanel({ title: `🩺 ${t('vetTitle')}`, render, animalId: a.id, kind: 'vet' });
}
