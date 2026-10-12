/**
 * Chunky outlined SVG icons in the game's toy style (drawn for this project).
 * Every icon is a 48×48 viewBox with a dark ink outline, so they read on any background
 * and look the same on every OS (unlike emoji).
 */
const INK = '#1b2238';
const S = `stroke="${INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;

const PATHS: Record<string, string> = {
  coin: `<circle cx="24" cy="24" r="17" fill="#ffc23d" ${S}/><circle cx="24" cy="24" r="11" fill="#ffd96b" stroke="#e39a17" stroke-width="2.5"/><path d="M27.5 19.5a6 6 0 1 0 0 9" fill="none" stroke="#b86d00" stroke-width="3.2" stroke-linecap="round"/><path d="M14 17a12 12 0 0 1 6-5" fill="none" stroke="#fff6cf" stroke-width="2.6" stroke-linecap="round"/>`,
  bag: `<path d="M15 15a9 9 0 0 1 18 0" fill="none" ${S}/><rect x="9" y="15" width="30" height="25" rx="7" fill="#46b8ff" ${S}/><rect x="15" y="25" width="18" height="10" rx="3" fill="#2a8ce0" ${S}/><path d="M13 19h22" stroke="#bfe8ff" stroke-width="2.4" stroke-linecap="round"/>`,
  book: `<path d="M8 11c6-2 11-1 16 3v26c-5-4-10-5-16-3z" fill="#b48bff" ${S}/><path d="M40 11c-6-2-11-1-16 3v26c5-4 10-5 16-3z" fill="#9a6cf5" ${S}/><path d="M12 18c3-.6 6 0 9 1.6M12 24c3-.6 6 0 9 1.6M36 18c-3-.6-6 0-9 1.6" stroke="#efe6ff" stroke-width="2.2" fill="none" stroke-linecap="round"/>`,
  shop: `<path d="M8 19l4-9h24l4 9z" fill="#ff6b6b" ${S}/><path d="M16 10l-2 9M24 10v9M32 10l2 9" ${S} fill="none"/><rect x="10" y="19" width="28" height="20" rx="3" fill="#fff3d6" ${S}/><rect x="18" y="26" width="12" height="13" rx="2" fill="#ffb63d" ${S}/>`,
  paw: `<ellipse cx="24" cy="31" rx="10" ry="8.5" fill="#ff8fd2" ${S}/><circle cx="12" cy="20" r="4.6" fill="#ff8fd2" ${S}/><circle cx="19" cy="12.5" r="4.6" fill="#ff8fd2" ${S}/><circle cx="29" cy="12.5" r="4.6" fill="#ff8fd2" ${S}/><circle cx="36" cy="20" r="4.6" fill="#ff8fd2" ${S}/><path d="M19 28c2-2 5-2.5 7-1.5" stroke="#ffd6ef" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
  gift: `<rect x="8" y="18" width="32" height="9" rx="2.5" fill="#ff5f7e" ${S}/><rect x="11" y="27" width="26" height="13" rx="2.5" fill="#ff7b95" ${S}/><path d="M24 18v22" ${S}/><path d="M24 18c-4-8-12-8-10-2 1 2 6 2 10 2zM24 18c4-8 12-8 10-2-1 2-6 2-10 2z" fill="#ffd23f" ${S}/>`,
  pause: `<rect x="13" y="11" width="8" height="26" rx="3" fill="#ffffff" ${S}/><rect x="27" y="11" width="8" height="26" rx="3" fill="#ffffff" ${S}/>`,
  gear: `<path d="M24 7l4 1 1 5 4 2 4-3 3 3-3 4 2 4 5 1 1 4-1 4-5 1-2 4 3 4-3 3-4-3-4 2-1 5-4 1-4-1-1-5-4-2-4 3-3-3 3-4-2-4-5-1-1-4 1-4 5-1 2-4-3-4 3-3 4 3 4-2 1-5z" fill="#cfd8e6" ${S}/><circle cx="24" cy="24" r="6" fill="#7c8aa5" ${S}/>`,
  star: `<path d="M24 6l5.4 11 12 1.7-8.7 8.5 2 12L24 33.5 13.3 39.2l2-12-8.7-8.5 12-1.7z" fill="#ffd23f" ${S}/><path d="M19 17l3-6" stroke="#fff6cf" stroke-width="2.4" stroke-linecap="round"/>`,
  fish: `<path d="M6 24l7-7v14z" fill="#ffb347" ${S}/><ellipse cx="25" cy="24" rx="15" ry="10" fill="#ffd27a" ${S}/><circle cx="32" cy="21.5" r="2.6" fill="${INK}"/><path d="M20 15l4-5 4 5" fill="#ff9a1f" ${S}/><path d="M20 28c3 2 7 2 10 0" stroke="#ffeec2" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
  egg: `<path d="M24 6c8 0 14 12 14 21a14 14 0 0 1-28 0C10 18 16 6 24 6z" fill="#bff3c0" ${S}/><circle cx="19" cy="25" r="3.4" fill="#5ccf6a"/><circle cx="29" cy="31" r="4" fill="#5ccf6a"/><circle cx="28" cy="17" r="2.6" fill="#5ccf6a"/><path d="M17 15c1-2 2.5-3.5 4-4.5" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>`,
  bolt: `<path d="M27 5L11 27h11l-3 16 18-24H25z" fill="#ffd23f" ${S}/>`,
  rod: `<path d="M10 40L38 8" stroke="${INK}" stroke-width="7" stroke-linecap="round"/><path d="M10 40L38 8" stroke="#c87b3e" stroke-width="3.5" stroke-linecap="round"/><path d="M38 8v22" stroke="${INK}" stroke-width="1.8"/><circle cx="38" cy="32" r="3.6" fill="#ff4d4d" ${S}/><circle cx="16" cy="33" r="5" fill="#9aa7bd" ${S}/>`,
  up: `<path d="M24 7l14 15h-8v18H18V22h-8z" fill="#7ee081" ${S}/>`,
  brush: `<path d="M30 8l10 10-14 14-10-10z" fill="#4fe3f0" ${S}/><path d="M16 22l10 10c-2 6-8 9-16 8 1-8 3-14 6-18z" fill="#ff8fd2" ${S}/>`,
  sun: `<path d="M24 5v6M24 37v6M5 24h6M37 24h6M10.5 10.5l4 4M33.5 33.5l4 4M10.5 37.5l4-4M33.5 14.5l4-4" stroke="${INK}" stroke-width="7" stroke-linecap="round"/><path d="M24 5v6M24 37v6M5 24h6M37 24h6M10.5 10.5l4 4M33.5 33.5l4 4M10.5 37.5l4-4M33.5 14.5l4-4" stroke="#ffd23f" stroke-width="3" stroke-linecap="round"/><circle cx="24" cy="24" r="9.5" fill="#ffd23f" ${S}/><path d="M19.5 21a5 5 0 0 1 4-3.5" stroke="#fff6cf" stroke-width="2.4" stroke-linecap="round" fill="none"/>`,
  moon: `<path d="M30 7a17 17 0 1 0 11 27A14 14 0 0 1 30 7z" fill="#ffe89a" ${S}/><circle cx="20" cy="28" r="2.4" fill="#e9c75a"/><circle cx="26" cy="35" r="1.8" fill="#e9c75a"/>`,
  ticket: `<path d="M7 15h34v6a3 3 0 0 0 0 6v6H7v-6a3 3 0 0 0 0-6z" fill="#ffb3e6" ${S}/><path d="M29 15v18" stroke="${INK}" stroke-width="2.4" stroke-dasharray="3 3"/>`,
  lock: `<path d="M16 21v-5a8 8 0 0 1 16 0v5" fill="none" ${S}/><rect x="11" y="21" width="26" height="20" rx="5" fill="#ffc23d" ${S}/><circle cx="24" cy="30" r="2.8" fill="${INK}"/><path d="M24 31v4" ${S}/>`,
  close: `<path d="M14 14l20 20M34 14L14 34" stroke="${INK}" stroke-width="10" stroke-linecap="round"/><path d="M14 14l20 20M34 14L14 34" stroke="#ffffff" stroke-width="5" stroke-linecap="round"/>`,
  check: `<path d="M10 25l9 9 19-20" stroke="${INK}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M10 25l9 9 19-20" stroke="#7ee081" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  fire: `<path d="M24 5c2 7 12 11 12 22a12 12 0 0 1-24 0c0-6 3-9 5-11 0 4 2 6 4 6-2-6 0-12 3-17z" fill="#ff7a2a" ${S}/><path d="M24 26c2 3 5 4 5 8a5 5 0 0 1-10 0c0-3 3-4 5-8z" fill="#ffd23f"/>`,
  clover: `<circle cx="18" cy="18" r="7" fill="#7ee081" ${S}/><circle cx="30" cy="18" r="7" fill="#7ee081" ${S}/><circle cx="18" cy="30" r="7" fill="#7ee081" ${S}/><circle cx="30" cy="30" r="7" fill="#7ee081" ${S}/><path d="M30 30l8 10" ${S}/>`,
  reel: `<circle cx="24" cy="24" r="15" fill="#6ff3ff" ${S}/><circle cx="24" cy="24" r="5" fill="#ffffff" ${S}/><path d="M24 9v6M24 33v6M9 24h6M33 24h6" ${S}/>`,
  quest: `<rect x="10" y="7" width="28" height="34" rx="5" fill="#fff3d6" ${S}/><path d="M16 17h16M16 24h16M16 31h10" ${S}/><path d="M33 4l4 4" stroke="#ff5f7e" stroke-width="3"/>`,
  sparkle: `<path d="M24 5c2 11 8 17 19 19-11 2-17 8-19 19-2-11-8-17-19-19 11-2 17-8 19-19z" fill="#fff3a6" ${S}/>`,
  cart: `<path d="M5 9h6l5 21h22l4-15H13" fill="none" ${S}/><path d="M14 15h28l-4 15H16z" fill="#7ee081" ${S}/><circle cx="19" cy="38" r="3.5" fill="#fff" ${S}/><circle cx="34" cy="38" r="3.5" fill="#fff" ${S}/>`,
  globe: `<circle cx="24" cy="24" r="17" fill="#4fc3ff" ${S}/><path d="M12 15c5 2 7 6 5 10s-1 8 3 10M30 9c-2 4 0 7 4 8s6 5 4 9M24 41c2-4 6-5 9-4" fill="#7ee081" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/><path d="M15 14a12 12 0 0 1 8-5" stroke="#d6f4ff" stroke-width="2.6" fill="none" stroke-linecap="round"/>`,
  plus: `<path d="M24 11v26M11 24h26" stroke="${INK}" stroke-width="11" stroke-linecap="round"/><path d="M24 11v26M11 24h26" stroke="#ffffff" stroke-width="5.5" stroke-linecap="round"/>`,
};

export type IconName = keyof typeof PATHS;

/** Inline SVG markup for an icon. */
export function icon(name: IconName | string, cls = 'gi'): string {
  const p = PATHS[name] ?? PATHS.star;
  return `<svg class="${cls}" viewBox="0 0 48 48" aria-hidden="true" focusable="false">${p}</svg>`;
}

/** Icon as a DOM element (span wrapper so it can sit inside flex rows). */
export function iconEl(name: IconName | string, cls = 'gi'): HTMLSpanElement {
  const s = document.createElement('span');
  s.className = `${cls}-wrap`;
  s.innerHTML = icon(name, cls);
  return s;
}
