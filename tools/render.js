/**
 * HTML/CSS → PNG rendering core.
 *
 * Cards are authored as HTML strings (with inline CSS), turned into an element
 * tree by satori-html, laid out + outlined to SVG by satori, then rasterised to
 * a PNG Buffer by resvg. This replaces hand-drawn node-canvas for anything
 * card-shaped — real flexbox, rounded corners, shadows, gradients, web fonts.
 *
 *   renderCard(html, { width, height, scale }) → Promise<Buffer>
 *
 * Emoji: satori can't draw emoji from a text font, so we resolve each emoji to a
 * Twemoji SVG (cached on disk, then in memory). If the network is unavailable
 * the emoji is silently dropped rather than breaking the whole render.
 *
 * Design tokens (colors, gradients, fonts) live here so every card stays
 * visually consistent. Import THEME / panel() / etc. when building a card.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import satori from 'satori';
import { html as toElement } from 'satori-html';
import { Resvg } from '@resvg/resvg-js';
import { createLogger } from './logger.js';

const log = createLogger('render');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');
const EMOJI_DIR = path.join(__dirname, '..', 'assets', 'emoji-cache');

/* ─── Fonts (lazy, cached) ──────────────────────────────────────────────── */

let _fonts = null;
function fonts() {
  if (_fonts) return _fonts;
  const load = (file, weight) => {
    try {
      return { name: 'Poppins', data: fs.readFileSync(path.join(FONT_DIR, file)), weight, style: 'normal' };
    } catch (err) {
      log.warn('font missing', { file, error: err.message });
      return null;
    }
  };
  _fonts = [
    load('Poppins-Regular.ttf', 400),
    load('Poppins-Medium.ttf', 500),
    load('Poppins-SemiBold.ttf', 600),
    load('Poppins-Bold.ttf', 700),
    load('Poppins-ExtraBold.ttf', 800),
  ].filter(Boolean);
  if (!_fonts.length) throw new Error('no fonts available in assets/fonts');
  return _fonts;
}

/* ─── Emoji → Twemoji SVG (disk + memory cache) ─────────────────────────── */

const EMOJI_CDN = (code) => `https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/${code}.svg`;
const _emojiMem = new Map();

/** Twemoji codepoint filename (drops VS16 unless a keycap, lowercases, joins with '-'). */
function emojiCodePoints(emoji) {
  const pts = [];
  for (const ch of emoji) {
    const cp = ch.codePointAt(0);
    // strip variation selector-16 (FE0F) unless this is a keycap sequence (20E3)
    if (cp === 0xfe0f && !emoji.includes('⃣')) continue;
    pts.push(cp.toString(16));
  }
  return pts.join('-');
}

async function emojiDataUri(emoji) {
  if (_emojiMem.has(emoji)) return _emojiMem.get(emoji);
  const code = emojiCodePoints(emoji);
  if (!code) return '';
  const cacheFile = path.join(EMOJI_DIR, `${code}.svg`);

  let svg = null;
  try { svg = fs.readFileSync(cacheFile, 'utf8'); } catch {}

  if (!svg) {
    try {
      const res = await fetch(EMOJI_CDN(code));
      if (res.ok) {
        svg = await res.text();
        try { fs.mkdirSync(EMOJI_DIR, { recursive: true }); fs.writeFileSync(cacheFile, svg); } catch {}
      }
    } catch (err) {
      log.warn('emoji fetch failed', { emoji, error: err.message });
    }
  }

  const uri = svg ? `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}` : '';
  _emojiMem.set(emoji, uri);
  return uri;
}

/* ─── Public renderer ───────────────────────────────────────────────────── */

/**
 * @param {string} html  — a single root element with inline styles
 * @param {{width:number, height:number, scale?:number}} opts
 * @returns {Promise<Buffer>} PNG
 */
export async function renderCard(html, { width, height, scale = 2 } = {}) {
  const markup = toElement(html);
  const svg = await satori(markup, {
    width,
    height,
    fonts: fonts(),
    loadAdditionalAsset: async (code, segment) => {
      if (code === 'emoji') return await emojiDataUri(segment);
      return '';
    },
  });
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: Math.round(width * scale) } });
  return Buffer.from(resvg.render().asPng());
}

/* ─── Design tokens ─────────────────────────────────────────────────────── */

export const THEME = {
  font: 'Poppins',
  ink: '#f8fafc',
  inkSoft: '#cbd5e1',
  inkMuted: '#94a3b8',
  panel: 'rgba(255,255,255,0.06)',
  panelBorder: 'rgba(255,255,255,0.10)',
  // page backgrounds (linear-gradient strings)
  bg: 'linear-gradient(135deg, #0b1220 0%, #131f38 100%)',
  bgViolet: 'linear-gradient(160deg, #1e1b4b 0%, #4c1d95 55%, #7c3aed 100%)',
  bgEmerald: 'linear-gradient(150deg, #052e2b 0%, #064e3b 60%, #0f766e 100%)',
  accent: '#60a5fa',
  good: '#34d399',
  warn: '#fbbf24',
  bad: '#f87171',
  // semantic color for a 0-100 percentage (green→amber→red)
  grade(pct) {
    if (pct >= 100) return '#f87171';
    if (pct >= 80) return '#fb923c';
    if (pct >= 50) return '#fbbf24';
    return '#34d399';
  },
  wallet: {
    bank:    'linear-gradient(135deg, #3b82f6 0%, #1e3a8a 100%)',
    savings: 'linear-gradient(135deg, #22c55e 0%, #14532d 100%)',
    cash:    'linear-gradient(135deg, #f59e0b 0%, #b45309 100%)',
    other:   'linear-gradient(135deg, #a78bfa 0%, #5b21b6 100%)',
  },
};

/**
 * Make user text safe for satori-html. It only ever lands in text content
 * (never attributes), and satori-html does NOT decode HTML entities — so we
 * strip the markup-significant angle brackets and leave everything else
 * (including `&`, quotes, apostrophes) to render literally.
 */
export function esc(s) {
  return String(s ?? '').replace(/[<>]/g, '');
}

/** Short money formatting for big numbers on cards (12.3M, 450K). */
export function compact(n) {
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n / 1e9).toFixed(abs >= 1e10 ? 0 : 1) + 'B';
  if (abs >= 1e6) return (n / 1e6).toFixed(abs >= 1e7 ? 0 : 1) + 'M';
  if (abs >= 1e3) return (n / 1e3).toFixed(abs >= 1e4 ? 0 : 1) + 'K';
  return String(Math.round(n));
}
