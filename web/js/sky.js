// Celestial sphere. Background stars are directions, not places: they sit at
// infinity, so they rotate with the camera and nothing else. They never
// translate, never scale with the orbit zoom and never appear "between" the
// planets. Pure module, tested in web/tests/.

// Mean obliquity of the ecliptic at J2000.0 (IAU 1976), degrees.
export const OBLIQUITY_DEG = 23.4392911;

// Unit vector in the ecliptic J2000 frame (the frame of the simulation) for
// a star at right ascension / declination (equatorial J2000, degrees).
// The two frames share the x axis (the vernal equinox); the ecliptic is the
// equator rotated about it by the obliquity.
export function equatorialToEcliptic(raDeg, decDeg) {
  const ra = raDeg * Math.PI / 180, dec = decDeg * Math.PI / 180;
  const eps = OBLIQUITY_DEG * Math.PI / 180;
  const x = Math.cos(dec) * Math.cos(ra);
  const y = Math.cos(dec) * Math.sin(ra);
  const z = Math.sin(dec);
  return [x, y * Math.cos(eps) + z * Math.sin(eps), -y * Math.sin(eps) + z * Math.cos(eps)];
}

// Ecliptic longitude and latitude (degrees) of a unit vector.
export function eclipticLonLat(v) {
  const lon = (Math.atan2(v[1], v[0]) * 180 / Math.PI + 360) % 360;
  return [lon, Math.asin(Math.max(-1, Math.min(1, v[2]))) * 180 / Math.PI];
}

// Five colour classes from the B-V index, desaturated: on a real dark sky
// star colours are subtle.
const CLASSES = [
  [-0.05, "#b9cdff"],   // O, B
  [0.3, "#dfe7ff"],     // A, F
  [0.75, "#fff6e6"],    // G
  [1.2, "#ffdfb8"],     // K
  [9, "#ffc49a"],       // M
];
export function colorClass(bv) {
  for (let i = 0; i < CLASSES.length; i++) if (bv <= CLASSES[i][0]) return i;
  return CLASSES.length - 1;
}
export const CLASS_COLORS = CLASSES.map((c) => c[1]);

// Radius (px) and opacity from visual magnitude.
export const starRadius = (mag) => Math.max(0.55, Math.min(3.0, 2.3 - 0.4 * mag));
export const starAlpha = (mag) => Math.max(0.3, Math.min(1, 1.15 - 0.14 * mag));

// catalog: web/data/stars.json. Returns flat arrays sorted so that stars of
// the same colour class are contiguous (one fillStyle change per class).
export function buildSky(catalog) {
  const rows = catalog.stars.map((s, index) => ({ s, index, cls: colorClass(s[3]) }));
  const nameOf = new Map(catalog.names);
  rows.sort((a, b) => a.cls - b.cls || a.s[2] - b.s[2]);
  const n = rows.length;
  const dir = new Float32Array(3 * n), mag = new Float32Array(n), cls = new Uint8Array(n);
  const names = [];
  rows.forEach((r, i) => {
    const v = equatorialToEcliptic(r.s[0], r.s[1]);
    dir[3 * i] = v[0]; dir[3 * i + 1] = v[1]; dir[3 * i + 2] = v[2];
    mag[i] = r.s[2]; cls[i] = r.cls;
    if (nameOf.has(r.index)) names.push({ i, name: nameOf.get(r.index), mag: r.s[2], ra: r.s[0], dec: r.s[1] });
  });
  return { n, dir, mag, cls, names };
}
