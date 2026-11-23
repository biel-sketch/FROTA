// =====================================================================
// CADASTROS E LANÇAMENTOS (formulários)
// =====================================================================
var SCHEMA = {
  veiculos:{label:'veículo', fields:[
    {k:'placa', l:'Placa', req:1}, {k:'modelo', l:'Modelo'}, {k:'ano', l:'Ano', t:'number'},
    {k:'tipo', l:'Tipo', t:'select', opts:['Carro','Utilitário','Van','Caminhão','Moto']},
    {k:'combustivel', l:'Combustível', t:'select', opts:['Flex','Gasolina','Etanol','Diesel S10','Diesel S500','GNV','Elétrico']},
    {k:'kmAtual', l:'Hodômetro atual (km)', t:'number'}, {k:'metaConsumo', l:'Consumo médio (km/l)', t:'number', step:'0.1', hint:'Usado para calcular o combustível.'},
    {k:'abasteceCom', l:'Abastece com (se flex)', t:'select', opts:['Gasolina','Etanol']}, {k:'precoLitro', l:'Preço do litro (R$), opcional', t:'number', step:'0.01', hint:'Em branco: usa o último abastecimento ou o preço geral.'},
    {k:'motorista', l:'Motorista principal', t:'motorista'}, {k:'rastreadorId', l:'ID do veículo no AgileSat (opcional)'},
    {k:'vencLicenciamento', l:'Vencimento do licenciamento', t:'date'}, {k:'vencSeguro', l:'Vencimento do seguro', t:'date'},
    {k:'status', l:'Status', t:'select', opts:['Ativo','Em manutenção','Parado','Inativo / vendido']},
    {k:'puxarRastreador', l:'Puxar dados do rastreador', t:'select', opts:['Sim','Não']}]},
  motoristas:{label:'motorista', fields:[
    {k:'nome', l:'Nome', req:1}, {k:'cnhCategoria', l:'Categoria da CNH', t:'select', opts:['A','B','AB','C','D','E','AD','AE']},
    {k:'vencCnh', l:'Vencimento da CNH', t:'date'}, {k:'telefone', l:'Telefone'}]},
  abastecimentos:{label:'abastecimento', fields:[
    {k:'data', l:'Data', t:'date', req:1}, {k:'veiculoId', l:'Veículo', t:'veic', req:1}, {k:'motorista', l:'Motorista', t:'motorista'},
    {k:'posto', l:'Posto de combustível'}, {k:'combustivel', l:'Combustível', t:'select', opts:['Gasolina','Etanol','Diesel S10','Diesel S500','GNV','Arla 32']},
    {k:'litros', l:'Litros', t:'number', step:'0.01', req:1}, {k:'valor', l:'Valor total (R$)', t:'number', step:'0.01', req:1},
    {k:'km', l:'Hodômetro (km)', t:'number', req:1}, {k:'tanqueCheio', l:'Tanque cheio?', t:'select', opts:['Sim','Não']}]},
  manutencoes:{label:'manutenção', fields:[
    {k:'veiculoId', l:'Veículo', t:'veic', req:1}, {k:'tipo', l:'Tipo', t:'select', opts:['Preventiva','Corretiva']},
    {k:'servico', l:'Serviço', req:1}, {k:'status', l:'Situação', t:'select', opts:['Realizada','Agendada']},
    {k:'data', l:'Data', t:'date', req:1}, {k:'km', l:'KM no serviço', t:'number'}, {k:'custo', l:'Custo (R$)', t:'number', step:'0.01'},
    {k:'oficina', l:'Oficina / fornecedor'}, {k:'proxData', l:'Próxima revisão (data)', t:'date'}, {k:'proxKm', l:'Próxima revisão (km)', t:'number'},
    {k:'obs', l:'Observações', t:'textarea'}]},
  pedagios:{label:'pedágio', fields:[
    {k:'data', l:'Data', t:'date', req:1}, {k:'veiculoId', l:'Veículo', t:'veic', req:1}, {k:'praca', l:'Praça'},
    {k:'rodovia', l:'Rodovia'}, {k:'valor', l:'Valor (R$)', t:'number', step:'0.01', req:1},
    {k:'origem', l:'Meio de pagamento', t:'select', opts:['Sem Parar','ConectCar','Veloe','Move Mais','Dinheiro/Cartão','Outro']}]},
  viagens:{label:'viagem', fields:[
    {k:'veiculoId', l:'Veículo', t:'veic', req:1}, {k:'motorista', l:'Motorista', t:'motorista'},
    {k:'inicio', l:'Saída (data e hora)', t:'datetime-local', req:1}, {k:'fim', l:'Chegada (data e hora)', t:'datetime-local'},
    {k:'origem', l:'Origem'}, {k:'destino', l:'Destino'},
    {k:'kmInicial', l:'Hodômetro na saída (km)', t:'number'}, {k:'kmFinal', l:'Hodômetro na chegada (km)', t:'number'},
    {k:'km', l:'KM rodados', t:'number', step:'0.1', hint:'Calculado pelo hodômetro, se em branco.'},
    {k:'velMax', l:'Velocidade máxima (km/h)', t:'number'}, {k:'paradoMin', l:'Tempo parado ligado (min)', t:'number'},
    {k:'postosVisitados', l:'Postos visitados nesta viagem', t:'postos-multi', full:1, hint:'Cada posto marcado vira uma visita registrada.'},
    {k:'obs', l:'Observações', t:'textarea'}]},
  leituras:{label:'leitura de KM', fields:[
    {k:'data', l:'Data', t:'date', req:1}, {k:'veiculoId', l:'Veículo', t:'veic', req:1},
    {k:'km', l:'Hodômetro (km)', t:'number', req:1}, {k:'motorista', l:'Quem leu', t:'motorista'},
    {k:'obs', l:'Observações', t:'textarea'}]},
  posicoes:{label:'posição / check-in', fields:[
    {k:'veiculoId', l:'Veículo', t:'veic', req:1}, {k:'dataHora', l:'Data e hora', t:'datetime-local', req:1},
    {k:'endereco', l:'Local / endereço', full:1, geo:1}, {k:'lat', l:'Latitude', t:'number', step:'any'}, {k:'lng', l:'Longitude', t:'number', step:'any'},
    {k:'ignicao', l:'Situação', t:'select', opts:['Desligado','Ligado']}, {k:'velocidade', l:'Velocidade (km/h)', t:'number'},
    {k:'km', l:'Hodômetro (km), se souber', t:'number'}]},
  postos:{label:'posto de trabalho', fields:[
    {k:'nome', l:'Nome do posto', req:1}, {k:'cliente', l:'Cliente / contrato'}, {k:'endereco', l:'Endereço', full:1},
    {k:'lat', l:'Latitude', t:'number', step:'any', geo:1}, {k:'lng', l:'Longitude', t:'number', step:'any'},
    {k:'raio', l:'Raio da cerca (metros)', t:'number'}, {k:'freqSemana', l:'Visitas esperadas por semana', t:'number', step:'0.5'}]},
  visitas:{label:'visita', fields:[
    {k:'postoId', l:'Posto de trabalho', t:'posto', req:1, checkin:1}, {k:'veiculoId', l:'Veículo', t:'veic'}, {k:'motorista', l:'Responsável'},
    {k:'chegada', l:'Chegada', t:'datetime-local', req:1}, {k:'saida', l:'Saída', t:'datetime-local'},
    {k:'obs', l:'Observações', t:'textarea'}]}
};

function openModal(html, wide){ $('#modal-box').className = 'modal-box' + (wide ? ' wide' : ''); $('#modal-box').innerHTML = html; $('#modal').classList.add('visible'); }
function closeModal(){ $('#modal').classList.remove('visible'); modalRefresh = null; }

function openForm(col, id){
  var sc = SCHEMA[col], cur = id ? (DB[col][id] || {}) : {};
  var agora = today() + 'T' + pad(new Date().getHours()) + ':' + pad(new Date().getMinutes());
  var defaults = {data: today(), veiculoId: F.veic || '', tanqueCheio:'Sim', status: col === 'veiculos' ? 'Ativo' : 'Realizada', raio:200, freqSemana:1, dataHora: agora, chegada: col === 'visitas' ? agora : '', ignicao:'Desligado'};
  if(col === 'posicoes' && id){ cur = Object.assign({}, cur, {ignicao: cur.ignicao ? 'Ligado' : 'Desligado'}); }
  function opts(list, v){ return list.map(function(o){ return '<option value="'+esc(o[0])+'"'+(String(v == null ? '' : v) === String(o[0]) ? ' selected' : '')+'>'+esc(o[1])+'</option>'; }).join(''); }
  var fields = sc.fields.map(function(f){
    var v = id ? cur[f.k] : (defaults[f.k] != null ? defaults[f.k] : '');
    var inp;
    if(f.t === 'veic') inp = '<select name="'+f.k+'"><option value="">Selecione...</option>' + opts(vals(DB.veiculos).sort(function(a, b){ return String(a.placa).localeCompare(String(b.placa)); }).map(function(x){ return [x._id, x.placa + ' · ' + (x.modelo || '')]; }), v) + '</select>';
    else if(f.t === 'posto') inp = '<select name="'+f.k+'"><option value="">Selecione...</option>' + opts(vals(DB.postos).map(function(x){ return [x._id, x.nome]; }), v) + '</select>';
    else if(f.t === 'motorista') inp = '<input name="'+f.k+'" list="dl-motoristas" value="'+esc(v)+'"><datalist id="dl-motoristas">' + vals(DB.motoristas).map(function(m){ return '<option value="'+esc(m.nome)+'">'; }).join('') + '</datalist>';
    else if(f.t === 'postos-multi') inp = vals(DB.postos).length ? '<div class="chips" style="gap:8px;padding:4px 0">' + vals(DB.postos).sort(function(a, b){ return String(a.nome).localeCompare(String(b.nome)); }).map(function(po){ var on = (v || []).indexOf(po._id) >= 0; return '<label class="tb-check"><input type="checkbox" name="pv" value="'+esc(po._id)+'"'+(on ? ' checked' : '')+(id ? ' disabled' : '')+'> '+esc(po.nome)+'</label>'; }).join('') + '</div>' : '<span class="mono">Nenhum posto cadastrado.</span>';
    else if(f.t === 'select') inp = '<select name="'+f.k+'">' + opts(f.opts.map(function(o){ return [o, o]; }), v || f.opts[0]) + '</select>';
    else if(f.t === 'textarea') inp = '<textarea name="'+f.k+'" rows="3">'+esc(v)+'</textarea>';
    else inp = '<input name="'+f.k+'" type="'+(f.t || 'text')+'" value="'+esc(v)+'"'+(f.step ? ' step="'+f.step+'"' : '')+'>';
    var extra = '';
    if(f.hint) extra += '<div class="hint">'+f.hint+'</div>';
    if(f.geo) extra += '<div class="hint"><a class="lnk" href="#" data-act="geo">📍 Usar minha localização atual</a></div>';
    if(f.checkin) extra += '<div class="hint"><a class="lnk" href="#" data-act="checkin">📍 Estou no posto agora (escolhe o mais próximo)</a></div>';
    return '<div class="modal-field'+(f.full || f.t === 'textarea' ? ' full' : '')+'"><label>'+f.l+(f.req ? ' *' : '')+'</label>'+inp+extra+'</div>';
  }).join('');
  openModal('<div class="modal-title">'+(id ? 'Editar ' : 'Novo ') + sc.label+'</div><form id="mform"><div class="modal-grid">'+fields+'</div><div class="form-error" id="mform-err"></div>' +
    '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-act="fechar">Cancelar</button><button type="submit" class="btn btn-primary">Salvar</button></div></form>', sc.fields.length > 8);
  $('#mform').addEventListener('submit', function(e){
    e.preventDefault();
    var fm = this, data = {}, falta = [];
    sc.fields.forEach(function(f){
      if(f.t === 'postos-multi'){ data[f.k] = id ? (cur[f.k] || '') : $$('input[name=pv]:checked', fm).map(function(x){ return x.value; }); if(!data[f.k].length) data[f.k] = ''; return; }
      var v = fm.elements[f.k].value.trim();
      if(f.t === 'number') v = v === '' ? '' : num(v);
      if(f.req && (v === '' || v == null)) falta.push(f.l);
      data[f.k] = v;
    });
    if(falta.length){ var er = $('#mform-err'); er.textContent = 'Preencha: ' + falta.join(', ') + '.'; er.style.display = 'block'; return; }
    if(col === 'veiculos'){
      data.placa = String(data.placa).toUpperCase().trim();
      var dup = vals(DB.veiculos).find(function(x){ return x._id !== id && normPlaca(x.placa) === normPlaca(data.placa); });
      if(dup){ var er2 = $('#mform-err'); er2.textContent = 'Já existe um veículo com esta placa.'; er2.style.display = 'block'; return; }
    }
    if(col === 'viagens'){
      if(data.kmInicial !== '' && data.kmFinal !== '' && num(data.kmFinal) < num(data.kmInicial)){ var e3 = $('#mform-err'); e3.textContent = 'O hodômetro da chegada é menor que o da saída.'; e3.style.display = 'block'; return; }
      if(data.km === '' && data.kmInicial !== '' && data.kmFinal !== '') data.km = num(data.kmFinal) - num(data.kmInicial);
    }
    if(col === 'posicoes') data.ignicao = data.ignicao === 'Ligado';
    var rec = Object.assign({}, clean(cur), clean(data));
    sc.fields.forEach(function(f){ if(data[f.k] === '' || data[f.k] == null) delete rec[f.k]; });
    if(col === 'visitas' && !id) rec.fonte = 'Manual';
    if(col === 'viagens' && !id) rec.fonte = 'Manual';
    if(col === 'posicoes'){ rec.fonte = 'Manual'; rec.ignicao = !!data.ignicao; }
    rec.atualizadoEm = nowTs(); rec.atualizadoPor = currentUser.name;
    var key = col === 'posicoes' ? rec.veiculoId : (id || store.key()), p = {};
    if(col === 'posicoes' && id && id !== key) p['posicoes/' + id] = null;
    p[col + '/' + key] = rec;
    var extra = '';
    // hodômetro do veículo acompanha os lançamentos com KM
    var kmLido = col === 'viagens' ? rec.kmFinal : rec.km;
    if(['abastecimentos','manutencoes','leituras','viagens','posicoes'].indexOf(col) >= 0 && kmLido && DB.veiculos[rec.veiculoId] && num(kmLido) > num(DB.veiculos[rec.veiculoId].kmAtual)){
      p['veiculos/' + rec.veiculoId + '/kmAtual'] = num(kmLido); extra = ' — hodômetro atualizado';
    }
    // viagem manual: postos marcados viram visitas
    if(col === 'viagens' && !id && rec.postosVisitados && rec.postosVisitados.length){
      rec.postosVisitados.forEach(function(pid){ p['visitas/' + store.key()] = {postoId:pid, veiculoId:rec.veiculoId, motorista:rec.motorista || '', chegada:rec.inicio, fonte:'Manual', obs:'Registrada na viagem ' + (rec.destino || ''), viagemId:key, atualizadoEm:nowTs()}; });
      extra += (extra ? ',' : '') + ' ' + rec.postosVisitados.length + ' visita(s) registrada(s)';
    }
    save(p, (id ? 'Editou ' : 'Cadastrou ') + sc.label, descRec(col, rec)).then(function(){ closeModal(); toast('Salvo' + extra + '.'); });
  });
}
function descRec(col, r){
  if(col === 'veiculos') return r.placa;
  if(col === 'motoristas' || col === 'postos') return r.nome;
  var p = r.veiculoId ? placaDe(r.veiculoId) + ' · ' : '';
  if(col === 'abastecimentos') return p + fmtD(r.data) + ' · ' + fmtR(r.valor);
  if(col === 'manutencoes') return p + r.servico;
  if(col === 'pedagios') return p + (r.praca || '') + ' · ' + fmtR(r.valor);
  if(col === 'visitas'){ var po = postoDe(r.postoId); return (po ? po.nome : '') + ' · ' + fmtDH(r.chegada); }
  if(col === 'viagens') return p + fmtDH(r.inicio);
  if(col === 'leituras') return p + fmtD(r.data) + ' · ' + fmtN(r.km) + ' km';
  if(col === 'posicoes') return p + fmtDH(r.dataHora) + ' · ' + (r.endereco || '');
  return '';
}
function confirmBox(title, msg, okLabel, fn){
  openModal('<div class="modal-title">'+esc(title)+'</div><p style="font-size:13px;color:var(--text-dim);line-height:1.5">'+msg+'</p><div class="modal-actions"><button class="btn btn-ghost" data-act="fechar">Cancelar</button><button class="btn btn-danger" id="cbox-ok">'+esc(okLabel)+'</button></div>');
  $('#cbox-ok').addEventListener('click', function(){ this.disabled = true; Promise.resolve(fn()).then(closeModal, closeModal); });
}

function onAction(e){
  var t = e.target.closest('[data-act],[data-trip]'); if(!t) return;
  if(t.dataset.trip && !e.target.closest('button')){ selTrip = t.dataset.trip; scheduleRender(); setTimeout(function(){ var mv = $('#mv-wrap') || $('#view .panel'); if(mv) mv.scrollIntoView({behavior:'smooth', block:'start'}); }, 120); return; }
  var a = t.dataset.act;
  if(a === 'fechar'){ closeModal(); return; }
  if(a === 'geo' || a === 'checkin'){ e.preventDefault(); usarLocalizacao(a); return; }
  if(a === 'lancar-km'){ openForm('leituras'); var f0 = $('#mform'); if(f0 && t.dataset.id) f0.elements.veiculoId.value = t.dataset.id; return; }
  if(a === 'novo'){ openForm(t.dataset.col); return; }
  if(a === 'editar'){ openForm(t.dataset.col, t.dataset.id); return; }
  if(a === 'excluir'){
    var col = t.dataset.col, id = t.dataset.id, r = DB[col][id] || {};
    if(col === 'veiculos'){ excluirVeiculo(id, r); return; }
    confirmBox('Excluir ' + SCHEMA[col].label, 'Excluir <b>' + esc(descRec(col, r)) + '</b>? Não dá para desfazer.', 'Excluir', function(){
      var p = {}; p[col + '/' + id] = null;
      if(col === 'veiculos') p['posicoes/' + id] = null;
      return save(p, 'Excluiu ' + SCHEMA[col].label, descRec(col, r)).then(function(){ toast('Excluído.'); });
    });
    return;
  }
  if(a === 'exportar'){ exportar(t.dataset.key); return; }
  if(a === 'detectar'){ detectarVisitas(false); return; }
  if(a === 'importar'){ abrirImportacao(t.dataset.col); return; }
  if(a === 'modelo'){ baixarModelo(t.dataset.col); return; }
  if(a === 'demo-carregar'){ carregarDemo(); return; }
  if(a === 'demo-remover'){ removerDemo(); return; }
  if(a === 'backup'){ baixarBackup(); return; }
  if(a === 'atualizar'){ atualizarAgora(); return; }
}

function usarLocalizacao(modo){
  var fm = $('#mform'); if(!fm) return;
  if(!navigator.geolocation){ toast('Este navegador não informa a localização.', 'err'); return; }
  toast('Obtendo localização...');
  navigator.geolocation.getCurrentPosition(function(pos){
    var la = +pos.coords.latitude.toFixed(6), lo = +pos.coords.longitude.toFixed(6);
    if(modo === 'geo'){
      if(fm.elements.lat){ fm.elements.lat.value = la; fm.elements.lng.value = lo; }
      if(fm.elements.endereco && !fm.elements.endereco.value) fm.elements.endereco.value = la + ', ' + lo;
      toast('Localização preenchida.'); return;
    }
    var best = null;
    vals(DB.postos).forEach(function(p){ if(p.lat === '' || p.lat == null) return; var d = hav(la, lo, +p.lat, +p.lng); if(!best || d < best.d) best = {p:p, d:d}; });
    if(!best){ toast('Nenhum posto com coordenadas cadastradas.', 'err'); return; }
    fm.elements.postoId.value = best.p._id;
    var dentro = best.d <= (num(best.p.raio) || 200);
    toast(best.p.nome + (dentro ? ' — você está dentro da cerca.' : ' — você está a ' + fmtN(best.d) + ' m do posto.'), dentro ? 'ok' : 'err');
  }, function(){ toast('Não foi possível obter a localização. Permita o acesso no navegador.', 'err'); }, {enableHighAccuracy:true, timeout:15000});
}

// =====================================================================
// EXCEL (SheetJS) — exportação, modelos e importação
// =====================================================================
function xlsxDownload(nome, sheets){
  if(!window.XLSX){ toast('Biblioteca do Excel não carregou. Verifique a conexão.', 'err'); return; }
  var wb = XLSX.utils.book_new();
  sheets.forEach(function(s){ XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s.rows.length ? s.rows : [{}]), s.nome.slice(0, 31)); });
  XLSX.writeFile(wb, nome + '_' + today() + '.xlsx');
}
function rowsOf(col, list){
  var sc = SCHEMA[col];
  return list.map(function(r){
    var o = {};
    sc.fields.forEach(function(f){
      if(f.t === 'veic') o['placa'] = placaDe(r[f.k]) === '—' ? '' : placaDe(r[f.k]);
      else if(f.t === 'posto'){ var p = postoDe(r[f.k]); o['posto'] = p ? p.nome : ''; }
      else if(f.t === 'postos-multi') o[f.k] = (r[f.k] || []).map(function(id){ var pp = postoDe(id); return pp ? pp.nome : ''; }).join(', ');
      else if(f.k === 'ignicao' && col === 'posicoes') o[f.k] = r[f.k] ? 'Ligado' : 'Desligado';
      else o[f.k] = r[f.k] == null ? '' : r[f.k];
    });
    if(col === 'visitas' || col === 'viagens') o.fonte = r.fonte || '';
    return o;
  });
}
function exportar(key){
  var c = calc();
  if(key === 'custos'){
    xlsxDownload('frota_custos', [{nome:'Custo por veículo', rows: Object.keys(c.per).map(function(k){ var p = c.per[k]; return {placa:p.v.placa, modelo:p.v.modelo || '', km:Math.round(p.km), litros:+p.litros.toFixed(2), consumo_kml:p.consumo ? +p.consumo.toFixed(2) : '', combustivel:+p.comb.toFixed(2), manutencao:+p.manut.toFixed(2), pedagio:+p.pedag.toFixed(2), total:+p.total.toFixed(2), custo_km:p.custoKm ? +p.custoKm.toFixed(3) : ''}; })}]);
    return;
  }
  var map = {abastecimentos:c.ab, manutencoes:vals(DB.manutencoes).filter(function(m){ return vOk(m.veiculoId) && (m.status === 'Agendada' || inP(m.data)); }), pedagios:c.pd, viagens:c.vg,
    visitas:vals(DB.visitas).filter(function(v){ return inP(v.chegada); }), leituras:vals(DB.leituras).filter(function(l){ return vOk(l.veiculoId) && inP(l.data); }), posicoes:vals(DB.posicoes), postos:vals(DB.postos), veiculos:vals(DB.veiculos), motoristas:vals(DB.motoristas)};
  xlsxDownload('frota_' + key, [{nome:key, rows:rowsOf(key, map[key] || [])}]);
}
function baixarModelo(col){
  var sc = SCHEMA[col], o = {};
  sc.fields.forEach(function(f){ if(f.t !== 'postos-multi') o[f.t === 'veic' ? 'placa' : f.t === 'posto' ? 'posto' : f.k] = ''; });
  xlsxDownload('modelo_' + col, [{nome:col, rows:[o]}]);
}
function lerPlanilha(file, cb){
  var r = new FileReader();
  r.onload = function(){
    try{
      var wb = XLSX.read(r.result, {type:'array', cellDates:true});
      var rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {defval:'', raw:false, dateNF:'yyyy-mm-dd'});
      cb(rows);
    }catch(err){ console.error(err); toast('Não consegui ler a planilha.', 'err'); }
  };
  r.readAsArrayBuffer(file);
}
function brDate(s, comHora){
  s = String(s || '').trim(); if(!s) return '';
  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ T](\d{1,2}):(\d{2}))?/);
  if(m){ var y = m[3].length === 2 ? '20' + m[3] : m[3]; var d = y + '-' + pad(+m[2]) + '-' + pad(+m[1]); return comHora && m[4] ? d + 'T' + pad(+m[4]) + ':' + m[5] : d; }
  return comHora ? s.slice(0, 16).replace(' ', 'T') : s.slice(0, 10);
}
function abrirImportacao(col){
  col = col || 'pedagios';
  var opts = Object.keys(SCHEMA).filter(function(k){ return canEdit(k); }).map(function(k){ return '<option value="'+k+'"'+(k === col ? ' selected' : '')+'>'+SCHEMA[k].label.charAt(0).toUpperCase() + SCHEMA[k].label.slice(1)+'</option>'; }).join('');
  openModal('<div class="modal-title">Importar planilha</div><div class="modal-sub">Excel (.xlsx) ou CSV. A primeira linha deve ter os nomes das colunas iguais aos do modelo. Use a coluna <code>placa</code> para ligar ao veículo e <code>posto</code> para ligar ao posto.</div>' +
    '<div class="modal-grid"><div class="modal-field"><label>O que vai importar</label><select id="imp-col">'+opts+'</select></div><div class="modal-field"><label>&nbsp;</label><button class="btn" id="imp-modelo" type="button">Baixar modelo</button></div>' +
    '<div class="modal-field full"><label>Arquivo</label><input type="file" id="imp-file" accept=".xlsx,.xls,.csv"></div></div><div id="imp-out" style="font-size:12.5px;color:var(--text-dim);margin-top:12px"></div>' +
    '<div class="modal-actions"><button class="btn btn-ghost" data-act="fechar">Fechar</button></div>');
  $('#imp-modelo').addEventListener('click', function(){ baixarModelo($('#imp-col').value); });
  $('#imp-file').addEventListener('change', function(){
    var f = this.files[0], c2 = $('#imp-col').value; if(!f) return;
    lerPlanilha(f, function(rows){ importarLinhas(c2, rows); });
  });
}
function importarLinhas(col, rows){
  var sc = SCHEMA[col], p = {}, ok = 0, skip = [];
  rows.forEach(function(row, i){
    var nr = {}; Object.keys(row).forEach(function(k){ nr[norm(k).replace(/[^a-z0-9]/g, '')] = row[k]; });
    var o = {};
    sc.fields.forEach(function(f){
      var v;
      if(f.t === 'veic'){ var pl = normPlaca(nr.placa || nr.veiculo); var vv = vals(DB.veiculos).find(function(x){ return normPlaca(x.placa) === pl; }); v = vv ? vv._id : ''; }
      else if(f.t === 'postos-multi'){ v = ''; }
      else if(f.t === 'posto'){ var pn = norm(nr.posto); var pp = vals(DB.postos).find(function(x){ return norm(x.nome) === pn; }); v = pp ? pp._id : ''; }
      else {
        v = nr[norm(f.k).replace(/[^a-z0-9]/g, '')]; if(v === undefined) v = nr[norm(f.l).replace(/[^a-z0-9]/g, '')];
        v = v == null ? '' : String(v).trim();
        if(f.t === 'number') v = v === '' ? '' : num(v);
        else if(f.t === 'date') v = brDate(v, false);
        else if(f.t === 'datetime-local') v = brDate(v, true);
      }
      if(v !== '' && v != null) o[f.k] = v;
    });
    var falta = sc.fields.filter(function(f){ return f.req && (o[f.k] === undefined || o[f.k] === ''); });
    if(falta.length){ skip.push('linha ' + (i + 2) + ': falta ' + falta.map(function(f){ return f.t === 'veic' ? 'placa (cadastrada)' : f.t === 'posto' ? 'posto (cadastrado)' : f.l; }).join(', ')); return; }
    if(col === 'veiculos'){ o.placa = String(o.placa).toUpperCase(); var ex = vals(DB.veiculos).find(function(x){ return normPlaca(x.placa) === normPlaca(o.placa); }); if(ex){ p['veiculos/' + ex._id] = Object.assign(clean(ex), o); ok++; return; } }
    if(col === 'visitas' || col === 'viagens' || col === 'posicoes') o.fonte = 'Planilha';
    if(col === 'viagens' && o.km === undefined && o.kmInicial !== undefined && o.kmFinal !== undefined) o.km = num(o.kmFinal) - num(o.kmInicial);
    if(col === 'posicoes') o.ignicao = /lig|sim|1|true/i.test(String(o.ignicao || ''));
    o.atualizadoEm = nowTs(); o.atualizadoPor = currentUser.name;
    p[col + '/' + (col === 'posicoes' ? o.veiculoId : store.key())] = o; ok++;
    var kl = col === 'viagens' ? o.kmFinal : o.km;
    if(kl && DB.veiculos[o.veiculoId] && num(kl) > num(DB.veiculos[o.veiculoId].kmAtual) && !(p['veiculos/' + o.veiculoId + '/kmAtual'] > num(kl))) p['veiculos/' + o.veiculoId + '/kmAtual'] = num(kl);
  });
  var out = $('#imp-out');
  if(!ok){ out.innerHTML = '<span style="color:var(--red)">Nenhuma linha importada.</span> ' + esc(skip.slice(0, 5).join('; ')); return; }
  save(p, 'Importou planilha de ' + SCHEMA[col].label, ok + ' linha(s)').then(function(){
    out.innerHTML = '<b style="color:var(--teal)">' + ok + ' linha(s) importada(s).</b>' + (skip.length ? ' <span style="color:var(--amber)">' + skip.length + ' ignorada(s):</span> ' + esc(skip.slice(0, 5).join('; ')) + (skip.length > 5 ? '…' : '') : '');
  });
}

// =====================================================================
// VISITAS — detecção pela cerca dos postos
// =====================================================================
function visitasDetectadas(){
  var novos = [];
  vals(DB.viagens).forEach(function(t){
    var pts = (t.pontos || []).map(function(p){ return Array.isArray(p) ? p : [p.lat, p.lng, p.t]; });
    if(pts.length < 2) return;
    vals(DB.postos).forEach(function(p){
      if(p.lat === '' || p.lat == null) return;
      var r = num(p.raio) || 200, ini = null, fim = null;
      function flush(){
        if(ini){
          var ch = String(ini[2] || t.inicio || '').slice(0, 16), sa = String((fim || ini)[2] || '').slice(0, 16);
          var dup = vals(DB.visitas).concat(novos).some(function(v){ return v.postoId === p._id && v.veiculoId === t.veiculoId && Math.abs((toDate(v.chegada) || 0) - (toDate(ch) || 0)) < 30 * 6e4; });
          if(!dup && ch) novos.push({postoId:p._id, veiculoId:t.veiculoId, motorista:t.motorista || '', chegada:ch, saida:sa, fonte:'Automática (rastreador)', obs:'Detectada pela cerca do posto'});
        }
        ini = fim = null;
      }
      pts.forEach(function(q){ if(hav(+q[0], +q[1], +p.lat, +p.lng) <= r){ if(!ini) ini = q; fim = q; } else flush(); });
      flush();
    });
  });
  return novos;
}
function detectarVisitas(silent){
  var novos = visitasDetectadas();
  if(!novos.length){ if(!silent) toast('Nenhuma visita nova encontrada nas rotas.'); return Promise.resolve(0); }
  var p = {}; novos.forEach(function(v){ v.atualizadoEm = nowTs(); p['visitas/' + store.key()] = v; });
  return save(p, 'Detectou visitas pelas rotas', novos.length + ' visita(s)').then(function(){ if(!silent) toast(novos.length + ' visita(s) registrada(s).'); return novos.length; });
}

// Excluir veículo leva junto tudo que é dele e, se veio do rastreador, para de puxar
function excluirVeiculo(id, r){
  var p = {}, cont = {}, nomes = {viagens:'viagens', visitas:'visitas', abastecimentos:'abastecimentos', manutencoes:'manutenções', pedagios:'pedágios', leituras:'leituras de KM', posicoes:'posição'};
  Object.keys(DB).forEach(function(c){
    var o = DB[c]; if(!o || typeof o !== 'object' || c === 'veiculos' || c === 'config' || c === 'logs') return;
    Object.keys(o).forEach(function(k){ var x = o[k]; if(x && typeof x === 'object' && x.veiculoId === id){ p[c + '/' + k] = null; cont[c] = (cont[c] || 0) + 1; } });
  });
  p['veiculos/' + id] = null; p['posicoes/' + id] = null;
  if(r.rastreadorId) p['config/rastreadorIgnorar/' + r.rastreadorId] = r.placa || '';
  var lista = Object.keys(cont).map(function(c){ return cont[c] + ' ' + (nomes[c] || c); }).join(', ');
  confirmBox('Excluir veículo', 'Excluir <b>' + esc(descRec('veiculos', r)) + '</b>' + (lista ? ' e todos os dados dele (' + lista + ')' : '') + '?' +
    (r.rastreadorId ? '<br><br>O rastreador deste carro também deixa de ser puxado (dá para voltar em Cadastros › Integração).' : '') + '<br>Não dá para desfazer.', 'Excluir', function(){
    return save(p, 'Excluiu veículo', descRec('veiculos', r) + (lista ? ' + ' + lista : '')).then(function(){ toast('Veículo e dados excluídos.'); });
  });
}
function voltarPuxar(rid){
  save((function(){ var o = {}; o['config/rastreadorIgnorar/' + rid] = null; return o; })(), 'Voltou a puxar veículo do rastreador', rid).then(function(){ toast('Na próxima atualização ele volta a ser puxado.'); });
}
