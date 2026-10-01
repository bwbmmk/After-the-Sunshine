/* Original vector portraits for 留一盏灯. No remote images or fonts. */
(function(global){
'use strict';const SP=global.SP;
const PRESETS={
 man:{label:'小满',hair:'#313e40',coat:'#b46e56',shadow:'#92523f',shirt:'#efe3c9',accent:'#dcab77',skin:'#efd5bc',style:'bob'},
 cheng:{label:'程野',hair:'#29363e',coat:'#66857e',shadow:'#45655e',shirt:'#e8e5d4',accent:'#baaf80',skin:'#e9ccb1',style:'short'},
 yan:{label:'阿言',hair:'#403c40',coat:'#64738c',shadow:'#424f67',shirt:'#e9dfd0',accent:'#c7a17c',skin:'#eed2ba',style:'part'},
 mom:{label:'妈妈',hair:'#463c3c',coat:'#a48285',shadow:'#805f67',shirt:'#eee3d3',accent:'#d2b687',skin:'#e6c5af',style:'bun'},
 aunt:{label:'陈姨',hair:'#393938',coat:'#939782',shadow:'#676e5d',shirt:'#e9dcc5',accent:'#bc9472',skin:'#dec0a4',style:'bun'},
 teacher:{label:'周老师',hair:'#3f4143',coat:'#79838b',shadow:'#53606b',shirt:'#eee4d2',accent:'#c7ad84',skin:'#e5c9b1',style:'part'},
 me:{label:'我',hair:'#34464b',coat:'#748d8a',shadow:'#4b6a69',shirt:'#e9e3d1',accent:'#bd9b75',skin:'#e8ceb5',style:'short'}
};
const P=(d,fill,stroke='',w=1.5)=>`<path d="${d}" fill="${fill}"${stroke?` stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`:''}/>`;
function face(expr){
 const ink='#514d49';let eyes='';
 if(['laugh','smile'].includes(expr))eyes=P('M148 158q9 -9 18 0 M194 157q9 -9 18 0','none',ink,2);
 else if(['sad','worry'].includes(expr))eyes=P('M148 159q9 5 18 0 M194 158q9 5 18 0 M148 144l17 5 M194 148l16 -5','none',ink,1.7);
 else eyes=P('M146 155q10 -5 21 0 M194 154q10 -5 21 0','none',ink,1.9)+'<g class="portrait-eyes"><ellipse cx="159" cy="157" rx="3" ry="4.3" fill="#454847"/><ellipse cx="201" cy="156" rx="3" ry="4.3" fill="#454847"/></g>';
 const mouth=expr==='laugh'?P('M170 190q11 5 23 -1q-10 21 -23 1','#a46d61'):P(expr==='sad'?'M172 195q9 -4 19 0':expr==='think'?'M174 192l15 0':'M170 191q11 7 23 -1','none','#986f61',1.6);
 return eyes+P('M181 160l-3 15 6 1','none','#c39780',1.2)+mouth+'<ellipse cx="147" cy="179" rx="9" ry="3" fill="#c48373" opacity=".17"/><ellipse cx="215" cy="177" rx="9" ry="3" fill="#c48373" opacity=".17"/>';
}
function build(key,expr='calm',opts={}){
 const c=PRESETS[key]||PRESETS.me,ink=c.shadow,skin=c.skin;
 const id='portrait-'+key, bob=c.style==='bob',short=c.style==='short',bun=c.style==='bun';
 const hairBack=bob?'M119 138Q108 70 170 67Q228 60 244 125L251 221Q219 251 183 237Q135 253 109 224Z':bun?'M125 135Q111 77 177 70Q232 65 241 132L234 198L128 198Z':'M123 145Q104 81 162 66Q224 54 241 117L237 188L127 185Z';
 let body='';
 // Broad cloth planes, then shoulder seams and small folds: more natural than a shared doll silhouette.
 body+=P('M149 247Q100 246 81 280Q61 332 51 437L66 557H301L309 429Q300 323 271 282Q249 252 211 246Z',`url(#${id}-coat)`);
 body+=P('M156 246L201 245L225 558H129Z',c.shirt);
 body+=P('M150 245L125 274L139 333L111 556H73L90 301Q105 259 150 245Z',c.coat);
 body+=P('M207 245L238 265L222 310L253 556H291L278 302Q260 258 207 245Z',c.coat);
 body+=P('M123 283L139 333L113 479 M237 279L222 310L246 481 M91 316L82 391 M271 323L281 387','none',ink,2);
 body+=P('M151 271Q176 294 207 269 M149 291Q175 308 205 288','none','#c6bca5',1.5);
 body+=P('M125 341l-25 8 4 46 21 -5 M250 338l17 5 -3 38 -17 -3','none',ink,1.5);
 // Bent forearms and hands give each character a reason to be in the scene.
 if(key==='man'){
  body+=P('M86 348Q70 404 108 433L175 424L170 397L123 400L117 351Z',c.coat,ink);
  body+=P('M277 350Q299 403 269 427L222 451L211 425L252 394L249 349Z',c.coat,ink);
  body+=P('M167 399q17 -7 28 3l14 13 -11 15 -28 -7Z',skin,'#b99780');
  body+=P('M218 427q-10 -7 -17 0l-13 15 14 13 20 -8Z',skin,'#b99780');
  body+=P('M148 253Q135 323 169 418 M209 253Q237 325 227 421','none','#3c4947',6);
  body+='<g transform="translate(158 401) rotate(-8)"><rect x="0" y="0" width="72" height="46" rx="7" fill="#344340"/><rect x="8" y="-7" width="22" height="10" rx="3" fill="#465550"/><circle cx="39" cy="24" r="18" fill="#788981"/><circle cx="39" cy="24" r="13" fill="#24363b"/><circle cx="36" cy="20" r="5" fill="#a5cbc3" opacity=".55"/><rect x="5" y="7" width="12" height="5" rx="2" fill="#d8d5ba"/></g>';
 }else if(key==='cheng'){
  body+=P('M94 344L104 466L141 504L159 482L132 444L133 350Z',c.coat,ink);
  body+=P('M157 480q17 5 20 21l-7 18 -17 -7 -12 -13Z',skin,'#b99780');
  body+=P('M272 343Q303 420 249 443L195 425L203 395L249 403L242 350Z',c.coat,ink);
  body+=P('M204 396q-14 -8 -28 -3l-14 14 8 13 29 5Z',skin,'#b99780');
  body+='<g transform="translate(161 378) rotate(12)"><rect width="34" height="55" rx="5" fill="#3e5057"/><rect x="4" y="5" width="26" height="41" rx="2" fill="#aabeb5"/><path d="M9 15h16M9 21h10" stroke="#e9ede0"/></g>';
  body+=P('M145 247Q124 274 146 306M208 247Q230 274 209 306','none',c.shadow,12);
  body+='<rect x="134" y="282" width="18" height="29" rx="8" fill="#364b50"/><rect x="202" y="282" width="18" height="29" rx="8" fill="#364b50"/>';
 }else{
  if(key==='aunt')body+=P('M134 285H222L248 556H111Z','#d4c4a0',c.shadow)+P('M139 285L151 246M216 285L204 246','none','#d4c4a0',7)+P('M139 410h65v48h-65z','none','#a29477');
  body+=P('M87 350Q67 420 121 445L202 426L196 398L129 407L119 352Z',c.coat,ink);
  body+=P('M192 400q19 -10 32 0l12 12 -13 15 -24 -3Z',skin,'#b99780');
  body+=P('M271 354Q298 418 252 451L210 470L199 444L237 413L240 356Z',c.coat,ink);
  body+=P('M208 444q-11 -6 -20 3l-9 14 15 10 18 -5Z',skin,'#b99780');
  if(key!=='aunt')body+='<g transform="translate(164 362) rotate(8)"><rect width="67" height="96" rx="3" fill="'+c.accent+'"/><path d="M6 0v96" stroke="'+ink+'" opacity=".5"/><rect x="15" y="17" width="38" height="1" fill="#fff4dd"/><rect x="15" y="23" width="25" height="1" fill="#fff4dd"/><path d="M60 0v25l-5 -6 -5 6V0" fill="#e5d5b6"/></g>';
 }
 const neck=P('M154 201L153 250Q177 275 207 247L204 200Z',skin)+P('M155 214Q183 235 204 210L204 228Q181 245 154 225Z','#bf9780');
 const head=P(hairBack,c.hair)+(bun?'<ellipse cx="239" cy="100" rx="29" ry="31" fill="'+c.hair+'"/>':'')+
 '<ellipse cx="130" cy="165" rx="10" ry="15" fill="'+skin+'"/><ellipse cx="230" cy="161" rx="10" ry="15" fill="'+skin+'"/>'+
 P('M132 128Q139 88 183 94Q223 98 230 130L226 185Q214 221 183 231Q152 223 137 193Z',skin)+
 P('M225 145L225 182Q212 216 185 229Q208 212 212 190Z','#d7b297')+face(expr)+
 P(bob?'M119 143Q108 83 161 71Q217 60 240 119L235 199L221 216L219 134Q191 132 173 104Q162 134 133 141L134 207L119 218Z':short?'M119 143L113 111L126 114L122 91L139 96L153 66L169 77L193 65L211 81L229 87L246 122L231 151L220 128L205 117L191 123L177 103L157 124L139 125L132 155Z':'M120 151Q112 90 164 75Q215 64 239 112L232 162L219 140L212 109Q171 149 137 132L132 168Z',c.hair)+
 P(bob?'M132 100Q143 79 175 78M230 145L234 190':short?'M143 99L158 84M178 91L195 83':'M136 108Q163 83 198 88','none','#ffffff',1.3);
 let accessory='';
 if(key==='man')accessory='<path d="M125 151l-1 19" stroke="#ddb775" stroke-width="4" stroke-linecap="round"/>';
 if(['cheng','teacher'].includes(key))accessory='<g fill="none" stroke="#596660" stroke-width="1.7"><rect x="141" y="145" width="33" height="23" rx="8"/><rect x="190" y="144" width="33" height="23" rx="8"/><path d="M174 154q8 -4 16 0M130 149l11 2M223 150l9 -3"/></g>';
 const flip=opts.flip?'translate(360 0) scale(-1 1)':'';
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 560" role="img" aria-label="${c.label}，${expr}" class="ch-svg"><defs><linearGradient id="${id}-coat" x2=".9" y2="1"><stop stop-color="${c.coat}"/><stop offset="1" stop-color="${c.shadow}"/></linearGradient></defs><g transform="${flip}"><g class="portrait-body">${body}${neck}<g class="portrait-head">${head}${accessory}</g></g></g></svg>`;
}
SP.character={build,PRESETS,VB:{w:360,h:560}};
})(window);

