#!/usr/bin/env node
/*  Runs in GitHub Actions on a schedule. Scrapes what the browser can't
 *  (LeekDuck event pages for bonus lists, GO Pass free/deluxe, official news)
 *  and writes enriched.json for the static site.  Node 20+, zero deps. */
'use strict';
const fs = require('fs');
const path = require('path');

const EVENTS_URL = 'https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/events.json';
const OUT = path.join(__dirname, '..', 'enriched.json');
const UA = { headers: { 'User-Agent': 'GoHub/1.0 (personal companion app)' } };

async function getText(url) {
  const res = await fetch(url, UA);
  if (!res.ok) throw new Error(url + ' HTTP ' + res.status);
  return res.text();
}

function parseBonuses(body) {
  const marks = [];
  for (const m of body.matchAll(/class="bonus-text">\s*([^<]+)/g)) marks.push({ pos: m.index, type: 'item', text: m[1].trim() });
  for (const m of body.matchAll(/Upgrade to the GO Pass Deluxe|strengthen the following bonus|Deluxe can also earn|purchas\w*[^.<]{0,60}ticket|ticket[^.<]{0,40}(?:exclusive|holders|will (?:also )?(?:receive|get|enjoy))/gi)) marks.push({ pos: m.index, type: 'paid' });
  for (const m of body.matchAll(/<h[23][^>]*>/g)) marks.push({ pos: m.index, type: 'reset' });
  marks.sort((a, b) => a.pos - b.pos);
  let paid = false;
  const out = [], seen = new Set();
  for (const mk of marks) {
    if (mk.type === 'reset') paid = false;
    else if (mk.type === 'paid') paid = true;
    else {
      const k = mk.text + '|' + paid;
      if (!seen.has(k)) { seen.add(k); out.push({ text: mk.text, paid }); }
    }
  }
  return out.slice(0, 16);
}

function parseGoPass(body) {
  const items = [...body.matchAll(/class="bonus-text">\s*([^<]+)/g)].map((m) => ({ pos: m.index, text: m[1].trim() }));
  const split = body.search(/strengthen the following bonus/);
  const free = items.filter((i) => split < 0 || i.pos < split).map((i) => i.text);
  const deluxe = split < 0 ? [] : items.filter((i) => i.pos >= split).map((i) => i.text);
  return (free.length || deluxe.length) ? { free, deluxe } : null;
}

async function fetchNews(events) {
  try {
    const html = await getText('https://pokemongolive.com/news?hl=en');
    const items = [];
    const re = /<a[^>]+href="(\/post\/[^"?]+)[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
    let m;
    while ((m = re.exec(html)) && items.length < 20) {
      const block = m[2];
      const title = ((block.match(/<h\d[^>]*>([\s\S]*?)<\/h\d>/) || [])[1] || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      const img = (block.match(/<img[^>]+src="([^"]+)"/) || [])[1] || '';
      if (title && !items.some((i) => i.link.endsWith(m[1]))) {
        items.push({ title, link: 'https://pokemongolive.com' + m[1], image: img, date: '', summary: '' });
      }
    }
    if (items.length >= 3) return items;
    throw new Error('too few items');
  } catch {
    return events.slice().sort((a, b) => new Date(b.start) - new Date(a.start)).slice(0, 20)
      .map((ev) => ({ title: ev.name, link: ev.link, image: ev.image, date: ev.start, summary: ev.heading || '' }));
  }
}

(async () => {
  const events = JSON.parse(await getText(EVENTS_URL));
  const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
  const horizon = Date.now() + 45 * 24 * 3600 * 1000;
  const bonuses = {}, gopass = {};

  for (const ev of events) {
    if (!ev.link) continue;
    const start = new Date(ev.start).getTime(), end = new Date(ev.end).getTime();
    if (isNaN(end) || end < Date.now() || start > horizon) continue;
    try {
      if (ev.eventType === 'go-pass') {
        const gp = parseGoPass(await getText(ev.link));
        if (gp) gopass[ev.eventID] = gp;
      } else if (!ev.extraData?.communityday && !ev.extraData?.spotlight) {
        // reuse the previous run's scrape; retry when it was empty (bonuses often announced late)
        const prevB = prev.bonuses?.[ev.eventID];
        bonuses[ev.eventID] = (prevB && prevB.length) ? prevB : parseBonuses(await getText(ev.link));
      }
    } catch (e) { console.error('scrape failed:', ev.eventID, e.message); }
  }

  const news = await fetchNews(events);
  fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), bonuses, gopass, news }, null, 1));
  console.log('enriched.json:', Object.keys(bonuses).length, 'events,', Object.keys(gopass).length, 'go-pass,', news.length, 'news');
})();
