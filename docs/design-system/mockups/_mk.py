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
