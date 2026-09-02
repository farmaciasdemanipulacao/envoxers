import asyncio, json, re, urllib.request, urllib.error
from app.core.config import settings
PROMPT_VERSION='restaurantes-prospect-v1'
SYSTEM_PROMPT='''Você atua como Diretor de Estratégia Comercial e Prospecção da Envox para negócios gastronômicos. Fale em português, reto, casual e natural. Nunca invente informação; diferencie fato observado de hipótese. Use somente dados e fontes fornecidos. Procure forças, vazamentos, reputação, jornada, cardápio, CTA, reservas, pedidos, links, prova social, recorrência e oportunidades. A primeira abordagem não entrega toda a auditoria. Use OURO CONVERSACIONAL: ouro, resposta, novo ouro. Uma ideia principal por mensagem. Cada insight deve ter evidência, impacto comercial e importância. Não use elogio genérico, não venda marketing de cara, não peça reunião na primeira mensagem, não peça faturamento, não use pressão nem números sem evidência.'''
def _text(r):
    out=[]
    for item in r.get('output',[]):
        for c in item.get('content',[]):
            if c.get('text'): out.append(c['text'])
    return '\n'.join(out)
def _parse(t):
    t=re.sub(r'^```(?:json)?\s*|\s*```$','',t.strip(),flags=re.S)
    return json.loads(t)
def _call(instructions,payload):
    if not settings.OPENAI_API_KEY: raise RuntimeError('OPENAI_API_KEY não configurada no servidor')
    body=json.dumps({'model':settings.OPENAI_MODEL,'instructions':instructions,'input':json.dumps(payload,ensure_ascii=False)}).encode()
    req=urllib.request.Request('https://api.openai.com/v1/responses',data=body,headers={'Authorization':'Bearer '+settings.OPENAI_API_KEY,'Content-Type':'application/json'},method='POST')
    try:
        with urllib.request.urlopen(req,timeout=90) as h: raw=json.loads(h.read().decode())
    except urllib.error.HTTPError as e:
        raise RuntimeError('Falha na OpenAI API: '+str(e.code))
    return _parse(_text(raw)), raw.get('usage') or {}
async def gerar_json(tarefa,contexto,formato):
    inst=SYSTEM_PROMPT+'\nTAREFA: '+tarefa+'\nResponda somente JSON válido. Formato: '+formato
    return await asyncio.to_thread(_call,inst,contexto)
