/* 人物立绘：纯手写 SVG，无外部图片与字体。
 * 三个动画挂点别动：.portrait-body（呼吸） .portrait-head（微转头） .portrait-eyes（眨眼）。
 * 画法：先铺大色块 → 再压阴影/褶皱 → 最后加皮肤渐变、眉毛、眼球高光、发丝与轮廓光，
 * 让它比纯平涂更接近 CG 的观感。 */
(function (global) {
'use strict';
const SP = global.SP;

const PRESETS = {
  man:     { label: '小满',   hair: '#3a4143', hair2: '#5b6a6b', coat: '#c07a5f', shadow: '#9c5a45', shirt: '#f4e8d2', accent: '#e0ac74', skin: '#f3d9c0', style: 'bob' },
  cheng:   { label: '程野',   hair: '#2f3a42', hair2: '#4c5f68', coat: '#6f948b', shadow: '#4a6b64', shirt: '#ecead9', accent: '#c2b489', skin: '#ecd0b4', style: 'short' },
  yan:     { label: '阿言',   hair: '#454047', hair2: '#6b6470', coat: '#6f7f9c', shadow: '#495670', shirt: '#efe6d7', accent: '#cca87f', skin: '#f1d6bd', style: 'part' },
  mom:     { label: '妈妈',   hair: '#4c4041', hair2: '#6f5f60', coat: '#ad8f92', shadow: '#8a6a72', shirt: '#f2e7d7', accent: '#d8bd8e', skin: '#eac9b2', style: 'bun' },
  aunt:    { label: '陈姨',   hair: '#3d3d3b', hair2: '#5c5c58', coat: '#9aa08a', shadow: '#6e7563', shirt: '#efe2ca', accent: '#c39a76', skin: '#e4c6a9', style: 'bun' },
  teacher: { label: '周老师', hair: '#43464a', hair2: '#666b70', coat: '#828d96', shadow: '#5a6772', shirt: '#f2e8d6', accent: '#cdb489', skin: '#e9cdb4', style: 'part' },
  me:      { label: '我',     hair: '#3a4c51', hair2: '#5a6f73', coat: '#7d9793', shadow: '#537170', shirt: '#efe8d6', accent: '#c2a077', skin: '#ecd1b8', style: 'short' },
};

const P = (d, fill, stroke = '', w = 1.5) =>
  `<path d="${d}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"` : ''}/>`;

/* 眉毛：让脸有表情的重心（原来没有眉毛，是"像伪人"的主要原因之一） */
function brows(ink, expr) {
  const soft = 'M144 141q13 -7 27 -1';
  const soft2 = 'M189 140q14 -6 27 2';
  if (expr === 'worry' || expr === 'sad') {
    return P('M144 137q13 -3 27 3', 'none', ink, 2.1) + P('M189 140q14 -5 27 -1', 'none', ink, 2.1);
  }
  if (expr === 'think') {
    return P('M145 138q13 -6 26 0', 'none', ink, 2) + P('M190 143q13 -7 25 -2', 'none', ink, 2);
  }
  if (expr === 'laugh') {
    return P('M143 138q14 -8 28 -1', 'none', ink, 2.2) + P('M188 137q14 -7 28 2', 'none', ink, 2.2);
  }
  return P(soft, 'none', ink, 2) + P(soft2, 'none', ink, 2);
}

function face(expr, id) {
  const ink = '#4f4a46';
  const iris = `url(#${id}-iris)`;
  let lids = '';
  if (['laugh', 'smile'].includes(expr)) {
    // 弯月眼：笑起来的眼睛
    lids = P('M147 157q10 -11 21 -1 M192 156q10 -11 21 -1', 'none', ink, 2.6);
  } else if (['sad', 'worry'].includes(expr)) {
    lids = P('M147 158q10 6 21 1 M192 157q10 6 21 0', 'none', ink, 2.2);
  } else {
    // 常态：上眼睑一条粗线 + 眼球
    lids = P('M145 153q11 -6 23 0 M190 152q11 -6 23 0', 'none', ink, 2.4)
      + `<g class="portrait-eyes">`
      +   `<ellipse cx="158" cy="159" rx="6.4" ry="6.8" fill="${iris}"/>`
      +   `<ellipse cx="158" cy="159.5" rx="2.9" ry="3.4" fill="#3b3a38"/>`
      +   `<circle cx="160" cy="156" r="2.1" fill="#ffffff" opacity=".92"/>`
      +   `<circle cx="155.6" cy="161.4" r="1" fill="#ffffff" opacity=".55"/>`
      +   `<ellipse cx="201" cy="158" rx="6.4" ry="6.8" fill="${iris}"/>`
      +   `<ellipse cx="201" cy="158.5" rx="2.9" ry="3.4" fill="#3b3a38"/>`
      +   `<circle cx="203" cy="155" r="2.1" fill="#ffffff" opacity=".92"/>`
      +   `<circle cx="198.6" cy="160.4" r="1" fill="#ffffff" opacity=".55"/>`
      +   `<path d="M145 165q11 4 23 0" fill="none" stroke="#c39a86" stroke-width="1.1"/>`
      +   `<path d="M190 164q11 4 23 0" fill="none" stroke="#c39a86" stroke-width="1.1"/>`
      + `</g>`;
  }
  const mouth = expr === 'laugh'
    ? P('M168 189q13 6 26 -1q-11 24 -26 1', '#a86a5c')
    : expr === 'sad' ? P('M172 195q9 -4 19 0', 'none', '#986f61', 1.7)
    : expr === 'think' ? P('M174 192h15', 'none', '#986f61', 1.7)
    : P('M170 191q11 7 23 -1', 'none', '#986f61', 1.7);
  // 腮红：柔边椭圆，不是一坨色块
  const blush = `<g opacity=".5">`
    + `<ellipse cx="147" cy="180" rx="12" ry="5.4" fill="#e79a86" opacity=".26"/>`
    + `<ellipse cx="215" cy="178" rx="12" ry="5.4" fill="#e79a86" opacity=".26"/>`
    + `<ellipse cx="152" cy="178" rx="7" ry="3" fill="#f2b7a4" opacity=".22"/>`
    + `</g>`;
  return brows(ink, expr) + lids
    + P('M181 161l-3 14 6 1', 'none', '#c39780', 1.2)
    + mouth + blush;
}

function build(key, expr = 'calm', opts = {}) {
  const c = PRESETS[key] || PRESETS.me;
  const ink = c.shadow, skin = c.skin;
  const id = 'portrait-' + key;
  const bob = c.style === 'bob', short = c.style === 'short', bun = c.style === 'bun';

  const hairBack = bob
    ? 'M119 138Q108 70 170 67Q228 60 244 125L251 221Q219 251 183 237Q135 253 109 224Z'
    : bun
      ? 'M125 135Q111 77 177 70Q232 65 241 132L234 198L128 198Z'
      : 'M123 145Q104 81 162 66Q224 54 241 117L237 188L127 185Z';

  let body = '';
  // 衣服：先铺大块，再压肩缝与褶皱
  body += P('M149 247Q100 246 81 280Q61 332 51 437L66 557H301L309 429Q300 323 271 282Q249 252 211 246Z', `url(#${id}-coat)`);
  body += P('M156 246L201 245L225 558H129Z', c.shirt);
  body += P('M150 245L125 274L139 333L111 556H73L90 301Q105 259 150 245Z', c.coat);
  body += P('M207 245L238 265L222 310L253 556H291L278 302Q260 258 207 245Z', c.coat);
  body += P('M123 283L139 333L113 479 M237 279L222 310L246 481 M91 316L82 391 M271 323L281 387', 'none', ink, 2);
  body += P('M151 271Q176 294 207 269 M149 291Q175 308 205 288', 'none', '#cfc5ae', 1.5);
  body += P('M125 341l-25 8 4 46 21 -5 M250 338l17 5 -3 38 -17 -3', 'none', ink, 1.5);
  // 轮廓光：左肩一道亮边，脸和衣服才不糊成一片
  body += P('M150 245Q105 259 90 301L73 556L84 556L100 306Q112 266 156 249Z', '#ffffff', '', 0);
  body += `<path d="M149 247Q100 246 81 280Q61 332 51 437" fill="none" stroke="#ffffff" stroke-width="3" opacity=".26" stroke-linecap="round"/>`;

  if (key === 'man') {
    body += P('M86 348Q70 404 108 433L175 424L170 397L123 400L117 351Z', c.coat, ink);
    body += P('M277 350Q299 403 269 427L222 451L211 425L252 394L249 349Z', c.coat, ink);
    body += P('M167 399q17 -7 28 3l14 13 -11 15 -28 -7Z', skin, '#b99780');
    body += P('M218 427q-10 -7 -17 0l-13 15 14 13 20 -8Z', skin, '#b99780');
    body += P('M148 253Q135 323 169 418 M209 253Q237 325 227 421', 'none', '#3c4947', 6);
    body += `<g transform="translate(158 401) rotate(-8)"><rect x="0" y="0" width="72" height="46" rx="7" fill="#344340"/><rect x="8" y="-7" width="22" height="10" rx="3" fill="#465550"/><circle cx="39" cy="24" r="18" fill="#788981"/><circle cx="39" cy="24" r="13" fill="#24363b"/><circle cx="36" cy="20" r="5" fill="#a5cbc3" opacity=".55"/><rect x="5" y="7" width="12" height="5" rx="2" fill="#d8d5ba"/></g>`;
  } else if (key === 'cheng') {
    body += P('M94 344L104 466L141 504L159 482L132 444L133 350Z', c.coat, ink);
    body += P('M157 480q17 5 20 21l-7 18 -17 -7 -12 -13Z', skin, '#b99780');
    body += P('M272 343Q303 420 249 443L195 425L203 395L249 403L242 350Z', c.coat, ink);
    body += P('M204 396q-14 -8 -28 -3l-14 14 8 13 29 5Z', skin, '#b99780');
    body += `<g transform="translate(161 378) rotate(12)"><rect width="34" height="55" rx="5" fill="#3e5057"/><rect x="4" y="5" width="26" height="41" rx="2" fill="#aabeb5"/><path d="M9 15h16M9 21h10" stroke="#e9ede0"/></g>`;
    body += P('M145 247Q124 274 146 306M208 247Q230 274 209 306', 'none', c.shadow, 12);
    body += '<rect x="134" y="282" width="18" height="29" rx="8" fill="#364b50"/><rect x="202" y="282" width="18" height="29" rx="8" fill="#364b50"/>';
  } else {
    if (key === 'aunt') {
      body += P('M134 285H222L248 556H111Z', '#dccaa4', c.shadow) + P('M139 285L151 246M216 285L204 246', 'none', '#dccaa4', 7) + P('M139 410h65v48h-65z', 'none', '#a29477');
    }
    body += P('M87 350Q67 420 121 445L202 426L196 398L129 407L119 352Z', c.coat, ink);
    body += P('M192 400q19 -10 32 0l12 12 -13 15 -24 -3Z', skin, '#b99780');
    body += P('M271 354Q298 418 252 451L210 470L199 444L237 413L240 356Z', c.coat, ink);
    body += P('M208 444q-11 -6 -20 3l-9 14 15 10 18 -5Z', skin, '#b99780');
    if (key !== 'aunt') {
      body += `<g transform="translate(164 362) rotate(8)"><rect width="67" height="96" rx="3" fill="${c.accent}"/><path d="M6 0v96" stroke="${ink}" opacity=".5"/><rect x="15" y="17" width="38" height="1" fill="#fff4dd"/><rect x="15" y="23" width="25" height="1" fill="#fff4dd"/><path d="M60 0v25l-5 -6 -5 6V0" fill="#e5d5b6"/></g>`;
    } else {
      // 陈姨：一把普通单头汤勺
      body += `<g transform="translate(196 420) rotate(24)"><rect x="0" y="0" width="58" height="7" rx="3.5" fill="#b9c0bd"/><ellipse cx="62" cy="3.5" rx="12" ry="8" fill="#cdd4d1"/><ellipse cx="62" cy="3.5" rx="8" ry="5" fill="#aab2af"/></g>`;
    }
  }

  const neck = P('M154 201L153 250Q177 275 207 247L204 200Z', `url(#${id}-skin)`)
    + P('M155 214Q183 235 204 210L204 228Q181 245 154 225Z', '#c99b83');

  // 头发：底色 + 高光发丝 + 边缘轮廓光
  const hairFront = bob
    ? 'M119 143Q108 83 161 71Q217 60 240 119L235 199L221 216L219 134Q191 132 173 104Q162 134 133 141L134 207L119 218Z'
    : short
      ? 'M119 143L113 111L126 114L122 91L139 96L153 66L169 77L193 65L211 81L229 87L246 122L231 151L220 128L205 117L191 123L177 103L157 124L139 125L132 155Z'
      : 'M120 151Q112 90 164 75Q215 64 239 112L232 162L219 140L212 109Q171 149 137 132L132 168Z';
  const hairShine = bob
    ? 'M132 100Q143 79 175 78'
    : short ? 'M143 99L158 84M178 91L195 83' : 'M136 108Q163 83 198 88';
  const head =
    P(hairBack, c.hair)
    + (bun ? `<ellipse cx="239" cy="100" rx="29" ry="31" fill="${c.hair}"/>` : '')
    + '<ellipse cx="130" cy="165" rx="10" ry="15" fill="' + skin + '"/><ellipse cx="230" cy="161" rx="10" ry="15" fill="' + skin + '"/>'
    + P('M132 128Q139 88 183 94Q223 98 230 130L226 185Q214 221 183 231Q152 223 137 193Z', `url(#${id}-skin)`)
    + P('M225 145L225 182Q212 216 185 229Q208 212 212 190Z', '#dcb79c')
    + face(expr, id)
    + P(hairFront, c.hair)
    // 发丝高光
    + P(hairShine, 'none', c.hair2, 2.6)
    + P(bob ? 'M196 84Q226 92 233 128' : 'M198 88Q226 98 232 132', 'none', c.hair2, 1.6)
    + `<path d="M119 143Q108 83 161 71Q217 60 240 119" fill="none" stroke="#ffffff" stroke-width="2.6" opacity=".22" stroke-linecap="round"/>`;

  let accessory = '';
  if (key === 'man') accessory = '<path d="M125 151l-1 19" stroke="#e6bd7f" stroke-width="4" stroke-linecap="round"/>';
  if (['cheng', 'teacher'].includes(key)) {
    accessory = '<g fill="none" stroke="#5d6a64" stroke-width="1.7"><rect x="141" y="145" width="33" height="23" rx="8"/><rect x="190" y="144" width="33" height="23" rx="8"/><path d="M174 154q8 -4 16 0M130 149l11 2M223 150l9 -3"/>'
      + '<path d="M145 149q6 -4 13 -3" stroke="#ffffff" stroke-width="1.4" opacity=".7"/></g>';
  }

  const flip = opts.flip ? 'translate(360 0) scale(-1 1)' : '';
  const defs = `<defs>`
    + `<linearGradient id="${id}-coat" x2=".9" y2="1"><stop stop-color="${c.coat}"/><stop offset="1" stop-color="${c.shadow}"/></linearGradient>`
    + `<radialGradient id="${id}-skin" cx=".36" cy=".3" r=".78"><stop stop-color="#fff6ea" stop-opacity=".85"/><stop offset=".55" stop-color="${skin}"/><stop offset="1" stop-color="${c.shadow}" stop-opacity=".38"/></radialGradient>`
    + `<radialGradient id="${id}-iris" cx=".4" cy=".34" r=".72"><stop stop-color="#6f5a48"/><stop offset=".7" stop-color="#43352c"/><stop offset="1" stop-color="#2b211c"/></radialGradient>`
    + `</defs>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 560" role="img" aria-label="${c.label}，${expr}" class="ch-svg">${defs}<g transform="${flip}"><g class="portrait-body">${body}${neck}<g class="portrait-head">${head}${accessory}</g></g></g></svg>`;
}

SP.character = { build, PRESETS, VB: { w: 360, h: 560 } };
})(window);
