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
MESAS=[(1,'livre',4,None,None,None),(2,'ocupada',4,186.40,'42 min',3),(3,'ocupada',2,64.90,'12 min',2),(4,'livre',6,None,None,None),(5,'fechando',4,248.00,'1h 18',4),(6,'livre',2,None,None,None),
       (7,'ocupada',8,412.70,'1h 05',7),(8,'livre',4,None,None,None),(9,'ocupada',4,39.50,'6 min',2),(10,'livre',4,None,None,None),(11,'livre',2,None,None,None),(12,'ocupada',6,127.30,'28 min',5)]
def tile(m,big=True):
    n,st,cap,tot,t,p=m
    lab={'livre':'Livre','ocupada':'Ocupada','fechando':'Fechando'}[st]
    body=f'<span class="mt-free">{i("users",15)}{cap} lugares</span>' if st=='livre' else f'<span class="mt-meta">{i("clock",14)}{t}<span class="dot-sep">·</span>{i("user",14)}{p}</span>{money(tot,"mt-total")}'
    return f'<button class="mt mt-{st}"><span class="mt-top"><span class="mt-num">{n:02d}</span><span class="pill pill-{st}"><i></i>{lab}</span></span><span class="mt-body">{body}</span></button>'
free=sum(1 for m in MESAS if m[1]=='livre'); occ=sum(1 for m in MESAS if m[1]=='ocupada'); cl=sum(1 for m in MESAS if m[1]=='fechando')
tabs=f'<div class="tabs"><button class="on">Todas<span>{len(MESAS)}</span></button><button>Livres<span>{free}</span></button><button>Ocupadas<span>{occ}</span></button><button>Fechando<span>{cl}</span></button></div>'
summary=f'<div class="sum"><span class="pill pill-livre"><i></i>{free} livres</span><span class="pill pill-ocupada"><i></i>{occ} ocupadas</span><span class="pill pill-fechando"><i></i>{cl} fechando</span><span class="sum-open">Em aberto {money(sum(m[3] or 0 for m in MESAS),"sm")}</span></div>'
MAP_D=f'''<div class="frame d"><div class="app">{sidebar('Mesas')}<main class="main">
<header class="ph"><div><p class="eyebrow">PDV / Mesas</p><h1 class="title">Mesas</h1></div>{summary}</header>
<div class="toolbar">{tabs}<span class="hint">{i('drag',16)}Arraste para reorganizar · toque para abrir</span></div>
<div class="mgrid">{''.join(tile(m) for m in MESAS)}</div></main></div></div>'''
PRODS=[('X-Bacon',29.9,2),('X-Burger',24.9,0),('X-Salada',26.9,0),('Porção de fritas',32.0,1),('Isca de peixe',38.0,0),('Calabresa acebolada',34.0,0),('Coca-Cola 600ml',9.5,3),('Chopp 300ml',12.0,4)]
def ptile(n,p,q): return f'<button class="pt {"in" if q else ""}"><span class="pt-nm">{n}</span>{money(p,"md")}{f"<b class=qty>{q}</b>" if q else ""}</button>'
ITENS=[('Chopp 300ml',4,12.0,'cozinha',None),('Porção de fritas',1,32.0,'cozinha','Sem sal'),('X-Bacon',2,29.9,'novo','Um sem cebola'),('Coca-Cola 600ml',3,9.5,'novo',None)]
sub=sum(q*p for _,q,p,_,_ in ITENS); serv=round(sub*0.10,2); pago=60.0; total=sub+serv; saldo=total-pago
def item(n,q,p,st,obs):
    badge='<span class="st st-k">'+i('chef',13)+'Na cozinha</span>' if st=='cozinha' else '<span class="st st-n">Novo</span>'
    step=f'<span class="stepper"><button>{i("minus",15)}</button><b>{q}</b><button>{i("plus",15)}</button></span>' if st=='novo' else ''
    ob=f'<p class="obs">{i("note",13)}{obs}</p>' if obs else ('<button class="add-obs">+ Observação</button>' if st=='novo' else '')
    return f'<li class="ci"><div class="ci-l"><p class="ci-nm">{n}</p><p class="ci-u">R$ {p:.2f} × {q}'.replace('.',',')+f'</p>{ob}</div><div class="ci-r">{money(q*p,"sm strong")}{badge}{step}</div></li>'
novos=sum(q for _,q,_,st,_ in ITENS if st=='novo')
COMANDA=f'''<section class="cart"><div class="cart-h"><div><p class="eyebrow">Comanda · Mesa 02</p><h2 class="heading">4 itens <span class="muted-num">· 10 un.</span></h2></div><button class="icon-btn" aria-label="Mais ações">{i('dots')}</button></div>
<ul class="ci-list">{''.join(item(*x) for x in ITENS)}</ul>
<div class="cart-f"><div class="ln"><span>Subtotal</span>{money(sub,"sm")}</div><div class="ln"><span>Taxa de serviço 10%</span><span class="num">+ {money(serv,"sm")}</span></div><div class="ln ok"><span>Já pago (parcial)</span><span class="num">− {money(pago,"sm")}</span></div>
<div class="tot"><span>Saldo a pagar</span>{money(saldo,"xl")}</div>
<button class="btn out full">{i('send')}Enviar para a cozinha<span class="kbd">{novos} novos</span></button>
<div class="two"><button class="btn out">{i('split')}Pagamento parcial</button><button class="btn out">{i('receipt')}Pré-conta</button></div>
<button class="cta">Fechar mesa<span class="kbd inv">F9</span>{money(saldo,"cta-total")}</button></div></section>'''
CAT='<div class="tabs"><button class="on">Lanches<span>6</span></button><button>Porções<span>8</span></button><button>Bebidas<span>12</span></button><button>Chopp<span>4</span></button><button>Sobremesas<span>5</span></button></div>'
MESA_D=f'''<div class="frame d"><div class="app">{sidebar('Mesas')}<main class="main mesa">
<div class="mesa-l"><header class="ph"><div><p class="eyebrow"><a>{i('back',13)}Mesas</a> / Mesa 02</p><h1 class="title">Mesa 02</h1><p class="sub">{i('clock',15)}Aberta há 42 min<span class="dot-sep">·</span>{i('user',15)}3 pessoas<span class="dot-sep">·</span>Garçom Beto</p></div>
<div class="acts"><button class="btn out">{i('swap')}Transferir</button><button class="btn quiet danger">Cancelar comanda</button></div></header>
<div class="search">{i('search')}<span>Buscar produto</span><span class="kbd">F2</span></div>{CAT}
<div class="pgrid">{''.join(ptile(*p) for p in PRODS)}</div></div>{COMANDA}</main></div></div>'''
# mobile
MAP_M=f'''<div class="frame m"><div class="mh"><div><p class="mh-t">Mesas</p><p class="mh-s">{occ} ocupadas · {free} livres</p></div><span class="mh-cash">{money(sum(m[3] or 0 for m in MESAS),"sm")}</span></div>
<div class="m-body"><div class="tabs sm">{tabs[len('<div class="tabs">'):]}<div class="mgrid m2">{''.join(tile(m) for m in MESAS[:8])}</div></div>
<nav class="bn"><a class="on">{i('bag')}PDV</a><a>{i('grid')}Gestão</a><a>{i('wallet')}Financeiro</a><a>{i('dots')}Outros</a><a>{i('user')}Perfil</a></nav></div>'''
MESA_M=f'''<div class="frame m"><div class="mh"><button class="icon-btn nav">{i('back')}</button><div><p class="mh-t">Mesa 02</p><p class="mh-s">42 min · 3 pessoas</p></div><button class="icon-btn nav r">{i('dots')}</button></div>
<div class="m-body"><div class="search">{i('search')}<span>Buscar produto</span></div><div class="tabs sm">{CAT[len('<div class="tabs">'):]}
<div class="pgrid m2">{''.join(ptile(*p) for p in PRODS[:6])}</div></div>
<button class="cartbar"><span class="cb-n">10</span><span class="cb-l">Ver comanda<small>{novos} novos p/ cozinha · saldo</small></span>{money(saldo,"cb-t")}<span class="cb-c">{i('chev',20)}</span></button>
<nav class="bn"><a class="on">{i('bag')}PDV</a><a>{i('grid')}Gestão</a><a>{i('wallet')}Financeiro</a><a>{i('dots')}Outros</a><a>{i('user')}Perfil</a></nav></div>'''
FECHAR=f'''<div class="frame sheetframe"><div class="scrim"></div><div class="sheet">
<header class="sh-h"><div><p class="eyebrow">Mesa 02 · 42 min</p><h2 class="heading">Fechar mesa</h2></div><button class="icon-btn">{i('x')}</button></header>
<div class="sh-b"><div class="sumbox"><div class="ln"><span>Consumo</span>{money(sub,"sm")}</div><div class="ln"><span>Taxa de serviço</span><span class="seg-mini"><b class="on">10%</b><b>0%</b><b>Outro</b></span></div><div class="ln"><span>Couvert (3 × R$ 8,00)</span>{money(24,"sm")}</div><div class="ln ok"><span>Já pago</span><span class="num">− {money(pago,"sm")}</span></div><div class="tot"><span>Saldo a pagar</span>{money(saldo+24,"xl")}</div></div>
<div class="split"><div><p class="label">Dividir por pessoas</p><p class="cap">{money((saldo+24)/3,"sm")} por pessoa</p></div><span class="stepper lg"><button>{i("minus",16)}</button><b>3</b><button>{i("plus",16)}</button></span></div>
<p class="eyebrow">Forma de pagamento</p><div class="pay">{''.join(f'<button class="pm {"on" if k=="X" else ""}"><span class="pm-t">{i(ic,18)}<span class="kbd">{k}</span></span><span class="pm-n">{n}</span></button>' for n,ic,k in [('Dinheiro','wallet','D'),('Pix','send','X'),('Débito','receipt','B'),('Crédito','receipt','C'),('Vale-Refeição','receipt','V'),('Fiado','user','F')])}</div></div>
<footer class="sh-f"><label class="sw"><i></i>Imprimir recibo</label><div class="two"><button class="btn out tall">Cancelar</button><button class="cta">Fechar mesa<span class="kbd inv">Ctrl ↵</span>{money(saldo+24,"cta-total")}</button></div></footer></div></div>'''
CSS=open('/home/user/zelopdv/docs/design-system/mockups/_mockup.css').read()
html=f'''<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mockup · Mesas</title><style>{fonts}{CSS}</style></head><body>
<header class="doc"><p class="eyebrow">Zelo Design System · Fase 4 · mockup 01 de 06 · aprovado em 2026-09-26 (bottom nav original do mobile mantida)</p><h1>Mesas</h1><p>Mapa de mesas e comanda da mesa (<code>/app/mesas</code>, <code>/app/mesas/[id]</code>) no layout aprovado do <code>/app</code>. Mesmas funções de hoje: filtros por status, arrastar para reordenar, lançar produto, observação por linha, enviar para a cozinha, pagamento parcial, pré-conta, transferir, taxa de serviço/couvert/desconto, dividir, fechar. Nada de lógica muda.</p>
<ol><li><b>Mapa</b> — tile por mesa com número em Mono, status (livre / ocupada / fechando), tempo aberto, pessoas e total em aberto. Resumo do salão no topo.</li><li><b>Comanda</b> — catálogo à esquerda como na Frente de Caixa; comanda à direita com itens "Na cozinha" (travados) e "Novos" (editáveis), saldo após parciais e o CTA "Fechar mesa".</li><li><b>Fechar mesa</b> — sheet com taxa/couvert, divisão por pessoas e formas de pagamento com atalhos (mesma linguagem do pagamento do PDV).</li><li><b>Celular</b> — mapa em 2 colunas e comanda em bottom sheet, com a barra "Ver comanda".</li></ol></header>
<section class="row"><h2 class="cap-h">1 · Mapa de mesas — desktop 1440</h2>{MAP_D}</section>
<section class="row"><h2 class="cap-h">2 · Comanda da mesa — desktop 1440</h2>{MESA_D}</section>
<section class="row"><h2 class="cap-h">3 · Fechar mesa — sheet</h2>{FECHAR}</section>
<section class="row mob"><div><h2 class="cap-h">4 · Mapa — celular 390</h2>{MAP_M}</div><div><h2 class="cap-h">5 · Comanda — celular 390</h2>{MESA_M}</div></section>
</body></html>'''
open('/home/user/zelopdv/docs/design-system/mockups/01-mesas.html','w').write(html)
