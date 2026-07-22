/* Pokemon GO Hub — app logic (data-dense timeline UI) */
'use strict';

/* ---------------- state & settings ---------------- */
const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));

const DEFAULTS = {
  theme: 'dark', tf24: false, region: 'US',
  notif: { enabled: false, events: true, ending: true, raids: true, spotlight: true, communityday: true, leads: [1] },
};
let settings = Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem('pgohub-settings') || '{}'));
settings.notif = Object.assign({}, DEFAULTS.notif, settings.notif || {});
const saveSettings = () => localStorage.setItem('pgohub-settings', JSON.stringify(settings));

let data = JSON.parse(localStorage.getItem('pgohub-data') || 'null') || { events: [], raids: [], research: [], eggs: [], news: [], fetchedAt: 0 };

function applyTheme() {
  const light = settings.theme === 'light' || (settings.theme === 'auto' && matchMedia('(prefers-color-scheme: light)').matches);
  document.documentElement.dataset.theme = light ? 'light' : 'dark';
}
applyTheme();
matchMedia('(prefers-color-scheme: light)').addEventListener('change', applyTheme);

/* ---------------- helpers ---------------- */
const now = () => Date.now();
const parseT = (s) => new Date(s).getTime();

function fmtTime(d) {
  return new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: !settings.tf24 });
}
function fmtDate(d) {
  const dt = new Date(d);
  const sameYear = dt.getFullYear() === new Date().getFullYear();
  return dt.toLocaleDateString([], { month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric' }) + ' ' + fmtTime(d);
}
function countdown(ms) {
  if (ms <= 0) return 'now';
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}
function eventStatus(ev) {
  const t = now(), st = parseT(ev.start), en = parseT(ev.end);
  if (t >= st && t < en) return (en - t < 24 * 3600 * 1000) ? 'ending' : 'now';
  if (t < st) return 'soon';
  return 'past';
}
const STATUS_LABEL = { now: 'LIVE', ending: 'ENDING SOON', soon: 'UPCOMING' };
const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2400);
}

/* ---------------- type chart & counters ---------------- */
const TYPE_COLORS = { normal:'#9aa5ad', fire:'#ef7c39', water:'#4d90d5', electric:'#d4a815', grass:'#63bc5a', ice:'#74cec0', fighting:'#ce416b', poison:'#a864c7', ground:'#d97845', flying:'#8fa8dd', psychic:'#f97176', bug:'#90c12c', rock:'#c5b78c', ghost:'#5269ad', dragon:'#0b6dc3', dark:'#595761', steel:'#5a8ea1', fairy:'#ec8fe6' };
const CHART = {
  normal:{rock:.5,ghost:0,steel:.5}, fire:{fire:.5,water:.5,grass:2,ice:2,bug:2,rock:.5,dragon:.5,steel:2},
  water:{fire:2,water:.5,grass:.5,ground:2,rock:2,dragon:.5}, electric:{water:2,electric:.5,grass:.5,ground:0,flying:2,dragon:.5},
  grass:{fire:.5,water:2,grass:.5,poison:.5,ground:2,flying:.5,bug:.5,rock:2,dragon:.5,steel:.5},
  ice:{fire:.5,water:.5,grass:2,ice:.5,ground:2,flying:2,dragon:2,steel:.5},
  fighting:{normal:2,ice:2,poison:.5,flying:.5,psychic:.5,bug:.5,rock:2,ghost:0,dark:2,steel:2,fairy:.5},
  poison:{grass:2,poison:.5,ground:.5,rock:.5,ghost:.5,steel:0,fairy:2},
  ground:{fire:2,electric:2,grass:.5,poison:2,flying:0,bug:.5,rock:2,steel:2},
  flying:{electric:.5,grass:2,fighting:2,bug:2,rock:.5,steel:.5},
  psychic:{fighting:2,poison:2,psychic:.5,dark:0,steel:.5},
  bug:{fire:.5,grass:2,fighting:.5,poison:.5,flying:.5,psychic:2,ghost:.5,dark:2,steel:.5,fairy:.5},
  rock:{fire:2,ice:2,fighting:.5,ground:.5,flying:2,bug:2,steel:.5},
  ghost:{normal:0,psychic:2,ghost:2,dark:.5},
  dragon:{dragon:2,steel:.5,fairy:0},
  dark:{fighting:.5,psychic:2,ghost:2,dark:.5,fairy:.5},
  steel:{fire:.5,water:.5,electric:.5,ice:2,rock:2,steel:.5,fairy:2},
  fairy:{fire:.5,fighting:2,poison:.5,dragon:2,dark:2,steel:.5},
};
const COUNTERS = {
  fighting:'Terrakion, Machamp, Lucario', fire:'Reshiram, Chandelure, Darmanitan', water:'Kyogre, Swampert, Feraligatr',
  grass:'Kartana, Roserade, Zarude', electric:'Xurkitree, Electivire, Magnezone', ice:'Baxcalibur, Mamoswine, Weavile',
  ground:'Groudon, Garchomp, Excadrill', rock:'Rampardos, Rhyperior, Tyranitar', flying:'Rayquaza, Yveltal, Braviary',
  psychic:'Mewtwo, Hoopa, Alakazam', bug:'Volcarona, Pheromosa, Pinsir', poison:'Nihilego, Naganadel, Gengar',
  ghost:'Giratina-O, Gengar, Chandelure', dark:'Hydreigon, Darkrai, Tyranitar', dragon:'Rayquaza, Palkia, Salamence',
  steel:'Metagross, Dialga, Excadrill', fairy:'Xerneas, Gardevoir, Togekiss', normal:'Slaking, Regigigas',
};
function weaknesses(defTypes) {
  const res = [];
  for (const atk of Object.keys(CHART)) {
    let mult = 1;
    for (const d of defTypes) mult *= (CHART[atk] || {})[d] ?? 1;
    if (mult > 1) res.push({ type: atk, mult });
  }
  return res.sort((a, b) => b.mult - a.mult);
}

/* ---------------- data fetching ---------------- */
// serverless build: feeds come straight from ScrapedDuck (CORS-friendly);
// scraped bonuses/gopass/news come from enriched.json, refreshed by GitHub Actions
const FEEDS = {
  events: 'https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/events.json',
  raids: 'https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/raids.json',
  research: 'https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/research.json',
};
async function loadData(force) {
  try {
    const opts = force ? { cache: 'reload' } : {};
    const [events, raids, research, enriched] = await Promise.all([
      fetch(FEEDS.events, opts).then((r) => r.json()),
      fetch(FEEDS.raids, opts).then((r) => r.json()),
      fetch(FEEDS.research, opts).then((r) => r.json()),
      fetch('enriched.json', opts).then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
    ]);
    for (const ev of events) {
      const x = (ev.extraData ||= {});
      if (enriched.bonuses?.[ev.eventID]) x.bonuses = enriched.bonuses[ev.eventID];
      if (enriched.gopass?.[ev.eventID]) x.gopass = enriched.gopass[ev.eventID];
    }
    const news = enriched.news?.length ? enriched.news : events.slice()
      .sort((a, b) => new Date(b.start) - new Date(a.start)).slice(0, 20)
      .map((ev) => ({ title: ev.name, link: ev.link, image: ev.image, date: ev.start, summary: ev.heading || '' }));
    data = { events, raids, research, news, fetchedAt: Date.now() };
    localStorage.setItem('pgohub-data', JSON.stringify(data));
  } catch {
    toast('Offline — showing cached data');
  }
  renderAll();
}

/* ---------------- timeline renderer ---------------- */
function eventBonusChips(ev) {
  const x = ev.extraData || {};
  const chips = [];
  if (x.spotlight) {
    chips.push({ text: `★ ${x.spotlight.name}${x.spotlight.canBeShiny ? ' ✨' : ''}`, acc: true });
    if (x.spotlight.bonus) chips.push({ text: x.spotlight.bonus });
  }
  for (const b of x.communityday?.bonuses || []) chips.push({ text: b.text, image: b.image });
  for (const b of x.breakthrough?.bonuses || []) chips.push({ text: b.text, image: b.image });
  for (const b of (x.raidbattles?.bosses || []).slice(0, 4)) chips.push({ text: b.name, image: b.image, acc: true });
  const spawns = x.communityday?.spawns || [];
  if (spawns.length && !chips.length) chips.push({ text: 'Featured: ' + spawns.slice(0, 3).map((s) => s.name).join(', '), acc: true });
  for (const t of (x.bonuses || []).slice(0, 4)) chips.push({ text: t });
  if (!chips.length && x.generic) {
    if (x.generic.hasSpawns) chips.push({ text: 'New event spawns' });
    if (x.generic.hasFieldResearchTasks) chips.push({ text: 'Event field research' });
  }
  return chips;
}

function tlRowHtml(ev, i, showName = true) {
  const st = eventStatus(ev);
  let chips = eventBonusChips(ev).slice(0, 6);
  // bonus-first rows: if there is no bonus/activity data at all, the name is the only description we have
  if (!showName && !chips.length) chips = [{ text: ev.name }];
  return `<div class="tlRow ${st}" data-ev="${i}">
    <div class="dot"></div>
    <div class="tlCard">
      <div class="tlTop">
        <span class="tlType">${esc(ev.heading || 'Event')}</span>
        <span class="statusPill ${st}">${STATUS_LABEL[st]}</span>
      </div>
      ${showName ? `<h3>${esc(ev.name)}</h3>` : ''}
      <div class="tlWhen">${fmtDate(ev.start)} → ${fmtDate(ev.end)} · <b data-cd="${st === 'soon' ? ev.start : ev.end}" data-cd-pre="${st === 'soon' ? 'in ' : 'ends '}"></b></div>
      ${chips.length ? `<div class="chips">${chips.map((c) => `<span class="chip${c.acc ? ' hot' : ''}">${c.image ? `<img src="${esc(c.image)}" loading="lazy">` : ''}${esc(c.text)}</span>`).join('')}</div>` : ''}
    </div>
  </div>`;
}

// rewrite LeekDuck's long bonus sentences into compact labels
function simplifyBonus(t) {
  t = String(t).replace(/\s+/g, ' ').trim().replace(/\.$/, '');
  return t
    .replace(/(?:Increased|Even greater) chance for Trainers level 31 and up to receive Candy XL for transferring Pokémon/i, 'Transfer XL Candy chance up')
    .replace(/Trainers level 31 and above will receive one guaranteed Candy XL when trading Pokémon/i, 'Guaranteed XL Candy per trade')
    .replace(/Increased chance to receive Candy XL/i, 'XL Candy chance up')
    .replace(/Candy for transferring Pokémon/i, 'Transfer Candy')
    .replace(/Candy for catching Pokémon/i, 'Catch Candy')
    .replace(/Candy for trading Pokémon/i, 'Trade Candy')
    .replace(/Stardust for catching Pokémon/i, 'Catch Stardust')
    .replace(/XP for catching Pokémon/i, 'Catch XP')
    .replace(/(?:Stardust|XP) for hatching (?:Pokémon|Eggs)/i, (m) => m.replace(/ for hatching.*/i, '') + ' from Hatching')
    .replace(/Increased XP and Stardust from hatching Eggs/i, 'More Hatch XP & Stardust')
    .replace(/One additional Candy for trading Pokémon/i, '+1 Trade Candy')
    .replace(/ for completing /i, ' from ')
    .replace(/ during the event$/i, '');
}

// every bonus an event grants, with icons where the feed has them
function collectEventBonuses(ev) {
  const x = ev.extraData || {};
  const out = [];
  if (x.spotlight) {
    out.push({ text: `Featured: ${x.spotlight.name}${x.spotlight.canBeShiny ? ' ✨' : ''}`, image: x.spotlight.image });
    if (x.spotlight.bonus) out.push({ text: x.spotlight.bonus });
  }
  for (const b of x.communityday?.bonuses || []) out.push({ text: simplifyBonus(b.text), image: b.image });
  for (const b of x.breakthrough?.bonuses || []) out.push({ text: simplifyBonus(b.text), image: b.image });
  for (const b of x.bonuses || []) {
    let text = typeof b === 'string' ? b : b.text;
    let paid = typeof b === 'object' && !!b.paid;
    // some pages label the paid tier inline instead of in a separate section
    const inline = text.match(/^(?:GO Pass )?Deluxe(?: only)?:?\s+(.+)/i) || text.match(/^(.+?)\s*\((?:GO Pass )?Deluxe\)$/i);
    if (inline) { text = inline[1]; paid = true; }
    out.push({ text: simplifyBonus(text), paid });
  }
  return out;
}

// match each paid bonus with its free counterpart ("2× Candy…" / "3× Candy…")
function pairBonuses(list) {
  const key = (t) => t.replace(/^[\d.]+×?\s*/, '').replace(/\b(even greater|increased)\b/gi, '~').toLowerCase().trim();
  const free = list.filter((b) => !b.paid), paid = list.filter((b) => b.paid);
  const usedPaid = new Set();
  const rows = free.map((f) => {
    const idx = paid.findIndex((p, j) => !usedPaid.has(j) && key(p.text) === key(f.text));
    if (idx >= 0) usedPaid.add(idx);
    return { image: f.image, free: f.text, paidText: idx >= 0 ? paid[idx].text : null };
  });
  paid.forEach((p, j) => { if (!usedPaid.has(j)) rows.push({ image: p.image, paidOnly: p.text }); });
  return rows;
}

function bonusLinesHtml(list) {
  return pairBonuses(list).map((r) => {
    const icon = r.image ? `<img src="${esc(r.image)}" loading="lazy">` : '<span class="bDot">•</span>';
    if (r.paidOnly) return `<div class="bLine"><span class="bDot">•</span><span class="paidVal">${esc(r.paidOnly)} <span class="paidTag">PAID</span></span></div>`;
    if (r.paidText) {
      const fm = r.free.match(/^[\d.]+×?/), pm = r.paidText.match(/^[\d.]+×?/);
      if (fm && pm) {
        // "2×/3× Transfer Candy" — free mult, paid mult, shared label
        const rest = r.free.slice(fm[0].length).trim();
        return `<div class="bLine">${icon}<span>${esc(fm[0])}<span class="paidVal">/${esc(pm[0])}</span> ${esc(rest)} <span class="paidTag">PAID</span></span></div>`;
      }
      const extra = r.paidText === r.free
        ? ` <span class="paidVal">· boosted <span class="paidTag">PAID</span></span>`
        : ` <span class="paidVal">· ${esc(r.paidText)} <span class="paidTag">PAID</span></span>`;
      return `<div class="bLine">${icon}<span>${esc(r.free)}${extra}</span></div>`;
    }
    return `<div class="bLine">${icon}<span>${esc(r.free)}</span></div>`;
  }).join('');
}

// the headline resources: Stardust, XP, Candy — everything else lives in the detail sheet
const CORE_BONUS = /stardust|\bxp\b|candy/i;
const coreBonuses = (ev) => collectEventBonuses(ev).filter((b) => CORE_BONUS.test(b.text));

function bonusTlRow(ev, i) {
  const st = eventStatus(ev);
  const bl = coreBonuses(ev).slice(0, 10);
  return `<div class="tlRow ${st}" data-ev="${i}">
    <div class="dot"></div>
    <div class="tlCard">
      <div class="tlTop">
        <span class="tlType">${esc(ev.heading || 'Event')}</span>
        <span class="statusPill ${st}" data-cd="${st === 'soon' ? ev.start : ev.end}" data-cd-pre="${st === 'soon' ? 'starts in ' : 'ends in '}"></span>
      </div>
      <div class="tlWhen">${fmtDate(ev.start)} → ${fmtDate(ev.end)}</div>
      <div class="bList">${bonusLinesHtml(bl)}</div>
    </div>
  </div>`;
}

function goPassCardHtml(ev, i) {
  const gp = ev.extraData?.gopass;
  const st = eventStatus(ev);
  const li = (arr) => arr.map((t) => `<div class="gpItem">${esc(t)}</div>`).join('');
  return `<div class="card gpCard" data-ev="${i}">
    <div class="gpHead">
      <span class="tlType">GO Pass</span>
      <span class="statusPill ${st}" data-cd="${st === 'soon' ? ev.start : ev.end}" data-cd-pre="${st === 'soon' ? 'starts in ' : 'ends in '}"></span>
    </div>
    ${gp ? `<div class="gpCols">
      <div class="gpCol">
        <div class="gpTitle free">Free</div>
        ${li(gp.free)}
      </div>
      <div class="gpCol">
        <div class="gpTitle deluxe">Deluxe · Paid</div>
        <div class="gpNote">Everything in Free, upgraded to:</div>
        ${gp.deluxe.length ? li(gp.deluxe) : '<div class="gpItem">Extra rewards & faster rank progress</div>'}
      </div>
    </div>` : '<div class="gpNote" style="padding:0 12px 12px">Tap for rewards & details</div>'}
  </div>`;
}

function bindTl(el) {
  $$('.tlRow', el).forEach((c) => c.addEventListener('click', () => openEvent(data.events[+c.dataset.ev])));
}

/* ---------------- panels ---------------- */
const HOME_EXCLUDE = new Set(['go-pass', 'raid-battles', 'raid-hour', 'raid-day', 'raid-weekend']);
function renderHome() {
  const el = $('#p-home');
  const events = (data.events || []).filter((e) => eventStatus(e) !== 'past' && !HOME_EXCLUDE.has(e.eventType));
  const active = events.filter((e) => ['now', 'ending'].includes(eventStatus(e)))
    .sort((a, b) => parseT(a.end) - parseT(b.end));
  const upcoming = events.filter((e) => eventStatus(e) === 'soon')
    .sort((a, b) => parseT(a.start) - parseT(b.start));
  const goPass = (data.events || []).filter((e) => e.eventType === 'go-pass' && eventStatus(e) !== 'past')
    .sort((a, b) => parseT(a.start) - parseT(b.start))[0];
  const bActive = active.filter((e) => coreBonuses(e).length);
  const bUpcoming = upcoming.filter((e) => coreBonuses(e).length);

  el.innerHTML = `
    <div class="sectionTitle">Bonuses Right Now <span class="count">· ${bActive.length}</span></div>
    ${bActive.length ? `<div class="tl">${bActive.map((e) => bonusTlRow(e, data.events.indexOf(e))).join('')}</div>` : '<div class="empty">No active bonuses</div>'}
    <div class="sectionTitle">Bonuses Coming Up <span class="count">· ${bUpcoming.length}</span></div>
    ${bUpcoming.length ? `<div class="tl">${bUpcoming.map((e) => bonusTlRow(e, data.events.indexOf(e))).join('')}</div>` : '<div class="empty">No upcoming bonuses announced</div>'}
    <div class="sectionTitle">Live Now <span class="count">· ${active.length}</span></div>
    ${active.length ? `<div class="tl">${active.map((e) => tlRowHtml(e, data.events.indexOf(e), false)).join('')}</div>` : '<div class="empty">No live events right now</div>'}
    ${goPass ? `<div class="sectionTitle">GO Pass · Free vs Paid</div>${goPassCardHtml(goPass, data.events.indexOf(goPass))}` : ''}
    <div class="sectionTitle">Upcoming <span class="count">· ${upcoming.length}</span></div>
    ${upcoming.length ? `<div class="tl">${upcoming.map((e) => tlRowHtml(e, data.events.indexOf(e), false)).join('')}</div>` : '<div class="empty">Nothing scheduled yet</div>'}
  `;
  bindTl(el);
  $$('.gpCard', el).forEach((c) => c.addEventListener('click', () => openEvent(data.events[+c.dataset.ev])));
}

function raidRowHtml(r) {
  const types = (r.types || []).map((t) => t.name.toLowerCase());
  const weak = weaknesses(types);
  const counters = [...new Set(weak.slice(0, 3).map((w) => COUNTERS[w.type]).filter(Boolean).join(', ').split(', '))].slice(0, 3).join(', ');
  return `<div class="raidRow">
    <img class="mon" src="${esc(r.image)}" loading="lazy" alt="">
    <div class="rrMain">
      <div class="rrName">${esc(r.name)} ${r.canBeShiny ? '<span class="shiny">✨</span>' : ''}</div>
      <div class="rrTags">
        ${types.map((t) => `<span class="typeChip" style="background:${TYPE_COLORS[t] || '#888'}">${t}</span>`).join('')}
        ${(r.boostedWeather || []).map((w) => `<img class="w" src="${esc(w.image)}" title="${esc(w.name)} boost">`).join('')}
      </div>
      <div class="rrData">CP <b>${r.combatPower?.normal?.min ?? '?'}–${r.combatPower?.normal?.max ?? '?'}</b> · Boosted <b>${r.combatPower?.boosted?.min ?? '?'}–${r.combatPower?.boosted?.max ?? '?'}</b></div>
      <div class="rrWeak"><b>Weak:</b> ${weak.slice(0, 4).map((w) => `${w.type}${w.mult >= 4 ? '×4' : ''}`).join(', ') || '—'} · <b>Counters:</b> ${counters || '—'}</div>
    </div>
  </div>`;
}

function renderRaids() {
  const el = $('#p-raids');
  const raids = data.raids || [];
  const tiers = [
    ['Mega Raids', 'Mega Raids'], ['5-Star Raids', 'Tier 5 · Legendary'],
    ['3-Star Raids', 'Tier 3'], ['1-Star Raids', 'Tier 1'],
  ];
  const known = new Set(tiers.map((t) => t[0]));
  const other = [...new Set(raids.map((r) => r.tier).filter((t) => !known.has(t)))];
  const raidEvents = (data.events || []).filter((e) => ['raid-battles', 'raid-day', 'raid-hour'].includes(e.eventType) && eventStatus(e) !== 'past')
    .sort((a, b) => parseT(a.start) - parseT(b.start));
  el.innerHTML = `
    ${raidEvents.length ? `<div class="sectionTitle">Raid Schedule</div><div class="tl">${raidEvents.slice(0, 5).map((e) => tlRowHtml(e, data.events.indexOf(e))).join('')}</div>` : ''}
    ${tiers.concat(other.map((t) => [t, t])).map(([key, label], idx) => {
      const list = raids.filter((r) => r.tier === key);
      if (!list.length) return '';
      return `<div class="card">
        <button class="acc${idx < 2 ? ' open' : ''}">${label} <span style="color:var(--muted);font-weight:600;font-size:12px">${list.length} <span class="chev">›</span></span></button>
        <div class="accBody" style="padding:0">${list.map(raidRowHtml).join('')}</div>
      </div>`;
    }).join('') || '<div class="empty">No raid data available</div>'}
  `;
  $$('.acc', el).forEach((b) => b.addEventListener('click', () => b.classList.toggle('open')));
  bindTl(el);
}

function categorizeTask(text) {
  const t = text.toLowerCase();
  if (t.includes('catch')) return 'Catch';
  if (t.includes('throw') || t.includes('curveball')) return 'Throw';
  if (t.includes('raid') || t.includes('battle') || t.includes('rocket') || t.includes('grunt')) return 'Battle';
  if (t.includes('hatch') || t.includes('egg') || t.includes('buddy') || t.includes('walk')) return 'Hatch & Buddy';
  if (t.includes('spin') || t.includes('explore') || t.includes('snapshot') || t.includes('gift')) return 'Explore';
  if (t.includes('evolve') || t.includes('power up') || t.includes('candy')) return 'Evolve & Power Up';
  return 'Other';
}

function renderResearch() {
  const el = $('#p-research');
  const tasks = data.research || [];
  const groups = {};
  for (const t of tasks) (groups[categorizeTask(t.text || '')] ||= []).push(t);
  const evResearch = (data.events || []).filter((e) => e.extraData?.generic?.hasFieldResearchTasks && eventStatus(e) !== 'past');
  const order = ['Catch', 'Throw', 'Battle', 'Hatch & Buddy', 'Explore', 'Evolve & Power Up', 'Other'];
  el.innerHTML = `
    ${evResearch.length ? `<div class="sectionTitle">Event Research</div><div class="tl">${evResearch.map((e) => tlRowHtml(e, data.events.indexOf(e))).join('')}</div>` : ''}
    <div class="sectionTitle">Field Research <span class="count">· ${tasks.length} tasks</span></div>
    ${order.filter((g) => groups[g]?.length).map((g) => `
      <div class="card">
        <button class="acc">${g} <span style="color:var(--muted);font-weight:600;font-size:12px">${groups[g].length} <span class="chev">›</span></span></button>
        <div class="accBody">
          ${groups[g].map((t) => `<div class="taskRow">
            <div class="task">${esc(t.text)}</div>
            <div class="rewards">${(t.rewards || []).slice(0, 3).map((r) => `<span style="position:relative"><img src="${esc(r.image)}" title="${esc(r.name)}" loading="lazy">${r.canBeShiny ? '<span class="shiny" style="position:absolute;top:-2px;right:-2px;font-size:10px">✨</span>' : ''}</span>`).join('')}</div>
          </div>`).join('')}
        </div>
      </div>`).join('') || '<div class="empty">No research data available</div>'}
  `;
  $$('.acc', el).forEach((b) => b.addEventListener('click', () => b.classList.toggle('open')));
  bindTl(el);
}

function renderShowcase() {
  const el = $('#p-showcase');
  const shows = (data.events || []).filter((e) => (e.eventType || '').includes('showcase') || /showcase/i.test(e.name)).filter((e) => eventStatus(e) !== 'past')
    .sort((a, b) => parseT(a.start) - parseT(b.start));
  el.innerHTML = `
    <div class="sectionTitle">Pokéstop Showcases <span class="count">· ${shows.length}</span></div>
    ${shows.length ? `<div class="tl">${shows.map((e) => tlRowHtml(e, data.events.indexOf(e))).join('')}</div>`
      : '<div class="empty">No active showcases right now.<br>They appear here when Niantic announces them.</div>'}
  `;
  bindTl(el);
}

function renderNews() {
  const el = $('#p-news');
  const news = data.news || [];
  el.innerHTML = `
    <div class="sectionTitle">Latest News</div>
    ${news.length ? news.map((n) => `
      <div class="card newsCard" data-link="${esc(n.link)}">
        ${n.image ? `<img src="${esc(n.image)}" loading="lazy" alt="">` : ''}
        <div>
          <div class="nt">${esc(n.title)}</div>
          ${n.summary ? `<div class="nd">${esc(n.summary)}</div>` : ''}
          <div class="nd">${n.date ? fmtDate(n.date) : ''}</div>
        </div>
      </div>`).join('') : '<div class="empty">No news available</div>'}
  `;
  $$('.newsCard', el).forEach((c) => c.addEventListener('click', () => window.open(c.dataset.link, '_blank')));
}

function segHtml(id, options, current) {
  return `<div class="seg" id="${id}">${options.map((o) => `<button data-v="${o[0]}" class="${o[0] === current ? 'on' : ''}">${o[1]}</button>`).join('')}</div>`;
}
function switchHtml(id, checked) {
  return `<label class="switch"><input type="checkbox" id="${id}" ${checked ? 'checked' : ''}><span class="knob"></span></label>`;
}

function renderSettings() {
  const el = $('#p-settings');
  const n = settings.notif;
  el.innerHTML = `
    <div class="sectionTitle">Appearance</div>
    <div class="card setGroup">
      <div class="setRow"><div><div class="lbl">Theme</div></div>${segHtml('segTheme', [['dark', 'Dark'], ['light', 'Light'], ['auto', 'Auto']], settings.theme)}</div>
      <div class="setRow"><div><div class="lbl">Time format</div></div>${segHtml('segTf', [['12', '12h'], ['24', '24h']], settings.tf24 ? '24' : '12')}</div>
      <div class="setRow"><div><div class="lbl">Region</div><div class="sub">Event times shown in your device's timezone</div></div>${segHtml('segRegion', [['US', 'US'], ['EU', 'EU'], ['APAC', 'APAC']], settings.region)}</div>
    </div>
    <div class="sectionTitle">Notifications</div>
    <div class="card setGroup">
      <div class="setRow"><div><div class="lbl">Push notifications</div><div class="sub">Not available in this hosted version — push needs a server. The Mac edition supports them.</div></div></div>
    </div>
    <div class="sectionTitle">Data</div>
    <div class="card setGroup">
      <div class="setRow"><div><div class="lbl">Last updated</div><div class="sub">${data.fetchedAt ? fmtDate(data.fetchedAt) : 'never'} · auto-refreshes every 4h</div></div></div>
      <button class="btn" id="forceRefresh">Refresh data now</button>
      <div class="sub" style="margin-top:12px;line-height:1.6">Data: LeekDuck via ScrapedDuck · Pokémon GO Live.<br>Go Hub is a fan project, not affiliated with Niantic.</div>
    </div>
  `;

  const seg = (id, fn) => $$(`#${id} button`).forEach((b) => b.addEventListener('click', () => { fn(b.dataset.v); saveSettings(); renderSettings(); applyTheme(); renderAll(); }));
  seg('segTheme', (v) => settings.theme = v);
  seg('segTf', (v) => settings.tf24 = v === '24');
  seg('segRegion', (v) => settings.region = v);
  $('#forceRefresh').addEventListener('click', () => { toast('Refreshing…'); loadData(true); });
}

/* ---------------- event detail modal ---------------- */
function openEvent(ev) {
  if (!ev) return;
  const x = ev.extraData || {};
  const st = eventStatus(ev);
  const bonuses = (x.communityday?.bonuses || []).concat(x.raidbattles?.bonuses || [], (x.bonuses || []).map((b) => (typeof b === 'string' ? { text: b } : b)));
  const mons = x.communityday?.spawns || x.spotlight?.list || x.raidbattles?.bosses || [];
  const shinies = x.communityday?.shinies || x.raidbattles?.shinies || [];
  $('#modalCard').innerHTML = `
    <button id="modalClose">✕</button>
    ${ev.image ? `<img class="banner" src="${esc(ev.image)}" alt="">` : ''}
    <div class="inner">
      <div class="tlType">${esc(ev.heading || 'Event')}</div>
      <h2>${esc(ev.name)}</h2>
      <div class="chips">
        <span class="statusPill ${st}">${STATUS_LABEL[st] || ''}</span>
        <span class="statusPill ${st}" data-cd="${st === 'soon' ? ev.start : ev.end}" data-cd-pre="${st === 'soon' ? 'starts in ' : 'ends in '}"></span>
      </div>
      <div style="margin-top:10px;font-size:12.5px;color:var(--muted);line-height:1.6">
        <b style="color:var(--text)">Starts:</b> ${fmtDate(ev.start)}<br><b style="color:var(--text)">Ends:</b> ${fmtDate(ev.end)}
      </div>
      ${x.spotlight ? `<div class="bonusList"><div class="bi">⭐ <span>Featured: <b>${esc(x.spotlight.name)}</b>${x.spotlight.canBeShiny ? ' <span class="shiny">✨</span>' : ''}</span></div><div class="bi">🎁 <span>${esc(x.spotlight.bonus)}</span></div></div>` : ''}
      ${bonuses.length ? `<div class="sectionTitle">Bonuses</div><div class="bList">${bonusLinesHtml(bonuses)}</div>` : ''}
      ${mons.length ? `<div class="sectionTitle">Featured Pokémon</div><div class="miniMon">${mons.map((m) => `<img src="${esc(m.image)}" title="${esc(m.name)}">`).join('')}</div>` : ''}
      ${shinies.length ? `<div class="sectionTitle">Shiny Debuts</div><div class="miniMon">${shinies.map((m) => `<img src="${esc(m.image)}" title="${esc(m.name)}">`).join('')}</div>` : ''}
      ${x.communityday?.specialresearch?.length ? `<div class="sectionTitle">Special Research</div><div class="bonusList">${x.communityday.specialresearch.map((r) => `<div class="bi">📜 <span>${esc(r.name || r)}</span></div>`).join('')}</div>` : ''}
      <a class="linkOut" href="${esc(ev.link)}" target="_blank" rel="noopener">Full details on LeekDuck →</a>
    </div>`;
  $('#modal').classList.add('open');
  $('#modalClose').addEventListener('click', closeModal);
  tick();
}
const closeModal = () => $('#modal').classList.remove('open');
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });

/* ---------------- countdown ticker ---------------- */
function tick() {
  const t = now();
  $$('[data-cd]').forEach((el) => {
    const target = parseT(el.dataset.cd);
    el.textContent = (el.dataset.cdPre || '') + countdown(target - t);
  });
  const fa = data.fetchedAt ? Math.round((t - data.fetchedAt) / 60000) : null;
  $('#lastSync').textContent = fa === null ? '' : fa < 1 ? 'synced now' : fa < 60 ? `synced ${fa}m ago` : `synced ${Math.round(fa / 60)}h ago`;
}
setInterval(tick, 1000);

/* ---------------- tabs & swipe ---------------- */
const panels = $('#panels');
const tabs = $$('#tabbar button');
let currentTab = 0;
function setTab(i, scroll = true) {
  currentTab = i;
  tabs.forEach((b, j) => b.classList.toggle('active', j === i));
  if (scroll) animateTo(i * panels.clientWidth);
}
// manual animation: scroll-snap interrupts native smooth scrollTo on some browsers
let animRaf = 0;
function animateTo(target) {
  cancelAnimationFrame(animRaf);
  panels.style.scrollSnapType = 'none';
  const from = panels.scrollLeft, dist = target - from, t0 = performance.now(), dur = 260;
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    panels.scrollLeft = from + dist * e;
    if (k < 1) animRaf = requestAnimationFrame(step);
    else { panels.scrollLeft = target; panels.style.scrollSnapType = ''; }
  };
  animRaf = requestAnimationFrame(step);
}
tabs.forEach((b) => b.addEventListener('click', () => setTab(+b.dataset.tab)));
let scrollT;
panels.addEventListener('scroll', () => {
  clearTimeout(scrollT);
  scrollT = setTimeout(() => {
    const i = Math.round(panels.scrollLeft / panels.clientWidth);
    if (i !== currentTab) setTab(i, false);
  }, 80);
});

/* ---------------- pull to refresh ---------------- */
let ptrStart = null;
panels.addEventListener('touchstart', (e) => {
  const panel = e.target.closest('.panel');
  if (panel && panel.scrollTop <= 0) ptrStart = e.touches[0].clientY;
}, { passive: true });
panels.addEventListener('touchmove', (e) => {
  if (ptrStart === null) return;
  const dy = e.touches[0].clientY - ptrStart;
  $('#ptr').classList.toggle('armed', dy > 70);
}, { passive: true });
panels.addEventListener('touchend', () => {
  if ($('#ptr').classList.contains('armed')) { loadData(true); setTimeout(() => $('#ptr').classList.remove('armed'), 800); }
  ptrStart = null;
});

/* ---------------- boot ---------------- */
function renderAll() {
  renderHome(); renderRaids(); renderResearch(); renderShowcase(); renderNews(); renderSettings();
  tick();
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
$('#refreshBtn').addEventListener('click', () => {
  $('#refreshBtn').classList.add('spin');
  loadData(true).finally(() => setTimeout(() => $('#refreshBtn').classList.remove('spin'), 600));
});

$$('.panel').forEach((p) => p.innerHTML = '<div class="skel"></div><div class="skel"></div><div class="skel"></div>');
if (data.fetchedAt) renderAll();
loadData(false);
setInterval(() => loadData(false), 30 * 60 * 1000);
