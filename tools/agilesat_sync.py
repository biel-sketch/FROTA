#!/usr/bin/env python3
"""
Conector AgileSat -> Painel Frota (Grupo Login Serv)
====================================================

Lê a API do rastreador AgileSat e grava no Firebase Realtime Database do painel
(nó `painel-frota`): veículos, última posição, viagens com trajeto e visitas aos
postos de trabalho. Roda sozinho pelo GitHub Actions (.github/workflows/agilesat-sync.yml).

Modo Firebase (GitHub Actions) — variáveis de ambiente:
    FIREBASE_DATABASE_URL       URL do Realtime Database (https://xxx-default-rtdb.firebaseio.com)
    FIREBASE_SERVICE_ACCOUNT    JSON da conta de serviço do Firebase (Configurações do projeto > Contas de serviço)
    AGILESAT_TOKEN              token da API (ou AGILESAT_USUARIO + AGILESAT_SENHA, se a autenticação for por login)
  A URL base e os endpoints são lidos do próprio painel (Cadastros > Integração), em config/agilesat.

Modo arquivo (sem Firebase), para testar no computador:
    pip install requests
    python agilesat_sync.py --arquivo --config config.json   # gera agilesat_export.json para importar no painel
    python agilesat_sync.py --teste --config config.json     # mostra um exemplo da resposta de cada endpoint

Como a documentação da API da AgileSat não é pública, os caminhos dos endpoints
e os nomes dos campos variam. O script tenta reconhecer automaticamente os nomes
mais comuns (lat/latitude, speed/velocidade, plate/placa...). Se algum campo não
vier, ajuste o dicionário CAMPOS abaixo com o nome que aparece na resposta da API
(rode com --teste para ver um exemplo da resposta).
"""
import json, math, os, re, sys, argparse
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    import requests
except ImportError:
    sys.exit("Instale a biblioteca: pip install requests")

PASTA = Path(__file__).resolve().parent

# Nomes possíveis de cada campo na resposta da API (o primeiro que existir é usado).
# Aceita caminhos com ponto, ex.: "position.latitude".
CAMPOS = {
    "id":        ["id", "vehicleId", "veiculoId", "idVeiculo", "deviceId", "trackerId", "imei", "codigo"],
    "placa":     ["placa", "plate", "licensePlate", "vehiclePlate", "identificacao", "nome", "name"],
    "modelo":    ["modelo", "model", "descricao", "description"],
    "lat":       ["lat", "latitude", "position.latitude", "posicao.latitude", "gps.lat"],
    "lng":       ["lng", "lon", "long", "longitude", "position.longitude", "posicao.longitude", "gps.lng"],
    "velocidade":["velocidade", "speed", "vel", "gpsSpeed"],
    "ignicao":   ["ignicao", "ignition", "ign", "ignitionOn", "motorLigado"],
    "data":      ["dataHora", "data_hora", "datetime", "dateTime", "gpsTime", "date", "data", "timestamp", "eventDate"],
    "endereco":  ["endereco", "address", "logradouro", "location"],
    "hodometro": ["hodometro", "odometro", "odometer", "odometro_km", "km", "totalDistance"],
}
# Onde a lista de itens costuma vir dentro da resposta
CHAVES_LISTA = ["data", "items", "result", "results", "veiculos", "vehicles", "posicoes", "positions", "content", "rows"]

PARADA_MIN = 10        # minutos parado/ignição desligada que encerram uma viagem
VEL_PARADO = 3         # km/h abaixo disso conta como parado
MAX_PONTOS = 400       # pontos de GPS guardados por viagem (o painel desenha o trajeto)


def pega(obj, nomes):
    for n in nomes:
        cur = obj
        ok = True
        for parte in n.split("."):
            if isinstance(cur, dict) and parte in cur:
                cur = cur[parte]
            else:
                ok = False
                break
        if ok and cur not in (None, ""):
            return cur
    return None


def lista(resp):
    if isinstance(resp, list):
        return resp
    if isinstance(resp, dict):
        for k in CHAVES_LISTA:
            if isinstance(resp.get(k), list):
                return resp[k]
            if isinstance(resp.get(k), dict):
                inner = lista(resp[k])
                if inner:
                    return inner
    return []


def num(v, padrao=0.0):
    try:
        return float(str(v).replace(",", "."))
    except (TypeError, ValueError):
        return padrao


def booleano(v):
    if isinstance(v, bool):
        return v
    return str(v).strip().lower() in ("1", "true", "sim", "on", "ligado", "ligada", "yes")


def data_iso(v):
    if v is None:
        return ""
    if isinstance(v, (int, float)):  # epoch (s ou ms)
        ts = v / 1000 if v > 1e11 else v
        return datetime.fromtimestamp(ts).strftime("%Y-%m-%dT%H:%M:%S")
    s = str(v).strip()
    for fmt in ("%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%dT%H:%M:%S")
        except ValueError:
            pass
    try:
        d = datetime.fromisoformat(s.replace("Z", "+00:00"))
        if d.tzinfo:
            d = d.astimezone().replace(tzinfo=None)  # horário local do computador
        return d.strftime("%Y-%m-%dT%H:%M:%S")
    except ValueError:
        return s


def haversine_km(a, b, c, d):
    r = math.radians
    h = math.sin(r(c - a) / 2) ** 2 + math.cos(r(a)) * math.cos(r(c)) * math.sin(r(d - b) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


class Api:
    def __init__(self, cfg):
        self.cfg = cfg
        self.base = cfg["base_url"].rstrip("/")
        self.s = requests.Session()
        self.s.headers["Accept"] = "application/json"
        auth = cfg.get("auth", {})
        tipo = auth.get("type", "bearer")
        if tipo == "bearer":
            self.s.headers["Authorization"] = f"Bearer {auth.get('token','')}"
        elif tipo == "header":
            self.s.headers[auth.get("header_name") or "x-api-key"] = auth.get("token", "")
        elif tipo == "login":
            ep = cfg["endpoints"].get("login") or "/login"
            r = self.s.post(self.base + ep, json={"usuario": auth.get("usuario"), "username": auth.get("usuario"),
                                                  "login": auth.get("usuario"), "senha": auth.get("senha"),
                                                  "password": auth.get("senha")}, timeout=30)
            r.raise_for_status()
            j = r.json()
            tok = pega(j, ["token", "access_token", "accessToken", "data.token", "jwt"])
            if not tok:
                sys.exit(f"Login feito, mas não encontrei o token na resposta: {str(j)[:300]}")
            self.s.headers["Authorization"] = f"Bearer {tok}"

    def get(self, caminho, **fmt):
        url = self.base + caminho.format(**fmt)
        r = self.s.get(url, timeout=60)
        if r.status_code == 401:
            sys.exit("A API recusou o acesso (401). Confira o token/usuário no config.json.")
        r.raise_for_status()
        return r.json()


def montar_viagens(rid, placa, pontos):
    """Divide o histórico de posições em viagens (ignição/parada > PARADA_MIN)."""
    pontos = sorted(pontos, key=lambda p: p["t"])
    viagens, atual, parado_desde = [], None, None

    def fechar():
        nonlocal atual
        if atual and len(atual["pts"]) >= 2 and atual["km"] >= 0.3:
            pts = atual["pts"]
            passo = max(1, len(pts) // MAX_PONTOS)
            amostra = pts[::passo]
            if amostra[-1] is not pts[-1]:
                amostra.append(pts[-1])
            viagens.append({
                "rastreadorId": rid, "placa": placa,
                "inicio": pts[0]["t"][:16], "fim": pts[-1]["t"][:16],
                "km": round(atual["km"], 1), "velMax": round(atual["vmax"]),
                "paradoMin": round(atual["parado"]),
                "origem": pts[0].get("end", ""), "destino": pts[-1].get("end", ""),
                "pontos": [[round(p["lat"], 6), round(p["lng"], 6), p["t"][:16]] for p in amostra],
            })
        atual = None

    ant = None
    for p in pontos:
        movendo = p["vel"] > VEL_PARADO
        if ant:
            dt_min = (datetime.fromisoformat(p["t"]) - datetime.fromisoformat(ant["t"])).total_seconds() / 60
        else:
            dt_min = 0
        if atual is None:
            if movendo or p["ign"]:
                atual = {"pts": [p], "km": 0.0, "vmax": p["vel"], "parado": 0.0}
                parado_desde = None
        else:
            atual["km"] += haversine_km(ant["lat"], ant["lng"], p["lat"], p["lng"])
            atual["vmax"] = max(atual["vmax"], p["vel"])
            atual["pts"].append(p)
            if not movendo:
                parado_desde = parado_desde or ant["t"]
                if p["ign"]:
                    atual["parado"] += dt_min
                ociosa = (datetime.fromisoformat(p["t"]) - datetime.fromisoformat(parado_desde)).total_seconds() / 60
                if (not p["ign"] and ociosa >= 1) or ociosa >= PARADA_MIN or dt_min >= PARADA_MIN:
                    fechar()
                    parado_desde = None
            else:
                parado_desde = None
        ant = p
    fechar()
    return viagens


class Firebase:
    """Leitura/gravação no Realtime Database pela API REST, com conta de serviço."""
    def __init__(self, url, sa_json, raiz="painel-frota"):
        from google.oauth2 import service_account
        from google.auth.transport.requests import Request
        info = json.loads(sa_json)
        cred = service_account.Credentials.from_service_account_info(
            info, scopes=["https://www.googleapis.com/auth/firebase.database",
                          "https://www.googleapis.com/auth/userinfo.email"])
        cred.refresh(Request())
        self.tok = cred.token
        self.base = url.rstrip("/") + "/" + raiz

    def get(self, caminho):
        r = requests.get(f"{self.base}/{caminho}.json", params={"access_token": self.tok}, timeout=60)
        r.raise_for_status()
        return r.json()

    def update(self, paths):
        # grava em lotes para não estourar o tamanho da requisição
        itens = list(paths.items())
        for i in range(0, len(itens), 400):
            r = requests.patch(f"{self.base}.json", params={"access_token": self.tok},
                               data=json.dumps(dict(itens[i:i + 400])), timeout=120)
            r.raise_for_status()


def chave_segura(s):
    return re.sub(r"[.#$\[\]/]", "_", str(s))[:180]


def nova_chave():
    import random, string, time
    return "-L" + format(int(time.time() * 1000), "x") + "".join(random.choices(string.ascii_lowercase + string.digits, k=8))


def ler_agilesat(cfg, teste=False):
    """Busca veículos, últimas posições e o histórico e monta as viagens."""
    ep = cfg.get("endpoints", {})
    api = Api(cfg)
    veiculos, posicoes, viagens = [], [], []
    if ep.get("veiculos"):
        brutos = lista(api.get(ep["veiculos"]))
        if teste:
            print("VEÍCULOS — exemplo:", json.dumps(brutos[:1], ensure_ascii=False, indent=2)[:1500])
        for v in brutos:
            veiculos.append({"rastreadorId": str(pega(v, CAMPOS["id"]) or ""), "placa": pega(v, CAMPOS["placa"]) or "",
                             "modelo": pega(v, CAMPOS["modelo"]) or "", "kmAtual": num(pega(v, CAMPOS["hodometro"]))})
    if ep.get("posicoes"):
        brutos = lista(api.get(ep["posicoes"]))
        if teste:
            print("POSIÇÕES — exemplo:", json.dumps(brutos[:1], ensure_ascii=False, indent=2)[:1500])
        for p in brutos:
            posicoes.append({"rastreadorId": str(pega(p, CAMPOS["id"]) or ""), "placa": pega(p, CAMPOS["placa"]) or "",
                             "lat": num(pega(p, CAMPOS["lat"])), "lng": num(pega(p, CAMPOS["lng"])),
                             "velocidade": num(pega(p, CAMPOS["velocidade"])), "ignicao": booleano(pega(p, CAMPOS["ignicao"])),
                             "endereco": pega(p, CAMPOS["endereco"]) or "", "dataHora": data_iso(pega(p, CAMPOS["data"])),
                             "hodometro": num(pega(p, CAMPOS["hodometro"]))})
    if ep.get("historico") and veiculos:
        fim = datetime.now()
        # janela com folga de 2h: viagens repetidas caem na mesma chave e são sobrescritas
        ini = fim - timedelta(hours=float(cfg.get("horas", 3)) + 2)
        for v in veiculos:
            if not v["rastreadorId"]:
                continue
            try:
                brutos = lista(api.get(ep["historico"], id=v["rastreadorId"],
                                       inicio=ini.strftime("%Y-%m-%dT%H:%M:%S"), fim=fim.strftime("%Y-%m-%dT%H:%M:%S")))
            except requests.HTTPError as e:
                print(f"  aviso: histórico de {v['placa']} falhou ({e})")
                continue
            if teste:
                print("HISTÓRICO — exemplo:", json.dumps(brutos[:1], ensure_ascii=False, indent=2)[:1500])
                break
            pts = []
            for p in brutos:
                lat, lng = num(pega(p, CAMPOS["lat"]), None), num(pega(p, CAMPOS["lng"]), None)
                t = data_iso(pega(p, CAMPOS["data"]))
                if lat is None or lng is None or not t or (lat == 0 and lng == 0):
                    continue
                pts.append({"lat": lat, "lng": lng, "t": t, "vel": num(pega(p, CAMPOS["velocidade"])),
                            "ign": booleano(pega(p, CAMPOS["ignicao"])), "end": pega(p, CAMPOS["endereco"]) or ""})
            pts.sort(key=lambda p: p["t"])
            vg = montar_viagens(v["rastreadorId"], v["placa"], pts)
            # viagem já em andamento no começo da janela foi gravada inteira numa execução anterior
            if vg and pts and (pts[0]["vel"] > VEL_PARADO) and vg[0]["inicio"] == pts[0]["t"][:16]:
                vg = vg[1:]
            print(f"  {v['placa'] or v['rastreadorId']}: {len(pts)} posições -> {len(vg)} viagem(ns)")
            viagens.extend(vg)
    return veiculos, posicoes, viagens


def detectar_visitas(viagens_por_id, postos, visitas):
    """Mesma regra do painel: pontos dentro do raio do posto viram uma visita (chegada/saída)."""
    novas = {}
    existentes = [(v.get("postoId"), v.get("veiculoId"), v.get("chegada", "")) for v in (visitas or {}).values() if isinstance(v, dict)]
    def dup(pid, vid, ch):
        try:
            t = datetime.fromisoformat(ch)
        except ValueError:
            return False
        for p2, v2, c2 in existentes:
            if p2 == pid and v2 == vid:
                try:
                    if abs((datetime.fromisoformat(c2) - t).total_seconds()) < 1800:
                        return True
                except ValueError:
                    pass
        return False
    for t in viagens_por_id.values():
        pts = t.get("pontos") or []
        for pid, p in (postos or {}).items():
            if not isinstance(p, dict) or p.get("lat") in (None, ""):
                continue
            raio = num(p.get("raio"), 200) or 200
            ini = fim = None
            for q in pts + [None]:
                dentro = q is not None and haversine_km(q[0], q[1], num(p["lat"]), num(p["lng"])) * 1000 <= raio
                if dentro:
                    ini = ini or q
                    fim = q
                elif ini:
                    ch, sa = ini[2][:16], fim[2][:16]
                    if not dup(pid, t["veiculoId"], ch):
                        novas[nova_chave()] = {"postoId": pid, "veiculoId": t["veiculoId"], "motorista": t.get("motorista", ""),
                                               "chegada": ch, "saida": sa, "fonte": "Automática (rastreador)",
                                               "obs": "Detectada pela cerca do posto"}
                        existentes.append((pid, t["veiculoId"], ch))
                    ini = fim = None
    return novas


def gravar_firebase(fb, veiculos, posicoes, viagens):
    cad = fb.get("veiculos") or {}
    def acha(rid, placa):
        pl = re.sub(r"[^A-Z0-9]", "", str(placa or "").upper())
        for vid, v in cad.items():
            if rid and str(v.get("rastreadorId", "")) == str(rid):
                return vid, v
        for vid, v in cad.items():
            if pl and re.sub(r"[^A-Z0-9]", "", str(v.get("placa", "")).upper()) == pl:
                return vid, v
        return None, None
    paths, novos = {}, 0
    for x in veiculos:
        vid, v = acha(x["rastreadorId"], x["placa"])
        if vid:
            if x["rastreadorId"] and v.get("rastreadorId") != x["rastreadorId"]:
                paths[f"veiculos/{vid}/rastreadorId"] = x["rastreadorId"]
            if x["kmAtual"] > num(v.get("kmAtual")):
                paths[f"veiculos/{vid}/kmAtual"] = round(x["kmAtual"])
        else:
            vid = nova_chave()
            novo = {"placa": str(x["placa"] or x["rastreadorId"]).upper(), "modelo": x["modelo"], "rastreadorId": x["rastreadorId"],
                    "status": "Ativo", "tipo": "Carro", "combustivel": "Flex", "origem": "AgileSat"}
            if x["kmAtual"]:
                novo["kmAtual"] = round(x["kmAtual"])
            paths[f"veiculos/{vid}"] = novo
            cad[vid] = novo
            novos += 1
    np = 0
    for x in posicoes:
        vid, v = acha(x["rastreadorId"], x["placa"])
        if not vid:
            continue
        paths[f"posicoes/{vid}"] = {"veiculoId": vid, "lat": x["lat"], "lng": x["lng"], "velocidade": x["velocidade"],
                                    "ignicao": x["ignicao"], "endereco": x["endereco"], "dataHora": x["dataHora"][:16]}
        if x["hodometro"] > num(v.get("kmAtual")) and f"veiculos/{vid}" not in paths:
            paths[f"veiculos/{vid}/kmAtual"] = round(x["hodometro"])
        np += 1
    novas_viagens = {}
    for t in viagens:
        vid, v = acha(t["rastreadorId"], t["placa"])
        if not vid:
            continue
        tid = chave_segura(f"ag_{t['rastreadorId']}_{t['inicio']}")
        novas_viagens[tid] = {"veiculoId": vid, "motorista": v.get("motorista", ""), "inicio": t["inicio"], "fim": t["fim"],
                              "origem": t["origem"], "destino": t["destino"], "km": t["km"], "velMax": t["velMax"],
                              "paradoMin": t["paradoMin"], "fonte": "AgileSat", "pontos": t["pontos"]}
    for tid, t in novas_viagens.items():
        paths[f"viagens/{tid}"] = t
    visitas = detectar_visitas(novas_viagens, fb.get("postos"), fb.get("visitas"))
    for k, v in visitas.items():
        paths[f"visitas/{k}"] = v
    agora = int(datetime.now().timestamp() * 1000)
    resumo = f"{len(veiculos)} veículos ({novos} novos), {np} posições, {len(novas_viagens)} viagens, {len(visitas)} visitas"
    paths["config/ultimaSync"] = {"em": agora, "resumo": resumo, "origem": "GitHub Actions"}
    paths[f"logs/{nova_chave()}"] = {"ts": agora, "usuario": "Sincronização AgileSat", "acao": "Sincronizou o rastreador", "detalhe": resumo}
    fb.update(paths)
    print("OK:", resumo)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default=str(PASTA / "config.json"), help="config.json (modo arquivo/teste)")
    ap.add_argument("--teste", action="store_true", help="mostra um exemplo de cada resposta e sai")
    ap.add_argument("--arquivo", action="store_true", help="gera agilesat_export.json em vez de gravar no Firebase")
    a = ap.parse_args()

    fb = None
    if not a.arquivo and not a.teste and os.environ.get("FIREBASE_SERVICE_ACCOUNT"):
        fb = Firebase(os.environ["FIREBASE_DATABASE_URL"], os.environ["FIREBASE_SERVICE_ACCOUNT"])
        ag = fb.get("config/agilesat") or {}
        if not ag.get("baseUrl"):
            sys.exit("Configure a URL base e os endpoints no painel (Cadastros > Integração) antes de sincronizar.")
        cfg = {"base_url": ag["baseUrl"], "endpoints": ag.get("endpoints", {}), "horas": ag.get("horas", 3),
               "auth": {"type": ag.get("authType", "bearer"), "header_name": ag.get("headerName"),
                        "token": os.environ.get("AGILESAT_TOKEN", ""),
                        "usuario": os.environ.get("AGILESAT_USUARIO", ""), "senha": os.environ.get("AGILESAT_SENHA", "")}}
    else:
        cfg = json.loads(Path(a.config).read_text(encoding="utf-8"))
        if not cfg.get("base_url"):
            sys.exit("Preencha base_url no config.json (URL base da API da AgileSat).")

    veiculos, posicoes, viagens = ler_agilesat(cfg, a.teste)
    if a.teste:
        print("\nTeste concluído. Ajuste CAMPOS no script se algum nome não bater.")
        return
    if fb:
        gravar_firebase(fb, veiculos, posicoes, viagens)
        return
    saida = PASTA / cfg.get("saida", "agilesat_export.json")
    saida.write_text(json.dumps({"origem": "AgileSat", "geradoEm": datetime.now().isoformat(timespec="seconds"),
                                 "veiculos": veiculos, "posicoes": posicoes, "viagens": viagens},
                                ensure_ascii=False), encoding="utf-8")
    print(f"\nOK: {len(veiculos)} veículos, {len(posicoes)} posições, {len(viagens)} viagens -> {saida}")
    print("Importe esse arquivo no painel: Cadastros > Integração AgileSat.")


if __name__ == "__main__":
    main()
