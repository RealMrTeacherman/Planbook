// Subject colors, shared by every page. White text on a subject's color must reach 4.5:1.
(function () {
  // A subject's color and the pale wash its tile sits on.
  function tint(hex, keep = 0.16) {
    const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return '#E6EBF1';
    const n = parseInt(m[1], 16), mix = c => Math.round(c * keep + 255 * (1 - keep));
    return `rgb(${mix(n >> 16)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
  }
  // White text on the subject's color must reach 4.5:1, so a light color is deepened until it does.
  function deep(hex) {
    const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return '#45607C';
    let [r, g, b] = [0, 8, 16].map(sh => (parseInt(m[1], 16) >> (16 - sh)) & 255);
    const lum = () => [r, g, b].map(c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
    for (let i = 0; i < 40 && 1.05 / (lum() + 0.05) < 4.5; i++) { r = Math.round(r * 0.92); g = Math.round(g * 0.92); b = Math.round(b * 0.92); }
    return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
  }
  const api = { tint, deep };
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof window !== 'undefined') window.SuiteColors = api;
})();
