import sys; sys.path.insert(0, '/home/user/zelopdv/docs/design-system/mockups')
from _mk import fonts, i, money, sidebar, CSS, ICON, MOTION_CSS, MOTION_JS, morph_cta
ICON.update({
 'down':'<path d="M6 9l6 6 6-6"/>','file':'<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/>','sheet':'<path d="M4 4h16v16H4z"/><path d="M4 10h16M10 4v16"/>',
 'filter':'<path d="M4 5h16l-6 7v6l-4 2v-8L4 5Z"/>','refresh':'<path d="M20 11a8 8 0 0 0-14.9-4M4 13a8 8 0 0 0 14.9 4"/><path d="M5 3v4h4M19 21v-4h-4"/>',
 'trend':'<path d="M4 16l6-6 4 4 6-7"/><path d="M15 7h5v5"/>','undo':'<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>','cal':'<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
})
def num(v, dec=2): return f'<span class="cnt" data-to="{v}" data-dec="{dec}">{f"{v:,.{dec}f}".replace(",","X").replace(".",",").replace("X",".")}</span>'
def m(v, cls='sm'): return f'<span class="money {cls}"><small>R$</small>{num(v)}</span>'
# DS chart palette (proposal): replaces sky/indigo; chartColors.js mirrors it for PDF/Excel
PAY=[('Dinheiro','c-cash',18.0),('Pix','c-pix',261.7),('Cartão de débito','c-deb',64.0),('Cartão de crédito','c-cred',96.3),('Fiado','c-fiado',29.9)]
TOT=sum(v for *_,v in PAY)
def paybar():
    bar=''.join(f'<i class="{c}" style="--w:{v/TOT*100:.2f}%"></i>' for _,c,v in PAY)
    leg=''.join(f'<li><span class="sw {c}"></span><span class="ln">{n}</span>{m(v)}<span class="pct">{v/TOT*100:.1f}%</span></li>'.replace('.',',',1) if False else f'<li><span class="sw {c}"></span><span class="ln">{n}</span>{m(v)}<span class="pct">{str(round(v/TOT*100,1)).replace(".",",")}%</span></li>' for n,c,v in PAY)
    return f'<section class="card pad"><div class="card-t"><h2 class="heading">Formas de pagamento</h2><span class="cap">{m(TOT)} no total</span></div><div class="pbar">{bar}</div><ul class="pleg">{leg}</ul></section>'
def kpis(extra=True):
    k=[('Vendas brutas',m(440,'md'),'7 vendas'),('Qtd. vendas',f'<span class="kn">{num(7,0)}</span>','cupons no caixa'),('Ticket médio',m(62.86,'md'),'por cupom'),('Dinheiro líq.',m(18,'md'),'na gaveta, sem troco')]
    return '<div class="kp4">'+''.join(f'<div class="kpi"><p class="eyebrow">{a}</p>{b}<p class="cap">{c}</p></div>' for a,b,c in k)+'</div>'
def hero(desp=False):
    net = 440-3327.25 if desp else 440
    neg = ' neg' if net<0 else ''
    extra = f'<span class="chip-err">Despesas −R$ 3.327,25</span>' if desp else ''
    return f'<section class="hero"><div><p class="eyebrow">{i("trend",14)} Receita líquida</p><p class="money xl{neg}"><small>{"−" if net<0 else ""}R$</small>{num(abs(net))}</p><p class="cap">Bruto R$ 440,00 · Comissões R$ 0,00 {extra}</p></div>{"" if desp else "<div class=hero-side><p class=eyebrow>Caixa #12</p><p class=hv>Aberto desde 08:00</p><p class=cap>Troco inicial R$ 200,00</p></div>"}</section>'
def export_btn(pri=False):
    return f'''<div class="exp"><button class="btn {"pri" if pri else "out"}" onclick="this.parentNode.classList.toggle('open')">{i("file")}Exportar{i("down",16)}</button>
<div class="menu"><button class="mi morph-lite">{i("file")}<span><b>Exportar PDF</b><small>Relatório visual com gráficos</small></span></button><button class="mi morph-lite">{i("sheet")}<span><b>Exportar Excel</b><small>Planilha com abas formatadas</small></span></button></div></div>'''
CANAL='''<section class="card pad"><div class="card-t"><h2 class="heading">Vendas por canal</h2><span class="cap">iFood por horário de conclusão, fora da gaveta e dos totais</span></div>
<div class="chg">'''+''.join(f'<div class="ch"><p class="ch-h"><span class="sw {c}"></span>{n}<span class="cap">{q} vendas</span></p>{m(v,"md")}<p class="cap">Ticket R$ {t} · Comissão R$ {cm} · Líquido R$ {lq}</p></div>' for n,c,q,v,t,cm,lq in [('PDV','c-card',7,469.9,'67,13','0,00','469,90'),('Zelo Menu','c-menu',3,152.4,'50,80','0,00','152,40'),('iFood','c-ifood',2,112.8,'56,40','14,10','98,70')])+'</div></section>'
MOVS='<div class="mv4">'+''.join(f'<div class="kpi sm"><p class="eyebrow"><span class="sw {c}"></span>{a}</p><span class="money md {cl}"><small>{s}R$</small>{num(v)}</span>{f"<p class=cap>{x}</p>" if x else ""}</div>' for a,c,s,v,cl,x in [('Sangrias','c-err','−',150,'neg',''),('Suprimentos','c-cash','+',50,'pos',''),('Descontos','c-fiado','',0,'',''),('Saldo na gaveta','c-pix','',118,'','Inicial R$ 200,00 · contado ao fechar')])+'</div>'
SMALL3=f'''<div class="g3">
<section class="card pad"><div class="card-t"><h2 class="heading">Tipos de pedido</h2></div><ul class="rows">{"".join(f'<li><span>{a}</span><span class="cap">{q}</span>{m(v)}</li>' for a,q,v in [('Balcão','5 vendas',358.1),('Entrega','1 venda',87.4),('Retirada','1 venda',24.4)])}</ul></section>
<section class="card pad"><div class="card-t"><h2 class="heading">Custos de plataforma</h2><span class="cap">caixa</span></div><ul class="rows">{"".join(f'<li><span><span class="sw {c}"></span>{a}</span><span class="cap">{p}</span>{m(v)}</li>' for a,c,p,v in [('iFood','c-ifood','12,5%',14.1),('Maquininha','c-deb','1,9%',3.05)])}</ul></section>
<section class="card pad"><div class="card-t"><h2 class="heading">{i("undo",16)} Estornos e cancelamentos</h2></div><ul class="rows"><li><span>Venda #1038 estornada</span><span class="cap">11:02</span><span class="money sm neg"><small>−R$</small>24,90</span></li><li class="muted"><span>Nenhum cancelamento</span></li></ul></section></div>'''
PRODS=[('X-Bacon','Lanches',6,179.4),('Coca-Cola lata 350ml','Bebidas',9,58.5),('Pão de queijo','Salgados',12,60.0),('Açaí 500ml','Doces',3,54.0)]
def prods(title='Produtos vendidos'):
    rows=''.join(f'<tr><td class="pn">{n}</td><td><span class="tag">{c}</span></td><td class="mono r">{q}</td><td class="r">{m(v)}</td></tr>' for n,c,q,v in PRODS)
    return f'''<section class="card tbl"><div class="card-t pad-x"><div><h2 class="heading">{title} <span class="cnum">4</span></h2><p class="cap">Resumo agrupado por produto</p></div><button class="chip-f">{i("filter",15)}Categoria: todas</button></div>
<table><thead><tr><th>Produto</th><th>Categoria</th><th class="r">Qtd.</th><th class="r">Receita</th></tr></thead><tbody>{rows}<tr class="trtot"><td>Total</td><td>&nbsp;</td><td class="mono r">30</td><td class="r">{m(351.9)}</td></tr></tbody></table></section>'''
VEN=[(1046,'14:08','PDV','Pix',87.4),(1045,'13:22','PDV','Fiado · Marina',29.9),(1044,'12:50','Zelo Menu','Cartão de débito',64.0),(1043,'12:15','PDV','Pix',131.8),(1042,'11:40','iFood','Cartão de crédito',96.3)]
def vendas():
    rows=''
    for k,(n,h,c,f,v) in enumerate(VEN):
        rows+=f'<tr class="{"open" if k==0 else ""}" onclick="this.classList.toggle(\'open\')"><td class="mono">#{n}</td><td class="mono">{h}</td><td><span class="tag">{c}</span></td><td class="{"warn" if f.startswith("Fiado") else ""}">{f}</td><td class="r">{m(v)}</td><td class="r"><button class="lnk">Detalhes{i("down",14)}</button></td></tr>'
        if k==0: rows+=f'<tr class="det"><td colspan="6"><div class="detb"><div><p class="eyebrow">Itens</p><p>2× X-Bacon <span class="cap">R$ 59,80</span></p><p>2× Coca-Cola lata <span class="cap">R$ 13,00</span></p><p>1× Batata média <span class="cap">R$ 14,60</span></p></div><div><p class="eyebrow">Pagamento</p><p>Pix · R$ 87,40</p><p class="cap">Operador: Beto · Balcão</p></div><div class="acts"><button class="btn out sm">Reimprimir</button></div></div></td></tr>'
    return f'''<section class="card tbl"><div class="card-t pad-x"><div><h2 class="heading">Vendas do caixa <span class="cnum">7</span></h2><p class="cap">Abra uma venda para conferir cliente, itens e valores</p></div></div>
<table><thead><tr><th>#</th><th>Horário</th><th>Canal</th><th>Forma</th><th class="r">Total</th><th></th></tr></thead><tbody>{rows}</tbody></table>
<div class="pag"><span class="cap">Mostrando 1–5 de 7</span><div class="pgb"><button class="btn out sm">Anterior</button><b>1</b><button class="btn out sm">2</button><button class="btn out sm">Próxima</button></div></div></section>'''
MOVT=f'''<section class="card tbl"><div class="card-t pad-x"><h2 class="heading">Movimentações do caixa</h2></div><table><thead><tr><th>Quando</th><th>Tipo</th><th>Motivo</th><th class="r">Valor</th></tr></thead><tbody>
<tr><td class="mono">13:40</td><td><span class="tag err">Sangria</span></td><td>Depósito banco</td><td class="r"><span class="money sm neg"><small>−R$</small>150,00</span></td></tr>
<tr><td class="mono">08:05</td><td><span class="tag ok">Suprimento</span></td><td>Troco</td><td class="r"><span class="money sm pos"><small>+R$</small>50,00</span></td></tr></tbody></table></section>'''
MESAS=f'''<section class="card pad"><div class="card-t"><h2 class="heading">Resumo do módulo Mesas</h2><span class="cap">aparece só com o add-on</span></div><div class="g4s">{"".join(f'<div><p class="eyebrow">{a}</p><p class="kv">{b}</p></div>' for a,b in [('Comandas fechadas','9'),('Ticket por mesa','R$ 84,20'),('Permanência média','52 min'),('Taxa de serviço','R$ 75,80')])}</div></section>'''
FILT_CAIXA=f'''<div class="fbar"><label class="fld"><span class="eyebrow">Caixa</span><span class="sel">#12 · hoje 08:00 · aberto{i("down",16)}</span></label><label class="fld"><span class="eyebrow">Canal de origem</span><span class="sel">Todos os canais{i("down",16)}</span></label></div>'''
PRESETS=['Hoje','Ontem','Últimos 7','Últimos 30','Mês atual','Mês anterior','Personalizado']
FILT_PER=f'''<div class="fbar"><div class="seg">{"".join(f'<button class="{"on" if p=="Últimos 7" else ""}">{p}</button>' for p in PRESETS)}</div><label class="fld sm"><span class="eyebrow">Início</span><span class="sel mono">20/09/2026{i("cal",16)}</span></label><label class="fld sm"><span class="eyebrow">Fim</span><span class="sel mono">26/09/2026{i("cal",16)}</span></label><label class="fld"><span class="eyebrow">Canal</span><span class="sel">Todos{i("down",16)}</span></label><button class="btn pri upd morph-lite">{i("refresh")}Atualizar</button></div>'''
DAYS=[('20/09','sáb',612.4,18),('21/09','dom',388.0,11),('22/09','seg',274.9,9),('23/09','ter',301.5,10),('24/09','qua',352.2,12),('25/09','qui',498.7,15),('26/09','sex',440.0,7)]
MX=max(d[2] for d in DAYS)
BARS='<div class="bars">'+''.join(f'<div class="bc"><span class="bv">R$ {str(v).replace(".",",")}</span><i style="--h:{v/MX*100:.1f}%;--d:{k*45}ms"></i><span class="bl">{d}<small>{w}</small></span></div>' for k,(d,w,v,q) in enumerate(DAYS))+'</div>'
def donut():
    c=2*3.14159*54; off=0; segs=''
    for n,cl,v in PAY:
        L=v/TOT*c; segs+=f'<circle class="dseg {cl}" r="54" cx="70" cy="70" stroke-dasharray="{L-2:.1f} {c:.1f}" stroke-dashoffset="{-off:.1f}"/>'; off+=L
    leg=''.join(f'<li><span class="sw {cl}"></span><span class="ln">{n}</span><span class="pct">{str(round(v/TOT*100,1)).replace(".",",")}%</span>{m(v)}</li>' for n,cl,v in PAY)
    return f'<section class="card pad"><div class="card-t"><h2 class="heading">Formas de pagamento</h2></div><div class="dn"><svg viewBox="0 0 140 140" class="dsvg">{segs}<text x="70" y="64" class="dt1">Total</text><text x="70" y="84" class="dt2">R$ 469,90</text></svg><ul class="pleg col">{leg}</ul></div></section>'
SERIE='<section class="card tbl"><div class="card-t pad-x"><h2 class="heading">Série diária</h2></div><table><thead><tr><th>Dia</th><th class="r">Vendas</th><th class="r">Total</th></tr></thead><tbody>'+''.join(f'<tr><td class="mono">{d} <span class="cap">{w}</span></td><td class="mono r">{q}</td><td class="r">{m(v)}</td></tr>' for d,w,v,q in DAYS)+'</tbody></table></section>'

VIEW_CAIXA=f'''<div class="view" data-v="caixa">{FILT_CAIXA}{hero()}{kpis()}{paybar()}{CANAL}{MOVS}{SMALL3}{MESAS}<div class="g2">{prods()}{MOVT}</div>{vendas()}</div>'''
VIEW_PER=f'''<div class="view" data-v="periodo" hidden>{FILT_PER}{hero(True)}{kpis()}<div class="g2c"><section class="card pad"><div class="card-t"><h2 class="heading">Vendas por dia</h2><span class="cap">20–26/09 · passe o mouse para o valor</span></div>{BARS}</section>{donut()}</div>{CANAL}{MOVS}<div class="g2">{SERIE}{prods("Produtos vendidos no período")}</div></div>'''
HEAD=f'''<header class="ph"><div><p class="eyebrow">Financeiro / Relatórios</p><h1 class="title">Relatórios</h1></div>{export_btn(True)}</header>
<div class="tabs mode"><button class="on" data-go="caixa">Por caixa</button><button data-go="periodo">Por período</button></div>'''
D1=f'''<div class="frame d tall"><div class="app">{sidebar('Relatórios')}<main class="main scroll">{HEAD}<div class="views">{VIEW_CAIXA}{VIEW_PER}</div></main></div></div>'''
HEAD2=HEAD.replace('class="on" data-go="caixa"','data-go="caixa"').replace('data-go="periodo"','class="on" data-go="periodo"',1)
D2=f'''<div class="frame d tall"><div class="app">{sidebar('Relatórios')}<main class="main scroll">{HEAD2}<div class="views">{VIEW_PER.replace(' hidden','')}</div></main></div></div>'''
MOB=f'''<div class="frame m"><div class="mh"><div><p class="mh-t">Relatórios</p><p class="mh-s">Caixa #12 · aberto</p></div><button class="icon-btn nav r">{i("file")}</button></div>
<div class="m-body scroll"><div class="tabs mode sm"><button class="on">Por caixa</button><button>Por período</button></div>
<div class="fbar m"><label class="fld"><span class="eyebrow">Caixa</span><span class="sel">#12 · hoje 08:00{i("down",16)}</span></label></div>
<section class="hero m"><p class="eyebrow">{i("trend",14)} Receita líquida</p><p class="money xl"><small>R$</small>{num(440)}</p><p class="cap">Bruto R$ 440,00</p></section>
<div class="kp4 m">{"".join(f'<div class="kpi"><p class="eyebrow">{a}</p>{b}</div>' for a,b in [('Ticket médio',m(62.86,'md')),('Vendas',f'<span class="kn">{num(7,0)}</span>'),('Dinheiro líq.',m(18,'md')),('Na gaveta',m(118,'md'))])}</div>
{paybar()}{vendas()}</div>
<nav class="bn"><a>{i('bag')}PDV</a><a>{i('grid')}Gestão</a><a class="on">{i('wallet')}Financeiro</a><a>{i('dots')}Outros</a><a>{i('user')}Perfil</a></nav></div>'''
EXTRA='''
.frame.tall{height:auto}.frame.tall .app{min-height:900px}.main.scroll{overflow:visible;gap:16px;display:flex;flex-direction:column}
.btn.pri{background:var(--navy);color:#fff;border:0}.btn.sm{height:34px;padding:0 10px;font-size:12.5px}
.card{background:var(--white);border:1px solid var(--line);border-radius:14px}.pad{padding:16px 18px}.pad-x{padding:16px 18px 10px}
.card-t{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px}.card-t .cap{text-align:right}.cnum{font:500 12px var(--num);color:var(--muted);margin-left:4px}
.view{display:flex;flex-direction:column;gap:16px}.view[hidden]{display:none}.views{display:flex;flex-direction:column}
.tabs.mode{margin-top:-4px}.tabs.mode.sm button{font-size:14px}
.fbar{display:flex;flex-wrap:wrap;align-items:flex-end;gap:12px}.fbar.m{margin:12px 0}.fld{display:flex;flex-direction:column;gap:6px;min-width:220px;flex:1}.fld.sm{flex:0 0 160px;min-width:0}
.sel{display:flex;align-items:center;justify-content:space-between;height:44px;padding:0 12px;border:1px solid var(--line);border-radius:12px;background:var(--white);font:500 14px var(--ui);color:var(--ink)}.sel.mono{font:500 13.5px var(--num)}
.seg{display:inline-flex;padding:3px;gap:2px;border-radius:12px;background:var(--sunk);flex:0 0 auto}.seg button{height:38px;padding:0 11px;border-radius:9px;font:500 13px var(--ui);color:var(--label)}.seg button.on{background:var(--white);color:var(--ink);font-weight:600;box-shadow:0 1px 3px rgba(1,31,74,.18)}
.upd{height:44px}
.hero{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;padding:20px 22px;border-radius:16px;background:var(--navy);color:#fff}.hero .eyebrow{color:rgba(255,255,255,.62);display:flex;gap:6px;align-items:center}.hero .money small{color:rgba(255,255,255,.62)}.hero .cap{color:rgba(255,255,255,.72);display:flex;gap:8px;align-items:center;flex-wrap:wrap}.hero .money.neg{color:#FFB4AB}
.hero-side{text-align:right}.hv{font:600 16px var(--num);margin:4px 0}.hero.m{display:block;margin-bottom:12px}
.chip-err{padding:2px 8px;border-radius:7px;background:rgba(255,180,171,.16);color:#FFB4AB;font:500 12px var(--num)}
.kp4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.kp4.m{grid-template-columns:1fr 1fr;margin-bottom:12px}.kpi{background:var(--white);border:1px solid var(--line);border-radius:14px;padding:14px 16px;display:flex;flex-direction:column;gap:6px}.kn{font:600 26px/1.1 var(--num);letter-spacing:-.02em}
.kpi .eyebrow{display:flex;align-items:center;gap:6px}.money.neg{color:var(--err)}.money.pos{color:var(--ok)}.money.neg small,.money.pos small{color:inherit;opacity:.7}
.mv4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.sw{display:inline-block;width:10px;height:10px;border-radius:3px;flex:none}
.c-cash{background:#146C43;stroke:#146C43}.c-pix{background:#011F4A;stroke:#011F4A}.c-deb{background:#4D6E9C;stroke:#4D6E9C}.c-cred{background:#9FB3CF;stroke:#9FB3CF}.c-fiado{background:#D99A06;stroke:#D99A06}.c-card{background:#8A94A3;stroke:#8A94A3}.c-menu{background:#7A46FF}.c-ifood{background:#EA1D2C}.c-err{background:#B42318}
.pbar{display:flex;height:14px;border-radius:7px;overflow:hidden;gap:2px;background:var(--sunk)}.pbar i{width:var(--w);transform-origin:left;animation:grow 700ms var(--spring) both}.pbar i:nth-child(2){animation-delay:40ms}.pbar i:nth-child(3){animation-delay:80ms}.pbar i:nth-child(4){animation-delay:120ms}.pbar i:nth-child(5){animation-delay:160ms}
@keyframes grow{from{transform:scaleX(0)}}
.pleg{list-style:none;margin:14px 0 0;padding:0;display:grid;grid-template-columns:repeat(5,1fr);gap:10px}.pleg li{display:grid;grid-template-columns:auto 1fr;column-gap:8px;align-items:center}.pleg .ln{font:500 13px var(--ui);color:var(--label)}.pleg .money{grid-column:2}.pleg .pct{grid-column:2;font:500 11.5px var(--num);color:var(--muted)}
.pleg.col{grid-template-columns:1fr;gap:8px;margin:0;flex:1}.pleg.col li{grid-template-columns:auto 1fr auto auto;column-gap:10px}.pleg.col .money,.pleg.col .pct{grid-column:auto}
.chg{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.ch{padding:14px;border-radius:12px;background:var(--sunk);display:flex;flex-direction:column;gap:6px}.ch-h{display:flex;align-items:center;gap:8px;font:600 14px var(--ui)}.ch-h .cap{margin-left:auto;font-weight:400}
.g3{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.g2{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}.g2c{display:grid;grid-template-columns:1.25fr 1fr;gap:16px}
.rows{list-style:none;margin:0;padding:0}.rows li{display:grid;grid-template-columns:1fr auto auto;gap:12px;align-items:center;min-height:40px;border-top:1px solid var(--line);font:500 14px var(--ui)}.rows li>span:first-child{display:flex;gap:8px;align-items:center}.rows li.muted{color:var(--muted);grid-template-columns:1fr}
.g4s{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.kv{font:600 20px var(--num);margin-top:4px}
.tbl{overflow:hidden}.tbl .card-t{margin:0}
table{width:100%;border-collapse:collapse}th{text-align:left;font:500 10.5px/1 var(--num);letter-spacing:.12em;text-transform:uppercase;color:var(--muted);padding:12px 18px;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}td{padding:0 18px;height:52px;border-bottom:1px solid var(--line);font:400 14px var(--ui);color:var(--label)}.r{text-align:right}tbody tr{transition:background 150ms}tbody tr:hover{background:#FAF9F7}
td.pn{font:500 14.5px var(--ui);color:var(--ink)}td.mono{font:500 13px var(--num)}td.warn{color:var(--warn)}tr.trtot td{font:600 14px var(--ui);color:var(--ink);border-bottom:0}
.tag{padding:3px 8px;border-radius:7px;background:var(--sunk);font:500 12px var(--ui)}.tag.err{background:var(--errbg);color:var(--err)}.tag.ok{background:var(--okbg);color:var(--ok)}
.chip-f{display:inline-flex;gap:6px;align-items:center;height:36px;padding:0 12px;border-radius:999px;border:1px solid var(--line);background:var(--white);font:500 13px var(--ui)}
.lnk{display:inline-flex;align-items:center;gap:4px;font:500 13px var(--ui);color:var(--label)}.lnk svg{transition:transform 320ms var(--spring)}tr.open .lnk svg{transform:rotate(180deg)}
tr.det{display:none}tr.open+tr.det{display:table-row}tr.det td{height:auto;padding:0 18px 14px;background:#FAF9F7}.detb{display:grid;grid-template-columns:1.4fr 1fr auto;gap:16px;padding:12px 14px;border-radius:12px;background:var(--white);border:1px solid var(--line);animation:swapin 260ms var(--spring)}.detb p{margin:3px 0;font:500 13.5px var(--ui);color:var(--ink)}.detb .acts{align-self:end}
.pag{display:flex;justify-content:space-between;align-items:center;padding:12px 18px}.pgb{display:flex;gap:6px;align-items:center}.pgb b{width:34px;height:34px;border-radius:9px;background:var(--navy);color:#fff;display:grid;place-items:center;font:500 13px var(--num)}
.exp{position:relative}.exp .menu{position:absolute;right:0;top:calc(100% + 6px);z-index:5;width:260px;padding:6px;border-radius:12px;background:var(--white);border:1px solid var(--line);box-shadow:var(--float);display:none}.exp.open .menu{display:block;animation:swapin 260ms var(--spring)}
.mi{display:flex;gap:10px;align-items:flex-start;width:100%;padding:10px;border-radius:9px;text-align:left}.mi:hover{background:var(--sunk)}.mi b{display:block;font:500 14px var(--ui)}.mi small{font:400 12px var(--ui);color:var(--muted)}
.bars{display:flex;align-items:flex-end;gap:10px;height:220px;padding-top:24px;border-bottom:1px solid var(--line)}.bc{flex:1;height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:6px;position:relative}
.bc i{display:block;width:100%;height:var(--h);max-height:calc(100% - 34px);border-radius:8px 8px 3px 3px;background:var(--navy);transform-origin:bottom;animation:rise 700ms var(--spring) both;animation-delay:var(--d)}.bc:hover i{background:#0B2C5C}
@keyframes rise{from{transform:scaleY(0)}}.bl{font:500 11.5px var(--num);color:var(--muted);display:flex;gap:4px}.bl small{font-family:var(--ui)}
.bv{position:absolute;top:0;padding:3px 7px;border-radius:7px;background:var(--navy);color:#fff;font:500 11.5px var(--num);opacity:0;transform:translateY(4px);transition:opacity 150ms,transform 320ms var(--spring);white-space:nowrap}.bc:hover .bv{opacity:1;transform:none}
.dn{display:flex;gap:20px;align-items:center}.dsvg{width:180px;height:180px;flex:none;transform:rotate(-90deg)}.dseg{fill:none;stroke-width:20;animation:dash 900ms var(--spring) both}@keyframes dash{from{stroke-dasharray:0 400}}
.dsvg text{transform:rotate(90deg);transform-origin:70px 70px;text-anchor:middle}.dt1{font:500 10px var(--ui);fill:var(--muted)}.dt2{font:600 13px var(--num);fill:var(--ink)}
.m-body.scroll{overflow:auto}.m-body .card{margin-bottom:12px}.m-body .pleg{grid-template-columns:1fr 1fr}.m-body table th:nth-child(3),.m-body table td:nth-child(3),.m-body table th:nth-child(6),.m-body table td:nth-child(6){display:none}.m-body th,.m-body td{padding-left:12px;padding-right:12px}.m-body .detb{grid-template-columns:1fr}.m-body .pag .btn.out.sm:not(:last-child){display:none}
'''
html=f'''<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mockup · Relatórios</title><style>{fonts}{CSS}{EXTRA}{MOTION_CSS}</style></head><body>
<header class="doc"><p class="eyebrow">Zelo Design System · Fase 4 · mockup 04 de 06</p><h1>Relatórios</h1><p>Tela <code>/relatorios</code> (hotspot) nos dois modos, com tudo o que existe hoje: seleção de caixa ou período (atalhos Hoje, Ontem, Últimos 7, Últimos 30, Mês atual, Mês anterior, Personalizado), filtro de canal, exportar PDF e Excel, receita líquida (no período, já descontando despesas), KPIs, formas de pagamento, vendas por canal, sangrias/suprimentos/descontos/gaveta, tipos de pedido, custos de plataforma, estornos, resumo de Mesas (só com o add-on), produtos vendidos com filtro de categoria, cupons com detalhes e paginação, movimentações, vendas por dia, rosca de pagamentos e série diária. Nada novo é buscado; só apresentação.</p>
<ol><li><b>Por caixa</b>: receita líquida em destaque navy (número que conta), filtros em linha, cartões em grade.</li><li><b>Por período</b>: atalhos em controle segmentado, barras por dia que sobem com mola (valor no hover) e rosca com legenda legível.</li><li><b>Paleta de gráficos</b> do Design System: Pix navy, dinheiro verde, débito e crédito em tons de navy, fiado âmbar; iFood e Zelo Menu com a cor da marca. O <code>chartColors.js</code> (PDF/Excel) passa a usar a mesma paleta.</li><li><b>Celular</b>: mesmas seções em coluna, bottom nav original.</li></ol>
<p class="hint-motion">Com movimento: clique em "Por caixa / Por período" (indicador líquido + troca com blur), em "Exportar", em "Detalhes" de um cupom e passe o mouse nas barras.</p></header>
<section class="row"><h2 class="cap-h">1 · Por caixa — desktop 1440 (troque o modo nas abas)</h2>{D1}</section>
<section class="row"><h2 class="cap-h">2 · Por período — desktop 1440</h2>{D2}</section>
<section class="row mob"><div><h2 class="cap-h">3 · Por caixa — celular 390</h2>{MOB}</div></section>
{MOTION_JS}<script>
const countAll = (root) => root.querySelectorAll('.cnt').forEach((el) => {{ const to = parseFloat(el.dataset.to); const dec = +el.dataset.dec; if (dec === 0) {{ el.textContent = to; return; }} zCount(el, 0, to); }});
countAll(document);
document.querySelectorAll('.frame').forEach((fr) => fr.querySelectorAll('.tabs.mode button[data-go]').forEach((b) => b.addEventListener('click', () => {{
  const views = fr.querySelector('.views'); if (!views || !fr.querySelector('.view[data-v="' + b.dataset.go + '"]')) return;
  zSwap(views, () => {{ views.querySelectorAll('.view').forEach((v) => v.hidden = v.dataset.v !== b.dataset.go); countAll(views); views.querySelectorAll('.pbar i,.bc i,.dseg').forEach((e) => {{ e.style.animation = 'none'; e.offsetWidth; e.style.animation = ''; }}); }});
}})));
document.querySelectorAll('.seg').forEach((s) => s.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {{ s.querySelectorAll('button').forEach((x) => x.classList.remove('on')); b.classList.add('on'); }})));
document.querySelectorAll('.morph-lite').forEach((b) => b.addEventListener('click', (e) => {{ e.stopPropagation(); if (b.dataset.busy) return; const html = b.innerHTML; b.dataset.busy = 1; b.style.minWidth = b.offsetWidth + 'px'; b.innerHTML = '<svg class="ic spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9" opacity=".2"/><path d="M12 3a9 9 0 0 1 9 9"/></svg>'; setTimeout(() => {{ b.innerHTML = '<svg class="ic popin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'; }}, 900); setTimeout(() => {{ b.innerHTML = html; delete b.dataset.busy; }}, 2000); }}));
</script><style>.spin{{animation:mspin .86s linear infinite}}.morph-lite{{justify-content:center}}</style></body></html>'''
open('/home/user/zelopdv/docs/design-system/mockups/04-relatorios.html','w').write(html)
print('ok', len(html))
