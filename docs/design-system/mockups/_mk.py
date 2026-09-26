# Shared helpers for the Design System mockups (fonts embedded, icons, money, sidebar).
import base64
F='/home/user/zelopdv/static/fonts/'
def ff(fam,w,f): return f"@font-face{{font-family:'{fam}';font-weight:{w};src:url(data:font/woff2;base64,{base64.b64encode(open(F+f,'rb').read()).decode()}) format('woff2')}}"
fonts="\n".join([ff('Geist',400,'Geist-Regular.woff2'),ff('Geist',500,'Geist-Medium.woff2'),ff('Geist',600,'Geist-SemiBold.woff2'),ff('Geist Mono',500,'GeistMono-Medium.woff2'),ff('Geist Mono',600,'GeistMono-SemiBold.woff2')])
ICON={
'bag':'<path d="M6 7h12l-1 13H7L6 7Z"/><path d="M9 7a3 3 0 0 1 6 0"/>',
'table':'<path d="M4 9h16"/><path d="M6 9v10M18 9v10"/><path d="M5 5h14v4H5z"/>',
'list':'<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
'chef':'<path d="M7 14h10v6H7z"/><path d="M7 14a4 4 0 1 1 2-7 4 4 0 0 1 6 0 4 4 0 1 1 2 7"/>',
'grid':'<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
'box':'<path d="M4 8l8-4 8 4-8 4-8-4Z"/><path d="M4 8v8l8 4 8-4V8"/><path d="M12 12v8"/>',
'users':'<circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M21 20a6 6 0 0 0-4-5.6"/>',
'wallet':'<path d="M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z"/><path d="M4 7l11-3v3"/><circle cx="16" cy="13.5" r="1"/>',
'chart':'<path d="M5 20V10M12 20V4M19 20v-7"/>',
'search':'<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/>',
'clock':'<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
'swap':'<path d="M7 7h12l-3-3M17 17H5l3 3"/>',
'receipt':'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6M9 12h6"/>',
'send':'<path d="m4 12 16-8-6 16-2-7-8-1Z"/>',
'plus':'<path d="M12 5v14M5 12h14"/>','minus':'<path d="M5 12h14"/>',
'x':'<path d="M6 6l12 12M18 6 6 18"/>','drag':'<circle cx="9" cy="7" r="1"/><circle cx="15" cy="7" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="17" r="1"/><circle cx="15" cy="17" r="1"/>',
'note':'<path d="M5 19h4l10-10-4-4L5 15v4Z"/>','chev':'<path d="m6 15 6-6 6 6"/>','back':'<path d="m15 6-6 6 6 6"/>',
'split':'<circle cx="7" cy="7" r="2.5"/><circle cx="7" cy="17" r="2.5"/><path d="M9 8.5 20 17M9 15.5 20 7"/>','dots':'<circle cx="6" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="18" cy="12" r="1"/>',
'user':'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
'bell':'<rect x="9.5" y="2.5" width="5" height="3" rx="1.2"/><path d="M4.5 13.5a7.5 7.5 0 0 1 15 0"/><path d="M3 13.5h18v1.2a5.8 5.8 0 0 1-5.8 5.8H8.8A5.8 5.8 0 0 1 3 14.7z"/>',
}
def i(n,s=18): return f'<svg class="ic" width="{s}" height="{s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{ICON[n]}</svg>'
def money(v,cls=''): 
    s=f"{v:,.2f}".replace(',','X').replace('.',',').replace('X','.')
    return f'<span class="money {cls}"><small>R$</small>{s}</span>'
def sidebar(active):
    items=[('VENDAS',[('Frente de Caixa','bag'),('Mesas','table'),('Pedidos','list'),('Cozinha','chef')]),('GESTÃO',[('Dashboard','grid'),('Produtos','box'),('Pessoas','users')]),('FINANCEIRO',[('Fechar Caixa','wallet'),('Relatórios','chart')])]
    h='<aside class="sb"><div class="sb-brand"><span class="sb-mark">'+i('bell',20)+'</span><span><b>Zelo<small>PDV</small></b><em>Padaria Bom Dia</em></span></div>'
    for g,its in items:
        h+=f'<h6>{g}</h6>'+''.join(f'<a class="{"on" if n==active else ""}">{i(ic)}{n}</a>' for n,ic in its)
    return h+'<div class="sb-user"><span class="av">A</span>Ana · Caixa #12</div></aside>'

CSS=open('/home/user/zelopdv/docs/design-system/mockups/_mockup.css').read()

import base64 as _b64
IFOOD_LOGO = 'data:image/png;base64,' + _b64.b64encode(open('/home/user/zelopdv/static/ifood-logo.png', 'rb').read()).decode()

# Motion — same language as src/lib/motion (docs/design-system/reference/zelopdv-morph.html):
# spring easing (ζ 0.84, ≤1% overshoot), press squash .965, blur swap (exit ~70ms, enter after),
# liquid tab indicator (leading edge stiff, trailing soft), button → loader → check, counting numbers.
MOTION_CSS = """
:root{--spring:linear(0,.064,.204,.367,.523,.658,.766,.848,.907,.948,.975,.992,1.001,1.006,1.008,1.008,1.007,1.005,1.004,1.003,1)}
button,.qc,.mt,.pt,.pm{transition:transform 320ms var(--spring),border-color 150ms,box-shadow 150ms,background-color 150ms}
button:active,.qc:active,.mt:active,.pt:active{transform:scale(.965);transition-duration:120ms}
.tabs{position:relative}.tabs button.on::after{display:none}.tabs .liq{position:absolute;bottom:0;height:2px;border-radius:2px;background:var(--navy);pointer-events:none}
.morph{position:relative;overflow:visible}.morph .mshape{position:absolute;inset:0;border-radius:16px;background:var(--navy);box-shadow:var(--float);transition:left 380ms var(--spring),right 380ms var(--spring),border-radius 380ms var(--spring);z-index:0}
.morph>*:not(.mshape){position:relative;z-index:1}.cta.morph{background:transparent;box-shadow:none}
.morph.busy .mshape,.morph.done .mshape{left:calc(50% - 28px);right:calc(50% - 28px);border-radius:28px}
.morph .mlayer{transition:opacity 90ms,filter 90ms}.morph.busy .mlayer,.morph.done .mlayer{opacity:0;filter:blur(8px)}
.morph .mspin,.morph .mcheck{position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;opacity:0;filter:blur(8px);transition:opacity 180ms 70ms,filter 180ms 70ms;z-index:1}
.morph.busy .mspin{opacity:1;filter:none;animation:mspin .86s linear infinite}.morph.done .mcheck{opacity:1;filter:none}
.mcheck path{stroke-dasharray:30;stroke-dashoffset:30}.morph.done .mcheck path{transition:stroke-dashoffset 420ms 160ms var(--spring);stroke-dashoffset:0}
@keyframes mspin{to{transform:rotate(360deg)}}
.swapping{animation:swapout 70ms forwards}.swapin{animation:swapin 260ms var(--spring)}
@keyframes swapout{to{opacity:0;filter:blur(8px);transform:scale(1.02)}}@keyframes swapin{from{opacity:0;filter:blur(8px);transform:scale(.96)}}
.popin{animation:popin 380ms var(--spring)}@keyframes popin{from{transform:scale(.6);opacity:.4}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
.hint-motion{display:inline-flex;gap:6px;align-items:center;margin-top:8px;padding:6px 10px;border-radius:9px;background:var(--white);border:1px solid var(--line);font:500 12.5px var(--ui);color:var(--label)}
"""
MOTION_JS = """
<script>
(() => {
  // closed-form spring (same math as src/lib/motion/spring.js)
  const step = (t, w, z) => { if (t <= 0) return 0; const wd = w*Math.sqrt(1-z*z); return 1 - Math.exp(-z*w*t)*(Math.cos(wd*t) + (z*w/wd)*Math.sin(wd*t)); };
  const springTo = (from, to, w, z, cb) => { const t0 = performance.now(); const f = (now) => { const t = (now-t0)/1000, p = step(t, w, z); cb(from + (to-from)*p); if (t < 1.2) requestAnimationFrame(f); else cb(to); }; requestAnimationFrame(f); };
  // liquid tab indicator: leading edge ω34, trailing ω15
  document.querySelectorAll('.tabs').forEach((tabs) => {
    const liq = document.createElement('span'); liq.className = 'liq'; tabs.appendChild(liq);
    let L = 0, R = 0; const place = (l, r) => { liq.style.left = l + 'px'; liq.style.width = Math.max(0, r - l) + 'px'; };
    const measure = (b) => [b.offsetLeft, b.offsetLeft + b.offsetWidth];
    const on = tabs.querySelector('button.on') || tabs.querySelector('button'); [L, R] = measure(on); place(L, R);
    tabs.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      tabs.querySelectorAll('button').forEach((x) => x.classList.remove('on')); b.classList.add('on');
      const [nl, nr] = measure(b), right = nl > L, l0 = L, r0 = R; L = nl; R = nr;
      let cl = l0, cr = r0;
      springTo(l0, nl, right ? 15 : 34, 0.85, (v) => { cl = v; place(cl, cr); });
      springTo(r0, nr, right ? 34 : 15, 0.85, (v) => { cr = v; place(cl, cr); });
    }));
  });
  // button → loader → check
  document.querySelectorAll('.morph').forEach((btn) => btn.addEventListener('click', () => {
    if (btn.classList.contains('busy') || btn.classList.contains('done')) return;
    btn.classList.add('busy');
    setTimeout(() => { btn.classList.remove('busy'); btn.classList.add('done'); }, 1100);
    setTimeout(() => { btn.classList.remove('done'); }, 2400);
  }));
  // blur swap helper + counting numbers
  window.zSwap = (el, apply) => { el.classList.add('swapping'); setTimeout(() => { apply(); el.classList.remove('swapping'); el.classList.add('swapin'); setTimeout(() => el.classList.remove('swapin'), 300); }, 70); };
  window.zCount = (el, from, to) => springTo(from, to, 16, 0.999, (v) => { el.textContent = v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); });
})();
</script>
"""
def morph_cta(inner, cls='cta'):
    return (f'<button class="{cls} morph"><span class="mshape"></span><span class="mlayer" style="display:flex;align-items:center;gap:12px;width:100%">{inner}</span>'
            '<svg class="mspin" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="9" opacity=".2"/><path d="M12 3a9 9 0 0 1 9 9"/></svg>'
            '<svg class="mcheck" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button>')
