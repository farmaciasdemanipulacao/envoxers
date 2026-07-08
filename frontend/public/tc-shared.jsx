const { useState, useEffect, useCallback, useRef, createContext, useContext } = React;

function formatMoney(v) {
  const n = Number(v || 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Extrai só os dígitos do que foi digitado e trata como centavos (mesmo
// comportamento de máscara monetária dos apps de banco: "300000" -> 3000,00)
function parseMoneyInput(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  return digits ? parseInt(digits, 10) / 100 : 0;
}

// Input de dinheiro com máscara em tempo real. `value` é number, `onChange`
// recebe number. Reusa formatMoney como única fonte de formatação (só tira
// o prefixo "R$" porque o "R$" já vem do ::before de .money-input no CSS).
function MoneyInput({ value, onChange, placeholder = "0,00", disabled = false, readOnly = false, className = "", style }) {
  const display = value || value === 0 ? formatMoney(value).replace(/^R\$\s?/, "") : "";
  return (
    <div className={`money-input ${className}`.trim()} style={style}>
      <input
        type="text"
        inputMode="decimal"
        value={display}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        onChange={(e) => { if (!readOnly && !disabled && onChange) onChange(parseMoneyInput(e.target.value)); }}
      />
    </div>
  );
}

// ==================== TOAST ====================
const ToastContext = createContext(null);

function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = "info") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div style={{ position: "fixed", bottom: 20, right: 20, display: "flex", flexDirection: "column", gap: 8, zIndex: 999 }}>
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              padding: "10px 16px",
              borderRadius: "var(--r-md)",
              background: t.type === "error" ? "var(--farol-vermelho)" : t.type === "success" ? "var(--farol-verde)" : "var(--ink)",
              color: "#fff",
              fontSize: 13,
              boxShadow: "var(--shadow-2)",
              maxWidth: 320,
            }}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function useToast() {
  return useContext(ToastContext);
}

function initials(nome) {
  return (nome || "?").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

// ==================== SIDEBAR ====================
function Sidebar({ view, onNavigate, nome, permissao }) {
  const iniciais = initials(nome);

  const item = (key, label, icon, helpKey) => (
    <a className={view === key ? "active" : ""} onClick={() => onNavigate(key)} style={{ cursor: "pointer" }}>
      {icon}
      {label}
      {helpKey && <HelpIcon helpKey={helpKey} />}
    </a>
  );

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">envox<span className="brand-dot"></span></span>
        <span className="brand-sub">Cockpit</span>
        <HelpIcon helpKey="cockpit" />
      </div>

      <div className="nav-section">
        <div className="nav-section-title">Cadastros</div>
        <nav className="nav">
          {item(
            "clientes",
            "Clientes",
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="5" r="2.5" /><path d="M3 14c0-2.8 2.2-5 5-5s5 2.2 5 5" /></svg>,
            "nav_clientes"
          )}
          {item(
            "envoxers",
            "Envoxers",
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="6" cy="6" r="2" /><circle cx="11" cy="7" r="1.5" /><path d="M2 13c0-2.2 1.8-4 4-4s4 1.8 4 4" /><path d="M10 13c0-1.7 1.3-3 3-3" /></svg>,
            "nav_envoxers"
          )}
          {item(
            "servicos",
            "Serviços",
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 4h10M3 8h10M3 12h6" /></svg>,
            "nav_servicos"
          )}
        </nav>
      </div>

      <div className="nav-section">
        <div className="nav-section-title">F1 · Operação</div>
        <nav className="nav">
          {item(
            "kanban",
            "Kanban",
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="3" width="3" height="10" rx="1" /><rect x="6.5" y="3" width="3" height="7" rx="1" /><rect x="11" y="3" width="3" height="4" rx="1" /></svg>,
            "nav_kanban"
          )}
          {item(
            "dashboard",
            "Dashboard do dia",
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2" width="5" height="12" rx="1" /><rect x="9" y="2" width="5" height="6" rx="1" /></svg>,
            "nav_dashboard"
          )}
          {item(
            "calendario",
            "Calendário",
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="4" width="12" height="10" rx="1" /><path d="M2 7h12M6 2v3M10 2v3" /></svg>,
            "nav_calendario"
          )}
          {item(
            "relatorio",
            "Relatório de custo",
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 13V3M2 13h12" /><path d="M5 10V7M8 10V5M11 10V8" /></svg>,
            "nav_relatorio"
          )}
        </nav>
      </div>

      <div className="nav-section" style={{ marginTop: "auto" }}>
        <div className="nav-section-title">F2 · Farol</div>
        <nav className="nav">
          {item(
            "solicitacoes",
            "Solicitações",
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 4h12v8l-3-2H2z" /><path d="M5 7h6M5 9h4" /></svg>,
            "nav_solic"
          )}
          {item(
            "farol",
            "Farol",
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6" /><circle cx="8" cy="8" r="2" fill="currentColor" /></svg>,
            "nav_farol"
          )}
          {item(
            "alertas",
            "Alertas",
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 2l6 11H2z" /><path d="M8 6v3M8 11v.5" /></svg>,
            "nav_alertas"
          )}
        </nav>
      </div>

      <div className="nav-section">
        <div className="nav-section-title">F3 · ICP</div>
        <nav className="nav">
          {item(
            "icp",
            "ICP Builder",
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 12l4-4 3 3 5-5" /></svg>,
            "nav_icp"
          )}
          {item(
            "faturamento",
            "Painel de faturamento",
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 13l4-6 3 3 5-7" /><path d="M9 3h5v5" /></svg>,
            "nav_faturamento"
          )}
          {item(
            "churn",
            "Cancelamentos",
            <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4l8 8M12 4l-8 8" /></svg>,
            "nav_churn"
          )}
        </nav>
      </div>

      <div className="sidebar-user">
        <div className="avatar">{iniciais}</div>
        <div className="sidebar-user-info">
          <div className="sidebar-user-name">{nome}</div>
          <div className="sidebar-user-role">{permissao}</div>
        </div>
      </div>
    </aside>
  );
}

// ==================== PAGE HEADER ====================
function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="page-header">
      <div className="page-title-block">
        <h1>{title}</h1>
        {subtitle && <div className="page-sub">{subtitle}</div>}
      </div>
      {actions && <div style={{ display: "flex", gap: 8 }}>{actions}</div>}
    </div>
  );
}

// ==================== TOPBAR ====================
function Topbar({ crumb, onLogout }) {
  return (
    <div className="topbar">
      <div className="topbar-crumb">{crumb}</div>
      <div className="topbar-actions">
        <button className="btn btn-ghost btn-sm" onClick={onLogout}>Sair</button>
      </div>
    </div>
  );
}

// ==================== TOOLTIPS DE AJUDA (HelpIcon) ====================
// Textos copiados literalmente do wireframe (envox-f0-f3-wireframe.html, objeto
// HELP_TEXTS) — só o subconjunto usado nas telas em escopo (Farol, Alertas, ICP,
// Faturamento, Clientes, Envoxers, Calendário, Cancelamentos, Relatório de custo).
// Extensível: Dashboard, Kanban, Solicitações ficam de fora por ora.
const HELP_TEXTS = {
  cockpit: { t: "O que é o Cockpit", b: "<p>Sistema interno da Envox. Substitui o Ummense como fonte única da verdade.</p><p><strong>Objetivo nº 1:</strong> avisar antes que o cliente saia. Não é gestor de tarefas com farol — é gestor de risco de churn com kanban embutido.</p>" },

  // --- Navegação
  nav_calendario: { t: "Calendário geral", b: "<p>Publicações programadas + reuniões + captações + eventos externos, tudo numa agenda. Filtro por cliente.</p>" },
  nav_relatorio: { t: "Relatório de custo", b: "<p>Horas de Foco × custo do time × contrato. Mostra margem por cliente/serviço/tipo/envoxer. Sinaliza margem &lt;20% em amarelo, &lt;10% em vermelho.</p>" },
  nav_dashboard: { t: "Dashboard do dia", b: "<p>Resumo do que precisa da sua atenção hoje: farol dos clientes em risco, atrasos, aprovações pendentes, publicações dos próximos 3 dias, e captações do dia.</p>" },
  nav_kanban: { t: "Kanban de demandas", b: "<p>Todas as tarefas de todos os clientes em 8 colunas (Nova → Finalizado). Arraste cards entre colunas. Filtre por cliente, responsável, tipo e atrasadas.</p>" },
  nav_solic: { t: "Solicitações do cliente", b: "<p>Inbox de pedidos: novo post, alteração, material extra, campanha, dúvida, evento. Triar aqui evita que pedidos virem WhatsApp perdido.</p>" },

  // --- Dashboard
  dash_farol_widget: { t: "Farol do topo do Dashboard", b: "<p>Os até 5 clientes com pior health score aparecem aqui todo dia. Se você abrir o sistema só para uma coisa, é esta.</p><p>Clique no cliente para abrir a ficha.</p>" },
  dash_meu_foco: { t: "Meu Foco", b: "<p>Tempo total que você registrou <strong>hoje</strong> e <strong>esta semana</strong>, com o quanto isso vale em custo gerado.</p><p>A meta de 32h semanais é o benchmark: 4 dias × 8h. Envoxer com gestão registra menos (~120h/mês); operador registra mais (~160h/mês).</p>" },
  dash_progress: { t: "Em andamento", b: "<p>Tarefas nas colunas <em>Produção</em>, <em>Revisão interna</em> e <em>Ajustes</em>. É o que o time está tocando agora mesmo.</p>" },
  dash_late: { t: "Atrasadas", b: "<p>Tarefas com prazo interno vencido e ainda não finalizadas. Este é <strong>o número que precisa ir a zero</strong> — atraso alimenta o sinal 2 do farol.</p>" },
  dash_approvals: { t: "Aprovações pendentes", b: "<p>Tarefas em <em>Aprovação cliente</em>. Se ficarem paradas, viram sinal no farol.</p>" },
  dash_next3: { t: "Próximos 3 dias", b: "<p>Tarefas com prazo nos próximos 3 dias. Ajuda a decidir o que priorizar hoje para não atrasar a entrega.</p>" },
  dash_hoje_eventos: { t: "Captações e eventos de hoje", b: "<p>Reuniões, captações e eventos externos agendados para hoje. Cabe checar antes das 10h.</p>" },
  dash_rel_rapido: { t: "Relatório rápido", b: "<p>Prévia do Relatório de custo (menu Operação → Relatório). Mostra os clientes com pior situação de margem para você ver antes de abrir a tela cheia.</p>" },

  // --- Foco
  foco_hoje: { t: "Foco de hoje", b: "<p>Soma de todas as sessões de Foco finalizadas hoje, e quanto isso vale em custo gerado (horas × custo/hora do Envoxer).</p>" },
  foco_semana: { t: "Foco da semana", b: "<p>Soma da semana. A meta média (32h) é o benchmark para operadores; heads e gestores fazem menos por dividir tempo com gestão.</p>" },

  // --- Solicitações
  solic_tab_novas: { t: "Solicitações novas", b: "<p>Pedidos que ainda não foram vistos por ninguém do time. Meta: zerar em 24h.</p>" },
  solic_tab_analise: { t: "Em análise", b: "<p>Vistas, sendo avaliadas. Cliente vê \"estamos avaliando\".</p>" },
  solic_acao: { t: "Ações da solicitação", b: "<p><strong>Virar demanda</strong> cria um card no Kanban com os dados. <strong>Em análise</strong> só marca como vista. <strong>Recusar</strong> exige motivo — cliente é notificado.</p>" },
  nav_farol: { t: "Farol de clientes", b: "<p>Todos os clientes ordenados por risco (health score 0-100). Vermelho = ligação essa semana. Amarelo = próximos 15 dias. Verde = mensal.</p>" },
  nav_alertas: { t: "Central de alertas", b: "<p>Toda vez que um cliente muda de farol, um alerta é criado com motivo específico e sugestão de ação. Reconheça, resolva, ou ignore com justificativa.</p>" },
  nav_icp: { t: "ICP Builder", b: "<p>Compara clientes que ficaram &gt;12 meses com os que saíram em &lt;6 meses. A diferença entre os dois grupos é o seu ICP (quem buscar) e anti-ICP (quem evitar).</p>" },
  nav_churn: { t: "Cancelamentos", b: "<p>Histórico de churn. Cada cancelamento congela snapshot dos dados do cliente (segmento, ticket, canal, perfil) — sem isso o ICP builder mente.</p>" },
  nav_faturamento: { t: "Painel de faturamento", b: "<p>MRR real, concentração top 3, receita em risco, projeção 90 dias, curva de retenção por cohort. A previsibilidade que substitui a montanha-russa.</p>" },
  nav_clientes: { t: "Cadastro de clientes", b: "<p>Base viva de contas. Cada cliente carrega dados de contrato + dados de ICP (segmento, canal, ticket, maturidade) — capturados no cadastro para uso em F3.</p>" },
  nav_envoxers: { t: "Cadastro de Envoxers", b: "<p>Time interno. O <code>custo/hora</code> aqui alimenta a margem em todos os relatórios — use salário + encargos (~1,5-1,8×), não salário puro.</p>" },
  nav_servicos: { t: "Cadastro de serviços", b: "<p>Catálogo fixo do que a Envox oferece. Editar aqui reflete em contratos históricos — mude com cuidado.</p>" },

  // --- Farol
  farol_kpi_score: { t: "Score médio", b: "<p>Média do health score de todos os clientes ativos. Passar de 80 significa base saudável.</p>" },
  farol_ordenacao: { t: "Ordenação", b: "<p>Menor health score primeiro. Entre clientes da mesma cor, o pior score sobe. Isso resolve \"qual dos 2 vermelhos ligo hoje?\".</p>" },
  farol_kpi_verm: { t: "Clientes vermelhos", b: "<p>Farol geral vermelho. Cada um representa MRR em risco imediato. Ligação em até 7 dias.</p>" },
  farol_kpi_amar: { t: "Clientes amarelos", b: "<p>Alguma coisa não está bem, mas ainda dá para reverter sem drama. Cadência de contato: 15 dias.</p>" },
  farol_kpi_verde: { t: "Clientes verdes", b: "<p>Saudáveis. Foco: manter a cadência mensal, não relaxar. Cliente verde por 12+ meses vira base do ICP.</p>" },
  farol_health_score: { t: "Health Score", b: "<p>Nota 0-100 calculada dos 8 sinais ponderados.</p><p>Regra dura: 2+ sinais vermelhos força farol geral vermelho, independente do score.</p>" },
  farol_motivo: { t: "Motivo do farol", b: "<p>Só sinais que não estão verdes aparecem. Cada um mostra o valor bruto que disparou o alerta.</p>" },

  // --- Sinais do farol
  sig_entrega: { t: "Sinal 1 · Entrega", b: "<p>Tarefas finalizadas no prazo nos últimos 90 dias. Verde ≥80%; amarelo 50-79%; vermelho &lt;50%.</p><p>Peso 15.</p>" },
  sig_atrasadas: { t: "Sinal 2 · Atrasadas", b: "<p>Tarefas com prazo interno vencido e ainda não finalizadas. Verde 0; amarelo 1-2; vermelho 3+.</p><p>Peso 15.</p>" },
  sig_alteracoes: { t: "Sinal 3 · Alterações", b: "<p>Alterações pedidas vs. limite do escopo. Verde dentro do limite; amarelo no limite; vermelho passou.</p><p>Peso 10.</p>" },
  sig_aprovacoes: { t: "Sinal 4 · Aprovações paradas", b: "<p>Tempo em Revisão interna ou Aprovação cliente. Verde nenhuma &gt;5d parada; vermelho 1+; 2+ conta ainda mais.</p><p>Peso 10.</p>" },
  sig_pulso: { t: "Sinal 5 · Pulso de satisfação", b: "<p>Nota mensal 0-10 (NPS-like) do cliente. Verde ≥8; amarelo 6-7; vermelho ≤5.</p><p>Peso 25 — <strong>o maior</strong>.</p>" },
  sig_margem: { t: "Sinal 6 · Margem", b: "<p>(Contrato − custo horas) ÷ contrato. Verde ≥40%; amarelo 20-39%; vermelho &lt;20%.</p><p>Peso 15. Margem baixa não é insatisfação do cliente, é da agência.</p>" },
  sig_silencio: { t: "Sinal 7 · Silêncio", b: "<p>Dias desde o último check-in registrado. Verde ≤15d; amarelo 16-30d; vermelho &gt;30d.</p><p>Peso 10. Silêncio é dos sinais mais fortes de churn iminente.</p>" },
  sig_whatsapp: { t: "Sinal 8 · Termômetro WhatsApp", b: "<p>Viria por webhook do WhatsApp — sem integração no Envoxers ainda, por isso sempre \"sem dado\" (peso 0, não entra na conta).</p>" },

  // --- Alertas
  alerta_status: { t: "Estado do alerta", b: "<p><strong>Aberto</strong>: ninguém viu. <strong>Reconhecido</strong>: alguém pegou para si. <strong>Resolvido</strong>: cliente voltou ao verde ou situação foi tratada.</p>" },
  alerta_sugestao: { t: "Sugestão de ação", b: "<p>Baseada na combinação específica de sinais que disparou. Alerta útil, não decorativo.</p>" },

  // --- ICP Builder
  icp_retidos: { t: "Grupo A · Retidos", b: "<p>Clientes ativos há mais de 12 meses. Estes provaram fit — quem se parece com eles provavelmente também fica.</p>" },
  icp_perdidos: { t: "Grupo B · Perdidos cedo", b: "<p>Clientes que cancelaram com menos de 6 meses. Estes revelam o anti-ICP — quem se parece com eles, evite aceitar.</p>" },
  icp_insights: { t: "Insights automáticos", b: "<p>ICP (quem buscar) e anti-ICP (quem evitar) sintetizados em texto a partir das dimensões com maior diferença. Não é recomendação — é observação do padrão.</p>" },
  icp_dim_segmento: { t: "Segmento", b: "<p>Ramo de atividade. Se o mesmo segmento aparece muito em retidos e pouco em perdidos, é um bom sinal para buscar mais desse tipo.</p>" },
  icp_dim_canal: { t: "Canal de aquisição", b: "<p>Como o cliente chegou até a Envox. Sinal anti-ICP: outbound (prospecção fria) domina os perdidos cedo em quase todos os casos.</p>" },
  icp_dim_ticket: { t: "Ticket", b: "<p>Faturamento anual declarado pelo cliente. Serve para segmentar por porte. Ticket muito baixo geralmente = churn cedo por não conseguir pagar.</p>" },
  icp_dim_matur: { t: "Maturidade digital", b: "<p>Quão pronto o cliente está para marketing digital. Baixa maturidade = espera resultado sem entender o processo = churn por frustração.</p>" },
  icp_dim_perfil: { t: "Perfil comportamental", b: "<p>Fácil / neutro / difícil — como o cliente se comporta na operação. Detectável em 60-90 dias, antes de decidir se vale continuar.</p>" },

  // --- Painel de faturamento
  fat_mrr: { t: "MRR", b: "<p>Monthly Recurring Revenue — soma de <code>valor_contrato</code> dos clientes com <code>tipo_receita = recorrente</code>. É o número que separa faturamento previsível de projeto pontual.</p>" },
  fat_concentr: { t: "Concentração top 3", b: "<p>% do MRR que vem dos 3 maiores clientes. Acima de 30% é zona de risco: perder 1 mexe muito na receita.</p><p>Meta saudável: nenhum cliente responde por mais de 10% sozinho.</p>" },
  fat_risco: { t: "Receita em risco", b: "<p>Soma dos contratos em farol amarelo + vermelho. É o MRR que precisa de intervenção agora para não virar churn projetado no próximo mês.</p>" },
  fat_projecao: { t: "Projeção 90 dias", b: "<p>MRR menos os clientes em vermelho (churn projetado). Método conservador — assume que amarelos são reversíveis, vermelhos não.</p>" },
  fat_tempo_casa: { t: "Tempo médio de casa", b: "<p>Média de meses que os clientes ativos têm de contrato + média dos cancelados. Meta: passar dos 12 meses.</p>" },
  fat_mrr_chart: { t: "MRR mês a mês", b: "<p>Barras coloridas: meses fechados (azul), mês atual (preto), projeção 90 dias (hachurado).</p><p>Tendência importa mais que valor absoluto — 3 meses subindo = base saudável.</p>" },
  fat_concentr_chart: { t: "Barra de concentração", b: "<p>Cada segmento é um cliente do top MRR. Quanto maior a fatia, maior o risco de perdê-lo.</p>" },
  fat_cohort: { t: "Curva de retenção (cohort)", b: "<p>Cada linha é uma turma de contratação — mostra quantos ainda estão ativos N meses depois.</p><p>Verde escuro ≥90%, verde ≥70%, amarelo ≥50%, vermelho &lt;50%. Vazio = mês ainda no futuro.</p>" },

  // --- Form do cliente
  form_cli_ident: { t: "Identidade", b: "<p>Como o cliente aparece no sistema. Nome vira o rótulo em toda tela; logo é opcional.</p>" },
  form_cli_contrato: { t: "Contrato", b: "<p>Os campos aqui alimentam o Painel de faturamento e a projeção 90 dias. <code>Tipo de receita</code> separa recorrente (MRR) de pontual (não conta no MRR).</p>" },
  form_cli_icp: { t: "Dados de ICP", b: "<p>Estes campos parecem opcionais, mas são o que faz o ICP Builder funcionar em F3.</p><p>Cadastro pobre aqui = ICP cego lá. Preencha mesmo estimando.</p>" },
  form_cli_servicos: { t: "Serviços contratados", b: "<p>Marque os serviços do cliente e o valor mensal de cada um. A soma é <em>checagem</em> contra o <code>valor_contrato</code> — divergência maior que 10% acende alerta.</p>" },
  form_cli_escopo: { t: "Escopo mensal", b: "<p>Volumes contratados. O <code>limite de alterações</code> vira o sinal 3 do farol — passar do limite acende amarelo.</p>" },
  form_cli_links: { t: "Links e observações", b: "<p>Perfis do cliente e notas internas. As observações não são vistas pelo cliente.</p>" },

  // --- KPIs de Clientes
  cli_kpi_ativos: { t: "Clientes ativos", b: "<p>Contratos ativos (recorrente + pontual). Não inclui cancelados — esses ficam em <em>Retenção → Cancelamentos</em>.</p>" },
  cli_kpi_mrr: { t: "MRR contratado", b: "<p>Soma de <code>valor_contrato</code> dos clientes com <code>tipo_receita = recorrente</code>. É o número que o Painel de faturamento acompanha mês a mês.</p>" },
  cli_kpi_verm: { t: "Farol vermelho", b: "<p>Quantidade de clientes com farol calculado vermelho. Cada um tem uma ligação pendente essa semana.</p>" },
  cli_kpi_novos: { t: "Novos no mês (30d)", b: "<p>Clientes com <code>data_inicio_contrato</code> nos últimos 30 dias. Variação alta aqui é sinal comercial, não operacional.</p>" },

  // --- Ficha do cliente (textos originalmente de uma view separada no wireframe —
  // encaixados nas seções mais próximas do ClienteForm, decisão confirmada com o Gus)
  cli_cadencia: { t: "Cadência sugerida", b: "<p>Frequência de check-in que o sistema recomenda baseado no farol. Vermelho: 7 dias. Amarelo: 15. Verde: 30.</p><p>Editável — se for exceção conhecida (cliente que só quer 1× ao mês), sobrescreva.</p>" },
  cli_perfil: { t: "Perfil comportamental", b: "<p>Calculado: <strong>fácil / neutro / difícil</strong> a partir de velocidade de aprovação (peso 40), média de alterações por tarefa (peso 40) e atrasos causados pelo cliente (peso 20).</p><p>Score 0-100 (100 = mais fácil). É uma das dimensões do ICP.</p>" },
  cli_pulso_hist: { t: "Pulso — histórico", b: "<p>Barras: verde ≥9, amarelo 7-8, vermelho ≤6. Vazias hachuradas = mês sem registro.</p><p>Ver a <em>trajetória</em> importa mais que a nota atual — trajetória descendente é o sinal.</p>" },
  cli_checkins: { t: "Histórico de check-ins", b: "<p>Todo contato registrado com o cliente: ligação, reunião, mensagem, e-mail, presencial. Humor de cada um: positivo, neutro, negativo, crítico.</p>" },

  // --- Form do Envoxer
  form_env_ident: { t: "Identidade", b: "<p>Dados básicos. A <code>permissão</code> define o que o Envoxer pode ver: <em>envoxer</em> executa; <em>gestor</em> aprova; <em>admin</em> configura.</p>" },
  form_env_custo: { t: "Custo/hora", b: "<p>Use <strong>salário + encargos</strong> (multiplicador ~1,5-1,8×) dividido por horas úteis (~160h/mês).</p><p>Salário puro deixa a margem por cliente falsamente positiva.</p>" },

  // --- Calendário
  cal_legend: { t: "Cores do calendário", b: "<p>Azul = publicação (tarefa com prazo). Roxo = reunião. Âmbar = captação. Vermelho = live. Verde = evento externo. Marcador vermelho pequeno = cliente com farol vermelho.</p>" },

  // --- Relatório de custo
  rep_horas: { t: "Horas registradas", b: "<p>Soma de todas as sessões de Foco fechadas no período. Ajuda a estimar capacidade real do time.</p>" },
  rep_custo: { t: "Custo do time", b: "<p>Custo real das horas trabalhadas: <code>horas × custo/hora</code> por Envoxer. Já usa custo+encargos.</p>" },
  rep_receita: { t: "Receita do período", b: "<p>Soma de <code>valor_contrato</code> dos clientes com horas registradas no período. É o topo de linha do período.</p>" },
  rep_margem: { t: "Margem bruta", b: "<p>(Receita − Custo do time) ÷ Receita. Ainda não desconta overhead (aluguel, ferramentas, marketing). É o teto da margem, não o piso.</p>" },
  rep_tab_cliente: { t: "Margem por cliente", b: "<p>Ordena do menos rentável ao mais rentável. Vermelho = margem &lt;10%. Amarelo = 10-20%. Verde = &gt;20%.</p><p>Cliente vermelho + farol vermelho = renegociar ou encerrar.</p>" },
  rep_tab_servico: { t: "Por serviço", b: "<p>Onde o time está gastando horas por tipo de serviço. Mostra o \"peso\" de cada oferta na operação.</p>" },
  rep_tab_tipo: { t: "Por tipo de tarefa", b: "<p>Custo médio por Reels, Carrossel, Story, etc. Serve para saber se o preço do escopo cobre o custo real de cada peça.</p>" },
  rep_tab_env: { t: "Por Envoxer", b: "<p>Horas + custo gerado + <em>utilização</em> (horas registradas ÷ meta). Utilização &gt;90% = sobrealocado; &lt;60% = subutilizado.</p>" },

  // --- Kanban
  kanban_col_nova: { t: "Nova demanda", b: "<p>Ponto de entrada. Tarefa cadastrada mas sem responsável ou prazo ainda.</p>" },
  kanban_col_planejamento: { t: "Planejamento", b: "<p>Definindo roteiro, briefing, referências. Pré-produção.</p>" },
  kanban_col_producao: { t: "Produção", b: "<p>Executando. Arte, edição, escrita. É onde o Foco geralmente acontece.</p>" },
  kanban_col_revisao_interna: { t: "Revisão interna", b: "<p>Gestor confere antes de mostrar ao cliente. <strong>Ninguém pula essa etapa</strong> — problemas aqui custam menos que problemas na aprovação do cliente.</p>" },
  kanban_col_aprovacao_cliente: { t: "Aprovação cliente", b: "<p>Cliente recebe criativo + legenda. Aprovando, vai para Programado. Solicitando ajuste, volta para Ajustes e incrementa o contador de alterações (sinal 3 do farol).</p>" },
  kanban_col_ajustes: { t: "Ajustes", b: "<p>Cliente pediu alteração. Executar e devolver para Aprovação cliente.</p>" },
  kanban_col_programado: { t: "Programado", b: "<p>Aprovado, aguardando data de publicação.</p>" },
  kanban_col_finalizado: { t: "Finalizado", b: "<p>Publicado ou entregue. Some do quadro por padrão (toggle \"Ocultar finalizadas\" acima).</p>" },
  card_farol: { t: "Listra colorida do card", b: "<p>É o farol do <strong>cliente</strong>, não da tarefa. Verde/amarelo/vermelho.</p><p>Facilita ver cards de clientes em risco sem precisar ler o nome.</p>" },
  card_etiqueta: { t: "Etiquetas do card", b: "<p>Texto livre com cor. Use para agrupar campanhas, sinalizar urgência ou marcar contexto (ex.: \"Cliente vermelho\", \"Campanha julho\", \"Urgente\").</p>" },
  card_prazo: { t: "Prazo interno", b: "<p>Quando o <strong>time</strong> precisa terminar. Diferente de <em>data de publicação</em>, que é quando o conteúdo vai ao ar. Confundir os dois é erro clássico.</p>" },
  modal_criativo: { t: "Criativo", b: "<p>Peça pronta para revisão. Substituída conforme entra em Ajustes.</p>" },
  modal_legenda: { t: "Legenda", b: "<p>Texto que acompanha o criativo. Fica visível ao cliente na aprovação.</p>" },
  modal_foco: { t: "Foco", b: "<p>Cronômetro por tarefa. Só um Foco ativo por Envoxer por vez — o banco impede duas sessões simultâneas.</p><p>Registre para entregarmos melhor e cobrarmos o preço justo.</p>" },
  modal_aprovacao_int: { t: "Aprovação interna", b: "<p>Etapa 1 de aprovação: <strong>gestor</strong> confere antes de o cliente ver. Aprovado, vai para o cliente. Pedir ajuste devolve para Produção.</p>" },
  modal_aprovacao_cli: { t: "Aprovação do cliente", b: "<p>Etapa 2 de aprovação: <strong>cliente</strong> aprova ou pede alteração. Cada alteração é registrada com descrição, número sequencial e conta contra o limite do contrato.</p>" },
  modal_alteracoes: { t: "Alterações", b: "<p>Pedidos de ajuste do cliente, numerados. Comparado ao <em>limite de alterações</em> do escopo. Passar do limite gera alerta e alimenta o sinal 3 do farol.</p>" },
  modal_comentarios: { t: "Comentários internos", b: "<p>Mural da tarefa. Não é visto pelo cliente. Use para alinhar com o time.</p>" },
  modal_anexos: { t: "Anexos", b: "<p>Referências, briefings, arquivos-fonte. Diferente do criativo (que é a peça pronta), anexos são apoio.</p>" },

  // --- Cancelamentos
  churn_total: { t: "Total no histórico", b: "<p>Últimos 24 meses de cancelamentos registrados. Base de dados para o ICP builder.</p>" },
  churn_cedo: { t: "Saíram cedo (<6m)", b: "<p>Cancelamentos com menos de 6 meses de casa. Estes vão para o grupo B (anti-ICP) do ICP builder.</p>" },
  churn_media: { t: "Tempo médio de casa", b: "<p>Média de meses até o cancelamento. Se esse número subir, a montanha-russa acabou.</p>" },
  churn_top: { t: "Motivo top", b: "<p>Motivo mais frequente no histórico. Sinaliza padrão sistemático — se for \"preço\", revisar ICP de ticket. Se for \"atraso\", operação.</p>" },
  churn_motivo: { t: "Motivo do cancelamento", b: "<p>12 opções catalogadas em 6 categorias: Preço, Entrega, Encaixe, Externa, Ativa (trocou de agência), Sem resposta.</p><p>Escolha o mais próximo — este campo alimenta a análise de padrão em F5.</p>" },
  churn_snapshot: { t: "Snapshot congelado", b: "<p>No cancelamento, o sistema congela: segmento, ticket, canal, maturidade, perfil comportamental, margem média, pulso médio, farol final, meses de casa.</p><p>Editar o cliente depois não altera o snapshot — é o único jeito de o ICP builder ser honesto.</p>" },
};

function HlpPopover({ btnRect, h, arrowLeftHint }) {
  const popRef = useRef(null);
  const [pos, setPos] = useState(null);
  const [arrowSide, setArrowSide] = useState("top");

  useEffect(() => {
    if (!popRef.current) return;
    const popW = 320;
    const gap = 10;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = btnRect.left + btnRect.width / 2 - 24;
    if (left + popW > vw - 12) left = vw - popW - 12;
    if (left < 12) left = 12;
    let top = btnRect.bottom + gap;
    const ph = popRef.current.getBoundingClientRect().height;
    let arrow = "top";
    if (top + ph > vh - 12) {
      top = btnRect.top - ph - gap;
      arrow = "bottom";
    }
    const arrowLeft = Math.max(8, Math.min(popW - 18, btnRect.left + btnRect.width / 2 - left - 5));
    setPos({ left, top, arrowLeft });
    setArrowSide(arrow);
  }, [btnRect]);

  return (
    <div
      className={"hlp-pop" + (pos ? " open" : "")}
      ref={popRef}
      style={pos ? { left: pos.left, top: pos.top, maxWidth: 320 } : { left: -9999, top: -9999, maxWidth: 320 }}
      onClick={(e) => e.stopPropagation()}
    >
      <h4>{h.t}</h4>
      <div dangerouslySetInnerHTML={{ __html: h.b }} />
      <div className={"hlp-pop-arrow " + arrowSide} style={pos ? { left: pos.arrowLeft } : undefined}></div>
    </div>
  );
}

function HelpIcon({ helpKey, onDark }) {
  const [aberto, setAberto] = useState(false);
  const [btnRect, setBtnRect] = useState(null);
  const btnRef = useRef(null);
  const h = HELP_TEXTS[helpKey];

  const toggle = (e) => {
    e.stopPropagation();
    if (aberto) { setAberto(false); return; }
    setBtnRect(btnRef.current.getBoundingClientRect());
    setAberto(true);
  };

  useEffect(() => {
    if (!aberto) return;
    const fechar = () => setAberto(false);
    const onKey = (e) => { if (e.key === "Escape") fechar(); };
    document.addEventListener("click", fechar);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", fechar);
    window.addEventListener("scroll", fechar, true);
    return () => {
      document.removeEventListener("click", fechar);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", fechar);
      window.removeEventListener("scroll", fechar, true);
    };
  }, [aberto]);

  if (!h) return null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={"hlp" + (onDark ? " on-dark" : "") + (aberto ? " active" : "")}
        aria-label="Ajuda"
        onClick={toggle}
      >
        ?
      </button>
      {aberto && btnRect && ReactDOM.createPortal(
        <HlpPopover btnRect={btnRect} h={h} />,
        document.body
      )}
    </>
  );
}

window.EnvoxersShared = { formatMoney, parseMoneyInput, MoneyInput, ToastProvider, useToast, Sidebar, PageHeader, Topbar, HelpIcon, initials };
