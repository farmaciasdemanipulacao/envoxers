-- =====================================================================
-- Envox — Sistema Interno — Schema F0 (Fundação)
-- MySQL 8.0+ / utf8mb4
-- =====================================================================

CREATE DATABASE IF NOT EXISTS envox
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

USE envox;

-- ---------------------------------------------------------------------
-- ENVOXER — pessoas que trabalham na agência
-- ---------------------------------------------------------------------
CREATE TABLE envoxer (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome          VARCHAR(120)    NOT NULL,
  email         VARCHAR(160)    NOT NULL,
  cargo         VARCHAR(80)     NOT NULL,
  custo_hora    DECIMAL(10,2)   NOT NULL DEFAULT 0.00
                COMMENT 'Custo/hora real: salário + encargos (~1.5-1.8x)',
  permissao     ENUM('admin','gestor','envoxer') NOT NULL DEFAULT 'envoxer',
  foto_url      VARCHAR(500)    NULL,
  pontos        INT UNSIGNED    NOT NULL DEFAULT 0
                COMMENT 'Gamificação — F4',
  ativo         TINYINT(1)      NOT NULL DEFAULT 1,
  created_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                        ON UPDATE CURRENT_TIMESTAMP,
  deleted_at    TIMESTAMP       NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_envoxer_email (email),
  KEY idx_envoxer_permissao (permissao),
  KEY idx_envoxer_ativo (ativo, deleted_at)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- SERVICO — catálogo fixo dos serviços da Envox
-- ---------------------------------------------------------------------
CREATE TABLE servico (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome          VARCHAR(80)     NOT NULL,
  slug          VARCHAR(40)     NOT NULL
                COMMENT 'social | trafego | design | video | sdr | site | atendimento',
  descricao     VARCHAR(300)    NULL,
  ativo         TINYINT(1)      NOT NULL DEFAULT 1,
  created_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                        ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_servico_slug (slug)
) ENGINE=InnoDB;

-- Seed dos serviços da Envox
INSERT INTO servico (nome, slug, descricao) VALUES
  ('Social Media',    'social',      'Planejamento, criação e gestão de conteúdo social'),
  ('Tráfego Pago',    'trafego',     'Meta Ads, Google Ads, gestão de campanhas'),
  ('Design',          'design',      'Peças gráficas, identidade, materiais'),
  ('Vídeo',           'video',       'Roteiro, gravação, edição'),
  ('SDR',             'sdr',         'Prospecção ativa e pré-venda'),
  ('Site',            'site',        'Landing pages e websites'),
  ('Atendimento',     'atendimento', 'Gestão de conta e relacionamento');

-- ---------------------------------------------------------------------
-- CLIENTE — enriquecido para ICP desde F0
-- ---------------------------------------------------------------------
CREATE TABLE cliente (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome                  VARCHAR(160)    NOT NULL,
  logo_url              VARCHAR(500)    NULL,

  -- Contrato
  valor_contrato        DECIMAL(12,2)   NOT NULL DEFAULT 0.00
                        COMMENT 'Soma dos serviços contratados; snapshot para MRR',
  tipo_receita          ENUM('recorrente','pontual') NOT NULL DEFAULT 'recorrente',
  data_inicio_contrato  DATE            NULL,
  data_cancelamento     DATE            NULL
                        COMMENT 'F3 — quando preenchido, cliente = churn',

  -- Campos de ICP (v3, seção 3)
  segmento              VARCHAR(80)     NULL
                        COMMENT 'Ex: farmácia de manipulação, clínica, e-commerce',
  canal_aquisicao       ENUM('indicacao','inbound','outbound','evento','sdr','outro') NULL,
  ticket                DECIMAL(12,2)   NULL
                        COMMENT 'Ticket declarado do cliente (faturamento dele)',
  maturidade_digital    ENUM('baixa','media','alta') NULL,

  -- Operacional
  responsavel_envoxer_id BIGINT UNSIGNED NULL,
  links_redes           JSON            NULL
                        COMMENT '{"instagram":"...","facebook":"...","site":"..."}',
  observacoes           TEXT            NULL,

  -- Farol calculado em F2/F3 — em F0 apenas placeholder para as telas
  status_farol          ENUM('verde','amarelo','vermelho') NOT NULL DEFAULT 'verde'
                        COMMENT 'Placeholder até F2; será recalculado',

  ativo                 TINYINT(1)      NOT NULL DEFAULT 1,
  created_at            TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                                ON UPDATE CURRENT_TIMESTAMP,
  deleted_at            TIMESTAMP       NULL,

  PRIMARY KEY (id),
  KEY idx_cliente_responsavel (responsavel_envoxer_id),
  KEY idx_cliente_ativo (ativo, deleted_at),
  KEY idx_cliente_farol (status_farol),
  KEY idx_cliente_tipo_receita (tipo_receita),
  KEY idx_cliente_segmento (segmento),
  KEY idx_cliente_data_inicio (data_inicio_contrato),

  CONSTRAINT fk_cliente_responsavel
    FOREIGN KEY (responsavel_envoxer_id) REFERENCES envoxer(id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- CLIENTE_SERVICO — N:M cliente x serviço, com valor por serviço
-- ---------------------------------------------------------------------
CREATE TABLE cliente_servico (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cliente_id      BIGINT UNSIGNED NOT NULL,
  servico_id      BIGINT UNSIGNED NOT NULL,
  valor_mensal    DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
  observacao      VARCHAR(300)    NULL,
  created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                          ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cliente_servico (cliente_id, servico_id),
  KEY idx_cs_cliente (cliente_id),
  KEY idx_cs_servico (servico_id),
  CONSTRAINT fk_cs_cliente FOREIGN KEY (cliente_id) REFERENCES cliente(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_cs_servico FOREIGN KEY (servico_id) REFERENCES servico(id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- ESCOPO — 1:1 com cliente
-- ---------------------------------------------------------------------
CREATE TABLE escopo (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cliente_id          BIGINT UNSIGNED NOT NULL,
  posts_mes           INT UNSIGNED    NOT NULL DEFAULT 0,
  videos_mes          INT UNSIGNED    NOT NULL DEFAULT 0,
  campanhas_mes       INT UNSIGNED    NOT NULL DEFAULT 0,
  limite_alteracoes   INT UNSIGNED    NOT NULL DEFAULT 2
                      COMMENT 'Alterações por peça — usado no Farol sinal 3',
  outros_itens        TEXT            NULL
                      COMMENT 'Texto livre p/ itens não padronizáveis',
  created_at          TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                              ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_escopo_cliente (cliente_id),
  CONSTRAINT fk_escopo_cliente FOREIGN KEY (cliente_id) REFERENCES cliente(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- VIEW utilitária para telas de listagem de cliente
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_cliente_lista AS
SELECT
  c.id,
  c.nome,
  c.logo_url,
  c.status_farol,
  c.tipo_receita,
  c.segmento,
  c.data_inicio_contrato,
  c.valor_contrato,
  COALESCE(SUM(cs.valor_mensal), 0) AS valor_servicos_soma,
  TIMESTAMPDIFF(MONTH, c.data_inicio_contrato, CURDATE()) AS meses_de_casa,
  e.nome AS responsavel_nome,
  e.foto_url AS responsavel_foto,
  c.ativo,
  c.created_at
FROM cliente c
LEFT JOIN cliente_servico cs ON cs.cliente_id = c.id
LEFT JOIN envoxer e ON e.id = c.responsavel_envoxer_id
WHERE c.deleted_at IS NULL
GROUP BY c.id;


-- =====================================================================
-- F1 — Operação interna (Kanban, tarefas, comentários, anexos)
-- =====================================================================

CREATE TABLE tipo_tarefa_catalogo (
  id      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome    VARCHAR(60)     NOT NULL,
  ativo   TINYINT(1)      NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tipo_nome (nome)
) ENGINE=InnoDB;

INSERT INTO tipo_tarefa_catalogo (nome) VALUES
  ('Post estático'), ('Carrossel'), ('Reels'), ('Story'),
  ('Campanha de tráfego'), ('Criativo (arte)'), ('Vídeo curto'),
  ('Vídeo longo'), ('E-mail marketing'), ('Landing page'),
  ('Roteiro'), ('Legenda'), ('Cronograma editorial'), ('Relatório mensal');

CREATE TABLE tarefa (
  id                          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cliente_id                  BIGINT UNSIGNED NOT NULL,
  servico_id                  BIGINT UNSIGNED NULL,
  titulo                      VARCHAR(200)    NOT NULL,
  descricao                   TEXT            NULL,
  tipo_tarefa                 VARCHAR(60)     NULL,
  responsavel_envoxer_id      BIGINT UNSIGNED NULL,

  status                      ENUM(
                                'nova','planejamento','producao',
                                'revisao_interna','aprovacao_cliente','ajustes',
                                'programado','finalizado'
                              ) NOT NULL DEFAULT 'nova',
  ordem                       INT UNSIGNED    NOT NULL DEFAULT 0
                              COMMENT 'Ordem manual dentro do status',

  prazo                       DATE            NULL,
  data_prevista_publicacao    DATE            NULL,

  etiqueta                    VARCHAR(40)     NULL,
  etiqueta_cor                VARCHAR(20)     NULL
                              COMMENT 'azul|amarelo|vermelho|verde|roxo|cinza',

  legenda                     TEXT            NULL,

  criado_por_envoxer_id       BIGINT UNSIGNED NULL,
  finalizada_em               TIMESTAMP       NULL,
  created_at                  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                                      ON UPDATE CURRENT_TIMESTAMP,
  deleted_at                  TIMESTAMP       NULL,

  PRIMARY KEY (id),
  KEY idx_tarefa_cliente (cliente_id),
  KEY idx_tarefa_status_ordem (status, ordem),
  KEY idx_tarefa_responsavel (responsavel_envoxer_id),
  KEY idx_tarefa_prazo (prazo),
  KEY idx_tarefa_publicacao (data_prevista_publicacao),
  KEY idx_tarefa_ativa (deleted_at, status),

  CONSTRAINT fk_tarefa_cliente     FOREIGN KEY (cliente_id) REFERENCES cliente(id) ON DELETE RESTRICT,
  CONSTRAINT fk_tarefa_servico     FOREIGN KEY (servico_id) REFERENCES servico(id) ON DELETE SET NULL,
  CONSTRAINT fk_tarefa_responsavel FOREIGN KEY (responsavel_envoxer_id) REFERENCES envoxer(id) ON DELETE SET NULL,
  CONSTRAINT fk_tarefa_criador     FOREIGN KEY (criado_por_envoxer_id) REFERENCES envoxer(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE tarefa_comentario (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tarefa_id    BIGINT UNSIGNED NOT NULL,
  envoxer_id   BIGINT UNSIGNED NOT NULL,
  conteudo     TEXT            NOT NULL,
  created_at   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_com_tarefa (tarefa_id, created_at),
  CONSTRAINT fk_com_tarefa  FOREIGN KEY (tarefa_id)  REFERENCES tarefa(id) ON DELETE CASCADE,
  CONSTRAINT fk_com_envoxer FOREIGN KEY (envoxer_id) REFERENCES envoxer(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE tarefa_anexo (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tarefa_id    BIGINT UNSIGNED NOT NULL,
  nome         VARCHAR(200)    NOT NULL,
  url          VARCHAR(500)    NOT NULL,
  mime_type    VARCHAR(80)     NULL,
  tamanho_kb   INT UNSIGNED    NULL,
  tipo         ENUM('criativo','referencia','briefing','outro') NOT NULL DEFAULT 'outro',
  enviado_por_envoxer_id BIGINT UNSIGNED NULL,
  created_at   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_anexo_tarefa (tarefa_id),
  CONSTRAINT fk_anexo_tarefa  FOREIGN KEY (tarefa_id) REFERENCES tarefa(id) ON DELETE CASCADE,
  CONSTRAINT fk_anexo_envoxer FOREIGN KEY (enviado_por_envoxer_id) REFERENCES envoxer(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE OR REPLACE VIEW vw_tarefa_card AS
SELECT
  t.id, t.titulo, t.status, t.ordem, t.tipo_tarefa,
  t.prazo, t.data_prevista_publicacao,
  t.etiqueta, t.etiqueta_cor,
  DATEDIFF(t.prazo, CURDATE()) AS dias_para_prazo,
  (t.prazo < CURDATE() AND t.status <> 'finalizado') AS atrasada,
  c.id AS cliente_id, c.nome AS cliente_nome, c.status_farol AS cliente_farol,
  s.nome AS servico_nome, s.slug AS servico_slug,
  e.id AS responsavel_id, e.nome AS responsavel_nome, e.foto_url AS responsavel_foto,
  (SELECT COUNT(*) FROM tarefa_comentario WHERE tarefa_id = t.id) AS qtd_comentarios,
  (SELECT COUNT(*) FROM tarefa_anexo      WHERE tarefa_id = t.id) AS qtd_anexos,
  t.created_at, t.updated_at
FROM tarefa t
JOIN cliente c ON c.id = t.cliente_id
LEFT JOIN servico s ON s.id = t.servico_id
LEFT JOIN envoxer e ON e.id = t.responsavel_envoxer_id
WHERE t.deleted_at IS NULL;


-- =====================================================================
-- F1 — Foco (registro de tempo)
-- =====================================================================

CREATE TABLE registro_tempo (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  envoxer_id          BIGINT UNSIGNED NOT NULL,
  tarefa_id           BIGINT UNSIGNED NULL
                      COMMENT 'Nullable: Foco pode ser em atividade sem tarefa (reunião, treino, admin)',

  inicio              DATETIME        NOT NULL,
  fim                 DATETIME        NULL
                      COMMENT 'NULL = sessão ainda ativa',
  duracao_segundos    INT UNSIGNED    NULL
                      COMMENT 'Materializado quando fim é preenchido',

  -- Snapshot financeiro (histórico preservado se custo_hora do envoxer mudar)
  custo_hora_snapshot DECIMAL(10,2)   NULL,
  custo               DECIMAL(10,2)   NULL
                      COMMENT '(duracao_segundos/3600) * custo_hora_snapshot',

  descricao           VARCHAR(300)    NULL
                      COMMENT 'O que foi feito — livre',

  created_at          TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                              ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_rt_envoxer_inicio (envoxer_id, inicio),
  KEY idx_rt_tarefa (tarefa_id),
  KEY idx_rt_fim (fim),

  CONSTRAINT fk_rt_envoxer FOREIGN KEY (envoxer_id) REFERENCES envoxer(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_rt_tarefa  FOREIGN KEY (tarefa_id)  REFERENCES tarefa(id)
    ON DELETE SET NULL ON UPDATE CASCADE,

  CONSTRAINT chk_rt_ordem CHECK (fim IS NULL OR fim > inicio)
) ENGINE=InnoDB;

-- Índice funcional: apenas UMA sessão ativa por envoxer
CREATE UNIQUE INDEX uq_rt_envoxer_ativo
  ON registro_tempo ((CASE WHEN fim IS NULL THEN envoxer_id ELSE NULL END));

-- =====================================================================
-- Views para o Relatório Tempo × Custo
-- =====================================================================

CREATE OR REPLACE VIEW vw_tempo_por_tarefa AS
SELECT
  tarefa_id,
  COUNT(*)                                     AS qtd_sessoes,
  SUM(duracao_segundos)                        AS total_segundos,
  ROUND(SUM(duracao_segundos)/3600, 2)         AS total_horas,
  SUM(custo)                                   AS total_custo
FROM registro_tempo
WHERE tarefa_id IS NOT NULL AND fim IS NOT NULL
GROUP BY tarefa_id;

CREATE OR REPLACE VIEW vw_tempo_por_cliente AS
SELECT
  c.id            AS cliente_id,
  c.nome          AS cliente_nome,
  c.status_farol  AS farol,
  c.valor_contrato,
  c.tipo_receita,
  c.segmento,
  COUNT(rt.id)                              AS qtd_sessoes,
  ROUND(SUM(rt.duracao_segundos)/3600, 2)   AS total_horas,
  COALESCE(SUM(rt.custo), 0)                AS total_custo,
  c.valor_contrato - COALESCE(SUM(rt.custo), 0) AS margem_absoluta,
  CASE
    WHEN c.valor_contrato > 0
    THEN ROUND(((c.valor_contrato - COALESCE(SUM(rt.custo),0)) / c.valor_contrato) * 100, 1)
    ELSE NULL
  END AS margem_percentual
FROM cliente c
LEFT JOIN tarefa t   ON t.cliente_id = c.id AND t.deleted_at IS NULL
LEFT JOIN registro_tempo rt ON rt.tarefa_id = t.id AND rt.fim IS NOT NULL
WHERE c.deleted_at IS NULL
GROUP BY c.id;

CREATE OR REPLACE VIEW vw_tempo_por_servico AS
SELECT
  s.id AS servico_id, s.nome AS servico_nome,
  COUNT(rt.id) AS qtd_sessoes,
  ROUND(SUM(rt.duracao_segundos)/3600, 2) AS total_horas,
  COALESCE(SUM(rt.custo),0) AS total_custo
FROM servico s
LEFT JOIN tarefa t  ON t.servico_id = s.id AND t.deleted_at IS NULL
LEFT JOIN registro_tempo rt ON rt.tarefa_id = t.id AND rt.fim IS NOT NULL
GROUP BY s.id;

CREATE OR REPLACE VIEW vw_tempo_por_envoxer AS
SELECT
  e.id AS envoxer_id, e.nome, e.cargo, e.custo_hora,
  COUNT(rt.id) AS qtd_sessoes,
  ROUND(SUM(rt.duracao_segundos)/3600, 2) AS total_horas,
  COALESCE(SUM(rt.custo),0) AS custo_gerado
FROM envoxer e
LEFT JOIN registro_tempo rt ON rt.envoxer_id = e.id AND rt.fim IS NOT NULL
WHERE e.deleted_at IS NULL
GROUP BY e.id;

-- Trigger: preenche automaticamente duração e custo ao fechar sessão
DELIMITER $$
CREATE TRIGGER trg_rt_before_update
BEFORE UPDATE ON registro_tempo
FOR EACH ROW
BEGIN
  IF NEW.fim IS NOT NULL AND OLD.fim IS NULL THEN
    SET NEW.duracao_segundos = TIMESTAMPDIFF(SECOND, NEW.inicio, NEW.fim);
    IF NEW.custo_hora_snapshot IS NULL THEN
      SELECT custo_hora INTO @ch FROM envoxer WHERE id = NEW.envoxer_id;
      SET NEW.custo_hora_snapshot = @ch;
    END IF;
    SET NEW.custo = ROUND((NEW.duracao_segundos / 3600) * NEW.custo_hora_snapshot, 2);
  END IF;
END$$
DELIMITER ;


-- =====================================================================
-- F2 (parcial) — Aprovações + Alterações + Solicitações + Calendário
-- =====================================================================

ALTER TABLE tarefa
  ADD COLUMN qtd_alteracoes    INT UNSIGNED NOT NULL DEFAULT 0
      COMMENT 'Materializado — vira sinal 3 do Farol',
  ADD COLUMN aprovada_interna  TINYINT(1)   NOT NULL DEFAULT 0,
  ADD COLUMN aprovada_cliente  TINYINT(1)   NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------
-- APROVACAO — histórico de decisões (interna E cliente)
-- ---------------------------------------------------------------------
CREATE TABLE aprovacao (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tarefa_id       BIGINT UNSIGNED NOT NULL,
  etapa           ENUM('interna','cliente') NOT NULL,
  decisao         ENUM('aprovada','pediu_ajuste') NOT NULL,
  decidido_por_envoxer_id BIGINT UNSIGNED NULL
                  COMMENT 'Quem aprovou/pediu ajuste — NULL se veio do cliente',
  decidido_por_cliente_nome VARCHAR(120) NULL
                  COMMENT 'Nome do contato do cliente',
  comentario      TEXT            NULL,
  created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_apr_tarefa (tarefa_id, created_at),
  CONSTRAINT fk_apr_tarefa FOREIGN KEY (tarefa_id) REFERENCES tarefa(id) ON DELETE CASCADE,
  CONSTRAINT fk_apr_envoxer FOREIGN KEY (decidido_por_envoxer_id) REFERENCES envoxer(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- ALTERACAO — pedido de ajuste do cliente (contabilizado)
-- ---------------------------------------------------------------------
CREATE TABLE alteracao (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tarefa_id       BIGINT UNSIGNED NOT NULL,
  numero          INT UNSIGNED    NOT NULL
                  COMMENT 'Sequencial POR TAREFA (1, 2, 3...)',
  descricao       TEXT            NOT NULL,
  solicitante_cliente_nome VARCHAR(120) NULL,
  status          ENUM('pendente','em_execucao','feita','descartada') NOT NULL DEFAULT 'pendente',
  atendida_por_envoxer_id BIGINT UNSIGNED NULL,
  created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                          ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_alt_tarefa_numero (tarefa_id, numero),
  KEY idx_alt_tarefa (tarefa_id),
  CONSTRAINT fk_alt_tarefa  FOREIGN KEY (tarefa_id) REFERENCES tarefa(id) ON DELETE CASCADE,
  CONSTRAINT fk_alt_envoxer FOREIGN KEY (atendida_por_envoxer_id) REFERENCES envoxer(id) ON DELETE SET NULL
) ENGINE=InnoDB;

DELIMITER $$

CREATE TRIGGER trg_alt_before_insert
BEFORE INSERT ON alteracao
FOR EACH ROW
BEGIN
  IF NEW.numero IS NULL OR NEW.numero = 0 THEN
    SELECT COALESCE(MAX(numero), 0) + 1 INTO @n FROM alteracao WHERE tarefa_id = NEW.tarefa_id;
    SET NEW.numero = @n;
  END IF;
END$$

CREATE TRIGGER trg_alt_after_insert
AFTER INSERT ON alteracao
FOR EACH ROW
BEGIN
  UPDATE tarefa
    SET qtd_alteracoes = qtd_alteracoes + 1
    WHERE id = NEW.tarefa_id;
END$$

DELIMITER ;

-- ---------------------------------------------------------------------
-- SOLICITACAO — inbox de pedidos do cliente
-- ---------------------------------------------------------------------
CREATE TABLE solicitacao (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cliente_id            BIGINT UNSIGNED NOT NULL,
  tipo                  ENUM('novo_post','alteracao','material_extra','campanha','evento_captacao','duvida','outro') NOT NULL,
  titulo                VARCHAR(200)    NOT NULL,
  descricao             TEXT            NULL,
  status                ENUM('nova','em_analise','aprovada','recusada','virou_tarefa') NOT NULL DEFAULT 'nova',
  motivo_recusa         VARCHAR(300)    NULL,

  tarefa_id_gerada      BIGINT UNSIGNED NULL,

  solicitante_nome      VARCHAR(120)    NULL,
  atendido_por_envoxer_id BIGINT UNSIGNED NULL,

  created_at            TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                                ON UPDATE CURRENT_TIMESTAMP,
  respondido_em         TIMESTAMP       NULL,

  PRIMARY KEY (id),
  KEY idx_sol_cliente (cliente_id, status),
  KEY idx_sol_status (status, created_at),
  CONSTRAINT fk_sol_cliente FOREIGN KEY (cliente_id) REFERENCES cliente(id) ON DELETE CASCADE,
  CONSTRAINT fk_sol_tarefa  FOREIGN KEY (tarefa_id_gerada) REFERENCES tarefa(id) ON DELETE SET NULL,
  CONSTRAINT fk_sol_envoxer FOREIGN KEY (atendido_por_envoxer_id) REFERENCES envoxer(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE solicitacao_anexo (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  solicitacao_id  BIGINT UNSIGNED NOT NULL,
  nome            VARCHAR(200)    NOT NULL,
  url             VARCHAR(500)    NOT NULL,
  created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_sol_anexo FOREIGN KEY (solicitacao_id) REFERENCES solicitacao(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- EVENTO_CALENDARIO — eventos que NÃO são tarefas
-- ---------------------------------------------------------------------
CREATE TABLE evento_calendario (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  titulo          VARCHAR(200)    NOT NULL,
  tipo            ENUM('reuniao','captacao','evento_externo','live','outro') NOT NULL DEFAULT 'reuniao',
  cliente_id      BIGINT UNSIGNED NULL,
  data_inicio     DATETIME        NOT NULL,
  data_fim        DATETIME        NULL,
  dia_inteiro     TINYINT(1)      NOT NULL DEFAULT 0,
  local           VARCHAR(200)    NULL,
  descricao       TEXT            NULL,
  criado_por_envoxer_id BIGINT UNSIGNED NULL,
  created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                          ON UPDATE CURRENT_TIMESTAMP,
  deleted_at      TIMESTAMP       NULL,
  PRIMARY KEY (id),
  KEY idx_evento_data (data_inicio),
  KEY idx_evento_cliente (cliente_id),
  CONSTRAINT fk_ev_cliente FOREIGN KEY (cliente_id) REFERENCES cliente(id) ON DELETE SET NULL,
  CONSTRAINT fk_ev_criador FOREIGN KEY (criado_por_envoxer_id) REFERENCES envoxer(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE evento_participante (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  evento_id    BIGINT UNSIGNED NOT NULL,
  envoxer_id   BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ev_participante (evento_id, envoxer_id),
  CONSTRAINT fk_ep_evento  FOREIGN KEY (evento_id)  REFERENCES evento_calendario(id) ON DELETE CASCADE,
  CONSTRAINT fk_ep_envoxer FOREIGN KEY (envoxer_id) REFERENCES envoxer(id)           ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE OR REPLACE VIEW vw_calendario AS
SELECT
  CONCAT('t-', t.id)          AS id,
  'tarefa'                    AS tipo,
  t.titulo                    AS titulo,
  t.data_prevista_publicacao  AS data,
  NULL                        AS hora_inicio,
  NULL                        AS hora_fim,
  t.cliente_id                AS cliente_id,
  c.nome                      AS cliente_nome,
  c.status_farol              AS cliente_farol,
  t.status                    AS status_tarefa,
  NULL                        AS local
FROM tarefa t
JOIN cliente c ON c.id = t.cliente_id
WHERE t.data_prevista_publicacao IS NOT NULL AND t.deleted_at IS NULL

UNION ALL

SELECT
  CONCAT('e-', ev.id),
  ev.tipo,
  ev.titulo,
  DATE(ev.data_inicio),
  TIME(ev.data_inicio),
  TIME(ev.data_fim),
  ev.cliente_id,
  c.nome,
  c.status_farol,
  NULL,
  ev.local
FROM evento_calendario ev
LEFT JOIN cliente c ON c.id = ev.cliente_id
WHERE ev.deleted_at IS NULL;


-- =====================================================================
-- F2 (fim) — Pulso + Check-in + Farol Inteligente + Alertas + WhatsApp
-- =====================================================================

-- Cliente ganha termômetro WhatsApp + timestamp de última interação
ALTER TABLE cliente
  ADD COLUMN termometro_whatsapp        ENUM('frio','morno','quente') NULL,
  ADD COLUMN termometro_whatsapp_valor  DECIMAL(3,1) NULL
      COMMENT 'Valor numérico normalizado 0-10 vindo do WhatsApp',
  ADD COLUMN termometro_whatsapp_ts     TIMESTAMP NULL,
  ADD COLUMN ultima_interacao_ts        TIMESTAMP NULL
      COMMENT 'Alimenta sinal 7 (silêncio)';

-- ---------------------------------------------------------------------
-- PULSO DE SATISFAÇÃO
-- ---------------------------------------------------------------------
CREATE TABLE pulso_satisfacao (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cliente_id     BIGINT UNSIGNED NOT NULL,
  ano_mes        CHAR(7)         NOT NULL COMMENT 'YYYY-MM',
  nota           TINYINT         NOT NULL COMMENT '0 a 10',
  comentario     TEXT            NULL,
  metodo         ENUM('ligacao','pesquisa','estimativa_interna','conversa_avulsa') NOT NULL DEFAULT 'ligacao',
  respondente_cliente_nome VARCHAR(120) NULL,
  registrado_por_envoxer_id BIGINT UNSIGNED NULL,
  created_at     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pulso_cliente_mes (cliente_id, ano_mes),
  KEY idx_pulso_cliente (cliente_id, ano_mes),
  KEY idx_pulso_nota (nota),
  CONSTRAINT chk_nota CHECK (nota BETWEEN 0 AND 10),
  CONSTRAINT fk_pulso_cliente FOREIGN KEY (cliente_id) REFERENCES cliente(id) ON DELETE CASCADE,
  CONSTRAINT fk_pulso_envoxer FOREIGN KEY (registrado_por_envoxer_id) REFERENCES envoxer(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- CHECK-IN
-- ---------------------------------------------------------------------
CREATE TABLE check_in (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cliente_id            BIGINT UNSIGNED NOT NULL,
  data_realizado        DATETIME        NOT NULL,
  tipo                  ENUM('ligacao','reuniao','mensagem','email','presencial') NOT NULL,
  motivo                ENUM('rotina','checkpoint_retencao','alerta_farol','alteracao_escopo','outro') NOT NULL DEFAULT 'rotina',
  responsavel_envoxer_id BIGINT UNSIGNED NULL,

  humor                 ENUM('positivo','neutro','negativo','critico') NULL,
  observacao            TEXT            NULL,

  proximo_sugerido      DATE            NULL,
  proximo_realizado     TINYINT(1)      NOT NULL DEFAULT 0,

  created_at            TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_checkin_cliente (cliente_id, data_realizado),
  KEY idx_checkin_proximo (proximo_sugerido, proximo_realizado),
  CONSTRAINT fk_ci_cliente FOREIGN KEY (cliente_id) REFERENCES cliente(id) ON DELETE CASCADE,
  CONSTRAINT fk_ci_envoxer FOREIGN KEY (responsavel_envoxer_id) REFERENCES envoxer(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- FAROL_CALCULO — snapshot atual
-- ---------------------------------------------------------------------
CREATE TABLE farol_calculo (
  id                       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cliente_id               BIGINT UNSIGNED NOT NULL,
  calculado_em             TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  farol                    ENUM('verde','amarelo','vermelho') NOT NULL,
  health_score             TINYINT UNSIGNED NOT NULL,

  sinal_entrega            ENUM('verde','amarelo','vermelho') NOT NULL,
  sinal_entrega_valor      VARCHAR(60)     NULL,
  sinal_atrasadas          ENUM('verde','amarelo','vermelho') NOT NULL,
  sinal_atrasadas_valor    INT UNSIGNED    NULL,
  sinal_alteracoes         ENUM('verde','amarelo','vermelho') NOT NULL,
  sinal_alteracoes_valor   VARCHAR(60)     NULL,
  sinal_aprovacoes         ENUM('verde','amarelo','vermelho') NOT NULL,
  sinal_aprovacoes_valor   VARCHAR(60)     NULL,
  sinal_pulso              ENUM('verde','amarelo','vermelho','sem_dado') NOT NULL,
  sinal_pulso_valor        TINYINT         NULL,
  sinal_margem             ENUM('verde','amarelo','vermelho','sem_dado') NOT NULL,
  sinal_margem_valor       DECIMAL(5,1)    NULL,
  sinal_silencio           ENUM('verde','amarelo','vermelho') NOT NULL,
  sinal_silencio_valor     INT UNSIGNED    NULL,
  sinal_whatsapp           ENUM('verde','amarelo','vermelho','sem_dado') NOT NULL,
  sinal_whatsapp_valor     VARCHAR(20)     NULL,

  motivo_json              JSON            NULL,

  PRIMARY KEY (id),
  UNIQUE KEY uq_farol_cliente (cliente_id),
  CONSTRAINT fk_farol_cliente FOREIGN KEY (cliente_id) REFERENCES cliente(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE farol_calculo_historico (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cliente_id   BIGINT UNSIGNED NOT NULL,
  calculado_em TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  farol        ENUM('verde','amarelo','vermelho') NOT NULL,
  health_score TINYINT UNSIGNED NOT NULL,
  motivo_json  JSON            NULL,
  PRIMARY KEY (id),
  KEY idx_fh_cliente_data (cliente_id, calculado_em),
  CONSTRAINT fk_fh_cliente FOREIGN KEY (cliente_id) REFERENCES cliente(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- ALERTA_FAROL
-- ---------------------------------------------------------------------
CREATE TABLE alerta_farol (
  id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cliente_id             BIGINT UNSIGNED NOT NULL,
  farol_de               ENUM('verde','amarelo','vermelho') NOT NULL,
  farol_para             ENUM('verde','amarelo','vermelho') NOT NULL,
  motivo_json            JSON            NOT NULL,
  motivo_texto           TEXT            NOT NULL,
  sugestao_acao          VARCHAR(300)    NULL,

  status                 ENUM('aberto','reconhecido','resolvido','ignorado') NOT NULL DEFAULT 'aberto',
  reconhecido_por_envoxer_id BIGINT UNSIGNED NULL,
  reconhecido_em         TIMESTAMP       NULL,
  resolvido_em           TIMESTAMP       NULL,
  resolucao_nota         TEXT            NULL,

  created_at             TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_alerta_status (status, created_at),
  KEY idx_alerta_cliente (cliente_id, status),
  CONSTRAINT fk_al_cliente FOREIGN KEY (cliente_id) REFERENCES cliente(id) ON DELETE CASCADE,
  CONSTRAINT fk_al_envoxer FOREIGN KEY (reconhecido_por_envoxer_id) REFERENCES envoxer(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- View consolidada
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_cliente_farol AS
SELECT
  c.id, c.nome, c.responsavel_envoxer_id, c.status_farol,
  c.data_inicio_contrato, c.valor_contrato,
  c.termometro_whatsapp, c.ultima_interacao_ts,
  TIMESTAMPDIFF(MONTH, c.data_inicio_contrato, CURDATE()) AS meses_de_casa,
  DATEDIFF(CURDATE(), c.ultima_interacao_ts)              AS dias_sem_interacao,

  f.farol             AS farol_calc,
  f.health_score,
  f.motivo_json,
  f.calculado_em,

  p.nota              AS pulso_ultima_nota,
  p.ano_mes           AS pulso_ultimo_mes,

  ci.proximo_sugerido AS proximo_checkin,
  (SELECT COUNT(*) FROM alerta_farol WHERE cliente_id = c.id AND status='aberto') AS alertas_abertos

FROM cliente c
LEFT JOIN farol_calculo f ON f.cliente_id = c.id
LEFT JOIN pulso_satisfacao p ON p.id = (
  SELECT id FROM pulso_satisfacao WHERE cliente_id = c.id ORDER BY ano_mes DESC LIMIT 1
)
LEFT JOIN check_in ci ON ci.id = (
  SELECT id FROM check_in WHERE cliente_id = c.id ORDER BY data_realizado DESC LIMIT 1
)
WHERE c.deleted_at IS NULL;


-- =====================================================================
-- F3 — Perfil comportamental + Churn + Painel de faturamento
-- =====================================================================

CREATE TABLE perfil_cliente (
  id                              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cliente_id                      BIGINT UNSIGNED NOT NULL,
  calculado_em                    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  perfil                          ENUM('facil','neutro','dificil') NOT NULL,
  score                           TINYINT UNSIGNED NOT NULL COMMENT '0-100 (100 = mais fácil)',
  velocidade_aprovacao_dias       DECIMAL(4,1)    NULL,
  alteracoes_media_por_tarefa     DECIMAL(3,1)    NULL,
  atrasos_causados_pelo_cliente   INT UNSIGNED    NOT NULL DEFAULT 0,
  tarefas_avaliadas               INT UNSIGNED    NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_perfil_cliente (cliente_id),
  CONSTRAINT fk_pc_cliente FOREIGN KEY (cliente_id) REFERENCES cliente(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE perfil_cliente_historico (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cliente_id   BIGINT UNSIGNED NOT NULL,
  calculado_em TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  perfil       ENUM('facil','neutro','dificil') NOT NULL,
  score        TINYINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  KEY idx_pch_cliente (cliente_id, calculado_em),
  CONSTRAINT fk_pch_cliente FOREIGN KEY (cliente_id) REFERENCES cliente(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE motivo_churn_catalogo (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo      VARCHAR(40)     NOT NULL,
  nome        VARCHAR(80)     NOT NULL,
  categoria   ENUM('preco','entrega','encaixe','externa','ativa','sem_resposta') NOT NULL,
  ordem       INT UNSIGNED    NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_motivo_codigo (codigo)
) ENGINE=InnoDB;

INSERT INTO motivo_churn_catalogo (codigo, nome, categoria, ordem) VALUES
  ('preco_alto',          'Preço acima do orçamento',                             'preco',       10),
  ('sem_retorno',         'Não viu retorno / ROI',                                'entrega',     20),
  ('atraso_entrega',      'Atrasos ou falha de entrega',                          'entrega',     30),
  ('qualidade_criativo',  'Qualidade do criativo abaixo do esperado',             'entrega',     40),
  ('mudou_estrategia',    'Mudou de estratégia (internalizou / parou marketing)', 'externa',     50),
  ('trocou_agencia',      'Trocou por outra agência',                             'ativa',       60),
  ('perfil_errado',       'Serviço não era o que o cliente precisava',            'encaixe',     70),
  ('cliente_dificil',     'Relação difícil / expectativa desalinhada',            'encaixe',     80),
  ('empresa_encerrada',   'Empresa fechou ou reduziu operação',                   'externa',     90),
  ('financeiro',          'Problema financeiro do cliente',                       'externa',    100),
  ('sem_resposta',        'Sumiu — sem resposta ao contato',                      'sem_resposta',110),
  ('outro',               'Outro',                                                 'externa',    120);

CREATE TABLE churn_snapshot (
  id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cliente_id             BIGINT UNSIGNED NOT NULL,
  data_cancelamento      DATE            NOT NULL,
  meses_de_casa          INT UNSIGNED    NOT NULL,
  motivo_codigo          VARCHAR(40)     NOT NULL,
  motivo_detalhe         TEXT            NULL,
  quem_registrou_envoxer_id BIGINT UNSIGNED NULL,

  cliente_nome_snap      VARCHAR(160)    NOT NULL,
  segmento_snap          VARCHAR(80)     NULL,
  ticket_snap            DECIMAL(12,2)   NULL,
  canal_aquisicao_snap   VARCHAR(40)     NULL,
  maturidade_snap        VARCHAR(20)     NULL,
  perfil_snap            ENUM('facil','neutro','dificil') NULL,
  valor_contrato_snap    DECIMAL(12,2)   NOT NULL,
  tipo_receita_snap      VARCHAR(20)     NOT NULL,
  margem_media_snap      DECIMAL(5,1)    NULL,
  pulso_medio_snap       DECIMAL(3,1)    NULL,
  farol_ultimo_snap      ENUM('verde','amarelo','vermelho') NULL,

  observacoes            TEXT            NULL,
  created_at             TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_churn_cliente (cliente_id),
  KEY idx_churn_data (data_cancelamento),
  KEY idx_churn_meses (meses_de_casa),
  KEY idx_churn_motivo (motivo_codigo),

  CONSTRAINT fk_churn_cliente FOREIGN KEY (cliente_id) REFERENCES cliente(id) ON DELETE CASCADE,
  CONSTRAINT fk_churn_motivo  FOREIGN KEY (motivo_codigo) REFERENCES motivo_churn_catalogo(codigo) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE faturamento_snapshot_mensal (
  id                          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ano_mes                     CHAR(7)         NOT NULL,
  fechado_em                  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  mrr                         DECIMAL(14,2)   NOT NULL,
  receita_pontual             DECIMAL(14,2)   NOT NULL DEFAULT 0,
  receita_total               DECIMAL(14,2)   NOT NULL,
  qtd_clientes_ativos         INT UNSIGNED    NOT NULL,
  qtd_recorrentes             INT UNSIGNED    NOT NULL,
  qtd_novos_no_mes            INT UNSIGNED    NOT NULL DEFAULT 0,
  qtd_churn_no_mes            INT UNSIGNED    NOT NULL DEFAULT 0,
  mrr_novo                    DECIMAL(14,2)   NOT NULL DEFAULT 0,
  mrr_churn                   DECIMAL(14,2)   NOT NULL DEFAULT 0,
  mrr_liquido                 DECIMAL(14,2)   AS (mrr_novo - mrr_churn) STORED,
  concentracao_top3_pct       DECIMAL(5,2)    NULL,
  receita_em_risco            DECIMAL(14,2)   NULL,
  mrr_projecao_90d            DECIMAL(14,2)   NULL,
  churn_rate_mensal           DECIMAL(5,2)    NULL,
  meses_medio_de_casa         DECIMAL(4,1)    NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_fat_mes (ano_mes),
  KEY idx_fat_data (ano_mes)
) ENGINE=InnoDB;

CREATE OR REPLACE VIEW vw_icp_populacao AS
SELECT
  c.id, c.nome, c.segmento, c.canal_aquisicao, c.ticket, c.maturidade_digital,
  c.valor_contrato, c.tipo_receita, c.data_inicio_contrato,
  TIMESTAMPDIFF(MONTH, c.data_inicio_contrato, COALESCE(cs.data_cancelamento, CURDATE())) AS meses_de_casa,
  cs.motivo_codigo,
  cs.perfil_snap,
  pc.perfil AS perfil_atual,
  CASE
    WHEN cs.id IS NOT NULL AND cs.meses_de_casa < 6 THEN 'perdido_cedo'
    WHEN cs.id IS NULL AND TIMESTAMPDIFF(MONTH, c.data_inicio_contrato, CURDATE()) >= 12 THEN 'retido_longo'
    WHEN cs.id IS NOT NULL THEN 'churn_normal'
    ELSE 'ativo_recente'
  END AS grupo_icp
FROM cliente c
LEFT JOIN churn_snapshot cs ON cs.cliente_id = c.id
LEFT JOIN perfil_cliente pc ON pc.cliente_id = c.id
WHERE c.deleted_at IS NULL;

CREATE OR REPLACE VIEW vw_icp_comparativo_segmento AS
SELECT
  COALESCE(segmento, 'Sem segmento') AS dimensao,
  SUM(CASE WHEN grupo_icp = 'retido_longo'  THEN 1 ELSE 0 END) AS retidos,
  SUM(CASE WHEN grupo_icp = 'perdido_cedo'  THEN 1 ELSE 0 END) AS perdidos,
  AVG(CASE WHEN grupo_icp = 'retido_longo'  THEN meses_de_casa END) AS meses_medio_retido,
  AVG(CASE WHEN grupo_icp = 'perdido_cedo'  THEN meses_de_casa END) AS meses_medio_perdido
FROM vw_icp_populacao
GROUP BY segmento;
