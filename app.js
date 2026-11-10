// Dra. Ana Paula Canever — prévia conceitual (Bruno Luque). Ideia central: "Um traço só".
// Uma única linha atravessa a página: nasce no hero, vira divisor, percorre "O caminho" e some no contato.
// O conteúdo funciona sem este arquivo: estados escondidos só existem depois de `motion-ready`.
//
// Motion em 3 camadas
//  ASSINATURA  hero (linha que se desenha sobre o vidro da fachada) e a cena presa "O caminho"
//              (a câmera acompanha o traço por quatro paradas; a linha engrossa, como tinta, em cada parada). [path--sereno, stepper--editorial]
//  NARRATIVA   a linha que sai do hero e vira divisor; a linha-cortina que revela "A clínica"; enquadramento
//              com profundidade na foto do espaço.                                                            [path--sereno, image-zoom--sereno]
//  INTERFACE   sublinhado desenhado nos botões, chips que trocam o painel (e redesenham o traço), dúvidas
//              com abertura interrompível, títulos em máscara de linhas.                                      [line-mask--editorial]

const root = document.documentElement;
const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');
const fineMQ = matchMedia('(hover: hover) and (pointer: fine)');
const wideMQ = matchMedia('(min-width: 900px)');
const reduce = reduceMQ.matches;
if (reduce) root.classList.add('reduce');

// ---- tokens de motion (espelham o CSS) ----
const EASE_OUT = [0.23, 1, 0.32, 1];
const EASE_IN_OUT = [0.77, 0, 0.175, 1];
const DUR = { press: 0.13, ctl: 0.2, panel: 0.32 };
const SPRING = { k: 140, c: 24 };               // mola da câmera (criticamente amortecida)
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const WA = 'https://wa.me/5548999728447';

const M = window.Motion || null;
if (!M) console.warn('Motion indisponível; página segue estática.');
const animated = !!M && !reduce;
const prog = (p) => (typeof p === 'number' ? p : p?.y?.progress ?? 0);

/* ------------------------------------------------------------------ */
/* SVG: traço que se desenha (dash) e curva suave por pontos            */
/* ------------------------------------------------------------------ */
const NS = 'http://www.w3.org/2000/svg';
function el(tag, attrs = {}, parent) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}
// path com dash; `set(L)` desenha L unidades de comprimento. Precisa estar visível ao medir.
function drawable(parent, d, cls) {
  const p = el('path', { class: cls, d }, parent);
  const len = p.getTotalLength();
  p.style.strokeDasharray = `${len.toFixed(2)} ${(len + 2).toFixed(2)}`;
  let last = -1;
  const api = {
    el: p, len,
    set(L) { L = clamp(L, 0, len); const s = L.toFixed(1); if (s !== last) { last = s; p.style.strokeDashoffset = (len - L).toFixed(2); } },
  };
  api.set(len);
  return api;
}
function measure(parent, d) {
  const p = el('path', { d }, parent);
  const len = p.getTotalLength();
  p.remove();
  return len;
}
// Catmull-Rom → Bézier. `upto(k)` devolve o traço até o k-ésimo ponto.
function spline(pts) {
  const f = (n) => n.toFixed(1);
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    segs.push(`C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`);
  }
  const head = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  return { full: head + segs.join(' '), upto: (k) => head + segs.slice(0, k).join(' ') };
}
function tween(dur, delay, ease, fn) { return M.animate(0, 1, { duration: dur, delay, ease, onUpdate: fn }); }

// mola 1D interrompível: mantém a velocidade ao mudar o alvo; para em repouso e com a aba oculta
function spring1(apply, { k = SPRING.k, c = SPRING.c } = {}) {
  const s = { x: 0, v: 0, t: 0, raf: 0, last: 0 };
  const tick = (now) => {
    const dt = Math.min(0.032, (now - (s.last || now)) / 1000 || 0.016); s.last = now;
    s.v += (-k * (s.x - s.t) - c * s.v) * dt; s.x += s.v * dt;
    if (Math.abs(s.x - s.t) + Math.abs(s.v) > 0.0006 && !document.hidden) { apply(s.x); s.raf = requestAnimationFrame(tick); }
    else { s.x = s.t; s.v = 0; s.raf = 0; s.last = 0; apply(s.x); }
  };
  return {
    to(t) { s.t = t; if (!s.raf) s.raf = requestAnimationFrame(tick); },
    set(x) { cancelAnimationFrame(s.raf); s.raf = 0; s.last = 0; s.x = s.t = x; s.v = 0; apply(x); },
    get x() { return s.x; },
  };
}

/* ------------------------------------------------------------------ */
/* Topo, rolagem contínua (só roda do mouse) e âncoras                  */
/* ------------------------------------------------------------------ */
const top = $('[data-top]');
const onScrollTop = () => top.classList.toggle('is-solid', scrollY > 24);
addEventListener('scroll', onScrollTop, { passive: true }); onScrollTop();

let lenis = null;
function startLenis() {
  if (reduce || !window.Lenis || lenis || !fineMQ.matches) return;
  lenis = new window.Lenis({ lerp: 0.09, smoothWheel: true, wheelMultiplier: 0.95 });
  const raf = (t) => { if (!lenis) return; lenis.raf(t); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
}
if (window.Lenis) startLenis(); else addEventListener('load', startLenis, { once: true });
reduceMQ.addEventListener('change', () => { if (reduceMQ.matches && lenis) { lenis.destroy(); lenis = null; } });
const goTo = (y, instant) => {
  if (lenis) lenis.scrollTo(y, { duration: instant ? 0 : 1.3, easing: (t) => 1 - Math.pow(1 - t, 4) });
  else scrollTo({ top: y, behavior: reduce || instant ? 'auto' : 'smooth' });
};
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  const id = a.getAttribute('href');
  const target = id === '#inicio' ? document.body : $(id);
  if (!target) return;
  e.preventDefault();
  const y = id === '#inicio' ? 0 : target.getBoundingClientRect().top + scrollY - (id === '#caminho' && root.classList.contains('pinned') ? 0 : top.offsetHeight + 8);
  goTo(y);
  if (id !== '#inicio') { target.setAttribute('tabindex', '-1'); target.focus({ preventScroll: true }); }
});

/* ------------------------------------------------------------------ */
/* ASSINATURA 1 · hero: a linha se desenha sobre o vidro da fachada     */
/* ------------------------------------------------------------------ */
const HERO_D = 'M560 -10 C470 90 330 70 270 180 C210 290 120 270 70 400 C20 500 110 580 190 610 C290 640 390 560 470 640 C560 710 520 830 400 870 C300 905 160 880 110 960 L60 1010';
const heroSvg = $('[data-hero-line]');
const heroFig = $('[data-hero-fig]');
let heroMain = null, heroGold = null, heroNib = null;
if (heroSvg) {
  heroGold = drawable(heroSvg, HERO_D, 'ln ln--gold');
  heroGold.el.setAttribute('transform', 'translate(13 9)');
  heroGold.el.style.strokeWidth = '1.1';
  heroMain = drawable(heroSvg, HERO_D, 'ln');
  heroMain.el.style.strokeWidth = '3';
  heroNib = el('circle', { class: 'nib', r: 5, cx: 560, cy: -10 }, heroSvg);
  heroNib.style.opacity = '0';
}

/* ------------------------------------------------------------------ */
/* NARRATIVA 1 · a linha que sai do hero vira divisor                   */
/* ------------------------------------------------------------------ */
const divBox = $('[data-divider]');
let divLine = null, divProg = 1;
function buildDivider() {
  if (!divBox || !heroFig) return;
  const svg = $('svg', divBox);
  svg.innerHTML = '';
  const bw = divBox.clientWidth, bh = divBox.clientHeight;
  const fr = heroFig.getBoundingClientRect(), dr = divBox.getBoundingClientRect();
  const sx = (fr.left - dr.left) + fr.width * (60 / 600);
  svg.setAttribute('viewBox', `0 0 ${bw} ${bh}`);
  // desktop: o traço varre para a esquerda, rumo ao texto; celular (traço nasce perto da margem): varre para a direita
  const pts = bw > 700
    ? [[sx, 0], [sx - 40, bh * 0.42], [bw * 0.56, bh * 0.74], [bw * 0.3, bh * 0.6], [bw * 0.1, bh * 0.82], [-30, bh * 0.66]]
    : [[sx, 0], [sx + 16, bh * 0.4], [bw * 0.42, bh * 0.76], [bw * 0.72, bh * 0.5], [bw + 24, bh * 0.72]];
  divLine = drawable(svg, spline(pts).full, 'ln');
  divLine.el.style.strokeWidth = '2.4';
  setDivider(divProg);
}
function setDivider(t) {
  divProg = t;
  if (!divLine) return;
  divLine.set(divLine.len * t);
  divLine.el.style.strokeWidth = (3 - 1.7 * smooth(clamp(t))).toFixed(2);
}

/* ------------------------------------------------------------------ */
/* Chips das duas frentes (tablist com teclado; redesenha o traço)      */
/* ------------------------------------------------------------------ */
function drawPanel(panel) {
  if (!animated) return;
  $$('[data-draw]', panel).forEach((p, i) => {
    const len = p.getTotalLength();
    p.style.strokeDasharray = `${len} ${len + 2}`;
    p.style.strokeDashoffset = String(len);
    tween(0.9, i * 0.15, EASE_OUT, (v) => { p.style.strokeDashoffset = String(len * (1 - v)); });
  });
}
const chipsBox = $('[data-chips]');
if (chipsBox) {
  const tabs = $$('.chip', chipsBox);
  const panels = tabs.map((t) => $('#' + t.getAttribute('aria-controls')));
  let cur = 0, anim = null;
  const select = (i, focus) => {
    if (i === cur && !focus) return;
    const prev = panels[cur];
    tabs.forEach((t, k) => { t.setAttribute('aria-selected', String(k === i)); t.tabIndex = k === i ? 0 : -1; });
    if (anim) anim.stop();
    prev.hidden = true;
    panels[i].hidden = false;
    cur = i;
    if (animated) {
      anim = M.animate(panels[i], { opacity: [0, 1], transform: ['translateX(14px)', 'translateX(0px)'] }, { duration: DUR.panel, ease: EASE_OUT });
      drawPanel(panels[i]);
    }
    if (focus) tabs[i].focus();
  };
  tabs.forEach((t, i) => t.addEventListener('click', () => select(i)));
  chipsBox.addEventListener('keydown', (e) => {
    const k = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (k) { e.preventDefault(); select((cur + k + tabs.length) % tabs.length, true); }
    else if (e.key === 'Home') { e.preventDefault(); select(0, true); }
    else if (e.key === 'End') { e.preventDefault(); select(tabs.length - 1, true); }
  });
}

/* ------------------------------------------------------------------ */
/* Dúvidas: abertura interrompível (altura animada; funciona sem JS)    */
/* ------------------------------------------------------------------ */
$$('.q').forEach((d) => {
  const sum = $('summary', d), body = $('.q__a', d);
  let anim = null, token = 0;
  sum.addEventListener('click', (e) => {
    if (!animated) return;                       // sem Motion, o <details> nativo basta
    e.preventDefault();
    const my = ++token;
    const from = anim ? body.getBoundingClientRect().height : (d.open ? body.scrollHeight : 0);
    if (anim) anim.stop();
    const opening = !d.open || (anim && d.dataset.closing === '1');
    d.dataset.closing = opening ? '0' : '1';
    if (opening) d.open = true;
    const to = opening ? body.scrollHeight : 0;
    body.style.height = from + 'px';
    anim = M.animate(body, { height: [from + 'px', to + 'px'] }, { duration: DUR.panel + 0.08, ease: EASE_OUT });
    anim.then(() => {
      if (my !== token) return;
      body.style.height = ''; anim = null;
      if (!opening) d.open = false;
    });
  });
});

/* ------------------------------------------------------------------ */
/* Contato: mensagem pré-preenchida, WhatsApp e copiar                  */
/* ------------------------------------------------------------------ */
const composer = $('[data-composer]');
if (composer) {
  const ta = $('textarea', composer), ok = $('[data-copy-ok]', composer);
  let t = 0;
  const say = (m) => { ok.textContent = m; clearTimeout(t); t = setTimeout(() => (ok.textContent = ''), 2600); };
  composer.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = ta.value.trim();
    if (!v) { say('Escreva uma mensagem curta.'); ta.focus(); return; }
    window.open(`${WA}?text=${encodeURIComponent(v)}`, '_blank', 'noopener');
  });
  $('[data-copy]', composer).addEventListener('click', async () => {
    const v = ta.value.trim();
    if (!v) { say('Escreva uma mensagem curta.'); ta.focus(); return; }
    try { await navigator.clipboard.writeText(v); say('Mensagem copiada.'); }
    catch { ta.select(); try { document.execCommand('copy'); say('Mensagem copiada.'); } catch { say('Selecione e copie o texto.'); } }
  });
}

/* ------------------------------------------------------------------ */
/* CTA fixo no celular: aparece depois do hero, some no contato         */
/* ------------------------------------------------------------------ */
const sticky = $('[data-sticky]');
if (sticky) {
  let pastHero = false, inContact = false;
  const upd = () => sticky.classList.toggle('is-on', pastHero && !inContact);
  new IntersectionObserver(([e]) => { pastHero = !e.isIntersecting && e.boundingClientRect.top < 0; upd(); }, { threshold: 0.1 }).observe($('[data-hero]'));
  new IntersectionObserver(([e]) => { inContact = e.isIntersecting; upd(); }, { threshold: 0.15 }).observe($('[data-contato]'));
}

/* ------------------------------------------------------------------ */
/* O CAMINHO · cena presa (desktop) e fio vertical (celular)            */
/* ------------------------------------------------------------------ */
const scene = $('[data-scene]');
const cards = $$('[data-card]');
const idxBtns = $$('[data-goto]');
const stage = $('[data-stage]');
const world = $('[data-world]');
const wsvg = $('[data-world-svg]');
let cancelScene = null, cancelFio = null, pinned = false;
let activeStep = 0;

function setActive(i) {
  if (i === activeStep) return;
  activeStep = i;
  cards.forEach((c, k) => c.classList.toggle('is-active', k === i));
  idxBtns.forEach((b, k) => (k === i ? b.setAttribute('aria-current', 'step') : b.removeAttribute('aria-current')));
  pulse(i);
}
let pulseEls = [];
function pulse(i) {
  const h = pulseEls[i];
  if (!h || !animated) return;
  M.animate(h, { opacity: [0.7, 0], transform: ['scale(1)', 'scale(3.4)'] }, { duration: 0.9, ease: EASE_OUT });
}

// --- modo presa: a câmera acompanha o traço por quatro paradas ---
const NODE_Y = [0.8, 0.6, 0.84, 0.62];
const MID_DY = [-0.14, 0.16, -0.18];     // curvas de ligação: o traço faz ondas entre as paradas
const arcPath = (cx, cy, r, a0, a1) => {
  const p = (a) => [cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)];
  const [x0, y0] = p(a0), [x1, y1] = p(a1);
  return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 ${Math.abs(a1 - a0) > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
};
// marcas abstratas de cada parada (linhas, sem figura humana)
const GLYPHS = [
  (x, y) => [arcPath(x, y, 24, -55, 55), arcPath(x, y, 38, -55, 55), arcPath(x, y, 52, -55, 55)],              // avaliação: foco
  (x, y) => [0, 1, 2, 3].map((k) => `M${x - 44} ${y - 22 - k * 11} q44 -18 88 0`),                             // plano: curvas de nível
  (x, y) => [arcPath(x, y, 30, 130, 230), arcPath(x, y, 30, -50, 50), arcPath(x, y, 46, 140, 220), arcPath(x, y, 46, -40, 40)], // atendimento: mãos
  (x, y) => [`M${x + 12} ${y} a12 12 0 1 1 -12 -12 a24 24 0 1 1 24 24 a36 36 0 1 1 -36 -36`],                   // acompanhamento: retorno
];
function buildWorld() {
  const pw = Math.round(stage.clientWidth), H = Math.round(stage.clientHeight);
  world.style.setProperty('--pw', pw + 'px');
  wsvg.setAttribute('viewBox', `0 0 ${pw * 4} ${H}`);
  wsvg.setAttribute('width', pw * 4); wsvg.setAttribute('height', H);
  wsvg.innerHTML = '';
  const nodePts = NODE_Y.map((y, i) => [pw * (i + 0.5), H * y]);
  const pts = [[0, H * 0.92]];
  nodePts.forEach((p, i) => {
    pts.push(p);
    if (i < 3) pts.push([(p[0] + nodePts[i + 1][0]) / 2, (p[1] + nodePts[i + 1][1]) / 2 + H * MID_DY[i]]);
  });
  pts.push([pw * 4, H * 0.7]);
  const sp = spline(pts);
  // relevo: cópias do traço, cada vez mais fracas, como curvas de nível sobre a pele
  for (let k = 1; k <= 9; k++) el('path', { class: 'ln ln--gold', d: sp.full, transform: `translate(0 ${k * 14})`, 'stroke-width': 1, opacity: (0.3 - k * 0.028).toFixed(3) }, wsvg);
  for (let k = 1; k <= 2; k++) el('path', { class: 'ln ln--gold', d: sp.full, transform: `translate(0 ${-k * 14})`, 'stroke-width': 1, opacity: (0.16 - k * 0.05).toFixed(3) }, wsvg);
  // trilha tracejada do que ainda vai ser desenhado
  el('path', { class: 'ln ln--gold', d: sp.full, 'stroke-dasharray': '2 9', 'stroke-width': 1.5, opacity: 0.8 }, wsvg);
  const lens = [1, 3, 5, 7, 8].map((k) => measure(wsvg, sp.upto(k)));   // comprimento até cada parada e até o fim
  const main = drawable(wsvg, sp.full, 'ln');
  main.set(0);
  const nodes = NODE_Y.map((y, i) => {
    const [x, yy] = nodePts[i];
    const g = el('g', {}, wsvg);
    const glyph = el('g', { class: 'glyph' }, g);
    GLYPHS[i](x, yy).forEach((d) => el('path', { class: 'ln ln--gold', d, 'stroke-width': 1.8 }, glyph));
    glyph.style.transformOrigin = `${x}px ${yy}px`; glyph.style.opacity = '0';
    const halo = el('circle', { class: 'ln ln--gold', cx: x, cy: yy, r: 9, 'stroke-width': 1.5 }, g);
    halo.style.transformOrigin = `${x}px ${yy}px`; halo.style.opacity = '0';
    el('circle', { cx: x, cy: yy, r: 8, fill: '#FBF4EC', stroke: '#4A2F22', 'stroke-width': 1.5 }, g);
    const blot = el('circle', { cx: x, cy: yy, r: 3, fill: '#4A2F22' }, g);
    return { halo, blot, glyph };
  });
  pulseEls = nodes.map((n) => n.halo);
  const nib = el('circle', { class: 'nib', r: 5.5, cx: 0, cy: pts[0][1] }, wsvg);
  return { pw, H, main, nodes, nib, L0: lens[0], Ls: [lens[0], lens[1], lens[2], lens[3]], Ltot: lens[4] };
}

let W = null;           // construção atual do mundo
let target = { entry: 0, pos: 0, tail: 0 };
let shown = { entry: 0, pos: 0, tail: 0 };
const cam = spring1((x) => { shown.pos = x; renderWorld(); });
function renderWorld() {
  if (!W) return;
  const { entry, pos, tail } = { ...target, pos: shown.pos };
  let L;
  if (entry < 1) L = W.L0 * entry;
  else { const i = Math.min(2, Math.floor(pos + 1e-6)); L = lerp(W.Ls[i], W.Ls[i + 1], pos - i) + tail * (W.Ltot - W.Ls[3]); }
  W.main.set(L);
  const pt = W.main.el.getPointAtLength(clamp(L, 0, W.main.len));
  W.nib.setAttribute('cx', pt.x.toFixed(1)); W.nib.setAttribute('cy', pt.y.toFixed(1));
  W.nib.style.opacity = L > 1 ? '1' : '0';
  // a linha "respira": engrossa como tinta nas paradas e afina em trânsito
  const d = pos - Math.round(pos);
  const ink = Math.exp(-Math.pow(d / 0.2, 2));
  W.main.el.style.strokeWidth = (1.5 + 3.6 * ink * (entry >= 1 ? 1 : 0.2)).toFixed(2);
  W.nodes.forEach((n, i) => {
    const near = clamp(1 - Math.abs(pos - i) * 2.2) * (entry >= 1 ? 1 : 0);
    n.glyph.style.opacity = near.toFixed(3);
    n.glyph.style.transform = `scale(${(0.7 + 0.3 * near).toFixed(3)})`;
    const reached = L >= W.Ls[i] - 1;
    n.blot.setAttribute('r', reached ? (2.5 + 4.5 * (Math.round(pos) === i ? ink : 0)).toFixed(2) : '0');
  });
  world.style.transform = `translate3d(${(-pos * W.pw).toFixed(1)}px,0,0)`;
  cards.forEach((c, i) => c.style.setProperty('--co', (0.16 + 0.84 * (1 - Math.min(1, Math.abs(pos - i) * 1.25))).toFixed(3)));
  setActive(clamp(Math.round(pos), 0, 3));
}
let lastQ = 0;
function onSceneScroll(q) {
  lastQ = q;
  const vh = innerHeight, q1 = vh / scene.offsetHeight;
  const entry = clamp(q / q1);
  const p = clamp((q - q1) / (1 - q1));
  const s = p * 4, i = Math.min(3, Math.floor(s)), l = s - i;
  // detentes: em cada zona a cena descansa na parada e só avança no fim
  let pos, tail = 0;
  if (i < 3) pos = i + smooth(clamp((l - 0.55) / 0.45));
  else { pos = 3; tail = smooth(clamp((l - 0.45) / 0.55)); }
  target = { entry, pos, tail };
  if (entry < 1) cam.set(0); else cam.to(pos);
  renderWorld();
}
function pinOn() {
  if (pinned) return;
  pinned = true;
  unFio();
  root.classList.add('pinned');
  W = buildWorld();
  shown.pos = 0; cam.set(0);
  cancelScene = M.scroll((p) => onSceneScroll(prog(p)), { target: scene, offset: ['start end', 'end end'] });
  onSceneScroll(0);
}
function pinOff() {
  if (!pinned) return;
  pinned = false;
  cancelScene && cancelScene(); cancelScene = null;
  root.classList.remove('pinned');
  world.style.transform = ''; wsvg.innerHTML = ''; W = null;
  cards.forEach((c) => c.style.removeProperty('--co'));
  activeStep = -1; setActive(0);
}

// --- modo lista: o traço vira fio vertical à esquerda, com um nó por etapa ---
let fioState = null;
function unFio() { cancelFio && cancelFio(); cancelFio = null; fioState = null; wsvg.classList.remove('fio'); wsvg.style.display = ''; wsvg.innerHTML = ''; }
function buildFio() {
  unFio();
  const H = Math.round(world.offsetHeight);
  if (!H) return;
  wsvg.classList.add('fio');
  wsvg.setAttribute('viewBox', `0 0 28 ${H}`); wsvg.setAttribute('width', 28); wsvg.setAttribute('height', H);
  wsvg.style.display = 'block';
  const ny = cards.map((c) => c.offsetTop + 34);
  const pts = [[14, 0], ...ny.map((y, i) => [i % 2 ? 22 : 6, y]), [14, H]];
  const sp = spline(pts);
  const lens = ny.map((_, i) => measure(wsvg, sp.upto(i + 1)));
  const main = drawable(wsvg, sp.full, 'ln');
  main.el.style.strokeWidth = '2.4';
  const dots = ny.map((y, i) => el('circle', { cx: pts[i + 1][0], cy: y, r: 6, fill: '#E9D3C8', stroke: '#4A2F22', 'stroke-width': 1.6 }, wsvg));
  const nib = el('circle', { class: 'nib', r: 4, cx: 14, cy: 0 }, wsvg);
  const paint = (t) => {
    const L = main.len * t;
    main.set(L);
    const pt = main.el.getPointAtLength(clamp(L, 0, main.len));
    nib.setAttribute('cx', pt.x.toFixed(1)); nib.setAttribute('cy', pt.y.toFixed(1));
    dots.forEach((d, i) => d.setAttribute('fill', L >= lens[i] - 2 ? '#4A2F22' : '#E9D3C8'));
    cards.forEach((c, i) => c.classList.toggle('is-active', L >= lens[i] - 2 && (i === cards.length - 1 || L < lens[i + 1] - 2)));
  };
  fioState = { paint };
  if (animated) {
    paint(0);
    cancelFio = M.scroll((p) => paint(clamp(prog(p))), { target: world, offset: ['start 0.8', 'end 0.55'] });
  } else { nib.style.display = 'none'; paint(1); cards.forEach((c) => c.classList.remove('is-active')); }
}

// --- ligar o modo certo ---
const canPin = () => animated && wideMQ.matches && innerHeight >= 620;
function applyMode() {
  if (!scene || !world) return;
  if (canPin()) { if (pinned) { W = buildWorld(); onSceneScroll(lastQ); } else pinOn(); }
  else { pinOff(); buildFio(); }
  buildDivider();
}
let rz = 0;
addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(applyMode, 140); });
wideMQ.addEventListener('change', applyMode);

// índice: cada título leva ao detente da sua parada
idxBtns.forEach((b) => b.addEventListener('click', () => {
  if (!pinned) return;
  const i = Number(b.dataset.goto);
  const p = i < 3 ? (i + 0.3) / 4 : 0.88;
  const q1 = innerHeight / scene.offsetHeight;
  const y = scene.getBoundingClientRect().top + scrollY + q1 * scene.offsetHeight - innerHeight + p * (scene.offsetHeight - innerHeight);
  goTo(y);
}));

/* ------------------------------------------------------------------ */
/* Motion                                                              */
/* ------------------------------------------------------------------ */
if (animated) {
  const { animate, scroll, inView, stagger } = M;
  heroMain.set(0); heroGold.set(0);
  root.classList.add('motion-ready');

  /* ---- ASSINATURA 1 · hero ---- */
  animate('.hero__title .line > span', { transform: ['translateY(112%)', 'translateY(0%)'] }, { duration: 1, delay: stagger(0.1), ease: EASE_OUT });
  animate('.hero__lead, .hero__actions', { opacity: [0, 1], transform: ['translateY(14px)', 'translateY(0)'] }, { duration: 0.8, delay: stagger(0.1, { startDelay: 0.45 }), ease: EASE_OUT });
  animate('.hero__photo img', { clipPath: ['inset(100% 0 0 0)', 'inset(0% 0 0 0)'] }, { duration: 1.2, delay: 0.1, ease: EASE_IN_OUT });
  animate('.hero__cap', { opacity: [0, 1], transform: ['translateY(8px)', 'translateY(0)'] }, { duration: 0.7, delay: 1.6, ease: EASE_OUT });
  heroNib.style.opacity = '1';
  tween(2.1, 0.55, EASE_IN_OUT, (v) => {
    heroMain.set(heroMain.len * v);
    heroGold.set(heroGold.len * clamp(v * 1.04 - 0.04));
    heroMain.el.style.strokeWidth = (1.8 + 2.6 * Math.sin(Math.PI * v) ** 0.7).toFixed(2);
    const pt = heroMain.el.getPointAtLength(heroMain.len * v);
    heroNib.setAttribute('cx', pt.x.toFixed(1)); heroNib.setAttribute('cy', pt.y.toFixed(1));
    if (v >= 1) heroNib.style.opacity = '0';
  });

  /* ---- NARRATIVA 1 · a linha sai do hero e vira divisor ---- */
  setDivider(0);
  if (divBox) scroll((p) => setDivider(clamp(prog(p) * 1.15)), { target: divBox, offset: ['start 0.98', 'end 0.5'] });

  /* ---- NARRATIVA 2 · a linha-cortina revela "A clínica" ---- */
  const curtain = $('[data-curtain]');
  if (curtain) {
    scroll((p) => {
      const t = smooth(clamp(prog(p)));
      curtain.style.setProperty('--cut', ((1 - t) * 100).toFixed(2) + '%');
      curtain.style.setProperty('--edge', t >= 0.999 ? '0' : '1');
    }, { target: curtain, offset: ['start end', 'start 0.12'] });
    curtain.style.setProperty('--cut', '100%');
  }

  /* ---- NARRATIVA 3 · enquadramento com profundidade na foto do espaço ---- */
  const zoom = $('[data-zoom]');
  if (zoom) {
    const img = $('img', zoom);
    scroll((p) => { img.style.transform = `scale(${(1.16 - 0.16 * smooth(clamp(prog(p) * 1.4))).toFixed(4)})`; }, { target: zoom, offset: ['start end', 'center 0.5'] });
  }

  /* ---- INTERFACE · títulos em máscara de linhas e traço do painel inicial ---- */
  $$('[data-mask]').forEach((h) => {
    const spans = $$('.line > span', h);
    inView(h, () => { animate(spans, { transform: ['translateY(112%)', 'translateY(0%)'] }, { duration: 0.95, delay: stagger(0.09), ease: EASE_OUT }); }, { amount: 0.4 });
  });
  const firstPanel = $('.panel:not([hidden])');
  if (firstPanel) inView(firstPanel, () => drawPanel(firstPanel), { amount: 0.5 });
}

applyMode();
// o hero pode mudar de tamanho depois das fontes; refaz o divisor
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => buildDivider());
addEventListener('load', () => { buildDivider(); if (!pinned) buildFio(); });
