// =====================================================================
// MAPAS (Leaflet): ruas com nome, satélite e tela cheia
// =====================================================================
var MAPA = null, ENDERECOS = {};

function camadasBase(){
  var ruas = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom:19, attribution:'&copy; OpenStreetMap'});
  var sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom:19, attribution:'Imagens &copy; Esri'});
  var nomes = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', {maxZoom:19});
  var lugares = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {maxZoom:19});
  return {'Mapa (ruas)': ruas, 'Satélite': sat, 'Satélite com ruas': L.layerGroup([L.tileLayer(sat._url, sat.options), nomes, lugares])};
}

function novoMapa(id){
  if(MAPA){ try{ MAPA.remove(); }catch(e){} MAPA = null; }
  var el = document.getElementById(id); if(!el || typeof L === 'undefined') return null;
  var base = camadasBase(), pref = 'Mapa (ruas)';
  try{ pref = localStorage.getItem('painelfrota_mapa') || pref; }catch(e){}
  MAPA = L.map(el, {zoomControl:true, scrollWheelZoom:true});
  (base[pref] || base['Mapa (ruas)']).addTo(MAPA);
  L.control.layers(base, null, {position:'topright'}).addTo(MAPA);
  L.control.scale({imperial:false}).addTo(MAPA);
  MAPA.on('baselayerchange', function(e){ try{ localStorage.setItem('painelfrota_mapa', e.name); }catch(x){} });
  return MAPA;
}

// nome da rua (OpenStreetMap / Nominatim), sob demanda e guardado em memória
function enderecoDe(lat, lng, cb){
  var k = (+lat).toFixed(4) + ',' + (+lng).toFixed(4);
  if(ENDERECOS[k]){ cb(ENDERECOS[k]); return; }
  fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&accept-language=pt-BR&lat=' + lat + '&lon=' + lng)
    .then(function(r){ return r.json(); }).then(function(j){
      var a = j.address || {};
      var rua = [a.road || a.pedestrian || a.footway || '', a.house_number || ''].filter(Boolean).join(', ');
      var txt = [rua, a.suburb || a.neighbourhood || '', a.city || a.town || a.village || ''].filter(Boolean).join(' · ') || j.display_name || '';
      ENDERECOS[k] = txt; cb(txt);
    }).catch(function(){ cb(''); });
}

function botaoTelaCheia(wrapId){
  return '<button class="btn btn-sm map-full-btn" type="button" onclick="telaCheiaMapa(\'' + wrapId + '\')">⛶ Tela cheia</button>';
}
function telaCheiaMapa(wrapId){
  var w = document.getElementById(wrapId); if(!w) return;
  w.classList.toggle('map-full');
  var b = w.querySelector('.map-full-btn'); if(b) b.textContent = w.classList.contains('map-full') ? '✕ Fechar' : '⛶ Tela cheia';
  setTimeout(function(){ if(MAPA) MAPA.invalidateSize(); }, 60);
}
document.addEventListener('keydown', function(e){ if(e.key === 'Escape'){ var w = document.querySelector('.map-full'); if(w) telaCheiaMapa(w.id); } });

function pinIcon(cor, txt){
  return L.divIcon({className:'pin', html:'<div class="pin-dot" style="background:' + cor + '">' + (txt || '') + '</div>', iconSize:[26, 26], iconAnchor:[13, 13]});
}

// ----- mapa do trajeto
function mapaViagemHtml(t){
  var pts = (t.pontos || []).filter(function(p){ return isFinite(p[0]) && isFinite(p[1]); });
  if(pts.length < 2 || typeof L === 'undefined') return routeSVG(t);
  return '<div class="map-wrap" id="mv-wrap">' + botaoTelaCheia('mv-wrap') + '<div id="mapa-viagem" class="map-big"></div></div>' +
    '<div class="map-foot"><div id="mv-end" style="display:flex;gap:18px;flex-wrap:wrap"><span><b style="color:var(--teal)">Partida:</b> <span id="mv-ini">…</span></span><span><b style="color:var(--red)">Chegada:</b> <span id="mv-fim">…</span></span></div>' +
    '<div class="legend" style="padding:0"><span><i class="c-teal" style="border-radius:50%"></i>Partida</span><span><i class="c-red" style="border-radius:50%"></i>Chegada</span><span><i style="background:#6EA8FF;border-radius:50%"></i>Ponto de GPS (clique para ver hora e rua)</span><span><i class="c-amber"></i>Posto (cerca)</span></div></div>';
}
function iniciarMapaViagem(t){
  var pts = (t.pontos || []).filter(function(p){ return isFinite(p[0]) && isFinite(p[1]); });
  if(pts.length < 2) return;
  var m = novoMapa('mapa-viagem'); if(!m) return;
  var ll = pts.map(function(p){ return [+p[0], +p[1]]; });
  L.polyline(ll, {color:'#0B1220', weight:9, opacity:.55}).addTo(m);
  var linha = L.polyline(ll, {color:'#2DD4BF', weight:5, opacity:.95}).addTo(m);
  pts.forEach(function(p, i){
    if(i === 0 || i === pts.length - 1) return;
    var c = L.circleMarker([+p[0], +p[1]], {radius:4, color:'#0B1220', weight:1, fillColor:'#6EA8FF', fillOpacity:1}).addTo(m);
    c.bindPopup('<b>' + fmtDH(p[2]) + '</b><br><span class="pop-end">buscando rua…</span>');
    c.on('popupopen', function(e){ enderecoDe(p[0], p[1], function(txt){ var el = e.popup.getElement().querySelector('.pop-end'); if(el) el.textContent = txt || 'endereço indisponível'; }); });
  });
  var a = pts[0], b = pts[pts.length - 1];
  L.marker([+a[0], +a[1]], {icon:pinIcon('#2DD4BF', 'P')}).addTo(m).bindPopup('<b>Partida</b><br>' + fmtDH(a[2]));
  L.marker([+b[0], +b[1]], {icon:pinIcon('#F2596B', 'C')}).addTo(m).bindPopup('<b>Chegada</b><br>' + fmtDH(b[2]));
  var bounds = linha.getBounds(), perto = bounds.pad(0.25);
  var visitados = {};
  vals(DB.visitas).forEach(function(v){ if(v.veiculoId === t.veiculoId && v.chegada >= String(t.inicio).slice(0, 16) && v.chegada <= String(t.fim || t.inicio).slice(0, 16)) visitados[v.postoId] = 1; });
  (t.postosVisitados || []).forEach(function(id){ visitados[id] = 1; });
  vals(DB.postos).forEach(function(p){
    if(p.lat === '' || p.lat == null || !perto.contains([+p.lat, +p.lng])) return;
    var vis = visitados[p._id];
    L.circle([+p.lat, +p.lng], {radius:num(p.raio) || 200, color:'#F2B84B', weight:vis ? 3 : 1.5, dashArray:vis ? null : '4 4', fillColor:'#F2B84B', fillOpacity:vis ? .22 : .08}).addTo(m)
      .bindTooltip(esc(p.nome) + (vis ? ' — visitado' : ''), {permanent:!!vis, direction:'top', className:'tt-posto'});
  });
  m.fitBounds(bounds, {padding:[30, 30]});
  enderecoDe(a[0], a[1], function(txt){ var el = $('#mv-ini'); if(el) el.textContent = fmtDH(a[2]) + (txt ? ' — ' + txt : ''); });
  setTimeout(function(){ enderecoDe(b[0], b[1], function(txt){ var el = $('#mv-fim'); if(el) el.textContent = fmtDH(b[2]) + (txt ? ' — ' + txt : ''); }); }, 1100);
}

// ----- mapa da posição atual da frota
function mapaFrotaHtml(){
  if(typeof L === 'undefined') return '';
  return panel('Mapa da frota', '<div class="map-wrap" id="mf-wrap">' + botaoTelaCheia('mf-wrap') + '<div id="mapa-frota" class="map-big"></div></div>', '', 'verde: ignição ligada · cinza: desligado');
}
function iniciarMapaFrota(){
  var pos = vals(DB.posicoes).filter(function(p){ return p.lat && p.lng && (!F.veic || p.veiculoId === F.veic); });
  var m = novoMapa('mapa-frota'); if(!m) return;
  if(!pos.length){ m.setView([-22.22, -49.95], 12); return; }
  var g = [];
  pos.forEach(function(p){
    var v = DB.veiculos[p.veiculoId] || {};
    var mk = L.marker([+p.lat, +p.lng], {icon:pinIcon(p.ignicao ? '#2DD4BF' : '#8A97B0', '')}).addTo(m);
    mk.bindTooltip(esc(v.placa || ''), {permanent:true, direction:'right', offset:[12, 0], className:'tt-placa'});
    mk.bindPopup('<b>' + esc(v.placa || '') + '</b> ' + esc(v.modelo || '') + '<br>' + (p.ignicao ? 'Ignição ligada · ' : 'Desligado · ') + fmtN(p.velocidade) + ' km/h<br>' + fmtDH(p.dataHora) + '<br><span class="pop-end">buscando rua…</span>');
    mk.on('popupopen', function(e){ enderecoDe(p.lat, p.lng, function(txt){ var el = e.popup.getElement().querySelector('.pop-end'); if(el) el.textContent = txt || p.endereco || ''; }); });
    g.push([+p.lat, +p.lng]);
  });
  if(g.length === 1) m.setView(g[0], 15); else m.fitBounds(L.latLngBounds(g).pad(0.2));
}
