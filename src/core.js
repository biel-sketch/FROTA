// =====================================================================
// PAINEL FROTA — Grupo Login Serv
// Single-file no mesmo padrão dos painéis RH/DP/Estoque: Firebase Auth + Realtime Database.
// =====================================================================

// ---------------------------------------------------------------------
// 1) CONFIGURAÇÃO DO FIREBASE
// Cole aqui a configuração do projeto (Console Firebase > Configurações do projeto > Seus apps > Web).
// Enquanto apiKey estiver como "COLE_AQUI", o painel roda em MODO DEMONSTRAÇÃO (dados só no navegador).
// ---------------------------------------------------------------------
var firebaseConfig = {
  apiKey: "AIzaSyB6JFpPmPo3PWeN0lZSbDCGOS0LBmQ6YIg",
  authDomain: "frota-f2697.firebaseapp.com",
  databaseURL: "https://frota-f2697-default-rtdb.firebaseio.com",
  projectId: "frota-f2697",
  storageBucket: "frota-f2697.firebasestorage.app",
  messagingSenderId: "1002372831843",
  appId: "1:1002372831843:web:3ae19d8aa10ca9aeff3656"
};
var DB_ROOT = 'painel-frota';

// ---------------------------------------------------------------------
// 2) PERFIS E USUÁRIOS
// O usuário digita o nome; o sistema troca pelo e-mail cadastrado no Firebase Authentication.
// As senhas NÃO ficam aqui — são validadas pelo Firebase.
// ---------------------------------------------------------------------
var rolePermissions = {
  administrador: {label:'Administrador',   initials:'AD', lancar:true,  manutencao:true,  cadastros:true,  excluir:true,  admin:true},
  gestor:        {label:'Gestor de frota', initials:'GF', lancar:true,  manutencao:true,  cadastros:true,  excluir:true,  admin:false},
  operador:      {label:'Operador',        initials:'OP', lancar:true,  manutencao:false, cadastros:false, excluir:false, admin:false},
  consulta:      {label:'Consulta',        initials:'CO', lancar:false, manutencao:false, cadastros:false, excluir:false, admin:false}
};
var USER_ROLES = [
  {user:'gabriel', email:'gabriel@loginserv.com.br', name:'Gabriel', role:'administrador'},
  {user:'carol',   email:'carol@loginserv.com.br',   name:'Carol',   role:'administrador'}
];

// =====================================================================
// HELPERS
// =====================================================================
var FB_ON = !!(firebaseConfig.apiKey && firebaseConfig.apiKey !== 'COLE_AQUI' && firebaseConfig.databaseURL);
var FB_FALHOU = false;
if(FB_ON && typeof firebase === 'undefined'){ FB_ON = false; FB_FALHOU = true; }
var COLS = ['veiculos','motoristas','abastecimentos','manutencoes','pedagios','viagens','leituras','posicoes','postos','visitas','config','logs'];
var DB_LOADED = {};
var DB = {}; COLS.forEach(function(c){ DB[c] = {}; });

function $(s, el){ return (el||document).querySelector(s); }
function $$(s, el){ return Array.prototype.slice.call((el||document).querySelectorAll(s)); }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function pad(n){ return (n < 10 ? '0' : '') + n; }
function today(){ var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()); }
function nowTs(){ return Date.now(); }
function fmtD(iso){ return iso ? String(iso).slice(8,10) + '/' + String(iso).slice(5,7) + '/' + String(iso).slice(0,4) : '—'; }
function fmtDH(iso){ if(!iso) return '—'; iso = String(iso); return fmtD(iso) + (iso.length > 10 ? ' ' + iso.slice(11,16) : ''); }
function fmtDT(ts){ if(!ts) return '—'; var d = new Date(ts); return pad(d.getDate())+'/'+pad(d.getMonth()+1)+'/'+d.getFullYear()+' '+pad(d.getHours())+':'+pad(d.getMinutes()); }
function addDays(iso, n){ var d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()); }
function daysUntil(iso){ if(!iso) return null; return Math.round((new Date(String(iso).slice(0,10) + 'T12:00:00') - new Date(today() + 'T12:00:00')) / 864e5); }
function toDate(s){ if(!s) return null; s = String(s); var d = new Date(s.length === 10 ? s + 'T12:00:00' : s); return isNaN(d) ? null : d; }
function fmtN(n, dec){ return Number(n || 0).toLocaleString('pt-BR', {minimumFractionDigits:dec||0, maximumFractionDigits:dec||0}); }
function fmtR(n){ return Number(n || 0).toLocaleString('pt-BR', {style:'currency', currency:'BRL'}); }
function num(v){ if(typeof v === 'number') return isFinite(v) ? v : 0; v = String(v || '').trim().replace(/R\$\s?/, ''); if(/,\d{1,3}$/.test(v)) v = v.replace(/\./g,'').replace(',', '.'); var n = parseFloat(v); return isNaN(n) ? 0 : n; }
function norm(s){ return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim(); }
function normPlaca(s){ return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function vals(o){ return Object.keys(o || {}).map(function(k){ var v = o[k]; if(v && typeof v === 'object') v._id = k; return v; }); }
function cfg(k, d){ var v = (DB.config || {})[k]; return v == null || v === '' ? d : v; }
function hav(a, b, c, d){ var R = 6371000, r = function(x){ return x * Math.PI / 180; }; var h = Math.pow(Math.sin(r(c-a)/2),2) + Math.cos(r(a))*Math.cos(r(c))*Math.pow(Math.sin(r(d-b)/2),2); return 2*R*Math.asin(Math.sqrt(h)); }

function toast(msg, kind){
  var t = $('#toast'); t.textContent = msg; t.className = 'toast show ' + (kind || 'ok');
  clearTimeout(toast._t); toast._t = setTimeout(function(){ t.className = 'toast'; }, 3200);
}

// =====================================================================
// CAMADA DE DADOS (Firebase Realtime Database ou modo local)
// =====================================================================
var store = null;

function firebaseStore(){
  var root = firebase.database().ref(DB_ROOT);
  var listeners = [];
  return {
    start: function(){
      COLS.forEach(function(c){
        var ref = c === 'logs' ? root.child(c).limitToLast(300) : root.child(c);
        var fn = function(snap){ DB[c] = snap.val() || {}; DB_LOADED[c] = true; scheduleRender(); };
        ref.on('value', fn, function(err){ console.error(c, err); setSync('err', 'Erro de acesso'); });
        listeners.push([ref, fn]);
      });
      var con = firebase.database().ref('.info/connected');
      var cf = function(s){ setSync(s.val() ? 'ok' : 'syncing', s.val() ? 'Sincronizado' : 'Reconectando...'); };
      con.on('value', cf); listeners.push([con, cf]);
    },
    stop: function(){ listeners.forEach(function(l){ l[0].off('value', l[1]); }); listeners = []; COLS.forEach(function(c){ DB[c] = {}; }); },
    key: function(){ return root.push().key; },
    update: function(paths){
      setSync('syncing', 'Salvando...');
      return root.update(paths).then(function(){ setSync('ok', 'Sincronizado'); }, function(e){ setSync('err', 'Erro ao salvar'); throw e; });
    }
  };
}

function localStore(){
  var K = 'painelfrota_demo_v1';
  function save(){ try{ localStorage.setItem(K, JSON.stringify(DB)); }catch(e){ toast('Armazenamento local cheio', 'err'); } }
  function walk(path, create){
    var parts = path.split('/'), o = DB;
    for(var i = 0; i < parts.length - 1; i++){
      if(!o[parts[i]] || typeof o[parts[i]] !== 'object'){ if(!create) return [null, null]; o[parts[i]] = {}; }
      o = o[parts[i]];
    }
    return [o, parts[parts.length - 1]];
  }
  function setPath(path, val){
    var w = walk(path, val !== null); if(!w[0]) return;
    if(val === null || val === undefined) delete w[0][w[1]]; else w[0][w[1]] = JSON.parse(JSON.stringify(val));
  }
  return {
    start: function(){
      try{ var s = JSON.parse(localStorage.getItem(K) || 'null'); if(s) COLS.forEach(function(c){ DB[c] = s[c] || {}; }); }catch(e){}
      COLS.forEach(function(c){ DB_LOADED[c] = true; });
      setSync('syncing', 'Modo local'); scheduleRender();
    },
    stop: function(){},
    key: function(){ return '-L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9); },
    update: function(paths){
      Object.keys(paths).forEach(function(p){ setPath(p, paths[p]); }); save(); scheduleRender(); return Promise.resolve();
    }
  };
}

function setSync(state, label){
  var p = $('#sync-pill'); if(!p) return;
  p.className = 'sync-pill' + (state === 'ok' ? '' : ' ' + state);
  $('#sync-label').textContent = label || '';
}

function logPaths(paths, acao, detalhe){
  paths['logs/' + store.key()] = {ts: nowTs(), usuario: currentUser ? currentUser.name : '', acao: acao, detalhe: detalhe || ''};
  return paths;
}
function save(paths, acao, detalhe){
  return store.update(logPaths(paths, acao, detalhe)).catch(function(e){
    console.error(e); toast('Não foi possível salvar. Verifique a conexão e o seu acesso.', 'err'); throw e;
  });
}
function clean(o){ var r = {}; Object.keys(o).forEach(function(k){ if(k.charAt(0) !== '_' && o[k] !== undefined && o[k] !== '') r[k] = o[k]; }); return r; }

// =====================================================================
// LOGIN
// =====================================================================
var currentUser = null, currentRole = null, firebaseAuth = null;
function can(p){ return !!(currentRole && currentRole[p]); }

function findUserRoleByUsername(u){ var k = norm(u); return USER_ROLES.find(function(x){ return norm(x.user) === k; }); }
function findUserRoleByEmail(e){ e = String(e || '').toLowerCase(); return USER_ROLES.find(function(x){ return x.email.toLowerCase() === e; }); }

function completeLogin(ur){
  currentUser = ur; currentRole = rolePermissions[ur.role] || rolePermissions.consulta;
  $('#role-avatar').textContent = currentRole.initials;
  $('#role-name').textContent = ur.name;
  $('#role-pill-label').textContent = currentRole.label;
  $('#login-screen').style.display = 'none';
  $('#app-shell').classList.add('visible');
  store.start();
  var nav = ''; try{ nav = localStorage.getItem('painelfrota_nav') || ''; }catch(e){}
  showModule(nav.split('/')[0] || 'inicio', nav.split('/')[1]);
}
function initAuth(){
  if(!FB_ON){
    document.body.classList.add('demo');
    if(FB_FALHOU){
      $('.login-demo').innerHTML = 'Não foi possível carregar o Firebase nesta página (sem internet ou visualização bloqueada). Abrindo em <b>modo demonstração</b>: senha <b>demo</b>, dados só neste navegador.';
      $('.demo-banner').textContent = 'Firebase indisponível nesta página: modo demonstração, dados só neste navegador.';
    }
    store = localStore();
    try{ var u = sessionStorage.getItem('painelfrota_demo_user'); if(u){ var ur = findUserRoleByUsername(u); if(ur) completeLogin(ur); } }catch(e){}
    return;
  }
  firebase.initializeApp(firebaseConfig);
  firebaseAuth = firebase.auth();
  store = firebaseStore();
  firebaseAuth.onAuthStateChanged(function(user){
    var btn = $('#login-form button[type=submit]'); btn.disabled = false;
    if(user){
      var ur = findUserRoleByEmail(user.email);
      if(!ur){ firebaseAuth.signOut(); loginError('Usuário sem perfil neste painel.'); return; }
      completeLogin(ur);
    }
  });
}
function loginError(m){ var e = $('#login-error'); e.textContent = m || 'Usuário ou senha inválidos.'; e.style.display = 'block'; }

document.addEventListener('DOMContentLoaded', function(){
  $('#login-form').addEventListener('submit', function(e){
    e.preventDefault();
    var u = $('#login-user').value.trim(), pass = $('#login-pass').value;
    var ur = findUserRoleByUsername(u);
    if(!ur || !pass){ loginError(); return; }
    $('#login-error').style.display = 'none';
    if(!FB_ON){
      if(pass !== 'demo'){ loginError('No modo demonstração a senha é "demo".'); return; }
      try{ sessionStorage.setItem('painelfrota_demo_user', ur.user); }catch(err){}
      completeLogin(ur); return;
    }
    var btn = this.querySelector('button[type=submit]'); btn.disabled = true;
    firebaseAuth.signInWithEmailAndPassword(ur.email, pass).catch(function(err){ console.error(err); btn.disabled = false; loginError(); });
  });
  $('#btn-logout').addEventListener('click', function(){
    store.stop(); currentUser = null; currentRole = null;
    try{ sessionStorage.removeItem('painelfrota_demo_user'); }catch(e){}
    if(FB_ON) firebaseAuth.signOut();
    $('#app-shell').classList.remove('visible');
    $('#login-screen').style.display = 'flex';
    $('#login-form').reset();
  });
  initUI();
  initAuth();
});
