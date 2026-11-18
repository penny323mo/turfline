const paths = {
  broadcast:
    '<circle cx="12" cy="12" r="2"/><path d="M7.5 7.5a6.4 6.4 0 0 0 0 9m9-9a6.4 6.4 0 0 1 0 9M4.4 4.5a10.6 10.6 0 0 0 0 15m15.2-15a10.6 10.6 0 0 1 0 15"/>',
  box: '<path d="m3 7 9-5 9 5v10l-9 5-9-5Zm0 0 9 5 9-5m-9 5v10m-4.5-17.5 9 5"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.8 8.9a2.4 2.4 0 1 1 3.1 2.3c-.8.3-1.1.7-1.1 2m.1 3h.01"/>',
  flag: '<path d="M4 21V4m0 1c5-4 10 3 16-1v10c-6 4-11-3-16 1Z"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  shrink: '<path d="M3 8h5V3m8 0v5h5M3 16h5v5m8 0v-5h5"/>',
  pause:
    '<path fill="currentColor" stroke="none" d="M5 4h5v16H5zm9 0h5v16h-5z"/>',
  play: '<path fill="currentColor" stroke="none" d="m6 3 14 9-14 9z"/>',
  restart: '<path d="M3 10a9 9 0 1 1 1 7m-1-7V4m0 6h6"/>',
  focus:
    '<path d="M8 3H4v4m12-4h4v4M4 17v4h4m12-4v4h-4"/><circle cx="12" cy="12" r="3"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  chevron: '<path d="m5 8 7 7 7-7"/>',
  camera:
    '<rect x="2" y="6" width="14" height="13" rx="2"/><path d="m16 10 6-4v13l-6-4"/>',
  aerial: '<path d="m2 12 10-6 10 6-10 6zm10-10v4m0 12v4"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  x: '<path d="m5 5 14 14m0-14L5 19"/>',
};
export function icon(key) {
  return (
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
    paths[key] +
    "</svg>"
  );
}
export function silk(number) {
  const cuts = [
    "M8 12h8v3H8z",
    "m8 7 8 7v3l-8-7z",
    "M8 8h2v10H8zm6 0h2v10h-2z",
    "m12 9 3 3-3 3-3-3z",
    "M8 11h8v2H8zm0 4h8v2H8z",
    "m8 9 4 3 4-3v3l-4 3-4-3z",
  ];
  return (
    '<svg class="silk" aria-hidden="true" viewBox="0 0 24 24"><path fill="currentColor" d="m8 4 2 1h4l2-1 3 2 4 6-4 3-2-3v8H7v-8l-2 3-4-3 4-6z"/><path fill="#fcf7e4" d="' +
    cuts[number - 1] +
    '"/><path d="m9.6 4.8 2.4 2 2.4-2" stroke="#3339" fill="none"/></svg>'
  );
}
