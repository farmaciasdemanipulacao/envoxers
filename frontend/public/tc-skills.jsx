const { useState: useSkillsState } = React;

function EnvoxSkillsScreen({ permissao }) {
  const [tab, setTab] = useSkillsState("overview");
  const [brainCat, setBrainCat] = useSkillsState("brand");

  const isAdmin = permissao === "admin" || permissao === "gestor";
  const tabs = [
    ["overview", "Visão geral"], ["brain", "Brain"], ["agents", "Agentes"],
    ["router", "AI Router"], ["knowledge", "Knowledge"], ["flags", "Feature Flags"], ["evals", "Evals"]
  ];

  const brainCats = [
    ["brand", "Marca", 12], ["communication", "Comunicação", 9], ["creative", "Criação", 8],
    ["editorial", "Editorial", 14], ["forbidden", "Proibições", 11], ["audiences", "Públicos", 6],
    ["approved", "Aprovados", 74], ["rejected", "Reprovados", 19], ["learnings", "Aprendizados", 23]
  ];

  const brainRules = {
    brand: [
      ["Integridade da marca", "bloqueante", "Logos e ativos oficiais nunca são reinterpretados por geração visual. Arquivos finais usam assets aprovados."],
      ["Consistência antes de novidade", "padrão", "A linguagem visual evolui sem descaracterizar a identidade institucional definida para a conta."],
      ["Templates controlados", "padrão", "Peças recorrentes priorizam componentes determinísticos para preservar tipografia, proporção e assinatura."],
    ],
    communication: [
      ["Clareza institucional", "padrão", "Texto direto, específico e sóbrio. Evitar frases genéricas, exagero promocional e linguagem que pareça automatizada."],
      ["Contexto por público", "padrão", "A mensagem deve mudar conforme síndicos, administradoras, imobiliárias, corretores ou demais públicos da conta."],
    ],
    creative: [
      ["Direção antes de geração", "bloqueante", "Nenhuma imagem ou peça é gerada antes da definição de conceito, hierarquia, formato e restrições."],
      ["Arte final controlada", "bloqueante", "Logo, texto, cores e componentes críticos são aplicados pelo design engine, não recriados pelo modelo de imagem."],
    ],
    editorial: [["Fonte para afirmações sensíveis", "bloqueante", "Normas, datas, números e afirmações jurídicas devem manter origem verificável antes de entrega."], ["Histórico de versões", "padrão", "Ajustes editoriais relevantes permanecem associados à peça e ao feedback que os originou."]],
    forbidden: [["Sem autonomia irrestrita do cliente", "bloqueante", "Acesso externo é concedido por funcionalidade, campanha, usuário, limite de uso e validade."], ["Sem exposição do Brain", "bloqueante", "Prompts, regras internas, agentes, custos e roteamento permanecem invisíveis ao cliente."]],
    audiences: [["Públicos segmentados", "padrão", "Cada público terá dores, vocabulário, CTA e nível de profundidade próprios no Brain."]],
    approved: [["Referências aprovadas", "padrão", "Peças aprovadas podem orientar padrão, sem serem copiadas literalmente como template universal."]],
    rejected: [["Reprovação vira dado", "padrão", "Toda reprovação relevante deve registrar motivo estruturado para melhorar próximas decisões."]],
    learnings: [["Aprendizado governado", "bloqueante", "Feedback não altera automaticamente regras críticas. Aprendizados entram como proposta e passam por revisão Envox."]],
  };

  const agents = [
    ["Orquestrador", "Direção", "Decide fluxo, especialistas e validações", "planejado"],
    ["Estrategista", "Estratégia", "Objetivo, público, ângulo, jornada e CTA", "planejado"],
    ["Social Media", "Conteúdo", "Calendário, formatos e desdobramentos", "planejado"],
    ["Copywriter", "Conteúdo", "Headlines, legendas, anúncios e e-mails", "planejado"],
    ["Diretor de Arte", "Criação", "Conceito visual, composição e briefing de geração", "planejado"],
    ["Brand Guardian", "QA", "Valida marca, tom, regras e risco de reprovação", "planejado"],
    ["Revisor", "QA", "Ortografia, datas, nomes, consistência e fontes", "planejado"],
    ["Analista de Performance", "Resultados", "Lê desempenho e retroalimenta aprendizados", "planejado"],
  ];

  const routes = [
    ["Estratégia complexa", "GPT · modelo de raciocínio", "fallback configurável", "definir por benchmark"],
    ["Redação operacional", "OpenAI · modelo eficiente", "fallback configurável", "definir por benchmark"],
    ["Pesquisa / verificação", "Web + modelo de análise", "fonte oficial prioritária", "governado"],
    ["Imagem", "Provider vencedor por tarefa", "provider alternativo", "benchmark Envox"],
    ["Vídeo generativo", "Veo / melhor engine disponível", "provider alternativo", "benchmark Envox"],
    ["Revisão", "Modelo rápido + regras", "modelo principal", "sempre executado"],
  ];

  const knowledge = [
    ["Manual de marca", "Documento", "SECOVI-PR", "pendente ingestão"],
    ["Peças aprovadas", "Acervo", "Envox", "pendente ingestão"],
    ["Peças rejeitadas + feedback", "Acervo", "Envox", "pendente estruturação"],
    ["Normas e documentos técnicos", "Fontes", "Oficiais/cliente", "pendente política"],
    ["Histórico de campanhas", "Dados", "Envox", "pendente integração"],
  ];

  const flags = [
    ["Criar variação de legenda", "Cliente específico", "Campanha específica", "bloqueado"],
    ["Creative Room", "Convite temporário", "Escopo fechado", "bloqueado"],
    ["Gerar Story", "Cliente específico", "Somente quando liberado", "bloqueado"],
    ["Gerar vídeo", "Cliente específico", "Somente quando liberado", "bloqueado"],
    ["Publicar sem revisão Envox", "Qualquer cliente", "Nunca", "bloqueado"],
  ];

  const evals = [
    ["Tom institucional", "copy", "Aderência a regras e exemplos aprovados", "a construir"],
    ["Integridade da marca", "design", "Logo, paleta, tipografia e restrições", "a construir"],
    ["Precisão factual", "compliance", "Datas, normas, números e fontes", "a construir"],
    ["Risco de reprovação", "approval", "Histórico de feedback e padrões recorrentes", "a construir"],
    ["Coerência de campanha", "strategy", "Consistência entre peças e objetivo central", "a construir"],
  ];

  const badgeClass = (s) => /bloque/.test(s) ? "block" : /pendente|planejado|construir|benchmark/.test(s) ? "warn" : "ok";

  const Table = ({ headers, rows }) => (
    <div className="skills-card skills-table-wrap">
      <table className="skills-table">
        <thead><tr>{headers.map(h => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{j === r.length - 1 ? <span className={`skills-badge ${badgeClass(String(c))}`}>{c}</span> : c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );

  return (
    <div className="skills-shell">
      <div className="skills-head">
        <div>
          <div className="skills-kicker">Envox · sistema proprietário</div>
          <div className="skills-title">Envox Skills</div>
          <div className="skills-subtitle">Camada de inteligência para estratégia, criação, revisão e aprendizado da operação. O cliente recebe somente acessos controlados; o Brain permanece sob governança Envox.</div>
        </div>
        <div className="skills-context">
          <span className="skills-pill">Conta · SECOVI-PR</span>
          <span className="skills-pill live">v0.1 · foundation</span>
        </div>
      </div>

      <div className="skills-tabs">
        {tabs.map(([k, label]) => <button key={k} className={`skills-tab ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>{label}</button>)}
      </div>

      {tab === "overview" && (
        <div className="skills-grid">
          <div className="skills-client-banner">
            <div>
              <div className="skills-kicker">Cliente piloto</div>
              <div className="skills-client-name">SECOVI-PR</div>
              <div className="skills-client-desc">Primeiro Brain do Envox Skills. Nesta fase os dados abaixo são demonstrativos e não representam métricas reais do cliente.</div>
            </div>
            <div className="skills-demo">dados de demonstração</div>
          </div>
          {[["Skills planejadas","8","agentes especializados"],["Camadas do Brain","9","marca, comunicação, criação e memória"],["Acesso cliente","Restrito","feature flags + Creative Rooms"],["Execuções reais","0","integrações de IA ainda desligadas"]].map(([k,v,n]) => <div className="skills-card skills-stat" key={k}><div className="skills-stat-label">{k}</div><div className="skills-stat-value">{v}</div><div className="skills-stat-note">{n}</div></div>)}
          <div className="skills-card skills-main">
            <div className="skills-section-head"><div><div className="skills-card-title">Arquitetura de execução</div><div className="skills-card-note">O pedido passa por especialistas e validação antes da entrega.</div></div><span className="skills-link">foundation</span></div>
            {[["1","Orquestrador","Entende o objetivo e escolhe o fluxo."],["2","Especialistas","Estratégia, conteúdo, criação ou análise conforme a demanda."],["3","Brain","Injeta somente regras e conhecimento pertinentes ao contexto."],["4","Brand Guardian + QA","Revisa marca, factualidade, linguagem e riscos."],["5","Envox Review","Mantém a responsabilidade final da agência."]].map(([n,t,d]) => <div className="skills-row" key={n}><span className="skills-badge">{n}</span><div className="skills-row-main"><div className="skills-row-title">{t}</div><div className="skills-row-note">{d}</div></div></div>)}
          </div>
          <div className="skills-card skills-side">
            <div className="skills-section-head"><div><div className="skills-card-title">Próximas fundações</div><div className="skills-card-note">Sem execução automática nesta versão.</div></div></div>
            {[["Brain Schema","em construção","warn"],["AI Router","arquitetado","ok"],["Feature Flags","arquitetado","ok"],["Knowledge ingestion","pendente","warn"],["Agentes reais","pendente","warn"]].map(([t,s,c]) => <div className="skills-row" key={t}><div className="skills-row-main"><div className="skills-row-title">{t}</div></div><span className={`skills-badge ${c}`}>{s}</span></div>)}
          </div>
        </div>
      )}

      {tab === "brain" && (
        <div className="skills-two">
          <div className="skills-card skills-list-nav">
            {brainCats.map(([k,l,n]) => <button key={k} className={brainCat===k?"active":""} onClick={() => setBrainCat(k)}><span>{l}</span><span>{n}</span></button>)}
          </div>
          <div className="skills-card">
            <div className="skills-section-head"><div><div className="skills-card-title">{brainCats.find(x=>x[0]===brainCat)?.[1]}</div><div className="skills-card-note">Estrutura demonstrativa. Publicação/versionamento entra na próxima fase.</div></div>{isAdmin && <button className="skills-action secondary">Nova regra</button>}</div>
            {(brainRules[brainCat] || []).map(([t,l,b]) => <div className="skills-rule" key={t}><div className="skills-rule-top"><div className="skills-rule-title">{t}</div><span className={`skills-badge ${l==="bloqueante"?"block":""}`}>{l}</span></div><div className="skills-rule-body">{b}</div></div>)}
          </div>
        </div>
      )}

      {tab === "agents" && <Table headers={["Skill / agente","Núcleo","Responsabilidade","Estado"]} rows={agents} />}
      {tab === "router" && <Table headers={["Tipo de tarefa","Motor principal","Fallback","Política"]} rows={routes} />}
      {tab === "knowledge" && <Table headers={["Fonte","Tipo","Origem","Estado"]} rows={knowledge} />}
      {tab === "flags" && <Table headers={["Funcionalidade","Quem","Escopo","Default"]} rows={flags} />}
      {tab === "evals" && <Table headers={["Eval","Categoria","O que mede","Estado"]} rows={evals} />}
    </div>
  );
}

window.EnvoxSkillsScreen = EnvoxSkillsScreen;
