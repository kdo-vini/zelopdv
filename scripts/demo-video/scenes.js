// Monta a timeline única do vídeo a partir de timeline.js (mesmos tempos da trilha).
// Primeiro mede o layout final (sheets abertos, tudo no lugar), depois aplica os
// estados iniciais e só então escreve os tweens; registra a timeline no fim, como
// pede o contrato do HyperFrames para construção assíncrona (o registro fica no index.html).
import { S, enter, exit, swap, press, pop, rise, count, type, text, liquid, tap, morph, sheetOpen, sheetClose, brl } from './motion.js';

const gsap = window.gsap;
const TL = window.TL;
const $ = (id) => document.getElementById(id);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const PHONE_SCALE = 1.72;
const int = (v) => String(Math.round(v));

await document.fonts.ready;

// ---------- medidas (coordenadas da tela do celular, 390 × 844) ----------
const phoneRect = $('phone').getBoundingClientRect();
const pt = (el) => {
  const r = (typeof el === 'string' ? $(el) : el).getBoundingClientRect();
  return { x: (r.left + r.width / 2 - phoneRect.left) / PHONE_SCALE, y: (r.top + r.height / 2 - phoneRect.top) / PHONE_SCALE };
};
const edges = (el, track) => {
  const r = el.getBoundingClientRect(), p = track.getBoundingClientRect();
  return { left: (r.left - p.left) / PHONE_SCALE, right: (p.right - r.right) / PHONE_SCALE };
};
const navTrack = $('navPill').parentElement;
const navEdge = (i) => {
  const e = edges($('nav' + i).querySelector('.ib'), navTrack);
  return e;
};
const segEdge = (el) => edges(el, el.parentElement);
const P = {
  xbacon: pt('p-xbacon'), coca: pt('p-coca'), cartPdv: pt('cart-pdv'), receber: pt('btnReceber'), pix: pt('payPix'), pay: pt('mbPay'),
  m02: pt('m02'), mXbacon: pt('m-xbacon'), mCoca: pt('m-coca'), cartMesa: pt('cart-mesa'), send: pt('mbSend'), fechar: pt('btnFecharMesa'),
  ppPlus: pt('ppPlus'), mPix: pt('mPix'), close: pt('mbClose'),
  nova: pt('btnNova'), contas: pt('cContas'), save: pt('mbSave'), caixa: pt('btnCaixa'), fecharCaixa: pt('mbCaixa'),
  semana: pt('sSemana'), chip: pt('chipOntem'), send2: pt('zSend'), confirm: pt('zConfirm')
};
const W = {
  hook: $('hookBtn').offsetWidth, pay: $('mbPay').offsetWidth, send: $('mbSend').offsetWidth, close: $('mbClose').offsetWidth,
  save: $('mbSave').offsetWidth, caixa: $('mbCaixa').offsetWidth, confirm: $('zConfirm').offsetWidth
};
const K = {
  catInsumos: segEdge($('cInsumos')), catContas: segEdge($('cContas')),
  relHoje: segEdge($('sHoje')), relSemana: segEdge($('sSemana')),
  nav: [0, 1, 2, 3, 4].map(navEdge)
};
const rowH = $('dNew').offsetHeight;

// Resposta do Zelinho chega palavra a palavra (o layout final já está reservado).
function splitWords(el) {
  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 3) {
        const frag = document.createDocumentFragment();
        child.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) frag.appendChild(document.createTextNode(part));
          else { const s = document.createElement('span'); s.className = 'w'; s.textContent = part; frag.appendChild(s); }
        });
        child.replaceWith(frag);
      } else if (child.nodeType === 1) {
        if (child.tagName === 'B') child.classList.add('w');
        else walk(child);
      }
    }
  };
  walk(el);
  return $$('.w', el);
}
const answerWords = splitWords($('z-a1'));

// ---------- estados iniciais ----------
gsap.set('#phoneWrap', { y: 1650 });
gsap.set('.sheet', { yPercent: 105 });
gsap.set(['#hookBtn', '#clock .t', '.eyebrow .e', '.sbar .st'], { opacity: 0 });
gsap.set(['#t0', '.sbar .st:first-child'], { opacity: 1 });
gsap.set(['#relDot', '#relTip'], { transformOrigin: '50% 50%' });
gsap.set(['#bar1', '#bar2', '#bar3'], { scaleX: 0 });
gsap.set('.toast .fil', { scaleX: 1 });
gsap.set('#navPill', K.nav[0]);
gsap.set('#nav0', { color: '#011F4A' });
gsap.set('#catKnob', K.catInsumos);
gsap.set('#relKnob', K.relHoje);
gsap.set(['#pdvB', '#mesaB'], { opacity: 0 });

export const tl = gsap.timeline({ paused: true });
const touch = $('touch');
const ink = '#011F4A', muted = '#5E6C80', navMuted = '#5E6C80';

// Troca de "capítulo": relógio, rótulo, hora do celular e legenda.
function chapter(t, i, capOut, capIn) {
  if (i > 0) {
    swap(tl, $('t' + (i - 1)), $('t' + i), t);
    swap(tl, $('e' + (i - 1)), $('e' + i), t);
  }
  if (capOut) swap(tl, $(capOut), $(capIn), t, { y: 24 });
  else enter(tl, $(capIn), t, { y: 24 });
}
const sbarTo = (t, i) => swap(tl, $$('.sbar .st')[i - 1], $$('.sbar .st')[i], t);
function screen(t, from, to) {
  exit(tl, [$('h-' + from), $('b-' + from)], t);
  enter(tl, [$('h-' + to), $('b-' + to)], t);
}
function nav(t, from, to) {
  liquid(tl, $('navPill'), K.nav[from], K.nav[to], t);
  tl.to($('nav' + from), { color: navMuted, duration: 0.22, ease: 'power2.out' }, t);
  tl.to($('nav' + to), { color: ink, duration: 0.22, ease: 'power2.out' }, t);
}
function seg(t, knob, from, to, elFrom, elTo) {
  liquid(tl, knob, from, to, t);
  tl.to(elFrom, { color: muted, duration: 0.22, ease: 'power2.out' }, t);
  tl.to(elTo, { color: ink, duration: 0.22, ease: 'power2.out' }, t);
}
const ringOn = (el, t) => tl.to(el, { opacity: 1, ...S.enter }, t);
const toast = (el, t0, t1) => {
  rise(tl, el, t0, 24);
  tl.to(el.querySelector('.fil'), { scaleX: 0, duration: t1 - t0, ease: 'none' }, t0);
  exit(tl, el, t1);
};

// ================= 1 · abertura =================
{
  const h = TL.hook;
  enter(tl, [$('clock'), $('e0')], h.eyebrow);
  chapter(h.caption, 0, null, 'cap-hook1');
  pop(tl, $('hookBtn'), h.pill);
  const mb = $('hookBtn').querySelector('.mb');
  press(tl, mb, h.press);
  morph(tl, mb, { loading: h.loading, check: h.check, width: W.hook, height: 128, done: { t: h.toast, inset: -40, radius: 64 } });
  swap(tl, $('cap-hook1'), $('cap-hook2'), h.caption2, { y: 24 });
  tl.to('#hookBtn', { y: -260, scale: 0.92, ...S.shape }, h.pillOut);
  tl.to('#hookBtn', { opacity: 0, ...S.exit }, h.pillOut + 0.12);
  tl.to('#phoneWrap', { y: 0, ...S.shape }, h.phoneIn);
  enter(tl, [$('h-pdv'), $('b-pdv')], h.phoneIn + 0.2);
}

// ================= 2 · venda no balcão =================
{
  const v = TL.venda;
  chapter(v.caption, 1, 'cap-hook2', 'cap-venda1');
  const [t1, t2, t3] = v.taps;
  tap(tl, touch, P.xbacon.x, P.xbacon.y, t1, $('p-xbacon'));
  ringOn($('p-xbacon').querySelector('.ring'), t1);
  pop(tl, $('q-xbacon'), t1 + 0.05);
  rise(tl, $('cart-pdv'), v.cartIn, 30);
  count(tl, $('cartTot'), 0, 29.9, v.cartIn);
  tap(tl, touch, P.coca.x, P.coca.y, t2, $('p-coca'));
  ringOn($('p-coca').querySelector('.ring'), t2);
  pop(tl, $('q-coca'), t2 + 0.05);
  count(tl, $('cartCnt'), 1, 2, t2, int);
  count(tl, $('cartTot'), 29.9, 36.4, t2);
  tap(tl, touch, P.coca.x, P.coca.y, t3, $('p-coca'));
  swap(tl, $('q-coca1'), $('q-coca2'), t3);
  press(tl, $('q-coca'), t3 + 0.02);
  count(tl, $('cartCnt'), 2, 3, t3, int);
  count(tl, $('cartTot'), 36.4, 42.9, t3);

  tap(tl, touch, P.cartPdv.x, P.cartPdv.y, v.openSheet, $('cart-pdv'));
  sheetOpen(tl, $('sh-pdv'), $('scrim'), v.openSheet + 0.05);
  tap(tl, touch, P.receber.x, P.receber.y, v.receber, $('btnReceber'));
  swap(tl, $('pdvA'), $('pdvB'), v.receber + 0.1);
  tap(tl, touch, P.pix.x, P.pix.y, v.pix, $('payPix'));
  ringOn($('payPixRing'), v.pix);
  tap(tl, touch, P.pay.x, P.pay.y, v.confirm, $('mbPay').querySelector('.mb'));
  morph(tl, $('mbPay').querySelector('.mb'), { loading: v.loading, check: v.check, width: W.pay, height: 64 });

  sheetClose(tl, $('sh-pdv'), $('scrim'), v.closeSheet);
  // comanda zera depois da venda
  exit(tl, [$('cart-pdv'), $('q-xbacon'), $('q-coca')], v.closeSheet);
  tl.to([$('p-xbacon').querySelector('.ring'), $('p-coca').querySelector('.ring')], { opacity: 0, duration: 0.22, ease: 'power2.out' }, v.closeSheet);
  toast($('toastVenda'), v.toast, v.toast + 2.3);
  count(tl, $('cashPdv'), 1284.5, 1327.4, v.cash);
  swap(tl, $('cap-venda1'), $('cap-venda2'), v.caption2, { y: 24 });
  swap(tl, $('stk12'), $('stk10'), v.stock);
}

// ================= 3 · mesas =================
{
  const m = TL.mesas;
  chapter(m.caption, 2, 'cap-venda2', 'cap-mesas1');
  sbarTo(m.caption, 1);
  screen(m.screen, 'pdv', 'mesas');
  enter(tl, $$('#mesaGrid .mesa'), m.tiles, { y: 16, stagger: 0.04 });
  tap(tl, touch, P.m02.x, P.m02.y, m.openMesa, $('m02'));
  screen(m.mesaScreen, 'mesas', 'mesa02');
  rise(tl, $('cart-mesa'), m.mesaScreen + 0.15, 30);

  const [a, b, c, d, e] = m.taps;
  const xb = $$('#mq-xbacon > span'), cc = $$('#mq-coca > span');
  tap(tl, touch, P.mXbacon.x, P.mXbacon.y, a, $('m-xbacon'));
  ringOn($('m-xbacon').querySelector('.ring'), a);
  pop(tl, $('mq-xbacon'), a + 0.05);
  swap(tl, $('mSub1'), $('mSub2'), a);
  tap(tl, touch, P.mXbacon.x, P.mXbacon.y, b, $('m-xbacon'));
  swap(tl, xb[0], xb[1], b);
  tap(tl, touch, P.mCoca.x, P.mCoca.y, c, $('m-coca'));
  ringOn($('m-coca').querySelector('.ring'), c);
  pop(tl, $('mq-coca'), c + 0.05);
  tap(tl, touch, P.mCoca.x, P.mCoca.y, d, $('m-coca'));
  swap(tl, cc[0], cc[1], d);
  tap(tl, touch, P.mCoca.x, P.mCoca.y, e, $('m-coca'));
  swap(tl, cc[1], cc[2], e);
  const totals = [80, 109.9, 139.8, 149.3, 158.8, 168.3];
  m.taps.forEach((t, i) => {
    count(tl, $('mCartTot'), totals[i], totals[i + 1], t);
    count(tl, $('mCartCnt'), 5 + i, 6 + i, t, int);
  });

  tap(tl, touch, P.cartMesa.x, P.cartMesa.y, m.openSheet, $('cart-mesa'));
  sheetOpen(tl, $('sh-mesa'), $('scrim'), m.openSheet + 0.05);
  const send = $('mbSend').querySelector('.mb');
  tap(tl, touch, P.send.x, P.send.y, m.send, send);
  morph(tl, send, { loading: m.sendLoading, check: m.sendCheck, width: W.send, height: 60, done: { t: m.kitchen, inset: 0, radius: 16 } });
  $$('#mesaA .kNew').forEach((el, i) => swap(tl, el, $$('#mesaA .kKit')[i], m.kitchen + i * 0.06));
  swap(tl, $('cap-mesas1'), $('cap-mesas2'), m.caption2, { y: 24 });

  tap(tl, touch, P.fechar.x, P.fechar.y, m.fechar, $('btnFecharMesa'));
  swap(tl, $('mesaA'), $('mesaB'), m.fecharSheet);
  const [s2, s3] = m.split;
  tap(tl, touch, P.ppPlus.x, P.ppPlus.y, s2, $('ppPlus'));
  swap(tl, $('pp1'), $('pp2'), s2);
  count(tl, $('perPessoa'), 149.13, 74.57, s2);
  tap(tl, touch, P.ppPlus.x, P.ppPlus.y, s3, $('ppPlus'));
  swap(tl, $('pp2'), $('pp3'), s3);
  count(tl, $('perPessoa'), 74.57, 49.71, s3);
  tap(tl, touch, P.mPix.x, P.mPix.y, m.pix, $('mPix'));
  ringOn($('mPixRing'), m.pix);
  const close = $('mbClose').querySelector('.mb');
  tap(tl, touch, P.close.x, P.close.y, m.close, close);
  morph(tl, close, { loading: m.closeLoading, check: m.closeCheck, width: W.close, height: 64 });
  sheetClose(tl, $('sh-mesa'), $('scrim'), m.closeSheet);
  exit(tl, $('cart-mesa'), m.closeSheet);
  toast($('toastMesa'), m.toast, TL.financeiro.screen + 0.4);
}

// ================= 4 · despesas e fechamento =================
{
  const f = TL.financeiro;
  chapter(f.caption, 3, 'cap-mesas2', 'cap-fin1');
  sbarTo(f.caption, 2);
  nav(f.nav, 0, 2);
  screen(f.screen, 'mesa02', 'desp');

  tap(tl, touch, P.nova.x, P.nova.y, f.novo, $('btnNova'));
  sheetOpen(tl, $('sh-desp'), $('scrim'), f.sheet);
  const focus = { boxShadow: '0 0 0 4px rgba(1,31,74,0.28)', borderColor: '#011F4A', duration: 0.22, ease: 'power2.out' };
  const blur = { boxShadow: '0 0 0 0px rgba(1,31,74,0)', borderColor: '#E5E2DC', duration: 0.22, ease: 'power2.out' };
  tl.to('#inDesc', focus, f.typeDesc[0] - 0.15);
  type(tl, $('dDesc'), 'Gás de cozinha', f.typeDesc[0], f.typeDesc[1]);
  tl.to('#inDesc', blur, f.typeValor[0] - 0.08);
  tl.to('#cDesc', { opacity: 0, duration: 0.01 }, f.typeValor[0] - 0.08);
  tl.to('#inValor', focus, f.typeValor[0] - 0.08);
  const digits = '12000';
  // campo de dinheiro: os dígitos entram pela direita (1 → 0,01 … 12000 → 120,00)
  const money = (d) => (v) => 'R$ ' + brl(Number(d.slice(0, Math.round(v)) || 0) / 100);
  text(tl, $('dValor'), 0, digits.length, money(digits), f.typeValor[0], { duration: f.typeValor[1] - f.typeValor[0], ease: 'none' });
  tl.to('#inValor', blur, f.categoria - 0.1);
  tap(tl, touch, P.contas.x, P.contas.y, f.categoria);
  seg(f.categoria, $('catKnob'), K.catInsumos, K.catContas, $('cInsumos'), $('cContas'));
  const save = $('mbSave').querySelector('.mb');
  tap(tl, touch, P.save.x, P.save.y, f.save, save);
  morph(tl, save, { loading: f.saveLoading, check: f.saveCheck, width: W.save, height: 64 });
  sheetClose(tl, $('sh-desp'), $('scrim'), f.closeSheet);
  tl.to('#dOld', { y: rowH, ...S.shape }, f.row);
  enter(tl, $('dNew'), f.row + 0.08);
  count(tl, $('cashDesp'), 6722.1, 6842.1, f.row);
  swap(tl, $('cap-fin1'), $('cap-fin2'), f.caption2, { y: 24 });

  tap(tl, touch, P.caixa.x, P.caixa.y, f.caixa, $('btnCaixa'));
  sheetOpen(tl, $('sh-caixa'), $('scrim'), f.caixaSheet);
  const cash = '61240';
  text(tl, $('dContado'), 0, cash.length, money(cash), f.contado[0], { duration: f.contado[1] - f.contado[0], ease: 'none' });
  pop(tl, $('bateu'), f.contado[1] + 0.05);
  const fc = $('mbCaixa').querySelector('.mb');
  tap(tl, touch, P.fecharCaixa.x, P.fecharCaixa.y, f.fechar, fc);
  morph(tl, fc, { loading: f.fecharLoading, check: f.fecharCheck, width: W.caixa, height: 64, done: { t: f.done, inset: 0, radius: 32 } });
}

// ================= 5 · relatórios =================
{
  const r = TL.relatorios;
  sheetClose(tl, $('sh-caixa'), $('scrim'), r.closeSheet);
  chapter(r.caption, 4, 'cap-fin2', 'cap-rel1');
  sbarTo(r.caption, 3);
  screen(r.screen, 'desp', 'rel');
  tap(tl, touch, P.semana.x, P.semana.y, r.semana);
  seg(r.semana, $('relKnob'), K.relHoje, K.relSemana, $('sHoje'), $('sSemana'));
  count(tl, $('relKpi'), 2418, 14858, r.semana + 0.05);
  pop(tl, $('relDelta'), r.semana + 0.3);
  tl.to('#relLine', { strokeDashoffset: 0, duration: r.chart[1] - r.chart[0], ease: S.count.ease }, r.chart[0]);
  tl.to('#relArea', { opacity: 1, duration: 0.4, ease: 'power2.out' }, r.chart[0] + 0.5);
  pop(tl, $('relDot'), r.tooltip);
  enter(tl, $('relTip'), r.tooltip, { y: 6 });
  [[$('mDesp'), 4120.4], [$('mLucro'), 10737.6]].forEach(([el, v], i) => count(tl, el, 0, v, r.tiles + i * 0.1));
  [[$('bar1'), 1], [$('bar2'), 0.54], [$('bar3'), 0.32]].forEach(([el, v], i) => tl.to(el, { scaleX: v, ...S.shape }, r.top + i * 0.08));
  swap(tl, $('cap-rel1'), $('cap-rel2'), r.caption2, { y: 24 });
}

// ================= 6 · Zelinho Gerente =================
{
  const z = TL.zelinho;
  chapter(z.caption, 5, 'cap-rel2', 'cap-zel1');
  sbarTo(z.caption, 4);
  nav(z.nav, 2, 1);
  screen(z.screen, 'rel', 'zel');
  tap(tl, touch, P.chip.x, P.chip.y, z.chip, $('chipOntem'));
  exit(tl, $('zChips'), z.chip + 0.15);
  enter(tl, $('z-q1'), z.ask, { y: 10 });
  const dots = (el, [t0, t1]) => {
    enter(tl, el, t0, { y: 6 });
    const n = Math.max(1, Math.floor((t1 - t0 - 0.1) / 0.3));
    tl.fromTo($$('i', el), { opacity: 0.3 }, { opacity: 1, duration: 0.15, stagger: 0.08, repeat: n * 2 - 1, yoyo: true, immediateRender: false, ease: 'sine.inOut' }, t0 + 0.05);
    exit(tl, el, t1);
  };
  dots($('z-dots1'), z.typing);
  enter(tl, $('z-a1'), z.answer[0], { y: 6 });
  const step = (z.answer[1] - z.answer[0] - 0.1) / answerWords.length;
  tl.to(answerWords, { opacity: 1, duration: 0.14, stagger: step, ease: 'power1.out' }, z.answer[0] + 0.08);

  tl.to('#zPh', { opacity: 0, duration: 0.05 }, z.typeCmd[0]);
  type(tl, $('zTyped'), 'sobe o X-Bacon pra 31,90', z.typeCmd[0], z.typeCmd[1]);
  tap(tl, touch, P.send2.x, P.send2.y, z.send, $('zSend'));
  exit(tl, $('zTyped'), z.send + 0.05);
  tl.to('#zPh', { opacity: 1, duration: 0.2 }, z.send + 0.2);
  enter(tl, $('z-q2'), z.ask2, { y: 10 });
  dots($('z-dots2'), z.typing2);
  rise(tl, $('z-act'), z.action, 16);
  swap(tl, $('cap-zel1'), $('cap-zel2'), z.caption2, { y: 24 });
  const ok = $('zConfirm').querySelector('.mb');
  tap(tl, touch, P.confirm.x, P.confirm.y, z.confirm, ok);
  morph(tl, ok, { loading: z.loading, check: z.check, width: W.confirm, height: 48, done: { t: z.done, inset: 0, radius: 12 } });
}

// ================= 7 · cartão final (Brand) =================
{
  const e = TL.end;
  tl.set('#endPanel', { opacity: 1 }, e.panel);
  tl.to('#endPanel', { left: 0, top: 0, width: 1080, height: 1920, borderRadius: 0, ...S.shape }, e.panel);
  pop(tl, $('endLogo'), e.logo);
  enter(tl, $('endEyebrow'), e.title - 0.15, { y: 12 });
  enter(tl, $('endTitle'), e.title, { y: 20 });
  enter(tl, $('endSub'), e.sub, { y: 16 });
  rise(tl, $('endCta'), e.cta, 30);
  enter(tl, $('endPrice'), e.cta + 0.25, { y: 10 });
  press(tl, $('endCta').querySelector('.mb'), e.press);
}

