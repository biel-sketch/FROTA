// =====================================================================
// NAVEGAÇÃO
// =====================================================================
var MODULES = [
  {id:'inicio', label:'Início', subs:[{id:'resumo', label:'Resumo', view:'resumo', filtros:true}]},
  {id:'rastreamento', label:'Rastreamento', subs:[
    {id:'posicoes', label:'Posição atual', view:'posicoes'},
    {id:'viagens', label:'Viagens e trajetos', view:'viagens', filtros:true},
    {id:'hodometro', label:'Hodômetro (KM)', view:'hodometro', filtros:true}]},
  {id:'combustivel', label:'Combustível', subs:[
    {id:'abastecimentos', label:'Abastecimentos', view:'abastecimentos', filtros:true},
    {id:'consumo', label:'Consumo e preço do litro', view:'consumo', filtros:true}]},
  {id:'manutencao', label:'Manutenções', subs:[
    {id:'plano', label:'Próximas e vencidas', view:'plano'},
    {id:'historico', label:'Histórico', view:'manutencoes', filtros:true}]},
  {id:'pedagios', label:'Pedágios', subs:[{id:'pedagios', label:'Pedágios', view:'pedagios', filtros:true}]},
  {id:'visitas', label:'Visitas a postos', subs:[
    {id:'visitas', label:'Visitas', view:'visitas', filtros:true},
    {id:'postos', label:'Postos de trabalho', view:'postos', filtros:true}]},
  {id:'relatorios', label:'Relatórios', subs:[{id:'custos', label:'Custos da frota', view:'relatorios', filtros:true}]},
  {id:'cadastros', label:'Cadastros', subs:[
    {id:'veiculos', label:'Veículos', view:'veiculos'},
    {id:'motoristas', label:'Motoristas', view:'motoristas'},
    {id:'integracao', label:'Integração AgileSat e importação', view:'integracao', admin:true},
    {id:'sistema', label:'Sistema', view:'sistema', admin:true}]}
];
var curMod = 'inicio', curSub = 'resumo', curView = 'resumo', renderQueued = false, modalRefresh = null, selTrip = null;
var F = {period:'30d', veic:'', d1:'', d2:''};

function modById(id){ return MODULES.find(function(m){ return m.id === id; }) || MODULES[0]; }
function scheduleRender(){
  if(renderQueued) return; renderQueued = true;
  requestAnimationFrame(function(){ renderQueued = false; if(currentUser) renderAll(); });
}
function renderAll(){ fillVeicFilter(); updateBadges(); syncInfo(); renderView(); }
function showModule(modId, subId){
  var m = modById(modId);
  var subs = m.subs.filter(function(x){ return !x.admin || can('admin'); });
  var sub = subs.find(function(x){ return x.id === subId; }) || subs[0];
  curMod = m.id; curSub = sub.id; curView = sub.view;
  try{ localStorage.setItem('painelfrota_nav', m.id + '/' + sub.id); }catch(e){}
  $$('.nav-item').forEach(function(n){ n.classList.toggle('active', n.dataset.mod === m.id); });
  $('#mod-title').textContent = m.label;
  $('#subnav').innerHTML = subs.length > 1 ? subs.map(function(x){ return '<div class="subtab'+(x.id === sub.id ? ' active' : '')+'" data-sub="'+x.id+'">'+esc(x.label)+'</div>'; }).join('') : '';
  $('#subnav').style.display = subs.length > 1 ? '' : 'none';
  $('#f-period').style.display = sub.filtros ? '' : 'none';
  ajustaDatas();
  $('#f-veic').style.display = sub.filtros ? '' : 'none';
  window.scrollTo(0, 0);
  renderAll();
}
function initUI(){
  $$('.page-date-js').forEach(function(el){ el.textContent = new Date().toLocaleDateString('pt-BR', {weekday:'long', day:'2-digit', month:'long', year:'numeric'}); });
  $('#nav').addEventListener('click', function(e){ var n = e.target.closest('.nav-item'); if(n) showModule(n.dataset.mod); });
  $('#subnav').addEventListener('click', function(e){ var t = e.target.closest('.subtab'); if(t) showModule(curMod, t.dataset.sub); });
  $('#sidebar-toggle-btn').addEventListener('click', function(){ $('#app-sidebar').classList.toggle('collapsed'); });
  $('#f-period').addEventListener('change', function(){ F.period = this.value; ajustaDatas(true); scheduleRender(); });
  $('#f-d1').addEventListener('change', function(){ F.d1 = this.value; if(F.period === 'entre' && F.d2 && F.d2 < F.d1){ F.d2 = F.d1; $('#f-d2').value = F.d1; } ajustaDatas(); scheduleRender(); });
  $('#f-d2').addEventListener('change', function(){ F.d2 = this.value; ajustaDatas(); scheduleRender(); });
  $('#f-veic').addEventListener('change', function(){ F.veic = this.value; scheduleRender(); });
  document.addEventListener('click', onAction);
  $('#modal').addEventListener('click', function(e){ if(e.target.id === 'modal') closeModal(); });
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape') closeModal(); });
}
function fillVeicFilter(){
  var sel = $('#f-veic'), cur = F.veic;
  var vs = vals(DB.veiculos).sort(function(a, b){ return String(a.placa).localeCompare(String(b.placa)); });
  sel.innerHTML = '<option value="">Todos os veículos</option>' + vs.map(function(v){ return '<option value="'+esc(v._id)+'">'+esc(v.placa)+' · '+esc(v.modelo || '')+'</option>'; }).join('');
  sel.value = DB.veiculos[cur] ? cur : ''; F.veic = sel.value;
}
function updateBadges(){
  var crit = alertas().filter(function(a){ return a.sev === 'red'; }).length;
  $('#badge-inicio').textContent = crit || '';
  var man = alertas().filter(function(a){ return a.tipo === 'manut' && a.sev === 'red'; }).length;
  $('#badge-manutencao').textContent = man || '';
}

// =====================================================================
// PERÍODO E CÁLCULOS
// =====================================================================
function iso(d){ return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function segunda(d){ var x = new Date(d); x.setHours(0,0,0,0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
function diaDe(s){ var d = s ? new Date(s + 'T00:00:00') : new Date(); if(isNaN(d)) d = new Date(); d.setHours(0,0,0,0); return d; }
function fimDia(d){ var x = new Date(d); x.setHours(23,59,59,999); return x; }
// mostra/esconde os campos de data conforme o período escolhido
function ajustaDatas(trocou){
  var p = F.period, box = $('#f-datas'); if(!box) return;
  var usa = p === 'dia' || p === 'sem' || p === 'entre';
  box.style.display = usa && $('#f-period').style.display !== 'none' ? 'flex' : 'none';
  if(!usa) return;
  if(trocou || !F.d1){ F.d1 = F.d1 || iso(new Date()); }
  if(p === 'entre' && !F.d2){ var x = diaDe(F.d1); x.setDate(x.getDate() + 6); F.d2 = iso(x) > iso(new Date()) ? iso(new Date()) : iso(x); }
  $('#f-d1').value = F.d1; $('#f-d2').value = F.d2 || '';
  $('#f-d2').style.display = p === 'entre' ? '' : 'none';
  $('#f-ate-txt').style.display = p === 'entre' ? '' : 'none';
  $('#f-d1').title = p === 'sem' ? 'Escolha qualquer dia da semana' : '';
  if(p === 'sem'){ var r = range(); $('#f-sem-txt').textContent = 'semana de ' + r[0].toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'}) + ' a ' + r[1].toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit', year:'numeric'}); }
  else $('#f-sem-txt').textContent = '';
}
function range(){
  var now = new Date(), end = new Date(now); end.setHours(23,59,59,999);
  var st = new Date(now); st.setHours(0,0,0,0);
  if(F.period === 'hoje') return [st, end];
  if(F.period === 'ontem'){ st.setDate(st.getDate() - 1); return [st, fimDia(st)]; }
  if(F.period === 'semana') return [segunda(now), end];
  if(F.period === 'semana-ant'){ var s0 = segunda(now); s0.setDate(s0.getDate() - 7); var e0 = new Date(s0); e0.setDate(e0.getDate() + 6); return [s0, fimDia(e0)]; }
  if(F.period === 'mes-ant') return [new Date(now.getFullYear(), now.getMonth() - 1, 1), fimDia(new Date(now.getFullYear(), now.getMonth(), 0))];
  if(F.period === 'dia'){ var d = diaDe(F.d1); return [d, fimDia(d)]; }
  if(F.period === 'sem'){ var s1 = segunda(diaDe(F.d1)), e1 = new Date(s1); e1.setDate(e1.getDate() + 6); return [s1, fimDia(e1)]; }
  if(F.period === 'entre'){ var a1 = diaDe(F.d1), b1 = diaDe(F.d2 || F.d1); if(b1 < a1){ var tmp = a1; a1 = b1; b1 = tmp; } return [a1, fimDia(b1)]; }
  if(F.period === 'mes') st = new Date(now.getFullYear(), now.getMonth(), 1);
  else if(F.period === '30d') st.setDate(st.getDate() - 30);
  else if(F.period === '90d') st.setDate(st.getDate() - 90);
  else if(F.period === 'ano') st = new Date(now.getFullYear(), 0, 1);
  else st = new Date(2000, 0, 1);
  return [st, end];
}
function inP(s){ var d = toDate(s); if(!d) return false; var r = range(); return d >= r[0] && d <= r[1]; }
function vOk(id){ return !F.veic || id === F.veic; }
function placaDe(id){ var v = DB.veiculos[id]; return v ? v.placa : '—'; }
function postoDe(id){ return DB.postos[id] || null; }
function weeksInP(){
  var r = range(), st = r[0];
  if(F.period === 'tudo'){ var ds = vals(DB.visitas).map(function(v){ return toDate(v.chegada); }).filter(Boolean); st = ds.length ? new Date(Math.min.apply(null, ds)) : new Date(); }
  return Math.max(1/7, (r[1] - st) / (7 * 864e5));
}

function calc(){
  var vs = vals(DB.veiculos).filter(function(v){ return vOk(v._id); });
  var per = {};
  vs.forEach(function(v){ per[v._id] = {v:v, kmGps:0, kmOdo:0, km:0, litros:0, comb:0, consumo:null, manut:0, pedag:0, viagens:0, velMax:0}; });
  // abastecimento mensal conta proporcional aos dias do mês que caem no período
  var R = range();
  var fatorAb = function(a){
    if(!ehMensal(a)) return inP(a.data) ? 1 : 0;
    var d = toDate(a.data); if(!d) return 0;
    var i = new Date(d.getFullYear(), d.getMonth(), 1), f = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
    var ov = Math.min(f, R[1]) - Math.max(i, R[0]); return ov > 0 ? Math.min(1, ov / (f - i)) : 0;
  };
  var ab = vals(DB.abastecimentos).filter(function(a){ return per[a.veiculoId] && fatorAb(a) > 0; });
  var mn = vals(DB.manutencoes).filter(function(m){ return per[m.veiculoId] && m.status !== 'Agendada' && inP(m.data); });
  var pd = vals(DB.pedagios).filter(function(p){ return per[p.veiculoId] && inP(p.data); });
  var vg = vals(DB.viagens).filter(function(t){ return per[t.veiculoId] && inP(t.inicio); });
  vg.forEach(function(t){ var p = per[t.veiculoId]; p.kmGps += num(t.km); p.viagens++; p.velMax = Math.max(p.velMax, num(t.velMax)); });
  mn.forEach(function(m){ per[m.veiculoId].manut += num(m.custo); });
  pd.forEach(function(x){ per[x.veiculoId].pedag += num(x.valor); });
  var byV = {};
  ab.forEach(function(a){ var k = fatorAb(a); if(!ehMensal(a)) (byV[a.veiculoId] = byV[a.veiculoId] || []).push(a); per[a.veiculoId].litros += num(a.litros) * k; per[a.veiculoId].comb += num(a.valor) * k; });
  Object.keys(byV).forEach(function(id){
    var list = byV[id].sort(function(a, b){ return num(a.km) - num(b.km); });
    if(list.length >= 2){
      var dk = num(list[list.length-1].km) - num(list[0].km);
      var l = list.slice(1).reduce(function(s, a){ return s + num(a.litros); }, 0);
      per[id].kmComb = dk > 0 ? dk : 0;
      if(l > 0 && dk > 0) per[id].consumo = dk / l;
    }
  });
  // consumo real pelos lançamentos mensais: KM rodado nos meses lançados ÷ litros (últimos 3 meses lançados)
  Object.keys(per).forEach(function(id){
    if(per[id].consumo) return;
    var r = consumoMensal(id); if(r){ per[id].consumo = r.consumo; per[id].kmComb = r.km; per[id].consumoFonte = r.fonte; }
  });
  // KM pelo hodômetro: todas as leituras do período (abastecimentos, leituras de KM, viagens, manutenções e posições)
  leiturasKm().forEach(function(r){ var p = per[r.v]; if(!p || !inP(r.d)) return; p._min = p._min == null ? r.km : Math.min(p._min, r.km); p._max = p._max == null ? r.km : Math.max(p._max, r.km); });
  Object.keys(per).forEach(function(id){ var p = per[id]; p.kmOdo = p._max != null ? p._max - p._min : 0; if(!p.kmComb) p.kmComb = 0; });
  var T = {km:0, litros:0, comb:0, manut:0, pedag:0, total:0, viagens:0, kmGps:0, combEst:0, litrosEst:0, semDados:0};
  Object.keys(per).forEach(function(id){
    var p = per[id]; p.km = Math.max(p.kmGps, p.kmOdo);
    p.consRef = p.consumo || num(p.v.metaConsumo) || null;
    p.preco = precoLitro(p.v);
    p.litrosEst = p.consRef ? p.km / p.consRef : 0;
    p.combEst = p.consRef && p.preco ? p.litrosEst * p.preco.valor : 0;
    p.semDados = p.km > 0 && !(p.consRef && p.preco);
    p.combUsado = p.semDados ? p.comb : p.combEst;   // sem consumo ou preço: usa o que foi lançado
    p.total = p.combUsado + p.manut + p.pedag; p.custoKm = p.km ? p.total / p.km : null;
    ['km','litros','comb','manut','pedag','total','viagens','kmGps','combEst','litrosEst'].forEach(function(k){ T[k] += p[k]; });
    if(p.semDados) T.semDados++;
  });
  T.combUsado = T.total - T.manut - T.pedag;
  var cons = Object.keys(per).map(function(k){ return per[k]; }).filter(function(p){ return p.consumo; });
  T.consumo = cons.length ? cons.reduce(function(s, p){ return s + p.kmComb; }, 0) / cons.reduce(function(s, p){ return s + p.kmComb / p.consumo; }, 0) : null;
  T.consumoRef = T.litrosEst ? Object.keys(per).reduce(function(s, k){ return s + (per[k].consRef ? per[k].km : 0); }, 0) / T.litrosEst : null;
  T.custoKm = T.km ? T.total / T.km : null;
  return {per:per, ab:ab, mn:mn, pd:pd, vg:vg, T:T, vs:vs};
}

function consumoMensal(vid){
  var ms = vals(DB.abastecimentos).filter(function(a){ return a.veiculoId === vid && ehMensal(a) && num(a.litros) > 0; })
    .sort(function(a, b){ return String(b.data).localeCompare(String(a.data)); }).slice(0, 3);
  var km = 0, l = 0, n = 0;
  ms.forEach(function(a){ var d = toDate(a.data); if(!d) return; var k = kmNoIntervalo(vid, new Date(d.getFullYear(), d.getMonth(), 1), new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59)); if(k > 0){ km += k; l += num(a.litros); n++; } });
  return km > 0 && l > 0 ? {consumo:km / l, km:km, fonte:n + ' mês(es) lançado(s)'} : null;
}
function leiturasKm(){
  var out = [];
  function add(v, d, km){ km = num(km); if(v && d && km > 0) out.push({v:v, d:d, km:km}); }
  vals(DB.abastecimentos).forEach(function(a){ add(a.veiculoId, a.data, a.km); });
  vals(DB.leituras).forEach(function(a){ add(a.veiculoId, a.data, a.km); });
  vals(DB.manutencoes).forEach(function(a){ if(a.status !== 'Agendada') add(a.veiculoId, a.data, a.km); });
  vals(DB.viagens).forEach(function(a){ add(a.veiculoId, a.inicio, a.kmInicial); add(a.veiculoId, a.fim || a.inicio, a.kmFinal); });
  vals(DB.posicoes).forEach(function(a){ add(a.veiculoId, a.dataHora, a.km); });
  return out;
}
function ultimaLeitura(vid){
  var u = null; leiturasKm().forEach(function(r){ if(r.v === vid && (!u || String(r.d) > String(u.d))) u = r; }); return u;
}

// ----- combustível estimado: KM rodado ÷ consumo (km/l) × preço do litro
var TIPOS_PRECO = ['Gasolina','Etanol','Diesel S10','Diesel S500','GNV'];
function tipoPreco(v){ var c = v.combustivel || 'Flex'; if(c === 'Flex') return v.abasteceCom || 'Gasolina'; if(c === 'Diesel') return 'Diesel S10'; return c; }
function precoLitro(v){
  if(num(v.precoLitro)) return {valor:num(v.precoLitro), fonte:'do cadastro do veículo'};
  var lim = addDays(today(), -90), ult = null;
  vals(DB.abastecimentos).forEach(function(a){ if(a.veiculoId === v._id && num(a.litros) && num(a.valor) && String(a.data) >= lim && (!ult || String(a.data) > String(ult.data))) ult = a; });
  if(ult) return {valor:num(ult.valor) / num(ult.litros), fonte:'último abastecimento (' + fmtD(ult.data) + ')'};
  var pr = (cfg('precos', {}) || {})[tipoPreco(v)];
  if(num(pr)) return {valor:num(pr), fonte:'preço de ' + tipoPreco(v)};
  return null;
}
function kmNoIntervalo(vid, a, b){
  var gps = 0, mn = null, mx = null;
  vals(DB.viagens).forEach(function(t){ var d = toDate(t.inicio); if(t.veiculoId === vid && d && d >= a && d <= b) gps += num(t.km); });
  leiturasKm().forEach(function(r){ var d = toDate(r.d); if(r.v !== vid || !d || d < a || d > b) return; mn = mn == null ? r.km : Math.min(mn, r.km); mx = mx == null ? r.km : Math.max(mx, r.km); });
  return Math.max(gps, mx != null ? mx - mn : 0);
}
function combEstimadoMes(vid, k){
  var v = DB.veiculos[vid]; if(!v) return 0; v._id = vid;
  var y = +k.slice(0, 4), m = +k.slice(5, 7), a = new Date(y, m - 1, 1), b = new Date(y, m, 0, 23, 59, 59);
  var cons = num(v.metaConsumo), pr = precoLitro(v);
  return cons && pr ? kmNoIntervalo(vid, a, b) / cons * pr.valor : 0;
}

function aderencia(){
  var w = weeksInP();
  return vals(DB.postos).sort(function(a, b){ return String(a.nome).localeCompare(String(b.nome)); }).map(function(p){
    var vis = vals(DB.visitas).filter(function(v){ return v.postoId === p._id && inP(v.chegada) && (!F.veic || v.veiculoId === F.veic); });
    var esperado = num(p.freqSemana) * w;
    var ult = vals(DB.visitas).filter(function(v){ return v.postoId === p._id; }).map(function(v){ return v.chegada; }).sort().pop();
    var perm = vis.map(function(v){ var a = toDate(v.chegada), b = toDate(v.saida); return a && b ? (b - a) / 6e4 : null; }).filter(function(x){ return x != null && x >= 0; });
    return {p:p, n:vis.length, esperado:esperado, pct:esperado ? Math.min(100, vis.length / esperado * 100) : null, ult:ult, perm:perm.length ? perm.reduce(function(s, x){ return s + x; }, 0) / perm.length : null};
  });
}

function alertas(){
  var A = [], lim = num(cfg('limiteVel', 110)) || 110;
  function add(sev, tipo, t, d){ A.push({sev:sev, tipo:tipo, t:t, d:d}); }
  var last = {};
  vals(DB.manutencoes).forEach(function(m){ if(!vOk(m.veiculoId)) return; var k = m.veiculoId + '|' + norm(m.servico); if(!last[k] || String(m.data) > String(last[k].data)) last[k] = m; });
  Object.keys(last).forEach(function(k){
    var m = last[k], v = DB.veiculos[m.veiculoId]; if(!v) return;
    if(m.status === 'Agendada'){
      var dd = daysUntil(m.data);
      if(dd != null && dd < 0) add('amber', 'manut', v.placa + ': ' + m.servico + ' agendada e não registrada', 'Agendada para ' + fmtD(m.data));
      else if(dd != null && dd <= 7) add('teal', 'manut', v.placa + ': ' + m.servico + ' agendada', fmtD(m.data) + (m.oficina ? ' · ' + m.oficina : ''));
      return;
    }
    if(m.proxKm && v.kmAtual){ var f = num(m.proxKm) - num(v.kmAtual);
      if(f <= 0) add('red', 'manut', v.placa + ': ' + m.servico + ' vencida por km', 'Previsto ' + fmtN(m.proxKm) + ' km · atual ' + fmtN(v.kmAtual) + ' km');
      else if(f <= 1000) add('amber', 'manut', v.placa + ': ' + m.servico + ' em ' + fmtN(f) + ' km', 'Previsto ' + fmtN(m.proxKm) + ' km'); }
    if(m.proxData){ var d = daysUntil(m.proxData);
      if(d < 0) add('red', 'manut', v.placa + ': ' + m.servico + ' vencida', 'Venceu em ' + fmtD(m.proxData));
      else if(d <= 15) add('amber', 'manut', v.placa + ': ' + m.servico + ' vence em ' + d + ' dia(s)', fmtD(m.proxData)); }
  });
  vals(DB.veiculos).filter(function(v){ return vOk(v._id); }).forEach(function(v){
    [['vencLicenciamento','Licenciamento'],['vencSeguro','Seguro']].forEach(function(x){
      var d = daysUntil(v[x[0]]); if(d == null) return;
      if(d < 0) add('red', 'doc', v.placa + ': ' + x[1] + ' vencido', fmtD(v[x[0]]));
      else if(d <= 30) add('amber', 'doc', v.placa + ': ' + x[1] + ' vence em ' + d + ' dia(s)', fmtD(v[x[0]]));
    });
  });
  vals(DB.veiculos).filter(function(v){ return vOk(v._id) && (v.status || 'Ativo') === 'Ativo'; }).forEach(function(v){
    var u = ultimaLeitura(v._id), pos = DB.posicoes[v._id];
    var ult = [u ? u.d : '', pos ? pos.dataHora : ''].sort().pop();
    var d = ult ? -daysUntil(ult) : null;
    if(d == null) add('amber', 'km', v.placa + ': sem leitura de hodômetro', 'Lance o KM em Rastreamento › Hodômetro');
    else if(d > 15) add('amber', 'km', v.placa + ': KM sem atualização há ' + d + ' dias', 'Última leitura em ' + fmtD(ult));
  });
  if(!F.veic) vals(DB.motoristas).forEach(function(m){
    var d = daysUntil(m.vencCnh); if(d == null) return;
    if(d < 0) add('red', 'doc', 'CNH vencida: ' + m.nome, fmtD(m.vencCnh));
    else if(d <= 30) add('amber', 'doc', 'CNH de ' + m.nome + ' vence em ' + d + ' dia(s)', fmtD(m.vencCnh));
  });
  var c = calc();
  Object.keys(c.per).forEach(function(id){ var p = c.per[id];
    if(p.consumo && num(p.v.metaConsumo) && p.consumo < num(p.v.metaConsumo) * 0.9) add('amber', 'consumo', p.v.placa + ': consumo abaixo da meta', fmtN(p.consumo, 1) + ' km/l (meta ' + fmtN(p.v.metaConsumo, 1) + ')'); });
  var exc = {}; c.vg.forEach(function(t){ if(num(t.velMax) > lim) exc[t.veiculoId] = (exc[t.veiculoId] || 0) + 1; });
  Object.keys(exc).forEach(function(id){ add('amber', 'vel', placaDe(id) + ': ' + exc[id] + ' viagem(ns) acima de ' + lim + ' km/h', 'Veja em Rastreamento › Viagens'); });
  aderencia().forEach(function(a){ if(a.pct != null && a.pct < 80) add(a.pct < 50 ? 'red' : 'amber', 'visita', a.p.nome + ': ' + fmtN(a.pct) + '% das visitas', a.n + ' de ' + fmtN(a.esperado) + ' esperadas no período'); });
  Object.keys(c.per).forEach(function(id){ var p = c.per[id]; if(p.semDados) add('amber', 'consumo', p.v.placa + ': informe ' + (!p.consRef ? 'o consumo (km/l)' : 'o preço do litro'), 'Necessário para calcular o combustível · Cadastros › Veículos'); });
  var us = cfg('ultimaSync', null);
  if(us && us.erro) add('amber', 'sync', 'Sincronização com a AgileSat falhou', fmtDT(us.erroEm) + ' · veja em Cadastros › Integração');
  var ord = {red:0, amber:1, teal:2}; A.sort(function(a, b){ return ord[a.sev] - ord[b.sev]; });
  return A;
}

// =====================================================================
// COMPONENTES
// =====================================================================
function stat(label, value, sub, cls){ return '<div class="stat-card"><div class="stat-label">'+label+'</div><div class="stat-value sm '+(cls||'')+'">'+value+'</div>'+(sub ? '<div class="stat-sub">'+sub+'</div>' : '')+'</div>'; }
function panel(title, body, extra, sub){ return '<div class="panel"><div class="panel-head"><span class="panel-title">'+title+(sub ? '<span class="panel-sub">'+sub+'</span>' : '')+'</span>'+(extra || '')+'</div>'+body+'</div>'; }
function empty(msg){ return '<div class="empty-state">'+esc(msg)+'</div>'; }
function table(cols, rows, opt){
  opt = opt || {};
  if(!rows.length) return empty(opt.empty || 'Nenhum registro no período.');
  var lim = opt.limit || 300;
  var h = '<div class="table-wrap"><table><thead><tr>' + cols.map(function(c){ return '<th class="'+(c.n ? 'num' : '')+'">'+c.l+'</th>'; }).join('') + (opt.acts ? '<th></th>' : '') + '</tr></thead><tbody>';
  h += rows.slice(0, lim).map(function(r){
    return '<tr '+(opt.attr ? opt.attr(r) : '')+'>' + cols.map(function(c){ return '<td class="'+(c.n ? 'num' : '')+'">'+(c.f ? c.f(r) : esc(r[c.k]))+'</td>'; }).join('') + (opt.acts ? '<td class="num" style="white-space:nowrap">'+opt.acts(r)+'</td>' : '') + '</tr>';
  }).join('');
  h += '</tbody></table></div>';
  if(rows.length > lim) h += '<div class="tbl-foot">Mostrando ' + lim + ' de ' + rows.length + ' registros. Use o filtro de período ou exporte para Excel.</div>';
  return h;
}
function acts(col, id){
  var h = '';
  if(canEdit(col)) h += '<button class="btn btn-sm" data-act="editar" data-col="'+col+'" data-id="'+esc(id)+'">Editar</button> ';
  if(can('excluir')) h += '<button class="btn btn-sm btn-danger" data-act="excluir" data-col="'+col+'" data-id="'+esc(id)+'">Excluir</button>';
  return h;
}
function canEdit(col){
  if(['veiculos','motoristas','postos'].indexOf(col) >= 0) return can('cadastros');
  if(col === 'manutencoes') return can('manutencao');
  return can('lancar');
}
function newBtn(col, label){ return canEdit(col) ? '<button class="btn btn-primary" data-act="novo" data-col="'+col+'">+ '+label+'</button>' : ''; }
function impBtn(col){ return canEdit(col) ? '<button class="btn" data-act="importar" data-col="'+col+'">Importar Excel</button>' : ''; }
function exportBtn(key){ return '<button class="btn" data-act="exportar" data-key="'+key+'">Exportar Excel</button>'; }
function pill(cls, txt){ return '<span class="pill '+cls+'">'+esc(txt)+'</span>'; }
function docPill(iso){ var d = daysUntil(iso); if(d == null) return '<span class="mono">—</span>'; if(d < 0) return pill('red', 'Vencido ' + fmtD(iso)); if(d <= 30) return pill('amber', fmtD(iso)); return '<span class="mono">'+fmtD(iso)+'</span>'; }
function alertList(A, emptyMsg){
  if(!A.length) return empty(emptyMsg || 'Nenhum alerta. Tudo em dia.');
  return '<div class="list scroll">' + A.map(function(a){ return '<div class="list-item"><span class="alert-dot '+a.sev+'"></span><div class="grow"><div class="t">'+esc(a.t)+'</div><div class="s">'+esc(a.d)+'</div></div></div>'; }).join('') + '</div>';
}
function bars(items, fmt, cls){
  if(!items.length) return empty('Sem dados no período.');
  var max = Math.max.apply(null, items.map(function(i){ return i.v; }).concat([1]));
  return '<div class="bars">' + items.map(function(i){ return '<div class="bar-row"><span class="bar-label" title="'+esc(i.l)+'">'+esc(i.l)+'</span><div class="bar-track"><div class="bar-fill '+(cls||'')+'" style="width:'+(i.v/max*100).toFixed(1)+'%"></div></div><span class="bar-val">'+fmt(i.v)+'</span></div>'; }).join('') + '</div>';
}
function months(n){ var out = [], d = new Date(); d.setDate(1); for(var i = n-1; i >= 0; i--){ var m = new Date(d.getFullYear(), d.getMonth() - i, 1); out.push({k: m.getFullYear() + '-' + pad(m.getMonth()+1), l: m.toLocaleDateString('pt-BR', {month:'short'}).replace('.', '') + '/' + String(m.getFullYear()).slice(2)}); } return out; }
function colsChart(ms, series){
  var tot = ms.map(function(m){ return series.reduce(function(s, x){ return s + (x.data[m.k] || 0); }, 0); });
  var max = Math.max.apply(null, tot.concat([1]));
  return '<div class="legend">' + series.map(function(s){ return '<span><i class="'+s.cls+'"></i>'+s.l+'</span>'; }).join('') + '</div>' +
    '<div class="cols">' + ms.map(function(m, i){
      var segs = series.map(function(s){ var v = s.data[m.k] || 0; return v ? '<div class="col-seg '+s.cls+'" style="height:'+(v/max*170).toFixed(1)+'px" title="'+esc(s.l)+': '+fmtR(v)+'"></div>' : ''; }).join('');
      return '<div class="col"><span class="col-val">'+(tot[i] ? 'R$ ' + fmtN(tot[i]/1000, 1) + ' mil' : '')+'</span><div class="col-stack">'+segs+'</div><span class="col-lbl">'+m.l+'</span></div>';
    }).join('') + '</div>';
}

// =====================================================================
// VIEWS
// =====================================================================
function renderView(){
  var fn = VIEWS[curView] || VIEWS.resumo;
  var out = fn();
  $('#view-actions').innerHTML = out.actions || '';
  $('#filters').style.display = ($('#f-period').style.display !== 'none' || out.actions) ? '' : 'none';
  $('#view').innerHTML = out.html;
  if(out.after) out.after();
}

var VIEWS = {};

VIEWS.resumo = function(){
  var c = calc(), A = alertas(), ad = aderencia();
  var ativos = c.vs.filter(function(v){ return (v.status || 'Ativo') === 'Ativo'; }).length;
  var lig = vals(DB.posicoes).filter(function(p){ return vOk(p.veiculoId) && p.ignicao; }).length;
  var tv = ad.reduce(function(s, a){ return s + a.n; }, 0), te = ad.reduce(function(s, a){ return s + a.esperado; }, 0);
  var ms = months(6), cb = {}, mt = {}, pg = {};
  ms.forEach(function(m){ cb[m.k] = c.vs.reduce(function(t, v){ var e = combEstimadoMes(v._id, m.k); if(!e) e = vals(DB.abastecimentos).filter(function(a){ return a.veiculoId === v._id && String(a.data).slice(0,7) === m.k; }).reduce(function(x, a){ return x + num(a.valor); }, 0); return t + e; }, 0); });
  vals(DB.manutencoes).forEach(function(a){ if(a.status !== 'Agendada' && vOk(a.veiculoId)){ var k = String(a.data).slice(0,7); mt[k] = (mt[k]||0) + num(a.custo); } });
  vals(DB.pedagios).forEach(function(a){ if(vOk(a.veiculoId)){ var k = String(a.data).slice(0,7); pg[k] = (pg[k]||0) + num(a.valor); } });
  var rows = Object.keys(c.per).map(function(k){ return c.per[k]; }).sort(function(a, b){ return b.km - a.km; });
  var html = '<div class="eyebrow"><span class="eyebrow-dot"></span>Visão geral da frota</div>' +
    '<div class="stats six">' +
      stat('Veículos ativos', ativos + '<span class="mono"> / ' + c.vs.length + '</span>', lig + ' com ignição ligada agora') +
      hodometroCard(c) +
      stat('Combustível', fmtR(c.T.combUsado), c.T.semDados ? '<span style="color:var(--amber)">falta consumo ou preço em ' + c.T.semDados + ' veículo(s)</span>' : fmtN(c.T.litrosEst) + ' litros estimados' + (c.T.comb ? ' · lançado ' + fmtR(c.T.comb) : '')) +
      stat('Consumo médio', c.T.consumoRef ? fmtN(c.T.consumoRef, 1) + ' km/l' : '—', c.T.consumo ? 'real pelos abastecimentos: ' + fmtN(c.T.consumo, 1) + ' km/l' : 'pelo consumo do cadastro', 'teal') +
      stat('Manutenção', fmtR(c.T.manut), c.mn.length + ' serviços realizados') +
      stat('Pedágios', fmtR(c.T.pedag), c.pd.length + ' passagens') +
    '</div><div class="stats three">' +
      stat('Custo total', fmtR(c.T.total), 'combustível + manutenção + pedágio') +
      stat('Custo por km', c.T.custoKm ? fmtR(c.T.custoKm) : '—', 'custo total ÷ km rodados') +
      stat('Visitas a postos', tv, te ? fmtN(Math.min(100, tv / te * 100)) + '% do esperado' : 'cadastre os postos', te && tv / te < 0.8 ? 'amber' : '') +
    '</div>' +
    '<div class="grid-3-1">' +
      panel('Custos por mês', colsChart(ms, [{l:'Combustível', cls:'c-teal', data:cb}, {l:'Manutenção', cls:'c-blue', data:mt}, {l:'Pedágios', cls:'c-amber', data:pg}]), '', 'últimos 6 meses') +
      panel('Alertas', alertList(A), '<span class="mono">' + A.length + '</span>') +
    '</div>' +
    panel('Desempenho por veículo', table([
      {l:'Veículo', f:function(r){ return esc(r.v.placa) + '<span class="sub">' + esc(r.v.modelo || '') + '</span>'; }},
      {l:'KM', n:1, f:function(r){ return fmtN(r.km); }},
      {l:'Hodômetro', n:1, f:function(r){ return r.v.kmAtual ? fmtN(r.v.kmAtual) : '—'; }},
      {l:'Consumo (km/l)', n:1, f:function(r){ return r.consRef ? fmtN(r.consRef, 1) : '<span style="color:var(--amber)">informar</span>'; }},
      {l:'Preço/l', n:1, f:function(r){ return r.preco ? fmtR(r.preco.valor) : '<span style="color:var(--amber)">informar</span>'; }},
      {l:'Combustível', n:1, f:function(r){ return fmtR(r.combUsado); }},
      {l:'Manutenção', n:1, f:function(r){ return fmtR(r.manut); }},
      {l:'Pedágio', n:1, f:function(r){ return fmtR(r.pedag); }},
      {l:'Custo total', n:1, f:function(r){ return fmtR(r.total); }},
      {l:'R$/km', n:1, f:function(r){ return r.custoKm ? fmtR(r.custoKm) : '—'; }}
    ], rows, {empty:'Cadastre os veículos em Cadastros › Veículos.'}), '', 'no período');
  return {html:html};
};

function hodometroCard(c){
  if(c.vs.length === 1){
    var v = c.vs[0], u = ultimaLeitura(v._id), pos = DB.posicoes[v._id];
    var quando = [u ? u.d : '', pos ? pos.dataHora : ''].sort().pop();
    return stat('Hodômetro atual', v.kmAtual ? fmtN(v.kmAtual) + '<span class="mono"> km</span>' : '—', '+' + fmtN(c.T.km) + ' km no período' + (quando ? ' · ' + fmtDH(quando) : ''));
  }
  return stat('KM rodados', fmtN(c.T.km), 'no período · hodômetro de cada veículo na tabela abaixo');
}

VIEWS.posicoes = function(){
  var pos = vals(DB.posicoes).sort(function(a, b){ return placaDe(a.veiculoId).localeCompare(placaDe(b.veiculoId)); });
  var lig = pos.filter(function(p){ return p.ignicao; }).length;
  var ult = pos.map(function(p){ return p.dataHora; }).sort().pop();
  var html = '<div class="stats three">' + stat('Veículos com posição', pos.length + '<span class="mono"> / ' + vals(DB.veiculos).length + '</span>') + stat('Ignição ligada', lig, 'em movimento ou parados ligados', 'teal') + stat('Última atualização', ult ? fmtDH(ult) : '—', 'pelo rastreador ou lançada manualmente') + '</div>' +
    mapaFrotaHtml() +
    panel('Posição atual da frota', table([
      {l:'Veículo', f:function(p){ var v = DB.veiculos[p.veiculoId] || {}; return esc(v.placa || '—') + '<span class="sub">' + esc(v.modelo || '') + '</span>'; }},
      {l:'Situação', f:function(p){ return p.ignicao ? pill('teal', 'Ignição ligada') : pill('gray', 'Desligado'); }},
      {l:'Velocidade', n:1, f:function(p){ return fmtN(p.velocidade) + ' km/h'; }},
      {l:'Local', f:function(p){ return esc(p.endereco || (fmtN(p.lat, 5) + ', ' + fmtN(p.lng, 5))); }},
      {l:'Atualizado', f:function(p){ return '<span class="mono">' + fmtDH(p.dataHora) + '</span>'; }},
      {l:'Fonte', f:function(p){ return p.fonte === 'Manual' || p.fonte === 'Planilha' ? pill('gray', p.fonte) : pill('blue', 'AgileSat'); }},
      {l:'', f:function(p){ return p.lat ? '<a class="lnk" target="_blank" rel="noopener" href="https://www.google.com/maps?q=' + num(p.lat) + ',' + num(p.lng) + '">Ver no mapa ↗</a>' : ''; }}
    ], pos, {empty:'Sem posições ainda. Elas chegam pela AgileSat ou podem ser lançadas aqui em “+ Posição / check-in”.', acts:function(p){ return acts('posicoes', p._id); }}));
  return {html:html, actions: newBtn('posicoes', 'Posição / check-in'), after:iniciarMapaFrota};
};

VIEWS.viagens = function(){
  var c = calc(), lim = num(cfg('limiteVel', 110)) || 110;
  var trips = c.vg.slice().sort(function(a, b){ return String(b.inicio).localeCompare(String(a.inicio)); });
  if(!selTrip || !trips.some(function(t){ return t._id === selTrip; })){ var w = trips.find(function(t){ return t.pontos && t.pontos.length; }) || trips[0]; selTrip = w ? w._id : null; }
  var t = trips.find(function(x){ return x._id === selTrip; });
  var kmT = c.vg.reduce(function(s, x){ return s + num(x.km); }, 0);
  var html = '<div class="stats five">' +
      stat('Viagens', c.T.viagens) + stat('KM em viagens', fmtN(kmT)) + stat('Média por viagem', c.T.viagens ? fmtN(kmT / c.T.viagens, 1) + ' km' : '—') +
      stat('Excessos de velocidade', c.vg.filter(function(x){ return num(x.velMax) > lim; }).length, 'acima de ' + lim + ' km/h', 'amber') +
      stat('Tempo parado ligado', fmtN(c.vg.reduce(function(s, x){ return s + num(x.paradoMin); }, 0) / 60, 1) + ' h') +
    '</div>' +
    panel('Trajeto' + (t ? ' — ' + esc(placaDe(t.veiculoId)) : ''), t ? mapaViagemHtml(t) : empty('Selecione uma viagem.'), '', t ? fmtDH(t.inicio) + ' → ' + fmtDH(t.fim) + ' · ' + fmtN(t.km, 1) + ' km' + (num(t.velMax) ? ' · máx. ' + fmtN(t.velMax) + ' km/h' : '') : '') +
    '<div class="compact" id="lista-viagens">' +
    panel('Viagens', table([
      {l:'Início', f:function(x){ return '<span class="mono nowrap">' + fmtDH(x.inicio) + '</span>'; }},
      {l:'Veículo', f:function(x){ return '<span class="nowrap">' + esc(placaDe(x.veiculoId)) + '</span>'; }},
      {l:'Destino', f:function(x){ return esc(x.destino || '—') + '<span class="sub">' + esc(x.motorista || '') + (x.fonte === 'Manual' ? ' · manual' : '') + '</span>'; }},
      {l:'KM', n:1, f:function(x){ return fmtN(x.km, 1); }},
      {l:'Vel. máx.', n:1, f:function(x){ if(!num(x.velMax)) return '—'; return '<span class="nowrap">' + (num(x.velMax) > lim ? pill('red', fmtN(x.velMax) + ' km/h') : fmtN(x.velMax) + ' km/h') + '</span>'; }}
    ], trips, {attr:function(x){ return 'data-trip="' + esc(x._id) + '" class="row-clickable' + (x._id === selTrip ? ' sel' : '') + '"'; }, acts:function(x){ return acts('viagens', x._id); }}), '', 'clique numa viagem para ver no mapa') + '</div>';
  return {html:html, actions: exportBtn('viagens') + newBtn('viagens', 'Viagem'), after:function(){ if(t) iniciarMapaViagem(t); }};
};

function routeSVG(t){
  var pts = (t.pontos || []).map(function(p){ return Array.isArray(p) ? p : [p.lat, p.lng, p.t]; }).filter(function(p){ return isFinite(p[0]) && isFinite(p[1]); });
  if(pts.length < 2){
    var pv = (t.postosVisitados || []).map(function(id){ var p = postoDe(id); return p ? p.nome : ''; }).filter(Boolean);
    return '<div class="info-grid" style="padding:18px">' +
      '<div><div class="lbl">Origem</div>' + esc(t.origem || '—') + '</div><div><div class="lbl">Destino</div>' + esc(t.destino || '—') + '</div>' +
      '<div><div class="lbl">Saída</div><span class="mono">' + fmtDH(t.inicio) + (t.kmInicial ? '<br>' + fmtN(t.kmInicial) + ' km' : '') + '</span></div>' +
      '<div><div class="lbl">Chegada</div><span class="mono">' + fmtDH(t.fim) + (t.kmFinal ? '<br>' + fmtN(t.kmFinal) + ' km' : '') + '</span></div>' +
      '<div style="grid-column:1/-1"><div class="lbl">Postos visitados</div>' + (pv.length ? esc(pv.join(', ')) : '—') + '</div>' +
      (t.obs ? '<div style="grid-column:1/-1"><div class="lbl">Observações</div>' + esc(t.obs) + '</div>' : '') +
      '</div><div class="map-foot">Viagem lançada manualmente, sem trajeto de GPS.' + (t.origem && t.destino ? ' <a target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&origin=' + encodeURIComponent(t.origem) + '&destination=' + encodeURIComponent(t.destino) + '">Ver rota no Google Maps ↗</a>' : '') + '</div>';
  }
  var la = pts.map(function(p){ return +p[0]; }), lo = pts.map(function(p){ return +p[1]; });
  var mnA = Math.min.apply(null, la), mxA = Math.max.apply(null, la), mnO = Math.min.apply(null, lo), mxO = Math.max.apply(null, lo);
  var near = vals(DB.postos).filter(function(p){ return p.lat !== '' && p.lat != null && +p.lat >= mnA - .05 && +p.lat <= mxA + .05 && +p.lng >= mnO - .05 && +p.lng <= mxO + .05; });
  near.forEach(function(p){ mnA = Math.min(mnA, +p.lat); mxA = Math.max(mxA, +p.lat); mnO = Math.min(mnO, +p.lng); mxO = Math.max(mxO, +p.lng); });
  var W = 600, H = 360, pd = 34, k = Math.cos((mnA + mxA) / 2 * Math.PI / 180);
  var dA = Math.max(mxA - mnA, .002), dO = Math.max((mxO - mnO) * k, .002);
  var sc = Math.min((W - 2*pd) / dO, (H - 2*pd) / dA), ox = (W - dO*sc) / 2, oy = (H - dA*sc) / 2;
  function X(o){ return (ox + (o - mnO) * k * sc).toFixed(1); } function Y(a){ return (oy + (mxA - a) * sc).toFixed(1); }
  var path = pts.map(function(p, i){ return (i ? 'L' : 'M') + X(+p[1]) + ' ' + Y(+p[0]); }).join(' ');
  var grid = ''; for(var i = 1; i < 6; i++) grid += '<line x1="'+(W*i/6)+'" y1="0" x2="'+(W*i/6)+'" y2="'+H+'" stroke="#1E2A44"/><line x1="0" y1="'+(H*i/6)+'" x2="'+W+'" y2="'+(H*i/6)+'" stroke="#1E2A44"/>';
  var pz = near.map(function(p){ var r = Math.max(5, num(p.raio || 200) / 111320 * sc); return '<circle cx="'+X(+p.lng)+'" cy="'+Y(+p.lat)+'" r="'+r.toFixed(1)+'" fill="#F2B84B" fill-opacity=".12" stroke="#F2B84B" stroke-dasharray="3 3"/><rect x="'+(X(+p.lng)-5)+'" y="'+(Y(+p.lat)-5)+'" width="10" height="10" rx="2" fill="#F2B84B"/><text x="'+(+X(+p.lng)+9)+'" y="'+(Y(+p.lat)-8)+'" font-size="11" fill="#EAF0FA" font-family="Inter,sans-serif">'+esc(p.nome)+'</text>'; }).join('');
  var a = pts[0], b = pts[pts.length-1];
  var step = Math.max(1, Math.floor(pts.length / 8));
  var wp = pts.slice(1, -1).filter(function(_, i){ return i % step === 0; }).slice(0, 8).map(function(p){ return p[0] + ',' + p[1]; }).join('|');
  var gm = 'https://www.google.com/maps/dir/?api=1&origin=' + a[0] + ',' + a[1] + '&destination=' + b[0] + ',' + b[1] + (wp ? '&waypoints=' + encodeURIComponent(wp) : '');
  return '<div style="padding:14px 18px 0"><svg class="map" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Trajeto da viagem">' + grid + pz +
    '<path d="'+path+'" fill="none" stroke="#0B1220" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>' +
    '<path d="'+path+'" fill="none" stroke="#2DD4BF" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>' +
    '<circle cx="'+X(+b[1])+'" cy="'+Y(+b[0])+'" r="7" fill="#F2596B" stroke="#0B1220" stroke-width="2"/>' +
    '<circle cx="'+X(+a[1])+'" cy="'+Y(+a[0])+'" r="11" fill="none" stroke="#2DD4BF" stroke-width="3"/></svg></div>' +
    '<div class="map-foot"><div class="legend" style="padding:0"><span><i class="c-teal" style="border-radius:50%"></i>Partida</span><span><i class="c-red" style="border-radius:50%"></i>Chegada</span><span><i class="c-amber"></i>Posto de trabalho (cerca)</span></div><a target="_blank" rel="noopener" href="'+gm+'">Abrir no Google Maps ↗</a></div>';
}

VIEWS.hodometro = function(){
  var c = calc();
  var rows = vals(DB.leituras).filter(function(l){ return vOk(l.veiculoId) && inP(l.data); }).sort(function(a, b){ return String(b.data).localeCompare(String(a.data)); });
  var vs = c.vs.slice().sort(function(a, b){ return String(a.placa).localeCompare(String(b.placa)); });
  var html = '<div class="perm-note" style="background:var(--teal-soft);color:var(--teal)">Sem rastreador, o KM rodado vem das leituras do hodômetro: abastecimentos, manutenções, viagens e as leituras lançadas aqui. Lance pelo menos uma leitura por semana de cada veículo.</div>' +
    panel('KM por veículo', table([
      {l:'Veículo', f:function(v){ return esc(v.placa) + '<span class="sub">' + esc(v.modelo || '') + '</span>'; }},
      {l:'Hodômetro atual', n:1, f:function(v){ return v.kmAtual ? fmtN(v.kmAtual) + ' km' : '—'; }},
      {l:'Última leitura', f:function(v){ var u = ultimaLeitura(v._id); if(!u) return pill('amber', 'nenhuma'); var d = -daysUntil(u.d); return '<span class="mono">' + fmtD(u.d) + '</span>' + (d > 15 ? ' ' + pill('amber', 'há ' + d + ' dias') : ''); }},
      {l:'KM no período (hodômetro)', n:1, f:function(v){ return fmtN((c.per[v._id] || {}).kmOdo); }},
      {l:'KM em viagens', n:1, f:function(v){ return fmtN((c.per[v._id] || {}).kmGps); }}
    ], vs, {empty:'Nenhum veículo cadastrado.', acts:function(v){ return can('lancar') ? '<button class="btn btn-sm" data-act="lancar-km" data-id="'+esc(v._id)+'">Lançar KM</button>' : ''; }})) +
    panel('Leituras de KM lançadas', table([
      {l:'Data', f:function(l){ return '<span class="mono">' + fmtD(l.data) + '</span>'; }},
      {l:'Veículo', f:function(l){ return esc(placaDe(l.veiculoId)); }},
      {l:'Hodômetro', n:1, f:function(l){ return fmtN(l.km) + ' km'; }},
      {l:'Quem leu', k:'motorista'}, {l:'Observações', k:'obs'}
    ], rows, {acts:function(l){ return acts('leituras', l._id); }}));
  return {html:html, actions: exportBtn('leituras') + newBtn('leituras', 'Leitura de KM')};
};

VIEWS.abastecimentos = function(){
  var c = calc();
  var rows = c.ab.slice().sort(function(a, b){ return String(b.data).localeCompare(String(a.data)); });
  var sv = rows.reduce(function(t, a){ return t + num(a.valor); }, 0), sl = rows.reduce(function(t, a){ return t + num(a.litros); }, 0);
  var html = '<div class="stats five">' +
      stat('Gasto com combustível', fmtR(sv), c.T.comb && Math.round(c.T.comb) !== Math.round(sv) ? fmtR(c.T.comb) + ' proporcional ao período' : '') + stat('Litros', fmtN(sl)) +
      stat('Preço médio', sl ? fmtR(sv / sl) + '/l' : '—') +
      stat('Consumo médio', c.T.consumo ? fmtN(c.T.consumo, 1) + ' km/l' : '—', 'KM do rastreador ÷ litros lançados', 'teal') + stat('Lançamentos', c.ab.length) +
    '</div>' +
    panel('Abastecimentos', table([
      {l:'Data', f:function(a){ return ehMensal(a) ? '<span class="mono">' + esc(new Date(toDate(a.data)).toLocaleDateString('pt-BR', {month:'short', year:'numeric'}).replace('.', '')) + '</span><span class="sub">mensal</span>' : '<span class="mono">' + fmtD(a.data) + '</span>'; }},
      {l:'Veículo', f:function(a){ return esc(placaDe(a.veiculoId)); }},
      {l:'Motorista', k:'motorista'}, {l:'Posto', k:'posto'}, {l:'Combustível', k:'combustivel'},
      {l:'Litros', n:1, f:function(a){ return fmtN(a.litros, 2); }},
      {l:'R$/l', n:1, f:function(a){ return num(a.litros) ? fmtR(num(a.valor) / num(a.litros)) : '—'; }},
      {l:'Total', n:1, f:function(a){ return fmtR(a.valor); }},
      {l:'Hodômetro', n:1, f:function(a){ return a.km ? fmtN(a.km) : '—'; }}
    ], rows, {acts:function(a){ return acts('abastecimentos', a._id); }}), '', 'lançamento mensal entra no mês inteiro; nos totais de períodos menores conta proporcional aos dias');
  return {html:html, actions: exportBtn('abastecimentos') + impBtn('abastecimentos') + newBtn('abastecimentos', 'Abastecimento')};
};

VIEWS.consumo = function(){
  var c = calc();
  var pr = cfg('precos', {}) || {}, edp = can('cadastros');
  var precosHtml = '<form id="precos-form" style="padding:14px 18px 18px"><div class="modal-grid">' + TIPOS_PRECO.map(function(t){ return '<div class="modal-field"><label>'+t+' (R$/l)</label><input name="'+esc(t)+'" type="number" step="0.01" value="'+esc(pr[t] || '')+'"'+(edp ? '' : ' disabled')+'></div>'; }).join('') + '</div>' +
    '<div class="hint" style="margin-top:8px">Ordem usada no cálculo: preço do litro no cadastro do veículo › último abastecimento lançado (90 dias) › estes preços. Carro flex usa o preço do combustível escolhido em “Abastece com”.</div>' +
    (edp ? '<div class="modal-actions" style="justify-content:flex-start"><button class="btn btn-primary" type="submit">Salvar preços</button></div>' : '') + '</form>';
  var per = Object.keys(c.per).map(function(k){ return c.per[k]; }).filter(function(p){ return p.litros > 0 || p.consumo; });
  var ms = months(6), g = {};
  vals(DB.abastecimentos).forEach(function(a){ if(vOk(a.veiculoId)){ var k = String(a.data).slice(0,7); g[k] = (g[k]||0) + num(a.valor); } });
  var max = Math.max.apply(null, per.map(function(p){ return Math.max(p.consumo || 0, num(p.v.metaConsumo)); }).concat([1]));
  var duo = per.length ? '<div class="bars">' + per.map(function(p){
    var ok = !p.consumo || !num(p.v.metaConsumo) || p.consumo >= num(p.v.metaConsumo) * 0.9;
    return '<div class="bar-row duo"><span class="bar-label">'+esc(p.v.placa)+'</span><div class="bar-pair"><div class="bar-track"><div class="bar-fill '+(ok ? '' : 'red')+'" style="width:'+((p.consumo||0)/max*100).toFixed(1)+'%"></div></div><div class="bar-track"><div class="bar-fill blue" style="width:'+(num(p.v.metaConsumo)/max*100).toFixed(1)+'%"></div></div></div><span class="bar-val">'+(p.consumo ? fmtN(p.consumo, 1) : '—')+' / '+fmtN(p.v.metaConsumo, 1)+'</span></div>';
  }).join('') + '</div>' : empty('Sem dados para o consumo real: lance o abastecimento mensal de cada veículo (ou 2 avulsos com hodômetro).');
  var html = '<div class="stats">' + stat('Combustível estimado', fmtR(c.T.combEst), fmtN(c.T.litrosEst) + ' litros · ' + fmtN(c.T.km) + ' km', 'teal') + stat('Lançado em abastecimentos', fmtR(c.T.comb), fmtN(c.T.litros) + ' litros') + stat('Diferença', c.T.comb ? fmtR(c.T.comb - c.T.combEst) : '—', 'lançado − estimado', c.T.comb && Math.abs(c.T.comb - c.T.combEst) > c.T.combEst * 0.15 ? 'amber' : '') + stat('Veículos sem consumo ou preço', c.T.semDados, '', c.T.semDados ? 'amber' : '') + '</div>' +
    panel('Preço do litro', precosHtml, '', 'usado para estimar o gasto com combustível') +
    '<div class="grid-2">' +
    panel('Consumo real × meta', '<div class="legend"><span><i class="c-teal"></i>Consumo real (km/l)</span><span><i class="c-blue"></i>Meta</span><span><i class="c-red"></i>Abaixo de 90% da meta</span></div>' + duo, '', 'KM rodados no mês ÷ litros lançados') +
    panel('Gasto mensal com combustível', colsChart(ms, [{l:'Combustível', cls:'c-teal', data:g}]), '', 'últimos 6 meses') +
    '</div>' +
    panel('Consumo por veículo', table([
      {l:'Veículo', f:function(p){ return esc(p.v.placa) + '<span class="sub">' + esc(p.v.modelo || '') + ' · ' + esc(p.v.combustivel || '') + '</span>'; }},
      {l:'KM (hodômetro)', n:1, f:function(p){ return fmtN(p.kmOdo); }},
      {l:'Litros', n:1, f:function(p){ return fmtN(p.litros, 1); }},
      {l:'Consumo', n:1, f:function(p){ return p.consumo ? fmtN(p.consumo, 2) + ' km/l' : '—'; }},
      {l:'Meta', n:1, f:function(p){ return p.v.metaConsumo ? fmtN(p.v.metaConsumo, 1) + ' km/l' : '—'; }},
      {l:'Situação', f:function(p){ if(!p.consumo || !num(p.v.metaConsumo)) return pill('gray', 'Sem dados'); var r = p.consumo / num(p.v.metaConsumo); return r >= 0.97 ? pill('teal', 'Dentro da meta') : r >= 0.9 ? pill('amber', 'Atenção') : pill('red', 'Abaixo da meta'); }},
      {l:'KM rodados', n:1, f:function(p){ return fmtN(p.km); }},
      {l:'Preço/l', n:1, f:function(p){ return p.preco ? fmtR(p.preco.valor) + '<span class="sub">' + esc(p.preco.fonte) + '</span>' : '—'; }},
      {l:'Estimado', n:1, f:function(p){ return p.combEst ? fmtR(p.combEst) : '—'; }},
      {l:'Lançado', n:1, f:function(p){ return fmtR(p.comb); }}
    ], Object.keys(c.per).map(function(k){ return c.per[k]; })));
  return {html:html, after:function(){
    var f = $('#precos-form'); if(!f || !can('cadastros')) return;
    f.addEventListener('submit', function(e){ e.preventDefault(); var o = {}; TIPOS_PRECO.forEach(function(t){ var v = num(f.elements[t].value); if(v) o[t] = v; });
      save({'config/precos': o}, 'Alterou os preços do combustível', Object.keys(o).map(function(k){ return k + ' ' + fmtR(o[k]); }).join(', ')).then(function(){ toast('Preços salvos.'); }); });
  }};
};

VIEWS.plano = function(){
  var A = alertas().filter(function(a){ return a.tipo === 'manut'; });
  var ag = vals(DB.manutencoes).filter(function(m){ return m.status === 'Agendada' && vOk(m.veiculoId); }).sort(function(a, b){ return String(a.data).localeCompare(String(b.data)); });
  var emMan = vals(DB.veiculos).filter(function(v){ return v.status === 'Em manutenção'; });
  var html = '<div class="stats">' +
      stat('Vencidas', A.filter(function(a){ return a.sev === 'red'; }).length, 'por km ou por data', 'red') +
      stat('Próximas', A.filter(function(a){ return a.sev === 'amber'; }).length, 'até 1.000 km ou 15 dias', 'amber') +
      stat('Agendadas', ag.length) + stat('Em manutenção agora', emMan.length, emMan.map(function(v){ return v.placa; }).join(', ')) +
    '</div><div class="grid-2">' +
    panel('Próximas e vencidas', alertList(A, 'Nenhuma revisão próxima.'), '', 'pelo plano de km e data de cada serviço') +
    panel('Agendadas', table([
      {l:'Data', f:function(m){ return '<span class="mono">' + fmtD(m.data) + '</span>'; }},
      {l:'Veículo', f:function(m){ return esc(placaDe(m.veiculoId)); }},
      {l:'Serviço', f:function(m){ return esc(m.servico) + '<span class="sub">' + esc(m.oficina || '') + '</span>'; }}
    ], ag, {empty:'Nenhuma manutenção agendada.', acts:function(m){ return acts('manutencoes', m._id); }})) +
    '</div>';
  return {html:html, actions: newBtn('manutencoes', 'Manutenção')};
};

VIEWS.manutencoes = function(){
  var c = calc();
  var rows = c.mn.slice().sort(function(a, b){ return String(b.data).localeCompare(String(a.data)); });
  var prev = c.mn.filter(function(m){ return m.tipo !== 'Corretiva'; }), corr = c.mn.filter(function(m){ return m.tipo === 'Corretiva'; });
  var sum = function(l){ return l.reduce(function(s, m){ return s + num(m.custo); }, 0); };
  var porV = Object.keys(c.per).map(function(k){ return {l:c.per[k].v.placa, v:c.per[k].manut}; }).filter(function(x){ return x.v > 0; }).sort(function(a, b){ return b.v - a.v; });
  var html = '<div class="stats">' + stat('Custo de manutenção', fmtR(c.T.manut)) + stat('Preventivas', prev.length, fmtR(sum(prev)), 'teal') + stat('Corretivas', corr.length, fmtR(sum(corr)), 'amber') + stat('Custo por km', c.T.km ? fmtR(c.T.manut / c.T.km) : '—') + '</div>' +
    '<div class="grid-3-1">' +
    panel('Manutenções realizadas', table([
      {l:'Data', f:function(m){ return '<span class="mono">' + fmtD(m.data) + '</span>'; }},
      {l:'Veículo', f:function(m){ return esc(placaDe(m.veiculoId)); }},
      {l:'Serviço', f:function(m){ return esc(m.servico) + '<span class="sub">' + esc(m.oficina || '') + '</span>'; }},
      {l:'Tipo', f:function(m){ return m.tipo === 'Corretiva' ? pill('amber', 'Corretiva') : pill('teal', 'Preventiva'); }},
      {l:'KM', n:1, f:function(m){ return m.km ? fmtN(m.km) : '—'; }},
      {l:'Custo', n:1, f:function(m){ return fmtR(m.custo); }},
      {l:'Próxima', f:function(m){ return '<span class="mono">' + ([m.proxKm ? fmtN(m.proxKm) + ' km' : '', m.proxData ? fmtD(m.proxData) : ''].filter(Boolean).join(' · ') || '—') + '</span>'; }}
    ], rows, {acts:function(m){ return acts('manutencoes', m._id); }})) +
    panel('Custo por veículo', bars(porV, fmtR, 'blue')) +
    '</div>';
  return {html:html, actions: exportBtn('manutencoes') + impBtn('manutencoes') + newBtn('manutencoes', 'Manutenção')};
};

VIEWS.pedagios = function(){
  var c = calc();
  var rows = c.pd.slice().sort(function(a, b){ return String(b.data).localeCompare(String(a.data)); });
  var pr = {}; c.pd.forEach(function(p){ var k = p.praca || '—'; pr[k] = pr[k] || {n:0, v:0, rod:p.rodovia}; pr[k].n++; pr[k].v += num(p.valor); });
  var top = Object.keys(pr).map(function(k){ return {l:k, v:pr[k].v, n:pr[k].n, rod:pr[k].rod}; }).sort(function(a, b){ return b.v - a.v; });
  var porV = Object.keys(c.per).map(function(k){ return {l:c.per[k].v.placa, v:c.per[k].pedag}; }).filter(function(x){ return x.v > 0; }).sort(function(a, b){ return b.v - a.v; });
  var html = '<div class="stats">' + stat('Gasto com pedágios', fmtR(c.T.pedag)) + stat('Passagens', c.pd.length) + stat('Média por passagem', c.pd.length ? fmtR(c.T.pedag / c.pd.length) : '—') + stat('Pedágio por km', c.T.km ? fmtR(c.T.pedag / c.T.km) : '—') + '</div>' +
    '<div class="grid-2">' + panel('Por veículo', bars(porV, fmtR, 'amber')) +
    panel('Praças mais usadas', table([{l:'Praça', f:function(x){ return esc(x.l) + '<span class="sub">' + esc(x.rod || '') + '</span>'; }}, {l:'Passagens', n:1, f:function(x){ return x.n; }}, {l:'Total', n:1, f:function(x){ return fmtR(x.v); }}], top, {limit:10})) + '</div>' +
    panel('Lançamentos', table([
      {l:'Data', f:function(p){ return '<span class="mono">' + fmtD(p.data) + '</span>'; }},
      {l:'Veículo', f:function(p){ return esc(placaDe(p.veiculoId)); }},
      {l:'Praça', k:'praca'}, {l:'Rodovia', k:'rodovia'}, {l:'Pagamento', k:'origem'},
      {l:'Valor', n:1, f:function(p){ return fmtR(p.valor); }}
    ], rows, {acts:function(p){ return acts('pedagios', p._id); }}), '', 'importe o extrato do Sem Parar / ConectCar / Veloe em Cadastros › Integração');
  return {html:html, actions: exportBtn('pedagios') + impBtn('pedagios') + newBtn('pedagios', 'Pedágio')};
};

VIEWS.visitas = function(){
  var ad = aderencia();
  var vis = vals(DB.visitas).filter(function(v){ return inP(v.chegada) && (!F.veic || v.veiculoId === F.veic); }).sort(function(a, b){ return String(b.chegada).localeCompare(String(a.chegada)); });
  var tv = ad.reduce(function(s, a){ return s + a.n; }, 0), te = ad.reduce(function(s, a){ return s + a.esperado; }, 0);
  var auto = vis.filter(function(v){ return /autom/i.test(v.fonte || ''); }).length;
  var html = '<div class="stats five">' +
      stat('Visitas realizadas', tv, auto + ' detectadas pelo rastreador') + stat('Esperadas', fmtN(te), 'pela frequência de cada posto') +
      stat('Aderência', te ? fmtN(Math.min(100, tv / te * 100)) + '%' : '—', '', te && tv / te < 0.8 ? 'amber' : 'teal') +
      stat('Postos', vals(DB.postos).length) + stat('Postos sem visita', ad.filter(function(a){ return a.n === 0; }).length, 'no período', 'red') +
    '</div>' +
    '<div class="perm-note" style="background:var(--teal-soft);color:var(--teal)">Detecção automática: o painel cruza o trajeto GPS de cada viagem com a cerca (raio) dos postos e registra chegada e saída.' + (can('lancar') ? ' <span class="spacer" style="flex:1"></span><button class="btn btn-sm" data-act="detectar">Detectar visitas pelas rotas</button>' : '') + '</div>' +
    panel('Aderência por posto', '<div class="legend"><span><i class="c-teal"></i>Realizadas</span><span><i class="c-blue"></i>Esperadas</span></div>' + (ad.length ? '<div class="bars">' + ad.map(function(a){
      var max = Math.max(a.n, a.esperado, 1);
      return '<div class="bar-row duo"><span class="bar-label" title="'+esc(a.p.nome)+'">'+esc(a.p.nome)+'</span><div class="bar-pair"><div class="bar-track"><div class="bar-fill '+(a.pct != null && a.pct < 50 ? 'red' : '')+'" style="width:'+(a.n/max*100).toFixed(1)+'%"></div></div><div class="bar-track"><div class="bar-fill blue" style="width:'+(a.esperado/max*100).toFixed(1)+'%"></div></div></div><span class="bar-val">'+a.n+' / '+fmtN(a.esperado)+'</span></div>';
    }).join('') + '</div>' : empty('Cadastre os postos de trabalho.'))) +
    panel('Registro de visitas', table([
      {l:'Chegada', f:function(v){ return '<span class="mono">' + fmtDH(v.chegada) + '</span>'; }},
      {l:'Saída', f:function(v){ return '<span class="mono">' + fmtDH(v.saida) + '</span>'; }},
      {l:'Posto', f:function(v){ var p = postoDe(v.postoId); return esc(p ? p.nome : '—') + (p && p.cliente ? '<span class="sub">' + esc(p.cliente) + '</span>' : ''); }},
      {l:'Veículo', f:function(v){ return esc(placaDe(v.veiculoId)); }},
      {l:'Responsável', k:'motorista'},
      {l:'Permanência', n:1, f:function(v){ var a = toDate(v.chegada), b = toDate(v.saida); return a && b ? fmtN((b - a) / 6e4) + ' min' : '—'; }},
      {l:'Fonte', f:function(v){ return /autom/i.test(v.fonte || '') ? pill('teal', 'Rastreador') : pill('gray', 'Manual'); }}
    ], vis, {acts:function(v){ return acts('visitas', v._id); }}));
  return {html:html, actions: exportBtn('visitas') + newBtn('visitas', 'Visita manual')};
};

VIEWS.postos = function(){
  var ad = aderencia();
  var html = panel('Postos de trabalho', table([
      {l:'Posto', f:function(a){ return esc(a.p.nome) + '<span class="sub">' + esc(a.p.cliente || '') + '</span>'; }},
      {l:'Endereço', f:function(a){ return esc(a.p.endereco || '') + '<span class="sub mono">' + (a.p.lat ? fmtN(a.p.lat, 5) + ', ' + fmtN(a.p.lng, 5) + ' · raio ' + fmtN(a.p.raio || 200) + ' m' : 'sem coordenadas') + '</span>'; }},
      {l:'Freq./semana', n:1, f:function(a){ return fmtN(a.p.freqSemana, 1); }},
      {l:'Visitas no período', n:1, f:function(a){ return a.n + ' / ' + fmtN(a.esperado); }},
      {l:'Aderência', f:function(a){ return a.pct == null ? '—' : a.pct >= 80 ? pill('teal', fmtN(a.pct) + '%') : a.pct >= 50 ? pill('amber', fmtN(a.pct) + '%') : pill('red', fmtN(a.pct) + '%'); }},
      {l:'Perm. média', n:1, f:function(a){ return a.perm != null ? fmtN(a.perm) + ' min' : '—'; }},
      {l:'Última visita', f:function(a){ return '<span class="mono">' + (a.ult ? fmtD(a.ult) : 'nunca') + '</span>'; }}
    ], ad, {empty:'Cadastre os postos com latitude, longitude e raio para a detecção automática.', acts:function(a){ return acts('postos', a.p._id); }}));
  return {html:html, actions: exportBtn('postos') + newBtn('postos', 'Posto')};
};

VIEWS.relatorios = function(){
  var c = calc();
  var rows = Object.keys(c.per).map(function(k){ return c.per[k]; }).sort(function(a, b){ return b.total - a.total; });
  var ms = months(6), cb = {}, mt = {}, pg = {};
  ms.forEach(function(m){ cb[m.k] = c.vs.reduce(function(t, v){ var e = combEstimadoMes(v._id, m.k); if(!e) e = vals(DB.abastecimentos).filter(function(a){ return a.veiculoId === v._id && String(a.data).slice(0,7) === m.k; }).reduce(function(x, a){ return x + num(a.valor); }, 0); return t + e; }, 0); });
  vals(DB.manutencoes).forEach(function(a){ if(a.status !== 'Agendada' && vOk(a.veiculoId)){ var k = String(a.data).slice(0,7); mt[k] = (mt[k]||0) + num(a.custo); } });
  vals(DB.pedagios).forEach(function(a){ if(vOk(a.veiculoId)){ var k = String(a.data).slice(0,7); pg[k] = (pg[k]||0) + num(a.valor); } });
  var mrows = ms.map(function(m){ var y = +m.k.slice(0, 4), mm = +m.k.slice(5, 7), a = new Date(y, mm - 1, 1), z = new Date(y, mm, 0, 23, 59, 59);
    return {l:m.l, km:c.vs.reduce(function(t, v){ return t + kmNoIntervalo(v._id, a, z); }, 0), c:cb[m.k]||0, m:mt[m.k]||0, p:pg[m.k]||0}; });
  var hod = c.vs.reduce(function(t, v){ return t + num(v.kmAtual); }, 0);
  var html = '<div class="stats five">' + stat('KM rodados no período', fmtN(c.T.km) + '<span class="mono"> km</span>', c.vs.length === 1 ? 'hodômetro atual: ' + fmtN(hod) + ' km' : c.vs.length + ' veículos') + stat('Custo total', fmtR(c.T.total), c.T.km ? fmtR(c.T.total / c.T.km) + ' por km' : '') + stat('Combustível (estimado)', fmtR(c.T.combUsado), c.T.total ? fmtN(c.T.combUsado / c.T.total * 100) + '% do total' : '') + stat('Manutenção', fmtR(c.T.manut), c.T.total ? fmtN(c.T.manut / c.T.total * 100) + '% do total' : '') + stat('Pedágios', fmtR(c.T.pedag), c.T.total ? fmtN(c.T.pedag / c.T.total * 100) + '% do total' : '') + '</div>' +
    panel('Custo por veículo', table([
      {l:'Veículo', f:function(r){ return esc(r.v.placa) + '<span class="sub">' + esc(r.v.modelo || '') + '</span>'; }},
      {l:'KM no período', n:1, f:function(r){ return fmtN(r.km); }},
      {l:'Hodômetro atual', n:1, f:function(r){ return r.v.kmAtual ? fmtN(r.v.kmAtual) : '—'; }},
      {l:'Litros (estim.)', n:1, f:function(r){ return fmtN(r.litrosEst); }},
      {l:'Combustível', n:1, f:function(r){ return fmtR(r.combUsado); }},
      {l:'Lançado', n:1, f:function(r){ return fmtR(r.comb); }},
      {l:'Manutenção', n:1, f:function(r){ return fmtR(r.manut); }},
      {l:'Pedágio', n:1, f:function(r){ return fmtR(r.pedag); }},
      {l:'Total', n:1, f:function(r){ return fmtR(r.total); }},
      {l:'R$/km', n:1, f:function(r){ return r.custoKm ? fmtR(r.custoKm) : '—'; }}
    ], rows), '', 'no período') +
    panel('Custo por mês', table([
      {l:'Mês', f:function(r){ return esc(r.l); }},
      {l:'KM rodados', n:1, f:function(r){ return fmtN(r.km); }},
      {l:'Combustível', n:1, f:function(r){ return fmtR(r.c); }},
      {l:'Manutenção', n:1, f:function(r){ return fmtR(r.m); }},
      {l:'Pedágio', n:1, f:function(r){ return fmtR(r.p); }},
      {l:'Total', n:1, f:function(r){ return fmtR(r.c + r.m + r.p); }}
    ], mrows), '', 'últimos 6 meses');
  return {html:html, actions: '<button class="btn" data-act="pdf">Gerar PDF</button>' + exportBtn('custos')};
};

VIEWS.veiculos = function(){
  var vs = vals(DB.veiculos).sort(function(a, b){ return String(a.placa).localeCompare(String(b.placa)); });
  var html = panel('Veículos', table([
      {l:'Placa', f:function(v){ return esc(v.placa) + '<span class="sub">' + esc(v.modelo || '') + (v.ano ? ' · ' + esc(v.ano) : '') + '</span>'; }},
      {l:'Tipo', k:'tipo'}, {l:'Combustível', k:'combustivel'},
      {l:'Hodômetro', n:1, f:function(v){ return v.kmAtual ? fmtN(v.kmAtual) + ' km' : '—'; }},
      {l:'Meta', n:1, f:function(v){ return v.metaConsumo ? fmtN(v.metaConsumo, 1) + ' km/l' : '—'; }},
      {l:'Motorista', k:'motorista'},
      {l:'ID AgileSat', f:function(v){ return v.rastreadorId ? '<code>' + esc(v.rastreadorId) + '</code>' : '<span class="mono">—</span>'; }},
      {l:'Licenciamento', f:function(v){ return docPill(v.vencLicenciamento); }},
      {l:'Seguro', f:function(v){ return docPill(v.vencSeguro); }},
      {l:'Status', f:function(v){ return v.status === 'Em manutenção' ? pill('amber', 'Em manutenção') : v.status === 'Parado' ? pill('gray', 'Parado') : pill('teal', 'Ativo'); }}
    ], vs, {empty:'Nenhum veículo cadastrado.', acts:function(v){ return (can('lancar') ? '<button class="btn btn-sm" data-act="lancar-km" data-id="'+esc(v._id)+'">Lançar KM</button> ' : '') + acts('veiculos', v._id); }}), '', 'o ID no AgileSat é opcional: liga o veículo ao rastreador');
  return {html:html, actions: exportBtn('veiculos') + (can('cadastros') ? '<button class="btn" data-act="importar" data-col="veiculos">Importar Excel</button>' : '') + newBtn('veiculos', 'Veículo')};
};

VIEWS.motoristas = function(){
  var ms = vals(DB.motoristas).sort(function(a, b){ return String(a.nome).localeCompare(String(b.nome), 'pt-BR'); });
  var html = panel('Motoristas', table([
      {l:'Nome', k:'nome'}, {l:'CNH', k:'cnhCategoria'},
      {l:'Vencimento da CNH', f:function(m){ return docPill(m.vencCnh); }},
      {l:'Telefone', k:'telefone'}
    ], ms, {empty:'Nenhum motorista cadastrado.', acts:function(m){ return acts('motoristas', m._id); }}));
  return {html:html, actions: exportBtn('motoristas') + newBtn('motoristas', 'Motorista')};
};

// =====================================================================
// RELATÓRIO EM PDF (abre a versão para impressão; o navegador salva em PDF)
// =====================================================================
function textoPeriodo(){
  var r = range(), sel = $('#f-period'), nome = sel ? sel.options[sel.selectedIndex].text.replace('…', '') : '';
  var d = function(x){ return x.toLocaleDateString('pt-BR'); };
  if(F.period === 'tudo') return 'Todo o período';
  return nome + ' — ' + (d(r[0]) === d(r[1]) ? d(r[0]) : d(r[0]) + ' a ' + d(r[1]));
}
function gerarPDF(){
  var w = window.open('', '_blank');
  if(!w){ toast('O navegador bloqueou a janela do relatório. Libere pop-ups para este site.', 'err'); return; }
  var c = calc(), rows = Object.keys(c.per).map(function(k){ return c.per[k]; }).sort(function(a, b){ return String(a.v.placa).localeCompare(String(b.v.placa)); });
  var r = range(), veic = F.veic && DB.veiculos[F.veic] ? DB.veiculos[F.veic].placa + ' · ' + (DB.veiculos[F.veic].modelo || '') : 'Todos os veículos';
  var tb = function(cols, data, tot){
    return '<table><thead><tr>' + cols.map(function(x){ return '<th' + (x.n ? ' class="n"' : '') + '>' + x.l + '</th>'; }).join('') + '</tr></thead><tbody>' +
      (data.length ? data.map(function(d){ return '<tr>' + cols.map(function(x){ return '<td' + (x.n ? ' class="n"' : '') + '>' + x.f(d) + '</td>'; }).join('') + '</tr>'; }).join('') : '<tr><td colspan="' + cols.length + '" class="vazio">Sem registros no período.</td></tr>') +
      '</tbody>' + (tot ? '<tfoot><tr>' + cols.map(function(x, i){ return '<td' + (x.n ? ' class="n"' : '') + '>' + (x.t ? x.t() : i === 0 ? 'Total' : '') + '</td>'; }).join('') + '</tr></tfoot>' : '') + '</table>';
  };
  var soma = function(k){ return rows.reduce(function(t, x){ return t + num(x[k]); }, 0); };
  var html = '<h2>Resumo por veículo</h2>' + tb([
      {l:'Veículo', f:function(x){ return '<b>' + esc(x.v.placa) + '</b><br><span class="sub">' + esc(x.v.modelo || '') + '</span>'; }},
      {l:'KM no período', n:1, f:function(x){ return fmtN(x.km); }, t:function(){ return fmtN(c.T.km); }},
      {l:'Hodômetro atual', n:1, f:function(x){ return x.v.kmAtual ? fmtN(x.v.kmAtual) + ' km' : '—'; }},
      {l:'Viagens', n:1, f:function(x){ return fmtN(x.viagens); }, t:function(){ return fmtN(soma('viagens')); }},
      {l:'Combustível', n:1, f:function(x){ return fmtR(x.combUsado); }, t:function(){ return fmtR(c.T.combUsado); }},
      {l:'Manutenção', n:1, f:function(x){ return fmtR(x.manut); }, t:function(){ return fmtR(c.T.manut); }},
      {l:'Pedágio', n:1, f:function(x){ return fmtR(x.pedag); }, t:function(){ return fmtR(c.T.pedag); }},
      {l:'Total', n:1, f:function(x){ return '<b>' + fmtR(x.total) + '</b>'; }, t:function(){ return fmtR(c.T.total); }},
      {l:'R$/km', n:1, f:function(x){ return x.custoKm ? fmtR(x.custoKm) : '—'; }, t:function(){ return c.T.km ? fmtR(c.T.total / c.T.km) : '—'; }}
    ], rows, true);
  var dentro = function(col, campo){ return vals(DB[col]).filter(function(x){ return vOk(x.veiculoId) && inP(x[campo]); }).sort(function(a, b){ return String(a[campo]) < String(b[campo]) ? -1 : 1; }); };
  var ab = dentro('abastecimentos', 'data'), mn = dentro('manutencoes', 'data').filter(function(m){ return m.status !== 'Agendada'; }), pd = dentro('pedagios', 'data');
  var vis = dentro('visitas', 'chegada');
  if(ab.length) html += '<h2>Abastecimentos</h2>' + tb([{l:'Data', f:function(x){ return fmtD(x.data); }}, {l:'Veículo', f:function(x){ return esc(placaDe(x.veiculoId)); }}, {l:'Posto', f:function(x){ return esc(x.posto || ''); }}, {l:'Litros', n:1, f:function(x){ return fmtN(x.litros, 1); }}, {l:'KM', n:1, f:function(x){ return x.km ? fmtN(x.km) : '—'; }}, {l:'Valor', n:1, f:function(x){ return fmtR(x.valor); }, t:function(){ return fmtR(ab.reduce(function(t, x){ return t + num(x.valor); }, 0)); }}], ab, true);
  if(mn.length) html += '<h2>Manutenções</h2>' + tb([{l:'Data', f:function(x){ return fmtD(x.data); }}, {l:'Veículo', f:function(x){ return esc(placaDe(x.veiculoId)); }}, {l:'Serviço', f:function(x){ return esc(x.servico || ''); }}, {l:'Oficina', f:function(x){ return esc(x.oficina || ''); }}, {l:'KM', n:1, f:function(x){ return x.km ? fmtN(x.km) : '—'; }}, {l:'Custo', n:1, f:function(x){ return fmtR(x.custo); }, t:function(){ return fmtR(mn.reduce(function(t, x){ return t + num(x.custo); }, 0)); }}], mn, true);
  if(pd.length) html += '<h2>Pedágios</h2>' + tb([{l:'Data', f:function(x){ return fmtD(x.data); }}, {l:'Veículo', f:function(x){ return esc(placaDe(x.veiculoId)); }}, {l:'Praça', f:function(x){ return esc(x.praca || x.local || ''); }}, {l:'Valor', n:1, f:function(x){ return fmtR(x.valor); }, t:function(){ return fmtR(pd.reduce(function(t, x){ return t + num(x.valor); }, 0)); }}], pd, true);
  if(vis.length) html += '<h2>Visitas a postos</h2>' + tb([{l:'Chegada', f:function(x){ return fmtDH(x.chegada); }}, {l:'Veículo', f:function(x){ return esc(placaDe(x.veiculoId)); }}, {l:'Posto', f:function(x){ var p = postoDe(x.postoId); return esc(p ? p.nome : '—'); }}, {l:'Motorista', f:function(x){ return esc(x.motorista || ''); }}, {l:'Tempo', n:1, f:function(x){ var a = toDate(x.chegada), b = toDate(x.saida); return a && b && b > a ? fmtN((b - a) / 6e4) + ' min' : '—'; }}], vis, false);
  var card = function(l, v, s){ return '<div class="card"><div class="l">' + l + '</div><div class="v">' + v + '</div>' + (s ? '<div class="s">' + s + '</div>' : '') + '</div>'; };
  var hod = c.vs.length === 1 ? 'hodômetro atual ' + fmtN(c.vs[0].kmAtual) + ' km' : c.vs.length + ' veículos';
  var titulo = 'Relatório de frota ' + iso(r[0]) + (iso(r[0]) !== iso(r[1]) ? ' a ' + iso(r[1]) : '') + (F.veic && DB.veiculos[F.veic] ? ' ' + DB.veiculos[F.veic].placa : '');
  var css = '@page{size:A4;margin:12mm}*{box-sizing:border-box}body{font:12px/1.45 Inter,Arial,sans-serif;color:#0B1220;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
    '.top{background:#0B1220;color:#EAF0FA;padding:16px 20px;border-radius:8px;display:flex;justify-content:space-between;align-items:center}.top img{height:44px}.top h1{margin:0;font:600 18px "Space Grotesk",Arial}.top .m{font-size:11px;color:#9FB0CC;text-align:right}' +
    '.cards{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:14px 0}.card{border:1px solid #D6DEEA;border-radius:8px;padding:10px}.card .l{font-size:9px;letter-spacing:.06em;text-transform:uppercase;color:#5B6B85}.card .v{font:600 16px "Space Grotesk",Arial;margin-top:4px}.card .s{font-size:10px;color:#5B6B85}' +
    'h2{font:600 13px "Space Grotesk",Arial;margin:18px 0 6px;padding-left:8px;border-left:3px solid #2DD4BF}table{width:100%;border-collapse:collapse;page-break-inside:auto}tr{page-break-inside:avoid}th{font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#5B6B85;text-align:left;border-bottom:1.5px solid #0B1220;padding:6px}td{padding:6px;border-bottom:1px solid #E4E9F1}.n{text-align:right;white-space:nowrap}.sub{color:#5B6B85;font-size:10px}tfoot td{font-weight:700;border-top:1.5px solid #0B1220;border-bottom:0}.vazio{text-align:center;color:#5B6B85}' +
    '.rod{margin-top:18px;font-size:10px;color:#5B6B85;display:flex;justify-content:space-between}.bar{position:fixed;top:10px;right:10px}.bar button{font:600 13px Arial;padding:8px 14px;border-radius:6px;border:0;background:#2DD4BF;cursor:pointer}@media print{.bar{display:none}}';
  w.document.open();
  w.document.write('<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>' + esc(titulo) + '</title><style>' + css + '</style></head><body>' +
    '<div class="bar"><button onclick="window.print()">Salvar em PDF / Imprimir</button></div>' +
    '<div class="top"><img src="' + $('.brand-logo-img').src + '" alt=""><div><h1>Relatório de frota</h1></div><div class="m">' + esc(textoPeriodo()) + '<br>' + esc(veic) + '</div></div>' +
    '<div class="cards">' + card('KM rodados', fmtN(c.T.km) + ' km', hod) + card('Custo total', fmtR(c.T.total), c.T.km ? fmtR(c.T.total / c.T.km) + ' por km' : '') + card('Combustível', fmtR(c.T.combUsado), fmtN(c.T.litrosEst) + ' L estimados') + card('Manutenção', fmtR(c.T.manut), '') + card('Pedágios', fmtR(c.T.pedag), '') + '</div>' +
    html + '<div class="rod"><span>Painel de Frota · Grupo Login Serv</span><span>Gerado em ' + new Date().toLocaleString('pt-BR') + ' por ' + esc(currentUser ? currentUser.name : '') + '</span></div>' +
    '<script>window.onload=function(){setTimeout(function(){window.print()},400)}<\/script></body></html>');
  w.document.close();
}
