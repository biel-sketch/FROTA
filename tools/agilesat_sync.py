#!/usr/bin/env python3
"""
Conector AgileSat (Fulltrack / RESTrack) -> Painel Frota (Grupo Login Serv)
===========================================================================

Lê a API RESTrack da Fulltrack (https://ws.fulltrack2.com), que é a plataforma usada
pela AgileSat, e grava no Firebase Realtime Database do painel (nó `painel-frota`):

  - veículos (placa, modelo, ano, hodômetro)          <- /vehicles/all + /events/all
  - última posição de cada veículo                     <- /events/all
  - viagens com trajeto, KM pelo hodômetro, vel. máx.  <- /events/interval/id/{id}/begin/{ts}/end/{ts}
  - postos de trabalho (pontos de referência)          <- /referencepoints/all  (só cria os novos)
  - motoristas (nome e vencimento da CNH)              <- /drivers/all          (só cria os novos)
  - visitas aos postos (cerca de cada posto)           <- calculado pelas viagens

Autenticação da API: cabeçalhos `apiKey` e `secretKey`.
Os horários da API vêm em UTC e são convertidos para o horário de Brasília.

Variáveis de ambiente (GitHub Actions > Secrets):
    AGILESAT_APIKEY, AGILESAT_SECRETKEY   chaves da AgileSat/Fulltrack
    FIREBASE_SERVICE_ACCOUNT              JSON da conta de serviço do Firebase
    FIREBASE_DATABASE_URL                 (opcional) URL do Realtime Database

Testar no computador, sem gravar nada:
    pip install requests
    AGILESAT_APIKEY=... AGILESAT_SECRETKEY=... python agilesat_sync.py --teste
"""
import argparse
import json
import math
import os
import random
import re
import string
import sys
import time
from datetime import datetime, timedelta, timezone

try:
    import requests
except ImportError:
    sys.exit("Instale a biblioteca: pip install requests")

try:
    from zoneinfo import ZoneInfo
    TZ_BR = ZoneInfo("America/Sao_Paulo")
except Exception:  # sem base de fusos: Brasília é UTC-3 (sem horário de verão)
    TZ_BR = timezone(timedelta(hours=-3))

API = "https://ws.fulltrack2.com"
DB_URL_PADRAO = "https://frota-f2697-default-rtdb.firebaseio.com"
RAIZ = "painel-frota"

HORAS_PADRAO = 24       # janela lida a cada execução (+2h de folga); cobre o intervalo 17h -> 12h
PARADA_MIN = 10         # minutos parado que encerram uma viagem
VEL_PARADO = 3          # km/h abaixo disso conta como parado
MAX_PONTOS = 400        # pontos de GPS guardados por viagem
RAIO_PADRAO = 200       # raio (m) dos postos criados a partir dos pontos de referência


# ---------------------------------------------------------------- utilidades
def num(v, padrao=0.0):
    try:
        return float(str(v).replace(",", "."))
    except (TypeError, ValueError):
        return padrao


def data_br(s):
    """'16/11/2026 19:27:21' (UTC) -> '2026-11-16T16:27' (Brasília)."""
    if not s:
        return ""
    try:
        d = datetime.strptime(str(s).strip(), "%d/%m/%Y %H:%M:%S").replace(tzinfo=timezone.utc)
        return d.astimezone(TZ_BR).strftime("%Y-%m-%dT%H:%M")
    except ValueError:
        return ""


def corrige_texto(s):
    """Corrige acentos que a API devolve com codificação dupla (ex.: 'MarÃ­lia')."""
    s = str(s or "").strip()
    try:
        return s.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return s


def haversine_km(a, b, c, d):
    r = math.radians
    h = math.sin(r(c - a) / 2) ** 2 + math.cos(r(a)) * math.cos(r(c)) * math.sin(r(d - b) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def nova_chave():
    return "-L" + format(int(time.time() * 1000), "x") + "".join(random.choices(string.ascii_lowercase + string.digits, k=8))


def norm_placa(s):
    return re.sub(r"[^A-Z0-9]", "", str(s or "").upper())


def norm_txt(s):
    import unicodedata
    s = unicodedata.normalize("NFD", str(s or "")).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", s).strip().lower()


# ---------------------------------------------------------------- API Fulltrack
class Fulltrack:
    def __init__(self, apikey, secretkey):
        self.s = requests.Session()
        self.s.headers.update({"apiKey": apikey, "secretKey": secretkey, "Accept": "application/json"})

    def get(self, caminho):
        for tentativa in range(3):
            r = self.s.get(API + caminho, timeout=60)
            if r.status_code in (401, 403):
                raise RuntimeError("A AgileSat/Fulltrack recusou as chaves (HTTP %s)." % r.status_code)
            if r.status_code >= 500 and tentativa < 2:
                time.sleep(3)
                continue
            r.raise_for_status()
            j = r.json()
            if isinstance(j, dict) and j.get("status") is False:
                msg = str(j.get("message", ""))
                if "not found" in msg.lower() or "nenhum" in msg.lower():
                    return []
                raise RuntimeError("API: " + msg)
            return (j.get("data") if isinstance(j, dict) else j) or []
        return []


def ponto(e):
    """Evento da API -> ponto simples."""
    lat, lng = num(e.get("ras_eve_latitude"), None), num(e.get("ras_eve_longitude"), None)
    t = data_br(e.get("ras_eve_data_gps"))
    if lat is None or lng is None or not t or (lat == 0 and lng == 0):
        return None
    return {"lat": lat, "lng": lng, "t": t, "vel": num(e.get("ras_eve_velocidade")),
            "ign": str(e.get("ras_eve_ignicao")) == "1", "hod": num(e.get("ras_eve_hodometro"), 0) / 1000.0}


def montar_viagens(pts):
    """Divide as posições em viagens: termina quando a ignição desliga ou fica parado > PARADA_MIN."""
    pts = sorted(pts, key=lambda p: p["t"])
    viagens, atual, parado_desde, ant = [], None, None, None

    def fechar():
        nonlocal atual
        if atual and len(atual["pts"]) >= 2:
            p = atual["pts"]
            km_hod = p[-1]["hod"] - p[0]["hod"] if p[0]["hod"] and p[-1]["hod"] else 0
            km = km_hod if 0 < km_hod < 2000 else atual["km_gps"]
            if km >= 0.3:
                passo = max(1, len(p) // MAX_PONTOS)
                amostra = p[::passo]
                if amostra[-1] is not p[-1]:
                    amostra.append(p[-1])
                viagens.append({"inicio": p[0]["t"], "fim": p[-1]["t"], "km": round(km, 1),
                                "kmInicial": round(p[0]["hod"]) if p[0]["hod"] else None,
                                "kmFinal": round(p[-1]["hod"]) if p[-1]["hod"] else None,
                                "velMax": round(atual["vmax"]), "paradoMin": round(atual["parado"]),
                                "pontos": [[round(x["lat"], 6), round(x["lng"], 6), x["t"]] for x in amostra]})
        atual = None

    def minutos(a, b):
        return (datetime.fromisoformat(b) - datetime.fromisoformat(a)).total_seconds() / 60

    for p in pts:
        movendo = p["vel"] > VEL_PARADO
        if atual is None:
            if movendo:
                atual = {"pts": [ant or p] if ant and minutos(ant["t"], p["t"]) < PARADA_MIN else [p],
                         "km_gps": 0.0, "vmax": p["vel"], "parado": 0.0}
                if atual["pts"][0] is not p:
                    atual["pts"].append(p)
                parado_desde = None
        else:
            q = atual["pts"][-1]
            atual["km_gps"] += haversine_km(q["lat"], q["lng"], p["lat"], p["lng"])
            atual["vmax"] = max(atual["vmax"], p["vel"])
            atual["pts"].append(p)
            dt = minutos(q["t"], p["t"])
            if not movendo:
                parado_desde = parado_desde or q["t"]
                if p["ign"]:
                    atual["parado"] += dt
                if not p["ign"] or minutos(parado_desde, p["t"]) >= PARADA_MIN or dt >= PARADA_MIN:
                    fechar()
                    parado_desde = None
            else:
                parado_desde = None
        ant = p
    fechar()
    return viagens


# ---------------------------------------------------------------- Firebase
class Firebase:
    def __init__(self, url, sa_json):
        from google.oauth2 import service_account
        from google.auth.transport.requests import Request
        cred = service_account.Credentials.from_service_account_info(
            json.loads(sa_json), scopes=["https://www.googleapis.com/auth/firebase.database",
                                         "https://www.googleapis.com/auth/userinfo.email"])
        cred.refresh(Request())
        self.tok = cred.token
        self.base = url.rstrip("/") + "/" + RAIZ

    def get(self, caminho):
        r = requests.get(f"{self.base}/{caminho}.json", params={"access_token": self.tok}, timeout=60)
        r.raise_for_status()
        return r.json()

    def update(self, paths):
        itens = list(paths.items())
        for i in range(0, len(itens), 300):
            r = requests.patch(f"{self.base}.json", params={"access_token": self.tok},
                               data=json.dumps(dict(itens[i:i + 300])), timeout=120)
            r.raise_for_status()


VISITA_MIN = 3   # minutos mínimos dentro da cerca para contar como visita (evita passagens)


def tipo_posto(p):
    """Só postos do tipo Cliente geram visitas. Sem tipo definido, deduz pelo nome."""
    if p.get("tipo"):
        return p["tipo"]
    n = norm_txt(p.get("nome")).upper()
    if n.startswith(("ESCRITORIO", "BASE ")):
        return "Escritório / base"
    if n.startswith("RESIDENCIA"):
        return "Residência"
    if n.startswith("PEDAGIO"):
        return "Outro"
    return "Cliente"


def detectar_visitas(pts_por_veic, postos, visitas, visita_max_h=8):
    """Posições seguidas dentro do raio de um posto viram uma visita (chegada = 1ª, saída = última).
    A chave é fixa (veículo + posto + chegada): execuções seguintes só atualizam a saída."""
    manuais = []
    for v in (visitas or {}).values():
        if isinstance(v, dict) and not str(v.get("fonte", "")).startswith("Autom"):
            try:
                manuais.append((v.get("postoId"), v.get("veiculoId"), datetime.fromisoformat(v.get("chegada", ""))))
            except ValueError:
                pass
    novas = {}
    cercas = [(pid, num(p["lat"]), num(p["lng"]), num(p.get("raio"), RAIO_PADRAO) or RAIO_PADRAO)
              for pid, p in (postos or {}).items()
              if isinstance(p, dict) and p.get("lat") not in (None, "") and tipo_posto(p) == "Cliente"]

    def posto_do_ponto(q):
        # cercas sobrepostas: fica com o posto mais perto do ponto
        melhor = None
        for pid, la, ln, raio in cercas:
            d = haversine_km(q["lat"], q["lng"], la, ln) * 1000
            if d <= raio and (melhor is None or d < melhor[1]):
                melhor = (pid, d)
        return melhor[0] if melhor else None

    def fecha(vid, rid, motorista, pid, ini, fim):
        # visita pode atravessar a meia-noite (turno da noite), mas permanência longa
        # é carro guardado/pernoitando ali, não visita
        if (datetime.fromisoformat(fim["t"]) - datetime.fromisoformat(ini["t"])).total_seconds() / 3600 > visita_max_h:
            return
        dur = (datetime.fromisoformat(fim["t"]) - datetime.fromisoformat(ini["t"])).total_seconds() / 60
        ch = datetime.fromisoformat(ini["t"])
        manual = any(a == pid and b == vid and abs((c - ch).total_seconds()) < 1800 for a, b, c in manuais)
        if dur >= VISITA_MIN and not manual:
            k = re.sub(r"[.#$\[\]/]", "_", f"ag_{rid}_{pid}_{ini['t']}")
            novas[k] = {"postoId": pid, "veiculoId": vid, "motorista": motorista, "chegada": ini["t"],
                        "saida": fim["t"], "fonte": "Automática (rastreador)", "obs": "Detectada pela cerca do posto"}

    for (vid, rid, motorista), pts in pts_por_veic.items():
        atual = ini = fim = None
        for q in pts + [None]:
            pid = posto_do_ponto(q) if q is not None else None
            if pid is not None and pid == atual:
                fim = q
                continue
            if atual is not None:
                fecha(vid, rid, motorista, atual, ini, fim)
            atual, ini, fim = (pid, q, q) if pid is not None else (None, None, None)
    return novas


# ---------------------------------------------------------------- sincronização
def sincronizar(api, fb, horas, teste=False):
    veic_api = api.get("/vehicles/all")
    ultimos = {str(e.get("ras_vei_id")): e for e in api.get("/events/all")}
    refs = api.get("/referencepoints/all")
    mots = api.get("/drivers/all")
    if teste:
        print(f"Veículos: {len(veic_api)} · últimas posições: {len(ultimos)} · pontos de referência: {len(refs)} · motoristas: {len(mots)}")

    cad = (fb.get("veiculos") if fb else {}) or {}
    postos = (fb.get("postos") if fb else {}) or {}
    motoristas = (fb.get("motoristas") if fb else {}) or {}
    ignorar = (fb.get("config/rastreadorIgnorar") if fb else {}) or {}
    ign_placas = {norm_placa(p) for p in ignorar.values() if p}
    paths, cont = {}, {"novos": 0, "pos": 0, "viagens": 0, "postos": 0, "mot": 0}

    def acha(rid, placa):
        for vid, v in cad.items():
            if isinstance(v, dict) and str(v.get("rastreadorId", "")) == rid:
                return vid, v
        for vid, v in cad.items():
            if isinstance(v, dict) and placa and norm_placa(v.get("placa")) == norm_placa(placa):
                return vid, v
        return None, None

    # --- veículos e última posição
    ids = {}
    for x in veic_api:
        rid, placa = str(x.get("ras_vei_id")), x.get("ras_vei_placa")
        ev = ultimos.get(rid, {})
        km = num(ev.get("ras_eve_hodometro"), 0) / 1000.0
        if rid in ignorar or (placa and norm_placa(placa) in ign_placas):
            cont["ignorados"] = cont.get("ignorados", 0) + 1
            continue
        vid, v = acha(rid, placa)
        if vid and str(v.get("puxarRastreador", "Sim")) == "Não":
            paths[f"posicoes/{vid}"] = None  # tira do mapa da frota
            cont["ignorados"] = cont.get("ignorados", 0) + 1
            continue
        if not vid:
            vid = nova_chave()
            v = {"placa": norm_placa(placa), "modelo": corrige_texto(x.get("ras_vei_veiculo")), "status": "Ativo",
                 "tipo": "Carro", "combustivel": "Flex", "rastreadorId": rid, "origem": "AgileSat"}
            if x.get("ras_vei_ano"):
                v["ano"] = int(num(x["ras_vei_ano"]))
            if km:
                v["kmAtual"] = round(km)
            paths[f"veiculos/{vid}"] = v
            cad[vid] = v
            cont["novos"] += 1
        else:
            if str(v.get("rastreadorId", "")) != rid:
                paths[f"veiculos/{vid}/rastreadorId"] = rid
        # hodômetro: o painel guarda o valor real (pode ter sido corrigido à mão) e soma o que
        # o rastreador andou desde a última leitura dele (kmRastreador)
        ajuste = 0.0
        if km:
            km_at, ant = num(v.get("kmAtual")), num(v.get("kmRastreador"), None)
            if ant is not None:
                delta = km - ant
                if 0 < delta < 5000:
                    km_at += delta
            elif km > km_at:
                km_at = km
            if round(km_at) != round(num(v.get("kmAtual"))):
                paths[f"veiculos/{vid}/kmAtual"] = round(km_at)
            paths[f"veiculos/{vid}/kmRastreador"] = round(km, 1)
            v["kmAtual"], v["kmRastreador"] = round(km_at), round(km, 1)
            ajuste = round(km_at) - km
        ids[rid] = (vid, v, ajuste)
        p = ponto(ev) if ev else None
        if p:
            paths[f"posicoes/{vid}"] = {"veiculoId": vid, "lat": p["lat"], "lng": p["lng"], "velocidade": p["vel"],
                                        "ignicao": p["ign"], "dataHora": p["t"],
                                        "km": round(p["hod"] + ajuste) if p["hod"] else None,
                                        "kmRastreador": round(p["hod"], 1) if p["hod"] else None,
                                        "endereco": "", "fonte": "AgileSat"}
            cont["pos"] += 1

    # --- histórico -> viagens
    fim = int(time.time())
    ini = fim - int((float(horas) + 2) * 3600)
    novas_viagens, pts_por_veic = {}, {}
    for rid, (vid, v, ajuste) in ids.items():
        try:
            evs = api.get(f"/events/interval/id/{rid}/begin/{ini}/end/{fim}")
        except Exception as e:
            print(f"  aviso: histórico de {v.get('placa')} falhou ({e})")
            continue
        pts = sorted([p for p in (ponto(e) for e in evs) if p], key=lambda p: p["t"])
        pts_por_veic[(vid, rid, v.get("motorista", ""))] = pts
        vg = montar_viagens(pts)
        # viagem que já estava em andamento no início da janela foi gravada numa execução anterior
        if vg and pts and pts[0]["vel"] > VEL_PARADO and vg[0]["inicio"] == pts[0]["t"]:
            vg = vg[1:]
        print(f"  {v.get('placa')}: {len(pts)} posições -> {len(vg)} viagem(ns)")
        for t in vg:
            tid = re.sub(r"[.#$\[\]/]", "_", f"ag_{rid}_{t['inicio']}")
            reg = {"veiculoId": vid, "motorista": v.get("motorista", ""), "origem": "", "destino": "", "fonte": "AgileSat"}
            reg.update({k: val for k, val in t.items() if val is not None})
            for kk in ("kmInicial", "kmFinal"):
                if reg.get(kk) is not None and ajuste:
                    reg[kk] = round(reg[kk] + ajuste)
            novas_viagens[tid] = reg
    for tid, t in novas_viagens.items():
        paths[f"viagens/{tid}"] = t
    cont["viagens"] = len(novas_viagens)

    # --- pontos de referência -> postos (só os que ainda não existem)
    por_ref = {str(p.get("refId")): k for k, p in postos.items() if isinstance(p, dict) and p.get("refId")}
    por_nome = {norm_txt(p.get("nome")): k for k, p in postos.items() if isinstance(p, dict)}
    for r in refs:
        ref_id, nome = str(r.get("ras_ref_id")), corrige_texto(r.get("ras_ref_descricao"))
        lat, lng = num(r.get("ras_ref_latitude"), None), num(r.get("ras_ref_longitude"), None)
        if not nome or lat is None or lng is None or ref_id in por_ref:
            continue
        if norm_txt(nome) in por_nome:  # já cadastrado à mão: só liga ao ponto de referência
            paths[f"postos/{por_nome[norm_txt(nome)]}/refId"] = ref_id
            continue
        pid = nova_chave()
        cidade = corrige_texto(r.get("ras_ref_cidade"))
        novo = {"nome": nome, "endereco": cidade.title() + (" - " + r.get("ras_ref_uf") if r.get("ras_ref_uf") else ""),
                "lat": lat, "lng": lng, "raio": RAIO_PADRAO, "freqSemana": 0, "refId": ref_id, "origem": "AgileSat"}
        novo["tipo"] = tipo_posto(novo)
        paths[f"postos/{pid}"] = novo
        postos[pid] = novo
        cont["postos"] += 1

    # --- motoristas (só nome e vencimento da CNH; sem CPF nem número da CNH)
    por_mid = {str(m.get("motoristaId")) for m in motoristas.values() if isinstance(m, dict) and m.get("motoristaId")}
    nomes = {norm_txt(m.get("nome")) for m in motoristas.values() if isinstance(m, dict)}
    for m in mots:
        mid, nome = str(m.get("ras_mot_id")), corrige_texto(m.get("ras_mot_nome")).title()
        if not nome or nome.upper() == "PADRAO" or mid in por_mid or norm_txt(nome) in nomes:
            continue
        reg = {"nome": nome, "motoristaId": mid, "origem": "AgileSat"}
        if re.match(r"\d{4}-\d{2}-\d{2}$", str(m.get("ras_mot_cnh_vence") or "")):
            reg["vencCnh"] = m["ras_mot_cnh_vence"]
        paths[f"motoristas/{nova_chave()}"] = reg
        cont["mot"] += 1

    # --- visitas
    visitas = detectar_visitas(pts_por_veic, postos, fb.get("visitas") if fb else {},
                               num((fb.get("config/agilesat") or {}).get("visitaMaxHoras") if fb else None, 8) or 8)
    for k, v in visitas.items():
        paths[f"visitas/{k}"] = v

    resumo = (f"{len(veic_api)} veículos ({cont['novos']} novos), {cont['pos']} posições, {cont['viagens']} viagens, "
              f"{len(visitas)} visitas" + (f", {cont['postos']} postos novos" if cont["postos"] else "")
              + (f", {cont['mot']} motoristas novos" if cont["mot"] else "")
              + (f", {cont['ignorados']} veículo(s) ignorado(s)" if cont.get("ignorados") else ""))
    agora = int(time.time() * 1000)
    paths["config/ultimaSync"] = {"em": agora, "resumo": resumo, "origem": "GitHub Actions"}
    paths[f"logs/{nova_chave()}"] = {"ts": agora, "usuario": "Sincronização AgileSat", "acao": "Sincronizou o rastreador", "detalhe": resumo}

    if teste:
        print("\nTESTE (nada foi gravado):", resumo)
        for k in list(paths)[:8]:
            print("  ", k, str(paths[k])[:120])
        return
    fb.update(paths)
    print("OK:", resumo)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--teste", action="store_true", help="lê a API e mostra o resultado, sem gravar no Firebase")
    ap.add_argument("--horas", type=float, default=None, help="horas de histórico (padrão 24)")
    a = ap.parse_args()

    apikey, secret = os.environ.get("AGILESAT_APIKEY", ""), os.environ.get("AGILESAT_SECRETKEY", "")
    if not apikey or not secret:
        sys.exit("Faltam os segredos AGILESAT_APIKEY e AGILESAT_SECRETKEY.")
    api = Fulltrack(apikey, secret)

    fb = None
    if not a.teste:
        if not os.environ.get("FIREBASE_SERVICE_ACCOUNT"):
            sys.exit("Falta o segredo FIREBASE_SERVICE_ACCOUNT.")
        fb = Firebase(os.environ.get("FIREBASE_DATABASE_URL") or DB_URL_PADRAO, os.environ["FIREBASE_SERVICE_ACCOUNT"])
    horas = a.horas or num(os.environ.get("AGILESAT_HORAS"), 0) or HORAS_PADRAO
    if fb and a.horas is None:
        cfg = fb.get("config/agilesat") or {}
        horas = max(num(cfg.get("horas"), 0), horas)  # nunca menos que o intervalo entre execuções
    sincronizar(api, fb, horas, a.teste)


def registrar_erro(msg):
    """Grava o erro em config/ultimaSync para aparecer no painel (Cadastros > Integração)."""
    try:
        if os.environ.get("FIREBASE_SERVICE_ACCOUNT"):
            fb = Firebase(os.environ.get("FIREBASE_DATABASE_URL") or DB_URL_PADRAO, os.environ["FIREBASE_SERVICE_ACCOUNT"])
            fb.update({"config/ultimaSync/erro": str(msg)[:300], "config/ultimaSync/erroEm": int(time.time() * 1000)})
    except Exception as e2:
        print("não consegui registrar o erro no painel:", e2)


if __name__ == "__main__":
    # No GitHub Actions o script nunca termina com erro (o GitHub não manda e-mail);
    # o problema aparece no painel.
    automatico = os.environ.get("GITHUB_ACTIONS") == "true"
    try:
        main()
    except SystemExit as e:
        if automatico and e.code not in (None, 0):
            print("Aviso:", e.code)
            registrar_erro(e.code)
        elif not automatico:
            raise
    except Exception as e:
        print("Erro na sincronização:", repr(e))
        if not automatico:
            raise
        registrar_erro(repr(e))
