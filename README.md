# PAINEL-FROTA

Painel de gestão da frota do Grupo Login Serv, no mesmo padrão dos painéis RH, DP e Estoque: um único `index.html` publicado no GitHub Pages, com login pelo Firebase Authentication e dados no Firebase Realtime Database (nó `painel-frota`). Os dados do rastreador AgileSat entram sozinhos por um workflow do GitHub Actions.

## Menu
São 8 módulos, com subabas no topo: **Início** · **Rastreamento** (Posição atual, Viagens e trajetos, Hodômetro) · **Combustível** (Abastecimentos, Consumo por veículo) · **Manutenções** (Próximas e vencidas, Histórico) · **Pedágios** · **Visitas a postos** (Visitas, Postos de trabalho) · **Relatórios** · **Cadastros** (Veículos, Motoristas, Integração AgileSat e importação, Sistema).

## Funciona sem a API
A integração com a AgileSat é opcional. Tudo o que vem do rastreador também pode ser lançado à mão ou por planilha:
- **Posição / check-in** do veículo (com o botão “Usar minha localização atual” no celular);
- **Leituras de KM** (Rastreamento › Hodômetro, ou “Lançar KM” na lista de veículos). O KM rodado sai da diferença entre as leituras do período: abastecimentos, manutenções, viagens e leituras;
- **Viagens** com hodômetro de saída e chegada (o KM é calculado), origem, destino e os **postos visitados**, que viram visitas registradas;
- **Visitas** com o botão “Estou no posto agora”, que pega a localização e escolhe o posto mais próximo;
- abastecimentos, manutenções, pedágios, veículos, motoristas e postos.

O painel avisa quando um veículo ativo fica mais de 15 dias sem leitura de KM.

## Funcionalidades
- **Resumo**: KM rodados, gasto com combustível, consumo médio (km/l), manutenção, pedágios, custo total e custo por km, custos por mês e desempenho por veículo. Filtro de período e de veículo em todas as telas de análise.
- **Alertas**: revisão vencida ou próxima (por km e por data), licenciamento, seguro e CNH vencendo, consumo abaixo de 90% da meta, excesso de velocidade e posto com poucas visitas.
- **Rastreamento**: última posição de cada veículo (ignição, velocidade, endereço) e as viagens com o trajeto desenhado, cerca dos postos e link para o Google Maps.
- **Combustível**: abastecimentos, preço médio por litro e consumo real × meta calculado pelo hodômetro. Lançar um abastecimento atualiza o hodômetro do veículo.
- **Manutenções**: preventivas e corretivas, plano de revisão por km e por data, agendamentos e custo por veículo.
- **Pedágios**: lançamentos, gasto por veículo e praças mais usadas; importação do extrato do Sem Parar, ConectCar ou Veloe.
- **Visitas a postos**: cada posto tem uma cerca (raio em metros). O painel e o conector cruzam o trajeto do GPS com a cerca e registram chegada, saída e permanência. Aderência = visitas realizadas ÷ esperadas (frequência semanal do posto).
- **Relatórios**: custo por veículo e por mês, exportáveis para Excel.
- **Excel**: exportação em todas as listas e importação por planilha com modelo (veículos, abastecimentos, manutenções, pedágios, viagens, postos e visitas).
- **Perfis**: Administrador, Gestor de frota, Operador e Consulta, além de log de auditoria e backup em JSON.

## Como ativar o Firebase
1. Crie o projeto no Firebase Console e ative o **Authentication** (e-mail e senha) e o **Realtime Database**.
2. Copie a configuração do app Web para a variável `firebaseConfig` no início de `src/core.js` e rode `python3 build.py`.
3. Publique as regras de `database.rules.json` em Realtime Database > Regras.
4. Crie os usuários no Authentication e cadastre cada um em `USER_ROLES` (`src/core.js`) com o perfil.

Sem a configuração, o painel roda em **modo demonstração** (senha `demo`, dados só no navegador). Em Cadastros › Sistema dá para carregar dados de exemplo para treinar a equipe.

## Integração AgileSat (automática)
A AgileSat usa a plataforma Fulltrack. A API usada é a **RESTrack** (`https://ws.fulltrack2.com`, documentação em `/apidoc/`), autenticada pelos cabeçalhos `apiKey` e `secretKey`. Ela não permite chamada direta do navegador (CORS), por isso a sincronização roda no GitHub Actions.

O workflow `.github/workflows/agilesat-sync.yml` roda `tools/agilesat_sync.py` três vezes por dia, às 8h, 12h e 17h (Brasília), lendo as últimas 26 horas. O botão “Atualizar dados do rastreador”, no topo do painel, dispara a mesma sincronização na hora (precisa de um token fine-grained do GitHub, configurado em Cadastros › Sistema) e grava no Firebase:
- **veículos** (`/vehicles/all`), casando pelo ID do AgileSat ou pela placa; hodômetro em metros, convertido para km;
- **última posição** (`/events/all`), com horários convertidos de UTC para Brasília;
- **viagens** (`/events/interval/id/{id}/begin/{ts}/end/{ts}`), com KM pelo hodômetro, velocidade máxima, tempo parado e trajeto;
- **postos de trabalho** a partir dos pontos de referência (`/referencepoints/all`). Só cria os novos, com raio de 200 m e frequência 0;
- **motoristas** (`/drivers/all`): só nome e vencimento da CNH, sem CPF nem número da CNH;
- **visitas**: posições seguidas dentro da cerca de um posto por 3 minutos ou mais.

Segredos necessários (Settings › Secrets and variables › Actions): `AGILESAT_APIKEY`, `AGILESAT_SECRETKEY` e `FIREBASE_SERVICE_ACCOUNT` (Firebase › Configurações do projeto › Contas de serviço › Gerar nova chave privada; cole o JSON inteiro).

O workflow nunca termina com erro, para não gerar e-mail de falha: o erro aparece no painel (Cadastros › Integração e alertas do Início).

Para testar no computador sem gravar nada: `AGILESAT_APIKEY=... AGILESAT_SECRETKEY=... python tools/agilesat_sync.py --teste`.

## Desenvolvimento
O código-fonte fica em `src/`. Rode `python3 build.py` para gerar o `index.html`.
