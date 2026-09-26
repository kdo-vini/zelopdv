# Mockup 06 — Onboarding: /cadastro → wizard de 2 passos → primeira venda → checklist.
# Celular primeiro (390), depois desktop (1440). Só apresentação: copy, eventos e regras de hoje.
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from _mk import fonts, i, money, sidebar, CSS, ICON, MOTION_CSS, MOTION_JS, morph_cta

ICON.update({
 'eye':'<path d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z"/><circle cx="12" cy="12" r="3"/>',
 'check':'<path d="m5 12 5 5 9-10"/>','ccheck':'<circle cx="12" cy="12" r="9"/><path d="m8 12.5 3 3 5-6"/>','circle':'<circle cx="12" cy="12" r="9"/>',
 'msg':'<path d="M4 20l1.3-3.9A8 8 0 1 1 8 19l-4 1Z"/>','arrow':'<path d="M5 12h14M13 6l6 6-6 6"/>','chevr':'<path d="m9 6 6 6-6 6"/>',
 'copy':'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V4h12"/>','printer':'<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
 'cash':'<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9v.01M18 15v.01"/>','pix':'<path d="M12 3l9 9-9 9-9-9z"/><path d="M8 12l4-4 4 4-4 4z"/>',
 'card':'<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/>','ticket':'<path d="M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4V7Z"/><path d="M14 7v10"/>',
 'bike':'<circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M6 17l4-8h5l3 8M10 9l-1-3H7"/>','refresh':'<path d="M20 12a8 8 0 1 1-2.3-5.6L20 8"/><path d="M20 4v4h-4"/>',
 'mail':'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>','store':'<path d="M4 10v10h16V10"/><path d="M3 10l2-6h14l2 6"/><path d="M3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/>',
})
GOOGLE = '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A12 12 0 0 1 12.7 28l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>'
BRAND = f'<div class="ob-brand"><span class="ob-mark">{i("bell",22)}</span><b>Zelo<small>PDV</small></b></div>'
BN = lambda on: '<nav class="bn">'+''.join(f'<a class="{"on" if n==on else ""}">{i(ic)}{n}</a>' for ic,n in [('bag','PDV'),('grid','Gestão'),('wallet','Financeiro'),('dots','Outros'),('user','Perfil')])+'</nav>'
SB = lambda a: sidebar(a).replace('Ana · Caixa #12', 'Ana · titular')
def keyboard(kind='abc'):
    if kind == 'tel':
        rows = [['1','2 ABC','3 DEF'],['4 GHI','5 JKL','6 MNO'],['7 PQRS','8 TUV','9 WXYZ'],['','0','⌫']]
        return '<div class="ob-kb tel">'+''.join('<div class="kr">'+''.join(f'<i>{k}</i>' for k in r)+'</div>' for r in rows)+'</div>'
    rows = ['qwertyuiop','asdfghjkl','⇧zxcvbnm⌫']
    return '<div class="ob-kb">'+''.join('<div class="kr">'+''.join(f'<i>{c}</i>' for c in r)+'</div>' for r in rows)+'<div class="kr"><i class="w">123</i><i class="sp">espaço</i><i class="w go">ir</i></div></div>'
def fld(lbl, val, ph=False, focus=False, suffix='', cls=''):
    return f'<label class="ob-fld {cls}"><span class="ob-lbl">{lbl}</span><span class="ob-inp{" ph" if ph else ""}{" focus" if focus else ""}">{val}{"<i class=caret></i>" if focus else ""}{suffix}</span></label>'
def mhead(title, sub, cash=None):
    c = f'<span class="ob-cash"><i class="dot{" off" if cash[1] else ""}"></i>{cash[0]}</span>' if cash else ''
    return f'<div class="mh"><span class="ob-mhmark">{i("bell",20)}</span><div><p class="mh-t">{title}</p><p class="mh-s">{sub}</p></div>{c}</div>'
PDV_HEAD = mhead('Frente de Caixa', 'Padaria Bom Dia', ('0,00', True))

# ───────────── 1 · Cadastro ─────────────
def cadastro(state='idle', desktop=False):
    ok = state == 'done'
    banner = '<div class="ob-okmsg">'+i('ccheck',18)+'Conta criada! Abrindo configuração inicial...</div>' if ok else ''
    btn = morph_cta('<span class="ob-cta-l">Criar conta</span>', 'cta ob-cta' + (' done' if ok else ''))
    body = f'''<h1 class="title">Criar conta</h1><p class="ob-sub">Teste grátis por 14 dias. Sem cartão, sem cobrança automática.</p>{banner}
<button class="ob-google">{GOOGLE}Continuar com Google</button><div class="ob-div"><span>ou continue com e-mail</span></div>
{fld("E-mail", "ana@padariabomdia.com.br")}{fld("Senha", "••••••••••", suffix=f'<span class="ob-eye">{i("eye")}</span>', focus=not ok)}
{btn}<p class="ob-reass">Leva menos de 1 minuto · cancele quando quiser</p><div class="ob-foot"><a>Já tenho conta</a></div>'''
    if desktop:
        return f'<div class="frame d ob-navy"><div class="ob-dcenter">{BRAND}<div class="ob-card">{body}</div></div></div>'
    return f'<div class="frame m ob-navy">{BRAND}<div class="ob-authsheet">{body}</div></div>'

def callback(timeout=False):
    msg = 'Tempo esgotado. Redirecionando...' if timeout else 'Autenticando...'
    return f'''<div class="frame m ob-navy ob-cb">{BRAND}<div class="ob-cb-c"><span class="ob-ring{" off" if timeout else ""}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9" opacity=".22"/><path d="M12 3a9 9 0 0 1 9 9"/></svg></span>
<p class="ob-cb-t" aria-live="polite">{msg}</p></div></div>'''

# ───────────── 2 · Wizard (sheet no celular, cartão no desktop) ─────────────
CHIPS = ['ChatGPT ou outra IA','Pesquisa no Google','Instagram ou TikTok','YouTube','Indicação de alguém','iFood','Outro']
def prog(step, arrived=False):
    segs = ''.join(f'<i class="{"done" if arrived or k < step else ("cur" if k == step else "")}"></i>' for k in (1, 2))
    return f'<div class="ob-prog" role="presentation">{segs}</div>'
def wiz_head(step, arrived=False):
    return f'<div class="ob-wh"><span class="ob-wbrand">{i("bell",16)}Zelo PDV</span>{prog(step, arrived)}</div>'
def wiz_step(step, error=False, value=True):
    if step == 1:
        q, h = 'Como se chama sua loja?', 'É o nome que vai no recibo do seu cliente.'
        inp = f'<span class="ob-inp big focus{" err" if error else ""}{"" if value else " ph"}">{"Padaria Bom Dia" if value else "Ex: Lanchonete do João"}<i class="caret"></i></span>'
        err = '<p class="ob-err" role="alert">Coloque o nome da loja.</p>' if error else ''
        foot = '<div class="ob-wf one">'+morph_cta('<span class="ob-cta-l">Continuar</span><span class="kbd inv">Enter</span>', 'cta ob-cta ob-next')+'</div>'
    else:
        q, h = 'Qual o seu WhatsApp?', 'É por onde a gente te ajuda. Se quiser, cadastramos seus produtos junto com você — uns 15 minutos, sem custo.'
        inp = f'<span class="ob-inp big mono focus{" err" if error else ""}">{"(11) 9876" if error else "(11) 98765-4321"}<i class="caret"></i></span>'
        err = '<p class="ob-err" role="alert">Faltou o DDD. Escreva os 11 números: (11) 98765-4321</p>' if error else ''
        foot = '<div class="ob-wf"><button class="ob-back">'+i('back',16)+'Voltar</button>'+morph_cta('<span class="ob-cta-l">Começar a usar</span>', 'cta ob-cta ob-next')+'</div>'
    return f'<div class="ob-wstep" data-step="{step}"><p class="eyebrow">Passo {step} de 2</p><h2 class="title">{q}</h2><p class="ob-hint">{h}</p>{inp}{err}</div>{foot}'
def wiz_arrived(thanks=False):
    hf = ('<p class="ob-thanks">'+i('check',16)+'Valeu por contar!</p>') if thanks else ('<div class="ob-hf"><div class="ob-hf-h"><p class="label">Como você conheceu o Zelo?</p><button class="ob-skip">Pular</button></div><div class="ob-chips">'+''.join(f'<button class="ob-chip">{c}</button>' for c in CHIPS)+'</div></div>')
    return f'''<div class="ob-wstep ob-arr"><span class="ob-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path class="draw" d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>
<h2 class="title" tabindex="-1">Boas-vindas ao Zelo, Padaria Bom Dia.</h2><p class="ob-hint">Seu teste de 14 dias começou. Se quiser, cadastramos seus produtos junto com você pelo WhatsApp — uns 15 minutos.</p>{hf}</div>
<div class="ob-wf stack">{morph_cta('<span class="ob-cta-l">Fazer primeira venda</span>'+i('arrow'), 'cta ob-cta')}<button class="ob-out">{i('msg')}Ajuda no WhatsApp</button></div>'''
def perfil_bg():
    return f'{mhead("Minha conta", "Configuração inicial")}<div class="m-body ob-ghost"><div class="ob-gcard"></div><div class="ob-gcard s"></div><div class="ob-gcard"></div></div>{BN("Perfil")}'
def wiz_mobile(inner, step=1, arrived=False, kb=None, cls=''):
    k = keyboard(kb) if kb else ''
    return f'<div class="frame m ob-wizm {cls}">{perfil_bg()}<div class="scrim ob-blur"></div><div class="ob-wsheet{" kb" if kb else ""}" role="dialog" aria-modal="true">{wiz_head(step, arrived)}<div class="ob-wbody">{inner}</div></div>{k}</div>'
def wiz_desktop(inner, step=1, arrived=False):
    return f'''<div class="frame d"><div class="app">{SB("")}<main class="main ob-ghost"><p class="eyebrow">Conta / Meu perfil</p><h1 class="title">Configurações da conta</h1><div class="ob-gcard w"></div><div class="ob-gcard w s"></div></main></div>
<div class="scrim ob-blur"></div><div class="ob-wcard" role="dialog" aria-modal="true">{wiz_head(step, arrived)}<div class="ob-wbody">{inner}</div></div></div>'''

# ───────────── 3 · Frente de Caixa no primeiro uso ─────────────
def empty_state(desktop=False):
    return f'''<div class="ob-empty{" d" if desktop else ""}"><span class="ob-eic">{i("receipt",24)}</span><h3 class="heading">Faça sua primeira venda</h3>
<p class="ob-etext">Cadastre seu primeiro produto para começar. É rápido: nome e preço.</p>
<div class="ob-eacts"><button class="ob-pri">{i("plus")}Cadastrar primeiro produto</button><button class="ob-quiet">Ou venda avulsa</button></div>
<div class="ob-prev" aria-hidden="true"><i></i><i></i><i class="third"></i></div><p class="cap">Seus produtos aparecerão aqui.</p></div>'''
MTOOLS = f'<div class="ob-mtools"><div class="search">{i("search")}Buscar produto</div><button class="ob-iconbtn" aria-label="Item avulso">{i("plus")}</button></div>'
def pdv_mobile_empty():
    return f'<div class="frame m">{PDV_HEAD}<div class="m-body">{MTOOLS}{empty_state()}</div>{BN("PDV")}</div>'
def product_sheet(desktop=False):
    body = f'''<div class="ob-sh-h"><div><p class="heading">Novo produto</p></div><button class="icon-btn" aria-label="Fechar">{i("x")}</button></div>
<div class="ob-sh-b">{fld("Nome do produto", "Coxinha", focus=True)}
<label class="ob-fld"><span class="ob-lbl">Preço</span><span class="ob-inp money-in"><small>R$</small><b>7,00</b></span></label>
<div class="ob-fld"><span class="ob-lbl">Categoria <em>(opcional)</em></span><button class="ob-link">+ Nova categoria</button></div></div>
<div class="ob-sh-f"><button class="ob-out">Cancelar</button>{morph_cta('<span class="ob-cta-l">Salvar produto</span>', 'cta ob-cta sm')}</div>'''
    if desktop:
        return f'<div class="ob-dsheet" role="dialog" aria-modal="true">{body}</div>'
    return f'<div class="ob-msheet" role="dialog" aria-modal="true"><span class="ob-grab"></span>{body}</div>'
def pdv_mobile_quick():
    return f'<div class="frame m">{PDV_HEAD}<div class="m-body">{MTOOLS}{empty_state()}</div>{BN("PDV")}<div class="scrim"></div>{product_sheet()}</div>'
COACH = f'''<div class="ob-coach" role="status"><span class="ob-coach-ar">{i("chev",20)}</span><p>Toque no produto para somar na venda</p><button class="ob-coach-x">Entendi</button><i class="ob-coach-bar"></i></div>'''
def tile(name, price, hl=False, qty=0):
    q = f'<span class="qty popin">{qty}</span>' if qty else ''
    return f'<button class="pt ob-tile{" ob-hl" if hl else ""}{" in" if qty else ""}" data-tile><span class="pt-nm">{name}</span>{money(price, "md")}{q}</button>'
AVULSO = f'<button class="ob-avulso"><span class="ob-av-ic">{i("plus")}</span><span><b>Valor avulso</b><small>Digite um valor livre</small></span></button>'
def pdv_mobile_coach():
    return f'''<div class="frame m ob-coachframe">{PDV_HEAD}<div class="m-body">{MTOOLS}<div class="pgrid m2 ob-g"><div class="ob-cell">{tile("Coxinha", 7, hl=True)}{COACH}</div>{AVULSO}</div></div>
<button class="cartbar ob-cartbar" hidden><span class="cb-n">1</span><span class="cb-l">Ver comanda<small>Retirada · 1 produto</small></span><span class="money cb-t"><small>R$</small><span class="ob-cnt">7,00</span></span><span class="cb-c">{i("chev",20)}</span></button>{BN("PDV")}</div>'''
def cart_items(n=1):
    return f'<li class="ci"><div><p class="ci-nm">Coxinha</p><p class="ci-u">R$ 7,00 × {n}</p></div><div class="ci-r">{money(7*n, "strong")}<button class="ob-rm">Remover</button></div></li>'
def seg():
    return f'<div class="ob-seg"><b class="on">{i("bag",16)}Retirada</b><b>{i("bike",16)}Delivery</b></div>'
def pdv_mobile_cart():
    return f'''<div class="frame m">{PDV_HEAD}<div class="m-body">{MTOOLS}<div class="pgrid m2"><div>{tile("Coxinha", 7, qty=1)}</div>{AVULSO}</div></div>{BN("PDV")}<div class="scrim"></div>
<div class="ob-msheet cartsheet"><span class="ob-grab"></span><div class="ob-sh-h"><p class="heading">Comanda <span class="ob-count">1 item</span></p><button class="icon-btn" aria-label="Fechar comanda">{i("x")}</button></div>
<div class="ob-sh-b">{seg()}<ul class="ci-list ob-ci">{cart_items()}</ul></div>
<div class="ob-sh-f col"><div class="ln"><span>Subtotal · 1 item</span>{money(7, "sm")}</div><div class="tot"><span>Total</span>{money(7, "md")}</div>
<button class="cta ob-receber">Receber{money(7)}</button><p class="cap ob-center">Dinheiro, Pix, cartão ou fiado · pagamento dividido</p></div></div></div>'''

# Abrir caixa na hora de receber → pagamento (mesmo sheet troca com blur)
def caixa_body():
    return f'''<div class="ob-sh-h"><div><p class="eyebrow">Antes de receber</p><p class="heading">Abrir caixa</p></div></div>
<p class="ob-shsub">Você precisa abrir o caixa antes de registrar vendas. Se não usa gaveta, vende mais no Pix/cartão ou está só testando, pode deixar R$ 0,00.</p>
<div class="ob-sh-b">{'<label class="ob-fld"><span class="ob-lbl">Troco inicial</span><span class="ob-inp money-in focus"><small>R$</small><b>0,00</b><i class="caret"></i></span><small class="cap">Troco inicial é apenas o dinheiro que já começa na gaveta para dar troco.</small></label>'}</div>
<div class="ob-sh-f">{morph_cta('<span class="ob-cta-l">Abrir caixa</span>', 'cta ob-cta ob-opencx')}</div>'''
PM = [('cash','Dinheiro','D'),('pix','Pix','X'),('ticket','Vale-Refeição','V'),('card','Débito','B'),('card','Crédito','C'),('user','Fiado','F')]
def pay_body(desktop=False):
    tiles = ''.join(f'<button class="pm{" on" if k=="X" else ""}"><span class="pm-t">{i(ic)}{"<span class=kbd>"+k+"</span>" if desktop else ""}</span><span class="pm-n">{n}</span></button>' for ic,n,k in PM)
    return f'''<div class="ob-sh-h"><div><p class="eyebrow">Pagamento</p><p class="heading">Receber</p></div><button class="icon-btn" aria-label="Fechar">{i("x")}</button></div>
<div class="ob-sh-b"><div class="sumbox"><div class="ln"><span>1 item · Retirada</span>{money(7, "sm")}</div><div class="tot"><span>Total</span>{money(7, "xl")}</div></div><div class="pay">{tiles}</div></div>
<div class="ob-sh-f">{morph_cta('<span class="ob-cta-l">Confirmar</span>'+("<span class=kbd inv>Ctrl+Enter</span>" if desktop else "")+money(7), 'cta ob-cta ob-confirm')}</div>'''
def success_body():
    return f'''<div class="ob-suc"><div class="ob-pill"><span class="ob-pcheck"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path class="draw" d="M5 12.5l4.5 4.5L19 7.5"/></svg></span><span class="ob-pbody"><span>Venda aprovada</span>{money(7, "md")}</span></div>
<p class="ob-meta">Venda <span class="mono">nº 1</span></p><div class="ob-sacts"><button class="ob-out">{i("msg")}WhatsApp</button><button class="ob-out">{i("copy")}Copiar recibo</button><button class="ob-out">{i("printer")}Imprimir</button></div>
<button class="cta ob-next2">Novo pedido<span class="kbd inv">Enter</span></button></div>'''
def pdv_mobile_caixa():
    return f'''<div class="frame m ob-flow">{PDV_HEAD}<div class="m-body">{MTOOLS}<div class="pgrid m2"><div>{tile("Coxinha", 7, qty=1)}</div>{AVULSO}</div></div>{BN("PDV")}<div class="scrim"></div>
<div class="ob-msheet ob-swap" role="dialog" aria-modal="true"><span class="ob-grab"></span><div class="ob-stage" data-stage="caixa">{caixa_body()}</div><div class="ob-stage" data-stage="pay" hidden>{pay_body()}</div><div class="ob-stage" data-stage="ok" hidden>{success_body()}</div></div></div>'''
def pdv_mobile_pay():
    return f'<div class="frame m">{PDV_HEAD}<div class="m-body">{MTOOLS}</div>{BN("PDV")}<div class="scrim"></div><div class="ob-msheet">{"<span class=ob-grab></span>"}{pay_body()}</div></div>'
def pdv_mobile_success():
    return f'<div class="frame m">{PDV_HEAD}<div class="m-body">{MTOOLS}</div>{BN("PDV")}<div class="scrim"></div><div class="ob-msheet">{"<span class=ob-grab></span>"}{success_body()}</div></div>'

# ───────────── 4 · Checklist "Terminar de configurar" ─────────────
CL = [('Cadastrar seu primeiro produto', True), ('CPF ou CNPJ no recibo', False), ('Logo da loja no recibo', False), ('Largura da bobina — hoje em 80 mm', False)]
def checklist():
    rows = ''.join(f'<li class="{"done" if d else ""}"><a><span class="ob-ck">{i("ccheck" if d else "circle", 20)}</span><span class="ob-cl-l">{t}</span>{i("chevr", 16)}</a></li>' for t,d in CL)
    return f'''<section class="ob-cl" role="region" aria-label="Terminar de configurar"><div class="ob-cl-h"><div><p class="heading">Terminar de configurar</p><p class="cap">Nada disso trava o caixa. Faça quando sobrar um tempo.</p></div>
<span class="ob-cl-n"><b>1</b>/4</span></div><div class="ob-cl-bar"><i style="width:25%"></i></div><ul>{rows}</ul></section>'''
KPI = lambda: ''.join(f'<div class="ob-kpi"><p class="eyebrow">{l}</p>{v}</div>' for l,v in [('Vendas hoje', money(7, 'md')), ('Pedidos', '<span class="ob-kn">1</span>'), ('Ticket médio', money(7, 'md'))])
def gestao_mobile():
    return f'<div class="frame m">{mhead("Gestão", "Padaria Bom Dia")}<div class="m-body ob-gm">{checklist()}<div class="ob-kpis m">{KPI()}</div></div>{BN("Gestão")}</div>'

# ───────────── Desktop ─────────────
DTOOLS = f'<div class="ob-dtools"><div class="search">{i("search")}Buscar produto<span class="kbd">F2</span></div><button class="btn out ob-avbtn">{i("plus")}Item avulso<span class="kbd">F4</span></button></div>'
def dcart(items=False):
    lst = f'<ul class="ci-list">{cart_items()}</ul>' if items else f'<div class="ob-cempty">{i("receipt",22)}<p>Toque em um produto para começar a venda</p></div>'
    tot = 7 if items else 0
    return f'''<aside class="cart"><div class="cart-h"><div><p class="heading" style="margin:0">Comanda{" <span class=ob-count>1 item</span>" if items else ""}</p></div></div><div class="ob-cseg">{seg()}</div>{lst}
<div class="cart-f"><div class="ln"><span>Subtotal · {1 if items else 0} {"item" if items else "itens"}</span>{money(tot, "sm")}</div><div class="tot"><span>Total</span>{money(tot, "md")}</div>
<button class="cta ob-receber{"" if items else " off"}">Receber<span class="kbd inv">F9</span>{money(tot)}</button><p class="cap ob-center">Dinheiro, Pix, cartão ou fiado · pagamento dividido</p></div></aside>'''
def dpdv(grid, items=False, overlay=''):
    return f'''<div class="frame d ob-flow"><div class="app">{SB("Frente de Caixa")}<main class="main"><header class="ph"><div><p class="eyebrow">PDV / Frente de Caixa</p><h1 class="title">Frente de Caixa</h1></div>
<span class="pill ob-warn"><i></i>Caixa fechado<span class="ob-psep"></span>{money(0, "sm")}</span></header>{DTOOLS}{grid}</main>{dcart(items)}</div>{overlay}</div>'''
D_EMPTY = dpdv(empty_state(True))
D_QUICK = dpdv(empty_state(True), overlay='<div class="scrim"></div>' + product_sheet(True))
D_COACH = dpdv(f'<div class="pgrid ob-g d"><div class="ob-cell">{tile("Coxinha", 7, hl=True)}{COACH}</div>{AVULSO}</div>', items=False).replace('class="frame d ob-flow"', 'class="frame d ob-flow ob-coachframe ob-dcoach"')
D_CAIXA = dpdv(f'<div class="pgrid"><div>{tile("Coxinha", 7, qty=1)}</div>{AVULSO}</div>', items=True,
    overlay=f'<div class="scrim"></div><div class="ob-dsheet ob-swap sm" role="dialog" aria-modal="true"><div class="ob-stage" data-stage="caixa">{caixa_body()}</div><div class="ob-stage" data-stage="pay" hidden>{pay_body(True)}</div><div class="ob-stage" data-stage="ok" hidden>{success_body()}</div></div>')
D_GESTAO = f'''<div class="frame d"><div class="app">{SB("Dashboard")}<main class="main"><header class="ph"><div><p class="eyebrow">Gestão / Dashboard</p><h1 class="title">Dashboard</h1></div></header>
<div class="ob-dg">{checklist()}<div class="ob-kpis">{KPI()}</div></div></main></div></div>'''

EXTRA = '''
.frame .scrim{z-index:5}.ob-blur{backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);background:rgba(1,31,74,.42)}
.mono{font-family:var(--num)}.ob-center{text-align:center;margin-top:8px}
/* brand pages */
.ob-navy{background:var(--navy);color:#fff}.ob-brand{display:flex;align-items:center;gap:10px;justify-content:center;padding:34px 0 26px}.ob-mark{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:rgba(255,255,255,.1)}
.ob-brand b{font:600 22px/1 var(--num);letter-spacing:-.02em}.ob-brand small{font:500 11px var(--num);letter-spacing:.1em;color:rgba(255,255,255,.62);margin-left:6px}
.ob-authsheet{flex:1;background:var(--white);color:var(--ink);border-radius:24px 24px 0 0;padding:28px 20px 20px;display:flex;flex-direction:column;gap:14px}
.ob-dcenter{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center}.ob-card{width:440px;background:var(--white);color:var(--ink);border-radius:24px;padding:32px;display:flex;flex-direction:column;gap:14px;box-shadow:0 30px 60px -24px rgba(0,0,0,.5)}
.ob-sub{color:var(--label);margin-top:-6px}.ob-okmsg{display:flex;gap:8px;align-items:center;padding:10px 12px;border-radius:12px;background:var(--okbg);color:var(--ok);font:500 13.5px var(--ui)}
.ob-google{display:flex;align-items:center;justify-content:center;gap:10px;height:48px;border:1px solid var(--line);border-radius:12px;font:500 14.5px var(--ui);color:var(--ink);background:var(--white)}
.ob-div{display:flex;align-items:center;gap:10px;color:var(--muted);font:400 12px var(--ui)}.ob-div::before,.ob-div::after{content:'';flex:1;height:1px;background:var(--line)}
.ob-fld{display:flex;flex-direction:column;gap:6px}.ob-lbl{font:500 13.5px var(--ui);color:var(--label)}.ob-lbl em{font-style:normal;color:var(--muted);font-weight:400}
.ob-inp{display:flex;align-items:center;gap:8px;height:48px;padding:0 14px;border:1px solid var(--line);border-radius:12px;background:var(--white);font:400 16px var(--ui);color:var(--ink);position:relative}
.ob-inp.ph{color:var(--muted)}.ob-inp.focus{border-color:var(--navy);box-shadow:0 0 0 4px var(--focus)}.ob-inp.err{border-color:var(--err);box-shadow:0 0 0 4px rgba(180,35,24,.14)}.ob-inp.mono{font:500 17px var(--num);letter-spacing:-.01em}
.ob-inp.big{height:56px;font-size:17px}.caret{display:inline-block;width:1.5px;height:20px;background:var(--navy);margin-left:-6px;animation:blink 1s steps(1) infinite}@keyframes blink{50%{opacity:0}}
.ob-eye{margin-left:auto;color:var(--muted);display:grid}.money-in small{font:500 13px var(--ui);color:var(--muted)}.money-in b{font:500 18px var(--num);letter-spacing:-.02em}
.cta.ob-cta{margin:4px 0 0;justify-content:center;height:56px;font-size:16px}.cta.ob-cta .mlayer{justify-content:center}.cta.ob-cta.sm{height:48px;font-size:15px;margin:0}.cta.ob-cta .kbd{margin-left:6px}
.ob-reass{text-align:center;font:400 12px var(--ui);color:var(--muted);margin-top:-4px}.ob-foot{margin-top:auto;padding-top:14px;border-top:1px solid var(--line);text-align:center}.ob-foot a,.ob-link{font:500 13.5px var(--ui);color:var(--label);text-decoration:underline;text-underline-offset:3px;align-self:flex-start}
.ob-cb{align-items:center}.ob-cb-c{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding-bottom:120px}.ob-ring{width:56px;height:56px;border-radius:50%;background:rgba(255,255,255,.1);display:grid;place-items:center;margin-bottom:8px}
.ob-ring svg{width:28px;height:28px;animation:mspin .86s linear infinite}.ob-ring.off svg{animation-duration:2s}.ob-cb-t{font:500 17px var(--ui)}.ob-cb-s{font:400 13.5px var(--ui);color:rgba(255,255,255,.62)}
/* wizard */
.ob-ghost>*{opacity:.55}.ob-gcard{height:120px;border-radius:14px;background:var(--white);border:1px solid var(--line);margin-bottom:12px}.ob-gcard.s{height:70px}.ob-gcard.w{margin-top:18px;max-width:860px}
.ob-wsheet{position:absolute;left:0;right:0;bottom:0;z-index:6;background:var(--white);border-radius:24px 24px 0 0;padding:18px 20px 22px;box-shadow:0 -20px 50px -20px rgba(1,31,74,.45);transition:height 380ms var(--spring)}
.ob-wsheet.kb{bottom:260px;border-radius:24px}.ob-wizm .ob-wsheet.kb{left:8px;right:8px}
.ob-wcard{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:440px;z-index:6;background:var(--white);border-radius:24px;padding:22px 28px 26px;box-shadow:0 30px 70px -24px rgba(1,31,74,.55)}
.ob-wh{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px}.ob-wbrand{display:inline-flex;gap:6px;align-items:center;font:600 13px var(--num);letter-spacing:-.01em}
.ob-prog{display:flex;gap:6px}.ob-prog i{width:28px;height:6px;border-radius:3px;background:var(--sunk);position:relative;overflow:hidden}.ob-prog i::after{content:'';position:absolute;inset:0;background:var(--navy);transform-origin:left;transform:scaleX(0);transition:transform 420ms var(--spring)}
.ob-prog i.done::after{transform:scaleX(1)}.ob-prog i.cur{box-shadow:inset 0 0 0 1.5px var(--navy)}.ob-prog i.cur::after{transform:scaleX(.35)}
.ob-wstep{display:flex;flex-direction:column;gap:8px}.ob-wstep .title{margin:2px 0 0}.ob-hint{color:var(--label);margin-bottom:10px}.ob-err{font:500 13px var(--ui);color:var(--err);margin-top:2px}
.ob-wf{display:flex;align-items:center;gap:10px;margin-top:18px}.ob-wf .cta{flex:1;margin:0}.ob-wf.stack{flex-direction:column;align-items:stretch}.ob-back{display:inline-flex;align-items:center;gap:4px;height:56px;padding:0 12px;border-radius:12px;color:var(--label);font:500 14.5px var(--ui)}
.ob-out{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:48px;padding:0 14px;border-radius:12px;border:1px solid var(--line);background:var(--white);font:500 14.5px var(--ui);color:var(--ink)}
.ob-badge{width:56px;height:56px;border-radius:50%;background:var(--navy);color:#fff;display:grid;place-items:center;margin-bottom:6px}.ob-badge svg{width:28px;height:28px}
.draw{stroke-dasharray:30;stroke-dashoffset:30;animation:draw 520ms 120ms var(--spring) forwards}@keyframes draw{to{stroke-dashoffset:0}}
.ob-hf{background:var(--sunk);border-radius:14px;padding:12px 14px;margin-top:4px}.ob-hf-h{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.ob-skip{font:500 13px var(--ui);color:var(--muted);text-decoration:underline;text-underline-offset:3px}
.ob-chips{display:flex;flex-wrap:wrap;gap:6px}.ob-chip{height:34px;padding:0 12px;border-radius:999px;border:1px solid var(--line);background:var(--white);font:500 13px var(--ui);color:var(--ink)}.ob-chip.on{background:var(--navy);border-color:var(--navy);color:#fff}
.ob-thanks{display:inline-flex;gap:6px;align-items:center;font:500 13.5px var(--ui);color:var(--ok)}
.ob-kb{position:absolute;left:0;right:0;bottom:0;height:260px;background:#D1D4DA;padding:8px 4px;display:flex;flex-direction:column;gap:10px;z-index:7}.ob-kb .kr{display:flex;gap:6px;justify-content:center}
.ob-kb i{font:400 18px var(--ui);font-style:normal;background:#fff;border-radius:6px;height:44px;flex:1;max-width:34px;display:grid;place-items:center;color:#111;box-shadow:0 1px 0 #898A8D}.ob-kb i.w{max-width:80px;font-size:14px;background:#ABB0BA}.ob-kb i.sp{max-width:none;flex:4;font-size:14px}.ob-kb i.go{background:var(--navy);color:#fff}
.ob-kb.tel .kr{gap:6px}.ob-kb.tel i{max-width:none;height:50px;font-size:20px}
/* pdv */
.mh{position:relative}.ob-mhmark{width:36px;height:36px;border-radius:10px;background:rgba(255,255,255,.1);display:grid;place-items:center;flex:none}.ob-cash{margin-left:auto;height:34px;padding:0 12px;border-radius:999px;background:rgba(255,255,255,.1);display:flex;align-items:center;gap:8px;font:500 14px var(--num)}
.ob-cash .dot{width:7px;height:7px;border-radius:50%;background:#4ADE80}.ob-cash .dot.off{background:#FBBF24}
.ob-mtools{display:flex;gap:8px}.ob-mtools .search{flex:1;margin:0}.ob-iconbtn{width:48px;height:48px;border-radius:12px;border:1px solid var(--line);background:var(--white);display:grid;place-items:center;flex:none}
.ob-empty{display:flex;flex-direction:column;align-items:center;text-align:center;padding:40px 8px 0}.ob-empty.d{padding-top:70px;max-width:420px;margin:0 auto}.ob-eic{width:52px;height:52px;border-radius:14px;background:var(--white);border:1px solid var(--line);display:grid;place-items:center;margin-bottom:16px}
.ob-etext{color:var(--label);margin:8px 0 24px;max-width:300px}.ob-eacts{display:flex;flex-direction:column;gap:8px;width:100%;max-width:320px}
.ob-pri{display:flex;align-items:center;justify-content:center;gap:8px;height:52px;border-radius:14px;background:var(--navy);color:#fff;font:600 15px var(--ui);box-shadow:var(--float)}.ob-quiet{height:48px;border-radius:12px;color:var(--label);font:500 14.5px var(--ui)}
.ob-prev{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;width:100%;max-width:320px;margin:32px 0 12px}.ob-prev i{height:64px;border-radius:14px;border:1.5px dashed var(--line2)}.ob-prev i.third{opacity:.5}
.ob-msheet{position:absolute;left:0;right:0;bottom:0;z-index:6;background:var(--white);border-radius:24px 24px 0 0;box-shadow:0 -20px 50px -20px rgba(1,31,74,.45);display:flex;flex-direction:column;animation:sheetup 420ms var(--spring)}
@keyframes sheetup{from{transform:translateY(40%);opacity:.3}}.ob-grab{width:40px;height:5px;border-radius:3px;background:var(--line2);margin:8px auto 0}
.ob-sh-h{display:flex;justify-content:space-between;align-items:flex-start;padding:14px 20px 4px}.ob-sh-b{padding:12px 20px;display:flex;flex-direction:column;gap:14px}.ob-sh-f{padding:12px 20px 22px;border-top:1px solid var(--line);display:flex;gap:10px;align-items:center}.ob-sh-f .cta{flex:1}.ob-sh-f.col{flex-direction:column;align-items:stretch;gap:2px}
.ob-shsub{padding:4px 20px 0;color:var(--label)}.ob-dsheet{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:520px;z-index:6;background:var(--white);border-radius:24px;box-shadow:0 30px 70px -24px rgba(1,31,74,.55);padding:8px 4px 0}.ob-dsheet.sm{width:460px}
.ob-count{font:500 12px var(--num);color:var(--muted);margin-left:8px;padding:2px 8px;border-radius:999px;background:var(--sunk)}
.ob-g{position:relative}.ob-cell{position:relative}.ob-tile{width:100%}.ob-hl{border-color:var(--navy);box-shadow:0 0 0 1px var(--navy),0 14px 26px -14px rgba(1,31,74,.55);transform:translateY(-2px)}
.ob-coach{position:absolute;left:0;top:calc(100% + 10px);width:min(330px,calc(200% + 10px));z-index:3;background:var(--navy);color:#fff;border-radius:14px;padding:12px 12px 14px 14px;display:flex;align-items:center;gap:10px;box-shadow:var(--float);animation:popin 380ms var(--spring);overflow:hidden}
.ob-coach p{font:500 14px/1.3 var(--ui);flex:1}.ob-coach-ar{position:absolute;top:-14px;left:28px;color:var(--navy);display:none}.ob-coach::before{content:'';position:absolute;top:-6px;left:40px;width:12px;height:12px;background:var(--navy);transform:rotate(45deg);border-radius:2px}
.ob-coach-x{height:34px;padding:0 12px;border-radius:10px;background:rgba(255,255,255,.12);font:500 13px var(--ui);color:#fff}.ob-coach-bar{position:absolute;left:0;bottom:0;height:2px;background:rgba(255,255,255,.7);width:100%;transform-origin:left;animation:coachbar 8s linear forwards}@keyframes coachbar{to{transform:scaleX(0)}}
.ob-coach.out{animation:swapout 70ms forwards}
.ob-avulso{height:118px;border-radius:14px;border:1.5px dashed var(--line2);padding:14px;display:flex;flex-direction:column;justify-content:space-between;text-align:left;color:var(--muted)}.ob-av-ic{width:32px;height:32px;border-radius:10px;background:var(--sunk);display:grid;place-items:center}.ob-avulso b{display:block;font:500 14.5px var(--ui)}.ob-avulso small{font:400 12px var(--ui)}
.ob-cartbar{animation:rise 420ms var(--spring)}@keyframes rise{from{transform:translateY(120%);opacity:0}}
.ob-seg{display:flex;background:var(--sunk);border-radius:12px;padding:3px}.ob-seg b{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;height:38px;border-radius:9px;font:500 13.5px var(--ui);color:var(--muted)}.ob-seg b.on{background:var(--white);color:var(--ink);box-shadow:0 0 0 1px var(--line)}
.ob-ci{padding:0;flex:none}.ob-rm{font:400 12px var(--ui);color:var(--muted);text-decoration:underline;text-underline-offset:3px}
.cta.ob-receber{justify-content:flex-start}.cta.ob-receber.off{opacity:.45;box-shadow:none}.cta.ob-receber .kbd{margin-left:4px}
.ob-stage[hidden]{display:none}.ob-swap .pay{grid-template-columns:repeat(3,1fr)}.ob-swap .pm,.ob-msheet .pm{min-height:64px}.pm-t .kbd{margin-left:auto}
.ob-confirm .money{margin-left:auto}.ob-confirm .mlayer{justify-content:flex-start!important}
.ob-suc{padding:22px 20px 22px;display:flex;flex-direction:column;align-items:center;gap:14px}.ob-pill{display:flex;align-items:center;gap:14px;height:72px;padding:0 24px 0 8px;border-radius:36px;background:var(--navy);color:#fff;animation:popin 420ms var(--spring)}
.ob-pcheck{width:56px;height:56px;border-radius:50%;background:rgba(255,255,255,.12);display:grid;place-items:center}.ob-pcheck svg{width:28px;height:28px}.ob-pbody{display:flex;flex-direction:column;gap:4px;font:500 15px var(--ui)}.ob-pbody .money small{color:rgba(255,255,255,.7)}
.ob-meta{color:var(--label);font-size:13.5px}.ob-sacts{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;width:100%}.ob-sacts .ob-out{font-size:13px;padding:0 8px}.cta.ob-next2{justify-content:center;margin:0}.cta.ob-next2 .kbd{margin-left:8px}
/* checklist */
.ob-cl{background:var(--white);border:1px solid var(--line);border-radius:14px;padding:16px 16px 6px}.ob-cl-h{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.ob-cl-h .heading{margin:0;font-size:16px}
.ob-cl-n{font:500 13px var(--num);color:var(--muted);white-space:nowrap}.ob-cl-n b{font-weight:600;color:var(--ink)}.ob-cl-bar{height:4px;border-radius:2px;background:var(--sunk);margin:12px 0 4px;overflow:hidden}.ob-cl-bar i{display:block;height:100%;background:var(--navy);border-radius:2px;transition:width 420ms var(--spring)}
.ob-cl ul{list-style:none;margin:0;padding:0}.ob-cl li a{display:flex;align-items:center;gap:12px;min-height:50px;border-top:1px solid var(--line);color:var(--ink);font:500 14.5px var(--ui);cursor:pointer}.ob-cl li:first-child a{border-top:0}
.ob-cl li a>.ic:last-child{margin-left:auto;color:var(--muted)}.ob-ck{color:var(--line2);display:grid}.ob-cl li.done .ob-ck{color:var(--ok)}.ob-cl li.done .ob-cl-l{color:var(--muted);text-decoration:line-through;text-decoration-color:var(--line2)}
.ob-gm{display:flex;flex-direction:column;gap:12px}.ob-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.ob-kpis.m{grid-template-columns:1fr 1fr}.ob-kpi{background:var(--white);border:1px solid var(--line);border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:10px}.ob-kn{font:500 20px var(--num)}
.ob-dg{display:grid;grid-template-columns:minmax(0,1fr) 420px;gap:16px;align-items:start}.ob-dg .ob-kpis{grid-column:1;grid-row:1}.ob-dg .ob-cl{grid-column:2;grid-row:1/3}
/* desktop pdv */
.ob-dtools{display:flex;gap:10px}.ob-dtools .search{flex:1;margin:0}.ob-avbtn{height:48px;gap:10px}.ob-avbtn .kbd{margin-left:6px}
.pill.ob-warn{background:var(--warnbg);border-color:var(--warnln);color:var(--warn);height:34px}.pill.ob-warn i{background:var(--warndot)}.ob-psep{width:1px;height:14px;background:var(--warnln)}
.ob-cseg{padding:14px 20px 0}.ob-cempty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:var(--muted);text-align:center;padding:0 40px}
.pgrid.ob-g.d{grid-template-columns:repeat(4,minmax(0,1fr))}.ob-dcoach .ob-coach{width:330px}
.ob-wf.stack .cta,.ob-sh-f.col .cta{flex:none}.ob-empty h3{margin:0}.ob-cartbar[hidden]{display:none}.frame.m .kbd{display:none}.ob-sacts .ob-out{white-space:nowrap;gap:6px}
.note{max-width:1100px;margin:0 auto;padding:0 24px;color:var(--label)}
'''

JS = '''<script>
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// morph button: busy → done, then run the next beat
async function morph(btn, ms = 900) { btn.classList.add('busy'); await sleep(ms); btn.classList.remove('busy'); btn.classList.add('done'); await sleep(520); btn.classList.remove('done'); }
// morph_cta from _mk already cycles by itself; we drive our flows with data-flow buttons instead
document.querySelectorAll('.ob-flow .morph, .ob-wizm .morph, .ob-wcard .morph, .ob-msheet .morph, .ob-dsheet .morph, .ob-authsheet .morph, .ob-card .morph').forEach((b) => b.replaceWith(b.cloneNode(true)));
// wizard: passo 1 → passo 2 → chegada (mesmo cartão, blur swap)
document.querySelectorAll('.ob-wizm.live, .ob-wcard.live').forEach((w) => {
  const body = w.querySelector('.ob-wbody'); const segs = w.querySelectorAll('.ob-prog i');
  const tpl = JSON.parse(w.dataset.tpl);
  const show = (k, stepIdx, arrived) => zSwap(body, () => { body.innerHTML = tpl[k]; segs.forEach((s, n) => { s.className = arrived || n < stepIdx - 1 ? 'done' : (n === stepIdx - 1 ? 'cur' : ''); }); bind(); });
  function bind() {
    const next = body.querySelector('.ob-next'); const back = body.querySelector('.ob-back');
    const step = body.querySelector('.ob-wstep')?.dataset.step;
    if (next) next.onclick = async () => { await morph(next, 700); show(step === '1' ? 's2' : 'arr', step === '1' ? 2 : 2, step !== '1'); };
    if (back) back.onclick = () => show('s1', 1, false);
    body.querySelectorAll('.ob-chip').forEach((c) => c.onclick = () => { c.classList.add('on'); setTimeout(() => { const hf = body.querySelector('.ob-hf'); zSwap(hf, () => { hf.outerHTML = tpl.thanks; }); }, 260); });
    const skip = body.querySelector('.ob-skip'); if (skip) skip.onclick = () => { const hf = body.querySelector('.ob-hf'); zSwap(hf, () => hf.remove()); };
    const first = body.querySelector('.ob-arr ~ .ob-wf .morph'); if (first) first.onclick = () => morph(first, 600).then(() => show('s1', 1, false));
  }
  bind();
});
// coachmark: tocar no produto → dica sai com blur, QtyBadge com pop, barra "Ver comanda" sobe e conta
document.querySelectorAll('.ob-coachframe').forEach((f) => {
  const t = f.querySelector('[data-tile]'); const coach = f.querySelector('.ob-coach'); const bar = f.querySelector('.ob-cartbar'); let n = 0;
  const dismiss = () => { if (coach.isConnected) { coach.classList.add('out'); setTimeout(() => coach.remove(), 80); } t.classList.remove('ob-hl'); };
  f.querySelector('.ob-coach-x').onclick = dismiss; new IntersectionObserver((es, o) => { if (es[0].isIntersecting) { o.disconnect(); const b = coach.querySelector('.ob-coach-bar'); b.style.animation = 'none'; void b.offsetWidth; b.style.animation = ''; setTimeout(dismiss, 8000); } }, { threshold: .6 }).observe(f);
  t.onclick = () => { dismiss(); n += 1; t.classList.add('in'); let q = t.querySelector('.qty'); if (!q) { q = document.createElement('span'); q.className = 'qty'; t.appendChild(q); } q.textContent = n; q.classList.remove('popin'); void q.offsetWidth; q.classList.add('popin');
    if (bar) { bar.hidden = false; bar.querySelector('.cb-n').textContent = n; bar.querySelector('small').textContent = 'Retirada · 1 produto'; zCount(bar.querySelector('.ob-cnt'), (n - 1) * 7, n * 7); }
    const cart = f.querySelector('.cart'); if (cart && n === 1) { const e = cart.querySelector('.ob-cempty'); zSwap(e, () => { e.outerHTML = `<ul class="ci-list"><li class="ci"><div><p class="ci-nm">Coxinha</p><p class="ci-u">R$ 7,00 × 1</p></div><div class="ci-r"><span class="money strong"><small>R$</small>7,00</span></div></li></ul>`; }); cart.querySelector('.ob-receber').classList.remove('off'); } };
});
// abrir caixa → pagamento → venda aprovada, tudo no mesmo sheet
document.querySelectorAll('.ob-swap').forEach((s) => {
  const go = (k) => zSwap(s, () => { s.querySelectorAll('.ob-stage').forEach((x) => x.hidden = x.dataset.stage !== k); bind(); });
  function bind() {
    const open = s.querySelector('[data-stage="caixa"]:not([hidden]) .morph'); if (open) open.onclick = () => morph(open, 700).then(() => go('pay'));
    const conf = s.querySelector('[data-stage="pay"]:not([hidden]) .morph'); if (conf) conf.onclick = () => morph(conf, 900).then(() => go('ok'));
    s.querySelectorAll('[data-stage="pay"] .pm').forEach((p) => p.onclick = () => { s.querySelectorAll('[data-stage="pay"] .pm').forEach((x) => x.classList.remove('on')); p.classList.add('on'); });
    const nx = s.querySelector('[data-stage="ok"]:not([hidden]) .ob-next2'); if (nx) nx.onclick = () => go('caixa');
  }
  bind();
});
// simple morph for the remaining single buttons (cadastro, salvar produto)
document.querySelectorAll('.ob-authsheet .morph, .ob-card .morph, .ob-msheet:not(.ob-swap) .morph, .ob-dsheet:not(.ob-swap) .morph').forEach((b) => { if (!b.classList.contains('done')) b.onclick = () => morph(b); });
// checklist: tocar marca/desmarca (só demonstração do movimento)
document.querySelectorAll('.ob-cl').forEach((c) => c.querySelectorAll('li a').forEach((a) => a.onclick = () => { const li = a.parentElement; li.classList.toggle('done'); a.querySelector('.ob-ck').innerHTML = li.classList.contains('done') ? CK : CI; const d = c.querySelectorAll('li.done').length; c.querySelector('.ob-cl-n b').textContent = d; c.querySelector('.ob-cl-bar i').style.width = d * 25 + '%'; }));
</script>'''
CKJS = f"<script>const CK = {i('ccheck',20)!r}; const CI = {i('circle',20)!r};</script>"

import json
def live_wizard(frame_html, cls):
    tpl = {'s1': wiz_step(1), 's2': wiz_step(2), 'arr': wiz_arrived(), 'thanks': '<p class="ob-thanks">'+i('check',16)+'Valeu por contar!</p>'}
    esc = json.dumps(tpl).replace('&', '&amp;').replace("'", '&#39;')
    return frame_html.replace(f'class="{cls}', f"data-tpl='{esc}' class=\"{cls} live", 1)

M_WIZ_LIVE = live_wizard(wiz_mobile(wiz_step(1), 1), 'frame m ob-wizm')
D_WIZ_LIVE = wiz_desktop(wiz_step(1), 1)
D_WIZ_LIVE = D_WIZ_LIVE.replace('<div class="ob-wcard"', '<div class="ob-wcard"', 1)
D_WIZ_LIVE = live_wizard(D_WIZ_LIVE.replace('class="ob-wcard"', 'class="ob-wcard"'), 'ob-wcard')

def sec(n, title, html): return f'<div><h2 class="cap-h">{n} · {title}</h2>{html}</div>'
MOB1 = [sec(1, 'Cadastro', cadastro()), sec(2, 'Conta criada → configuração', cadastro('done')), sec(3, 'Volta do Google (/auth/callback)', callback())]
MOB2 = [sec(4, 'Passo 1 · com teclado (interativo)', live_wizard(wiz_mobile(wiz_step(1), 1, kb='abc'), 'frame m ob-wizm')), sec(5, 'Passo 2 · WhatsApp', wiz_mobile(wiz_step(2), 2, kb='tel')), sec(6, 'Passo 2 · erro', wiz_mobile(wiz_step(2, error=True), 2, kb='tel'))]
MOB3 = [sec(7, 'Boas-vindas', wiz_mobile(wiz_arrived(), 2, arrived=True)), sec(8, 'Boas-vindas · respondeu', wiz_mobile(wiz_arrived(True), 2, arrived=True)), sec(9, 'Frente de Caixa vazia', pdv_mobile_empty())]
MOB4 = [sec(10, 'Cadastro rápido (compact)', pdv_mobile_quick()), sec(11, 'Dica do primeiro produto (toque no tile)', pdv_mobile_coach()), sec(12, 'Comanda', pdv_mobile_cart())]
MOB5 = [sec(13, 'Receber no 1º uso (clique)', pdv_mobile_caixa()), sec(14, 'Pagamento', pdv_mobile_pay()), sec(15, 'Primeira venda aprovada', pdv_mobile_success())]
MOB6 = [sec(16, 'Gestão · Terminar de configurar', gestao_mobile()), sec(17, 'Wizard sem teclado (tablet/desktop pequeno)', M_WIZ_LIVE), sec(18, 'Retorno do Google · tempo esgotado', callback(True))]

html = f'''<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mockup · Onboarding</title><style>{fonts}{CSS}{EXTRA}{MOTION_CSS}</style></head><body>
<header class="doc"><p class="eyebrow">Zelo Design System · Fase 4 · mockup 06</p><h1>Onboarding: do cadastro à primeira venda</h1>
<p>O caminho real de uma conta nova, <b>celular primeiro</b> (82% do tráfego) e depois desktop. Só apresentação: a copy, os passos, as validações, os redirecionamentos e os eventos são os de hoje
(<code>signup_started</code> → <code>signup_submitted</code> → <code>onboarding_wizard_step_viewed/completed</code> → <code>onboarding_wizard_completed</code> → <code>onboarding_welcome_viewed</code> → <code>onboarding_welcome_cta_clicked</code> → <code>pdv_empty_state_cta_clicked</code> → <code>pdv_quick_product_created</code> → <code>pdv_first_use_caixa_prompted</code> → <code>first_sale_completed</code>).</p>
<ol><li><b>Cadastro</b> já está no cartão claro sobre navy (Fase 3). Novo aqui: "Criar conta" vira loader → check, e "Conta criada!" aparece como faixa de sucesso antes de ir para a configuração.</li>
<li><b>Confirmação de e-mail:</b> hoje não existe tela de "confirme seu e-mail" — o cadastro já devolve a sessão e vai direto para o wizard. A única tela de retorno é a do Google (<code>/auth/callback</code>, "Autenticando..."), que hoje é um spinner cru; ela ganha a página navy com a marca.</li>
<li><b>Wizard</b>: no celular vira folha inferior que sobe acima do teclado; barra de progresso de 2 segmentos que se enchem com mola no lugar das bolinhas; título em Mono; "Continuar" → loader → check → o conteúdo troca com blur no mesmo cartão. A chegada desenha o check.</li>
<li><b>Frente de Caixa no primeiro uso</b>: estado vazio no sistema (botão navy + "Ou venda avulsa" discreto, prévia tracejada), cadastro rápido em folha, dica do primeiro produto como bloco navy colado no tile, com o filete dos 8 s (mesma linguagem do toast).</li>
<li><b>Abrir caixa só no pagamento</b>: o Abrir caixa, o pagamento e a venda aprovada acontecem <b>na mesma folha</b>, trocando o conteúdo com blur — a pessoa sente um fluxo só. Único acréscimo de texto: o rótulo "Antes de receber" acima do título (proposta; sai se você preferir).</li>
<li><b>Terminar de configurar</b>: cartão com contador <code>1/4</code> e barra que enche; itens concluídos riscados com check verde. O contador é só a contagem dos mesmos 4 itens.</li></ol>
<p class="hint-motion">Com movimento: no quadro 4 clique em Continuar e em Começar a usar (e nas opções de "Como conheceu"); no 11 toque no tile; no 13 clique em Abrir caixa, depois em Confirmar; no checklist toque nos itens.</p></header>
<section class="row mob">{"".join(MOB1)}</section><section class="row mob">{"".join(MOB2)}</section><section class="row mob">{"".join(MOB3)}</section>
<section class="row mob">{"".join(MOB4)}</section><section class="row mob">{"".join(MOB5)}</section><section class="row mob">{"".join(MOB6)}</section>
<section class="row"><h2 class="cap-h">19 · Cadastro — desktop 1440</h2>{cadastro(desktop=True)}</section>
<section class="row"><h2 class="cap-h">20 · Wizard sobre o perfil — desktop (interativo: Continuar → Começar a usar → Boas-vindas)</h2>{D_WIZ_LIVE}</section>
<section class="row"><h2 class="cap-h">21 · Frente de Caixa vazia — desktop</h2>{D_EMPTY}</section>
<section class="row"><h2 class="cap-h">22 · Cadastro rápido — desktop</h2>{D_QUICK}</section>
<section class="row"><h2 class="cap-h">23 · Dica do primeiro produto — desktop (clique no tile: a comanda recebe o item)</h2>{D_COACH}</section>
<section class="row"><h2 class="cap-h">24 · Receber → abrir caixa → pagamento → aprovada — desktop (clique)</h2>{D_CAIXA}</section>
<section class="row"><h2 class="cap-h">25 · Dashboard com "Terminar de configurar" — desktop</h2>{D_GESTAO}</section>
<p class="note cap">O checklist também aparece hoje só para o titular, só enquanto houver item pendente; subusuário nunca vê. Nada disso muda.</p>
{MOTION_JS}{CKJS}{JS}</body></html>'''
out = os.path.join(HERE, '06-onboarding.html')
open(out, 'w', encoding='utf-8', newline='\n').write(html)
print('ok', len(html))
