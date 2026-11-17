// =====================================================================
// INTEGRAÇÃO AGILESAT + SISTEMA
// =====================================================================
VIEWS.integracao = function(){
  var ag = cfg('agilesat', null) || {horas:24};
  var us = cfg('ultimaSync', null);
  var linked = vals(DB.veiculos).filter(function(v){ return v.rastreadorId; }).length;
  var ed = can('admin');
  var dis = ed ? '' : ' disabled';
  var html = '<div class="stats">' +
      (us && us.erro ? stat('Sincronização com erro', fmtDT(us.erroEm), esc(us.erro), 'red') :
      stat('Última sincronização', us && us.em ? fmtDT(us.em) : 'nunca', us ? esc(us.resumo || '') + (us.origem ? ' · ' + esc(us.origem) : '') : '', us && us.em ? 'teal' : '')) +
      stat('Veículos vinculados', linked + '<span class="mono"> / ' + vals(DB.veiculos).length + '</span>', 'com ID do AgileSat') +
      stat('Posições recebidas', vals(DB.posicoes).length) +
      stat('Viagens do rastreador', vals(DB.viagens).filter(function(v){ return v.fonte === 'AgileSat'; }).length) +
    '</div><div class="cfg-grid">' +
    '<div class="perm-note" style="grid-column:1/-1;margin:0;background:var(--teal-soft);color:var(--teal)">A integração é opcional. Tudo que o rastreador envia também pode ser lançado à mão: posição/check-in e leituras de KM (Rastreamento), viagens com hodômetro e postos visitados, visitas, abastecimentos, manutenções e pedágios, ou importado por planilha.</div>' +
    '<div class="cfg-card"><h3>Como os dados do rastreador chegam aqui</h3>' +
      '<p>Duas vezes por dia, às <b>12h e às 17h</b>, o GitHub Actions do repositório roda o conector <code>tools/agilesat_sync.py</code>. Ele lê a API RESTrack da Fulltrack (plataforma da AgileSat) e grava aqui: veículos, última posição, viagens com trajeto e KM pelo hodômetro, postos (pontos de referência), motoristas e visitas aos postos. As chaves ficam nos segredos do GitHub, nunca no painel.</p>' +
      '<div class="steps">' +
        '<div class="step"><div><b>Segredos no GitHub</b> (repositório FROTA › Settings › Secrets › Actions): <code>AGILESAT_APIKEY</code>, <code>AGILESAT_SECRETKEY</code> e <code>FIREBASE_SERVICE_ACCOUNT</code>.</div></div>' +
        '<div class="step"><div><b>Primeira carga</b>: aba Actions › “Sincronizar AgileSat” › Run workflow, com 24 horas (ou mais) de histórico.</div></div>' +
        '<div class="step"><div>Depois roda sozinho às 12h e às 17h (para puxar fora do horário: Actions › Run workflow). Postos novos chegam com 0 visitas por semana: ajuste a frequência em Visitas › Postos.</div></div>' +
      '</div>' +
      '<p style="margin:14px 0 8px">Também dá para rodar o conector no computador e importar o arquivo gerado:</p>' +
      '<div class="drop" id="ag-drop">Arraste aqui o <code>agilesat_export.json</code> ou <label class="lnk" style="cursor:pointer">escolha o arquivo<input type="file" id="ag-file" accept=".json" hidden></label></div>' +
    '</div>' +
    '<div class="cfg-card"><h3>Ajustes da sincronização</h3><p>API: <code>ws.fulltrack2.com</code> (RESTrack). Salvo no Firebase, sem senhas.' + (ed ? '' : ' Só administradores alteram.') + '</p>' +
      '<form id="ag-form"><div class="modal-grid">' +
        '<div class="modal-field"><label>Horas de histórico por execução (mín. 24)</label><input name="horas" type="number" value="'+esc(ag.horas || 24)+'"'+dis+'></div>' +
        '<div class="modal-field"><label>Limite de velocidade p/ alerta (km/h)</label><input name="limiteVel" type="number" value="'+esc(cfg('limiteVel', 110))+'"'+dis+'></div>' +
      '</div>' + (ed ? '<div class="modal-actions" style="justify-content:flex-start"><button class="btn btn-primary" type="submit">Salvar</button></div>' : '') + '</form>' +
    '</div></div>' +
    '<div class="cfg-card" style="margin-top:16px"><h3>Importar planilhas</h3><p>Extratos de pedágio (Sem Parar, ConectCar, Veloe), cartão combustível, leituras de KM, viagens, posições, planilhas antigas de manutenção ou relatórios exportados do AgileSat. Cada tipo tem um modelo para baixar.</p>' +
      (can('lancar') ? '<button class="btn" data-act="importar" data-col="pedagios">Importar planilha</button>' : '<span class="mono">Seu perfil não permite importar.</span>') + '</div>';
  return {html:html, after:bindIntegracao};
};
function bindIntegracao(){
  var f = $('#ag-form');
  if(f && can('admin')) f.addEventListener('submit', function(e){
    e.preventDefault(); var el = this.elements;
    var ag = {horas:Math.max(24, num(el.horas.value) || 24)};
    save({'config/agilesat': ag, 'config/limiteVel': num(el.limiteVel.value) || 110}, 'Alterou a configuração da AgileSat', ag.horas + ' h').then(function(){ toast('Configuração salva.'); });
  });
  var d = $('#ag-drop'); if(!d) return;
  function ler(file){ var r = new FileReader(); r.onload = function(){ try{ importarAgile(JSON.parse(r.result)); }catch(err){ toast('Arquivo inválido: não é o JSON do conector.', 'err'); } }; r.readAsText(file); }
  d.addEventListener('dragover', function(e){ e.preventDefault(); d.classList.add('over'); });
  d.addEventListener('dragleave', function(){ d.classList.remove('over'); });
  d.addEventListener('drop', function(e){ e.preventDefault(); d.classList.remove('over'); if(e.dataTransfer.files[0]) ler(e.dataTransfer.files[0]); });
  $('#ag-file').addEventListener('change', function(){ if(this.files[0]) ler(this.files[0]); this.value = ''; });
}

// mesmo formato que o conector grava no Firebase
function chaveSegura(s){ return String(s).replace(/[.#$\[\]\/]/g, '_').slice(0, 180); }
function importarAgile(json){
  if(!can('lancar')){ toast('Seu perfil não permite importar.', 'err'); return; }
  var p = {}, veic = vals(DB.veiculos), novos = 0, at = 0, np = 0, nt = 0;
  function acha(rid, pl){ return veic.find(function(v){ return (rid != null && rid !== '' && String(v.rastreadorId) === String(rid)) || (pl && normPlaca(v.placa) === normPlaca(pl)); }); }
  (json.veiculos || []).forEach(function(x){
    var v = acha(x.rastreadorId, x.placa);
    if(v){ if(x.rastreadorId != null && x.rastreadorId !== '') p['veiculos/' + v._id + '/rastreadorId'] = String(x.rastreadorId); if(num(x.kmAtual) > num(v.kmAtual)) p['veiculos/' + v._id + '/kmAtual'] = Math.round(num(x.kmAtual)); at++; }
    else { var id = store.key(); var nv = {placa:String(x.placa || x.rastreadorId).toUpperCase(), modelo:x.modelo || '', rastreadorId:String(x.rastreadorId == null ? '' : x.rastreadorId), status:'Ativo', tipo:'Carro', combustivel:'Flex'}; if(num(x.kmAtual)) nv.kmAtual = Math.round(num(x.kmAtual)); p['veiculos/' + id] = nv; nv._id = id; veic.push(nv); novos++; }
  });
  (json.posicoes || []).forEach(function(x){
    var v = acha(x.rastreadorId, x.placa); if(!v) return;
    p['posicoes/' + v._id] = {veiculoId:v._id, lat:num(x.lat), lng:num(x.lng), velocidade:num(x.velocidade), ignicao:!!x.ignicao, endereco:x.endereco || '', dataHora:String(x.dataHora || '').slice(0, 16)};
    if(num(x.hodometro) > num(v.kmAtual)) p['veiculos/' + v._id + '/kmAtual'] = Math.round(num(x.hodometro));
    np++;
  });
  (json.viagens || []).forEach(function(t){
    var v = acha(t.rastreadorId, t.placa); if(!v) return;
    var id = chaveSegura('ag_' + (t.rastreadorId != null ? t.rastreadorId : v.placa) + '_' + t.inicio);
    p['viagens/' + id] = {veiculoId:v._id, motorista:t.motorista || v.motorista || '', inicio:String(t.inicio || '').slice(0, 16), fim:String(t.fim || '').slice(0, 16), origem:t.origem || '', destino:t.destino || '', km:+num(t.km).toFixed(1), velMax:Math.round(num(t.velMax)), paradoMin:Math.round(num(t.paradoMin)), fonte:'AgileSat', pontos:(t.pontos || []).slice(0, 600)};
    nt++;
  });
  var resumo = (at + novos) + ' veículos, ' + np + ' posições, ' + nt + ' viagens';
  p['config/ultimaSync'] = {em:nowTs(), resumo:resumo, origem:'arquivo importado'};
  save(p, 'Importou dados da AgileSat', resumo).then(function(){
    return detectarVisitas(true);
  }).then(function(n){ toast('Importado: ' + resumo + (n ? ', ' + n + ' visita(s) detectada(s)' : '') + '.'); });
}

VIEWS.sistema = function(){
  var logs = vals(DB.logs).sort(function(a, b){ return b.ts - a.ts; }).slice(0, 150);
  var temDemo = COLS.some(function(c){ return vals(DB[c]).some(function(r){ return r && r.demo; }); });
  var html = '<div class="cfg-grid">' +
    '<div class="cfg-card"><h3>Usuários e perfis</h3><p>Os usuários ficam em <code>USER_ROLES</code> no início do <code>src/core.js</code>, com o e-mail cadastrado no Firebase Authentication. As senhas são do Firebase.</p>' +
      table([{l:'Usuário', k:'user'}, {l:'Nome', k:'name'}, {l:'E-mail', k:'email'}, {l:'Perfil', f:function(u){ return pill('gray', (rolePermissions[u.role] || {}).label || u.role); }}], USER_ROLES) +
      '<p style="margin-top:12px"><b style="color:var(--text)">Perfis:</b> Administrador (tudo), Gestor de frota (lança, cadastra e exclui), Operador (lança abastecimentos, pedágios, viagens e visitas) e Consulta (só vê).</p></div>' +
    '<div class="cfg-card"><h3>Dados</h3><p>Banco: Firebase Realtime Database, nó <code>' + DB_ROOT + '</code>' + (FB_ON ? '' : ' (modo demonstração: dados só neste navegador)') + '.</p>' +
      '<div class="toolbar"><button class="btn" data-act="backup">Baixar backup (JSON)</button></div>' +
      '<p style="margin-top:6px">Dados de exemplo: 5 veículos fictícios com abastecimentos, manutenções, pedágios, viagens com GPS e visitas, para treinar a equipe.</p>' +
      '<div class="toolbar">' + (temDemo ? '<button class="btn btn-danger" data-act="demo-remover">Remover dados de exemplo</button>' : '<button class="btn" data-act="demo-carregar">Carregar dados de exemplo</button>') + '</div></div>' +
    '</div>' +
    panel('Log de auditoria', table([
      {l:'Quando', f:function(l){ return '<span class="mono">' + fmtDT(l.ts) + '</span>'; }}, {l:'Usuário', k:'usuario'}, {l:'Ação', k:'acao'}, {l:'Detalhe', k:'detalhe'}
    ], logs, {empty:'Nenhuma ação registrada ainda.'}), '', 'últimas 150 ações');
  return {html:html};
};
function baixarBackup(){
  var o = {}; COLS.forEach(function(c){ o[c] = DB[c]; });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(o)], {type:'application/json'}));
  a.download = 'backup_painel_frota_' + today() + '.json'; document.body.appendChild(a); a.click(); a.remove();
}
function carregarDemo(){
  if(typeof DEMO_DATA === 'undefined') return;
  confirmBox('Carregar dados de exemplo', 'Serão incluídos registros fictícios marcados como exemplo. Eles podem ser removidos de uma vez depois.', 'Carregar', function(){
    var p = {}, off = Math.round((new Date(today() + 'T12:00:00') - new Date(DEMO_BASE + 'T12:00:00')) / 864e5);
    function sh(s){ s = String(s); var m = s.match(/^(\d{4}-\d{2}-\d{2})(.*)$/); return m ? addDays(m[1], off) + m[2] : s; }
    Object.keys(DEMO_DATA).forEach(function(c){ Object.keys(DEMO_DATA[c]).forEach(function(id){
      var r = JSON.parse(JSON.stringify(DEMO_DATA[c][id]));
      ['data','inicio','fim','chegada','saida','dataHora','proxData'].forEach(function(k){ if(r[k]) r[k] = sh(r[k]); });
      if(r.pontos) r.pontos = r.pontos.map(function(q){ return [q[0], q[1], sh(q[2])]; });
      p[c + '/' + id] = r;
    }); });
    return save(p, 'Carregou dados de exemplo', Object.keys(p).length + ' registros').then(function(){ toast('Dados de exemplo carregados.'); });
  });
}
function removerDemo(){
  confirmBox('Remover dados de exemplo', 'Remove todos os registros marcados como exemplo. Os dados que vocês lançaram continuam.', 'Remover', function(){
    var p = {}, n = 0;
    COLS.forEach(function(c){ Object.keys(DB[c] || {}).forEach(function(id){ var r = DB[c][id]; if(r && r.demo){ p[c + '/' + id] = null; n++; } }); });
    return save(p, 'Removeu dados de exemplo', n + ' registros').then(function(){ toast(n + ' registros de exemplo removidos.'); });
  });
}
