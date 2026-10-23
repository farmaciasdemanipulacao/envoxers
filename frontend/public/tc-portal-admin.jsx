/* Configuração interna: perfil simples e múltiplas áreas por pessoa.
 * Não replica serviços, solicitações nem tarefas. Envox admin/gestor.
 */
function PortalClientesAdminScreen() {
  const toast = EnvoxersShared.useToast();
  const [clientes,setClientes]=React.useState([]);
  const [clienteId,setClienteId]=React.useState("");
  const [dados,setDados]=React.useState(null);
  const [loading,setLoading]=React.useState(true);
  const [salvando,setSalvando]=React.useState(false);
  const [edit,setEdit]=React.useState(null);
  const [novoNome,setNovoNome]=React.useState("");
  const [novoTipo,setNovoTipo]=React.useState("regional");
  const [contatoEdit,setContatoEdit]=React.useState(null);
  const [formCampos,setFormCampos]=React.useState([]);
  const portalAdminApi=(path,opts)=>api("/portal/operacao/admin"+path,opts);
  const falha=(err)=>toast(err?.message||"Não foi possível concluir a operação","error");
  const buscar=async()=>{
    setLoading(true);
    try {let r=await portalAdminApi("/clientes");setClientes(r);setClienteId(id=>id||String(r[0]?.id||""));}
    catch(e){falha(e);}
    finally{setLoading(false);}
  };
  const carregar=async(id)=>{
    if(!id){setDados(null);return;}
    setLoading(true);
    try {
      const d=await portalAdminApi("/clientes/"+id+"/configuracao");
      setDados(d);setEdit({...d.config,modulos:{...d.config.modulos},notificacoes:{...d.config.notificacoes},visibilidade:{...d.config.visibilidade}});
      setFormCampos((d.formulario?.campos||[]).filter(x=>!["regional","tipo","titulo","descricao","prazo_solicitado","apoio_envox","referencias"].includes(x.chave)).map(x=>({...x})));
    }catch(e){falha(e);setDados(null)}
    finally{setLoading(false)}
  };
  React.useEffect(()=>{buscar()},[]);
  React.useEffect(()=>{carregar(clienteId)},[clienteId]);
  const salvar=async()=>{
    setSalvando(true);
    try {
      await portalAdminApi("/clientes/"+clienteId+"/configuracao",{method:"PUT",body:JSON.stringify(edit)});
      await carregar(clienteId);toast("Configuração do portal salva.","success");
      const r=await portalAdminApi("/clientes");setClientes(r);
    }catch(e){falha(e)}
    finally{setSalvando(false)}
  };
  const criarUnidade=async(e)=>{
    e.preventDefault();if(!novoNome.trim())return;
    setSalvando(true);
    try{
      await portalAdminApi("/clientes/"+clienteId+"/unidades",{method:"POST",body:JSON.stringify({nome:novoNome.trim(),tipo:novoTipo})});
      setNovoNome("");await carregar(clienteId);toast("Unidade cadastrada.","success");
    }catch(e){falha(e)}finally{setSalvando(false)}
  };
  const salvarPapel=async()=>{
    if(!contatoEdit)return;setSalvando(true);
    try{
      await portalAdminApi("/clientes/"+clienteId+"/contatos/"+contatoEdit.id+"/acesso",{method:"PATCH",body:JSON.stringify({
        papel:contatoEdit.papel,unidade_ids:contatoEdit.papel==="admin_institucional"?[]:contatoEdit.unidade_ids,
        capacidades:{aprovar:contatoEdit.pode_aprovar===true}
      })});
      setContatoEdit(null);await carregar(clienteId);toast("Permissões atualizadas.","success");
    }catch(e){falha(e)}finally{setSalvando(false)}
  };
  const salvarFormulario=async()=>{
    setSalvando(true);
    try{
      const campos=(dados.formulario?.campos||[]).filter(x=>["regional","tipo","titulo","descricao","prazo_solicitado","apoio_envox","referencias"].includes(x.chave));
      if(new Set(formCampos.map(x=>x.chave)).size!==formCampos.length)throw Error("Chaves de campos repetidas");
      if(formCampos.some(x=>!x.rotulo?.trim()||!x.chave?.trim()))throw Error("Informe chave e nome para todos os campos");
      await portalAdminApi("/clientes/"+clienteId+"/formularios",{method:"POST",body:JSON.stringify({campos:[...campos,...formCampos]})});
      await carregar(clienteId);toast("Nova versão do formulário salva.","success");
    }catch(e){falha(e)}finally{setSalvando(false)}
  };
  const check=(label,checked,onChange,disabled=false,description="")=><label style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",opacity:disabled?.5:1}}>
    <input type="checkbox" checked={!!checked} disabled={disabled} onChange={e=>onChange(e.target.checked)}/>
    <span>{label}{description&&<small style={{display:"block",color:"var(--ink-3)",marginTop:3}}>{description}</small>}</span>
  </label>;
  const section=(title,sub,children)=><section className="card" style={{padding:22,marginBottom:16}}>
    <h3 style={{margin:"0 0 7px",fontSize:16}}>{title}</h3>
    <p style={{fontSize:12,color:"var(--ink-3)",margin:"0 0 17px"}}>{sub}</p>{children}
  </section>;
  const inputStyle={border:"1px solid var(--line)",borderRadius:8,padding:"9px 11px",background:"#fff",minWidth:0};
  return <div className="page" style={{maxWidth:1200,margin:"0 auto",paddingBottom:45}}>
    <div className="page-header"><div className="page-title-block"><h1>Portal do Cliente</h1>
      <div className="page-sub">Dois perfis para o cliente: Administrador/Gestor e Solicitante. Cada solicitante pode acessar várias regionais e frentes e também aprovar.</div>
    </div></div>
    {section("Cliente a configurar","Clientes são os mesmos cadastros já existentes no Envoxers. Não cria uma segunda base.",<>
      <select style={{...inputStyle,width:"100%",maxWidth:530}} value={clienteId} onChange={e=>setClienteId(e.target.value)}>
        {clientes.map(c=><option value={c.id} key={c.id}>{c.nome}{c.config.habilitado?" · Portal habilitado":""}</option>)}
      </select>
      {loading&&<p style={{fontSize:12,color:"var(--ink-3)"}}>Carregando configurações...</p>}
    </>)}
    {!loading&&dados&&edit&&<>
      {section("Ativação e módulos","Apenas funcionalidades já integradas e aprovadas podem ser habilitadas. O padrão é desativado.",<>
        {check("Portal habilitado para este cliente",edit.habilitado,v=>setEdit({...edit,habilitado:v}))}
        <div style={{borderTop:"1px solid var(--line)",marginTop:10,paddingTop:12,display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(230px,1fr))",gap:"0 22px"}}>
          {Object.entries({solicitacoes:"Solicitações e acompanhamento",documentos:"Acordos e documentos",aprovacoes:"Aprovações de materiais",campanhas:"Campanhas",biblioteca:"Biblioteca de arquivos",ia:"Recursos de IA"}).map(([key,name])=>
            <div key={key}>{check(name,edit.modulos[key],value=>setEdit({...edit,modulos:{...edit.modulos,[key]:value}}),
              !dados.modulos_habilitaveis.includes(key),
              !dados.modulos_habilitaveis.includes(key)?"Aguardando homologação de backend e segurança":"")}</div>
          )}
        </div>
        <p style={{fontSize:12,color:"var(--ink-3)"}}>Notificações externas, aprovação de mídia e indicadores de horas permanecem bloqueados até terem política de segurança homologada.</p>
        <button className="btn btn-envox" onClick={salvar} disabled={salvando}>Salvar configuração</button>
      </>)}
      {section("Regionais e frentes","Estrutura organizacional de cada cliente. O acesso às demandas é filtrado no backend por unidade.",<>
        <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:18}}>
          {dados.unidades.map(u=><span className="pill" key={u.id} style={{padding:"7px 10px",background:"var(--bg-inset)"}}>{u.tipo==="frente"?"Frente":"Regional"}: {u.nome}{!u.ativo?" (inativa)":""}</span>)}
          {!dados.unidades.length&&<span style={{color:"var(--ink-3)",fontSize:12}}>Nenhuma unidade cadastrada.</span>}
        </div>
        <form onSubmit={criarUnidade} style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <select aria-label="Tipo de unidade" style={inputStyle} value={novoTipo} onChange={e=>setNovoTipo(e.target.value)}><option value="regional">Regional</option><option value="frente">Frente</option></select>
          <input aria-label="Nome da unidade" placeholder="Nome da regional ou frente" style={{...inputStyle,flex:"1 1 240px"}} value={novoNome} onChange={e=>setNovoNome(e.target.value)}/>
          <button className="btn btn-envox" type="submit" disabled={salvando||!novoNome.trim()}>Adicionar unidade</button>
        </form>
      </>)}
      {section("Pessoas e acessos","Selecione Administrador/Gestor SECOVI ou Solicitante. Associe quantas regionais e frentes precisar. Aprovação é uma opção independente.",<>
        {dados.contatos.length===0&&<p style={{fontSize:13}}>Nenhum contato cadastrado nesta organização.</p>}
        {dados.contatos.map(c=><div key={c.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,padding:"12px 0",borderBottom:"1px solid var(--line)",flexWrap:"wrap"}}>
          <div><strong style={{fontSize:13}}>{c.nome}</strong><div style={{fontSize:12,color:"var(--ink-3)"}}>{c.email} · {c.papel==="admin_institucional"?"Administrador/Gestor SECOVI":c.papel==="solicitante"?"Solicitante":"Perfil antigo: "+(c.papel||"não definido")} {c.pode_aprovar?" · Pode aprovar":""} {c.ativo?"":"· inativo"}</div></div>
          <button className="btn btn-sm" onClick={()=>setContatoEdit({...c,papel:c.papel==="admin_institucional"?"admin_institucional":"solicitante",unidade_ids:[...c.unidade_ids]})}>Definir acesso</button>
        </div>)}
        {contatoEdit&&<div style={{background:"var(--bg-inset)",padding:18,marginTop:14,borderRadius:12}}>
          <strong>{contatoEdit.nome}</strong>
          <div style={{margin:"12px 0"}}><label style={{display:"block",fontSize:12,marginBottom:6}}>Perfil</label>
            <select style={{...inputStyle,width:"100%"}} value={contatoEdit.papel} onChange={e=>setContatoEdit({...contatoEdit,papel:e.target.value})}>
              {["admin_institucional","solicitante"].map(p=><option value={p} key={p}>{p==="admin_institucional"?"Administrador / Gestor SECOVI":"Solicitante"}</option>)}
            </select></div>
          <div style={{fontSize:12,marginBottom:9}}>Vínculos de acesso: um usuário pode acompanhar várias regionais e frentes.</div>
          {check("Também pode aprovar materiais",contatoEdit.pode_aprovar,v=>setContatoEdit({...contatoEdit,pode_aprovar:v}),false,
            "A permissão é independente do perfil. Ações reais de aprovação seguem desativadas até homologação.")}
          {contatoEdit.papel==="admin_institucional"&&<p style={{fontSize:12,color:"var(--ink-3)"}}>O administrador SECOVI visualiza todas as áreas da organização. Não precisa selecionar vínculos.</p>}
          <div style={{fontSize:12,fontWeight:650,marginTop:12}}>Regionais</div>
          {contatoEdit.papel!=="admin_institucional"&&<>
            {dados.unidades.filter(u=>u.tipo==="regional").map(u=><div key={u.id}>{check(u.nome,contatoEdit.unidade_ids.includes(u.id),v=>setContatoEdit({...contatoEdit,unidade_ids:v?[...contatoEdit.unidade_ids,u.id]:contatoEdit.unidade_ids.filter(id=>id!==u.id)}) )}</div>)}
            <div style={{fontSize:12,fontWeight:650,marginTop:12}}>Frentes / departamentos</div>
            {dados.unidades.filter(u=>u.tipo==="frente").map(u=><div key={u.id}>{check(u.nome,contatoEdit.unidade_ids.includes(u.id),v=>setContatoEdit({...contatoEdit,unidade_ids:v?[...contatoEdit.unidade_ids,u.id]:contatoEdit.unidade_ids.filter(id=>id!==u.id)}) )}</div>)}
          </>}
          <div style={{display:"flex",gap:8,marginTop:14}}><button className="btn btn-envox" onClick={salvarPapel} disabled={salvando}>Salvar acesso</button><button className="btn" onClick={()=>setContatoEdit(null)}>Cancelar</button></div>
        </div>}
      </>)}
      {section("Formulário de solicitações","Os campos principais permanecem fixos e editáveis através de versões de formulário; itens adicionais são configurados por cliente.",<>
        {formCampos.map((c,i)=><div key={i} style={{display:"flex",gap:9,marginBottom:9,flexWrap:"wrap",alignItems:"center"}}>
          <input aria-label={"Rótulo do campo "+(i+1)} style={{...inputStyle,flex:"1 1 170px"}} placeholder="Nome do campo" value={c.rotulo} onChange={e=>setFormCampos(a=>a.map((x,j)=>j===i?{...x,rotulo:e.target.value}:x))}/>
          <select style={inputStyle} value={c.tipo} onChange={e=>setFormCampos(a=>a.map((x,j)=>j===i?{...x,tipo:e.target.value}:x))}><option value="texto">Texto</option><option value="texto_longo">Texto longo</option><option value="data">Data</option></select>
          {check("Obrigatório",c.obrigatorio,v=>setFormCampos(a=>a.map((x,j)=>j===i?{...x,obrigatorio:v}:x)))}
          <button className="btn btn-sm" onClick={()=>setFormCampos(a=>a.filter((_,j)=>j!==i))}>Remover</button>
        </div>)}
        <div style={{display:"flex",gap:9,flexWrap:"wrap",marginTop:16}}>
          <button className="btn" onClick={()=>setFormCampos(a=>[...a,{chave:"extra_"+Date.now().toString(36),rotulo:"Novo campo",tipo:"texto",obrigatorio:false}])} disabled={formCampos.length>=20}>+ Adicionar campo</button>
          <button className="btn btn-envox" onClick={salvarFormulario} disabled={salvando}>Salvar versão do formulário</button>
        </div>
        <p style={{fontSize:11,color:"var(--ink-3)",marginTop:10}}>Versão atual: {dados.formulario?.versao||"padrão"} · As solicitações antigas não são reescritas.</p>
      </>)}
    </>}
  </div>;
}
window.PortalClientesAdminScreen=PortalClientesAdminScreen;
