// The envelope guests open first: cream paper with embossed flowers, their names on the flap and a wax seal.
// Everything is drawn here as SVG, sized to the screen. site.js decides when it opens.
(() => {
function draw() {
  const NS = 'http://www.w3.org/2000/svg', art = document.getElementById('envArt'), s = document.getElementById('sealSvg');
  art.innerHTML = ''; s.innerHTML = '';
const el=(t,a,p=art)=>{const e=document.createElementNS(NS,t);for(const k in a)e.setAttribute(k,a[k]);p.appendChild(e);return e;};
const W=innerWidth,H=innerHeight; art.setAttribute('viewBox',`0 0 ${W} ${H}`);
const fy=H*.30, py=H*.50; const env=document.getElementById('envelope'); env.style.setProperty('--fy',fy+'px'); env.style.setProperty('--py',py+'px');
const defs=el('defs',{});
const fg=el('linearGradient',{id:'flapg',x1:0,y1:0,x2:0,y2:1},defs);el('stop',{offset:0,'stop-color':'#f2e8d8'},fg);el('stop',{offset:1,'stop-color':'#ebdfcb'},fg);
const sh=el('filter',{id:'flapsh',x:'-10%',y:'-10%',width:'120%',height:'130%'},defs);el('feDropShadow',{dx:0,dy:3,stdDeviation:4,'flood-color':'#6b4a25','flood-opacity':.22},sh);
// lower seams: from bottom corners up to the centre, behind the flap
el('path',{d:`M0 ${H} L${W/2} ${py+H*.06} L${W} ${H}`,fill:'none',stroke:'rgba(120,85,50,.18)','stroke-width':1});
el('path',{d:`M0 ${fy} L${W*.03} ${fy}`,fill:'none'});
let seed=7; const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
const C='#e8dac4', L='rgba(140,105,65,.28)';
function leaf(x,y,ang,len,par){const w=len*.34;el('path',{d:`M0 0 C ${len*.3} ${-w}, ${len*.75} ${-w*.8}, ${len} 0 C ${len*.75} ${w*.8}, ${len*.3} ${w}, 0 0 Z M${len*.1} 0 L${len*.85} 0`,fill:C,stroke:L,'stroke-width':.5,transform:`translate(${x} ${y}) rotate(${ang})`},par);}
function blossom(x,y,r,par){const gg=el('g',{transform:`translate(${x} ${y}) rotate(${rnd()*72})`},par);for(let i=0;i<5;i++){el('ellipse',{cx:0,cy:-r*.55,rx:r*.36,ry:r*.55,fill:C,stroke:L,'stroke-width':.45,transform:`rotate(${i*72})`},gg);}el('circle',{r:r*.2,fill:'#dccab0'},gg);}
function rose(x,y,r,par){const gg=el('g',{transform:`translate(${x} ${y}) rotate(${rnd()*40})`},par);for(let i=0;i<9;i++){el('ellipse',{cx:0,cy:-r*.45,rx:r*.46,ry:r*.5,fill:C,stroke:L,'stroke-width':.55,transform:`rotate(${i*40})`},gg);}
 for(let k=4;k>0;k--){el('path',{d:`M${-r*k*.18} 0 A ${r*k*.18} ${r*k*.18} 0 1 1 ${r*k*.15} ${r*k*.07}`,fill:'none',stroke:'rgba(140,105,65,.4)','stroke-width':.7},gg);}}
function sprig(x0,y0,x1,y1,bend,n,par,sz=1){const mx=(x0+x1)/2+bend,my=(y0+y1)/2-bend*.4;el('path',{d:`M${x0} ${y0} Q${mx} ${my} ${x1} ${y1}`,fill:'none',stroke:'#dbc8ac','stroke-width':1.2},par);
 for(let i=1;i<=n;i++){const t=i/(n+1),x=(1-t)*(1-t)*x0+2*(1-t)*t*mx+t*t*x1,y=(1-t)*(1-t)*y0+2*(1-t)*t*my+t*t*y1;const dx=2*(1-t)*(mx-x0)+2*t*(x1-mx),dy=2*(1-t)*(my-y0)+2*t*(y1-my);const ang=Math.atan2(dy,dx)*180/Math.PI;
  leaf(x,y,ang+(i%2?-50:50)+rnd()*16-8,(9+rnd()*7)*sz,par);}
 const t=1;leaf(x1,y1,Math.atan2(y1-my,x1-mx)*180/Math.PI,11*sz,par);}
const back=el('g',{class:'emboss'});
// side vines on the envelope body
sprig(4,fy+40,30,H*.86,26,10,back);sprig(W-4,fy+40,W-30,H*.86,-26,10,back);
[[22,.5],[34,.62],[18,.74]].forEach(([x,f])=>{blossom(x,H*f,6,back);blossom(W-x,H*f+18,6,back);});
// bottom bouquet
const bx=W/2, by=H*.83;
for(let i=0;i<10;i++){const a=(-168+i*17)*Math.PI/180;const r=48+rnd()*38;const sx=bx+(rnd()-.5)*30,sy=by+8;
 sprig(sx,sy,sx+Math.cos(a)*r*1.6,sy+Math.sin(a)*r*.85,(i<5?-1:1)*(18+rnd()*22),6,back,.95);}
for(let i=0;i<14;i++){const a=rnd()*Math.PI*2,r=26+rnd()*30;leaf(bx+Math.cos(a)*r*1.3,by-6+Math.sin(a)*r*.7,a*180/Math.PI,10+rnd()*6,back);}
rose(bx,by-18,22,back);rose(bx-40,by-2,15,back);rose(bx+42,by-4,16,back);rose(bx-82,by+14,11,back);rose(bx+84,by+12,11,back);
[[-20,-52],[22,-50],[-62,-30],[64,-32],[-110,-6],[112,-8],[0,-70]].forEach(([dx,dy])=>blossom(bx+dx,by+dy,6+rnd()*3,back));
// the flap, over the body, with its own garland
const flapG=el('g',{id:'flap'});
el('path',{d:`M0 0 L${W} 0 L${W} ${fy} L${W/2} ${py} L0 ${fy} Z`,fill:'url(#flapg)',filter:'url(#flapsh)'},flapG);
el('path',{d:`M0 ${fy} L${W/2} ${py} L${W} ${fy}`,fill:'none',stroke:'rgba(255,252,245,.8)','stroke-width':1},flapG);
const crown=el('g',{class:'emboss'},flapG);
rose(W*.16,H*.055,17,crown);rose(W*.82,H*.05,18,crown);rose(W*.5,H*.02,12,crown);
sprig(-4,H*.13,W*.34,H*.012,18,7,crown);sprig(W+4,H*.135,W*.64,H*.01,-18,7,crown);sprig(W*.36,H*.05,W*.12,H*.17,10,4,crown,.8);sprig(W*.64,H*.05,W*.88,H*.17,-10,4,crown,.8);
[[.3,.03],[.7,.028],[.06,.2],[.94,.2],[.42,.07],[.58,.065]].forEach(([fx,fy2])=>blossom(W*fx,H*fy2,5.5,crown));
// seal
const sd=el('defs',{},s);
const rg=el('radialGradient',{id:'wax',cx:'38%',cy:'32%',r:'75%'},sd);el('stop',{offset:0,'stop-color':'#b3262a'},rg);el('stop',{offset:.55,'stop-color':'#7a0a0e'},rg);el('stop',{offset:1,'stop-color':'#4a0306'},rg);
let d='';for(let i=0;i<=120;i++){const a=i/120*Math.PI*2;const r=90+Math.sin(a*5+.4)*3.2+Math.sin(a*9+1.3)*1.8+Math.cos(a*3)*1.6;d+=(i?'L':'M')+(100+Math.cos(a)*r).toFixed(1)+' '+(100+Math.sin(a)*r).toFixed(1);}
el('path',{d:d+'Z',fill:'url(#wax)'},s);
el('circle',{cx:100,cy:100,r:68,fill:'none',stroke:'#4e0408','stroke-width':5,opacity:.6},s);
el('circle',{cx:100,cy:100,r:66,fill:'none',stroke:'#c4484b','stroke-width':1.5,opacity:.6,transform:'translate(-1.5 -1.5)'},s);
const t=el('text',{x:100,y:121,'text-anchor':'middle','font-family':'Pinyon Script','font-size':66,fill:'#58040a',stroke:'#d0585b','stroke-width':.9,'paint-order':'stroke'},s);t.textContent='S M';
el('ellipse',{cx:70,cy:58,rx:26,ry:12,fill:'#fff',opacity:.18,transform:'rotate(-30 70 58)'},s);
}
window.Envelope = { draw };
})();
