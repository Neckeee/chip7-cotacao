# Diagnóstico Chip7

Ferramenta interna de balcão e de visita técnica da **Chip7 Tecnologia e Inovação**
(São Mateus do Sul/PR). **É produção** — a equipe usa na frente do cliente, no
computador da loja e no celular em visita. Não é protótipo, não é site
institucional.

Leia `CONTEXTO.md` para quem usa e por quê. Este arquivo é o mapa do código.

## Como é por dentro

- **`index.html` é o app inteiro** (~5.855 linhas): HTML + CSS + JS vanilla no mesmo
  arquivo. Sem framework, sem build, sem node_modules. **É proposital** — quem mantém
  é uma pessoa só, e um arquivo só é o que dá pra manter. Não "modernizar" isso.
- PWA instalável, roda no Netlify. Deploy = subir os arquivos no GitHub (repo
  `chip7-cotacao`); o Netlify auto-deploya.
- **`sw.js` tem a versão do cache (`chip7-diag-vN`) — suba o N a cada release**,
  senão o celular da equipe continua com a versão velha. Hoje: **v76**.
- Dados em `localStorage`, com sync opcional no Firebase (conta compartilhada).
- PDF com jsPDF + jsPDF-autotable, **já embarcados**. Não adicionar biblioteca nova.
- Funções Netlify em `netlify/functions/`: `buscar.js` (comprasparaguai),
  `mazer.js` e `guarapuava.js` (fornecedores BR, login em env var **no Netlify**,
  nunca no código).
- O botão "Resumo feito por IA" **não chama IA nenhuma** — é texto montado por regra
  em `resumoIAtexto()`. Não existe chamada de LLM no app e não é pra existir agora.
- **Dólar — atualiza sozinho.** `dolarInit()` roda ao abrir a cotação e a cada
  pesquisa; `DOLAR_CACHE` segura 10 min pra não martelar a API. O ↻ força
  (`buscarDolar(true)`).
  - **Dois tipos, escolhidos por chip** (`chip7_dolar_tipo`, sincronizado):
    `com` = **comercial** (USD-BRL *bid*, o valor cotado) · `tur` = **turismo**
    (USD-BRLT ***ask***, a venda na casa de câmbio — é o que se paga de verdade pra
    ter dólar na mão). Os dois aparecem na tela com o valor, então dá pra comparar.
  - `manual` = alguém digitou. Fica salvo em `chip7_dolar` (com quem e quando),
    **sincroniza pra equipe** e o automático **para de sobrescrever** até tocarem
    num chip. Foi pedido explícito: o dono às vezes tem um dólar que nenhum feed dá.
  - ⚠️ **Nunca usar `economia.awesomeapi.com.br/last/USD-BRL`** (sem "json"): em
    jul/2026 ficou **congelado 6 dias** (devolvia 16/07 no dia 22 → 5,11 com o
    mercado em 5,07) e ninguém viu, porque nada na tela mostrava a data. O
    **`/json/last/USD-BRL,USD-BRLT` traz os dois ao vivo numa chamada**. Trocou de
    endpoint? **Confira o `create_date`** — foi o que denunciou o feed morto.
  - Reserva: PTAX do Banco Central (`dolarPTAX`). É o comercial oficial, mas é
    **fechamento** e só sai em dia útil ~13h — não serve pra dólar de agora.

## Módulos (tela `chooser`, função `irModulo`)

Cotação (importados PY) · Diagnóstico · Montar PC · Celulares · Câmeras ·
Reparo de celular · Calcular Taxas · **Garantia** · Histórico.

**Quem vê o quê:** funcionário vê tudo; cliente tem acesso só de leitura ao
relatório do diagnóstico dele. **Se a tela tem custo, margem, taxa ou fornecedor,
é tela de funcionário.**

## Onde ficam as coisas no index.html

| O quê | Linha |
|---|---|
| CSS da tela inicial / chooser (`.wel-card`, `.wel-choice`) | ~174 |
| CSS do switch de maquininha + editor de taxas | ~232 |
| CSS da pré-visualização da garantia (`.gar-prev`, `.gp-*`) | ~322 |
| HTML do `chooser` (botões dos módulos) | ~736 |
| HTML do `taxasScreen` (+ editor de taxas) | ~1036 |
| HTML do `garantiaScreen` | ~1068 |
| `CHIP7` — dados da loja (nome, CNPJ, endereço, contato) | ~1496 |
| `showChooser()` / `escolherDiagnostico()` / `irModulo()` / `marcarTela()` | ~3039–3075 |
| `LOJAS_PY` — lojas do Paraguai (checkbox) | ~3089 |
| `TAXAS_CARTAO` + `MAQS_PADRAO` — **padrão de fábrica das taxas** | ~3149 |
| `maqCfgLoad()` / `maqCfgSave()` / `let MAQS` | ~3160–3170 |
| `refreshMaqUI()` | ~3204 |
| Editor de taxas (`maqAbrirCfg` e cia.) | ~3218 |
| `GAR_LOJA` — **dados fixos + textos do certificado de garantia** | ~3300 |
| Garantia (`escolherGarantia`, `garMontarPDF`, histórico) | ~3322 |
| `LOJAS_TERMOS` — **apelidos que filtram as lojas de verdade** | ~4132 |
| Firebase (config, sync, `PREF_KEYS`, `marcaLocal`) | ~5530–5715 |
| `USUARIOS` — login (gate client-side) | ~5808 |

## Convenções — quebrar isso quebra o app

### 1. Telas são `div` com a classe `show`

Cada módulo tem `escolherX()` que liga o `show` da tela dele e desliga o do chooser.
**Uma tela nova precisa entrar em QUATRO listas** — se esquecer de uma, a tela
fica presa e o usuário não sai dela:

1. `showChooser()` — o que esconder ao voltar pro menu
2. `escolherDiagnostico()` — idem
3. `irModulo()` — idem, e registrar o módulo no `if/else`
4. o `overlay` do `popstate` — pro botão voltar do celular

`marcarTela()` empilha estado no history pro botão voltar do celular navegar dentro
do app. Toda tela nova chama.

### 2. Padrão load/save

```js
function xLoad(){ try{ return JSON.parse(localStorage.getItem('chip7_x')||'[]'); }catch(e){ return []; } }
function xSave(a){
  if(typeof marcaLocal==='function')marcaLocal('x');      // anti-eco: ignora snapshot atrasado da nuvem
  try{ localStorage.setItem('chip7_x',JSON.stringify(a)); }catch(e){}
  if(typeof cloudSaveX==='function')cloudSaveX(a);        // guardado: pode não existir ainda
}
```

`marcaLocal()` é o que evita "o item some do carrinho" — mudança local recente
ignora o snapshot atrasado do Firebase. Não remova.

### 3. Taxa de maquininha passa TUDO por `maqTaxa()` / `maqBand()` / `maqMax()`

Nunca leia `MAQS` direto pra calcular preço, e **nunca escreva número de taxa no
código**. Os únicos números de taxa ficam em `TAXAS_CARTAO` / `MAQS_PADRAO`
(padrão de fábrica).

- `MAQS_PADRAO` = fábrica (código).
- `MAQS` = o que roda = `chip7_maq_cfg` do localStorage, ou a fábrica se não houver.
  **Salva inteiro, não mescla** — senão máquina removida voltava do padrão.
- Depois de qualquer mudança: **`refreshMaqUI()`** (redesenha os switches e os
  selects de parcela da cotação, câmera, taxas e reparo).
- Fórmula do repasse: **`precoComTaxa(v,tx) = v/(1-tx/100)`** — dividir, não
  multiplicar. Você recebe o líquido cheio; a taxa incide sobre o total cobrado.

### 4. Filtro das lojas do Paraguai mora em DOIS lugares no index.html

- `LOJAS_PY` — só desenha o checkbox.
- **`LOJAS_TERMOS` — é quem filtra** (`o.loja.toLowerCase().includes(termo)`).

Loja nova precisa das duas. Só no `LOJAS_PY` = checkbox que não filtra nada.
Os apelidos têm que bater com o texto **exato** que o comprasparaguai imprime em
`'advertiser'`.

> A tabela `LOJAS` do `buscar.js` **está sem uso** — o filtro é no cliente desde que
> `parseDetalhe` passou a devolver todas as ofertas. Mantida em sincronia por
> segurança, mas quem manda é o `LOJAS_TERMOS`.

### 5. Busca de importados: paginação + filtros por spec

- **Paginação do comprasparaguai**: o site devolve **20 por página**.
  ⚠️ **Termo de categoria (ex.: "notebook") REDIRECIONA** pra `/notebook/` e pagina
  por `/notebook/?page=N` — o `&page` no `/busca/?q=` é **ignorado** (volta pág. 1).
  A **`canonical`** da pág. 1 dá a base certa. Isso vale nos DOIS lados: `buscar.js`
  (servidor, puxa até 10 pág = 200 itens em paralelo) e o fallback do `cpPesquisa`
  (navegador via proxy, até 5 pág = 100). Sempre **dedup por link**.
- **Filtros vêm do NOME do produto** (`cpSpecs`): RAM (`Memória NGB`), SSD/armazenam.
  (`SSD/HD/UFS NGB|TB`, ou o GB solto do celular), processador. `renderProdutos`
  monta os chips só pras dimensões que **variam** no resultado (`cotBarraFiltros`),
  aplica em `cotItensFiltrados` e **pagina no cliente** 20/página (`cotPaginador`).
- **Acessório escondido por padrão** (`CP_RE_ACES`: capa, película, cabo, peça de
  reposição, speaker, estuche…). Toggle "Mostrar acessórios (N)" liga. Foi o que
  resolveu "coloco iphone 13 pro e vem coisa que não quero".
- `COT_SITE_TOTAL` guarda o total do site; se for maior que o baixado, aparece o
  aviso "São X no site; use os filtros".
- ⚠️ `htmlProdHit(i, COT_HITS.indexOf(i))` — o índice do onclick é a posição REAL em
  `COT_HITS` (não na página filtrada), senão `verOfertas`/`toggleFav` abrem o errado.

## O que foi feito agora (jul/2026)

1. **Layout no computador** — `#chooser` abre em **3 colunas** a partir de 900px
   (card 430→720px). Escopado em `#chooser` de propósito: `.wel-choice`/`.wel-card`
   são compartilhados com a tela `#welcome`, que tem **2 botões** e continua em 2
   colunas/430px. Mexer neles solto esticaria a tela inicial e deixaria buraco no
   grid. As outras telas já tratam desktop (`.cot-wrap` tem breakpoint em 860px).

2. **Taxas editáveis pela interface** — `TAXAS_CARTAO`/`MAQS` viraram
   `MAQS_PADRAO` (fábrica) + `chip7_maq_cfg` (localStorage) por cima, sincronizado
   via `PREF_KEYS`/`cloudSavePrefs()`. Editor em **Calcular Taxas → ⚙️**: escolhe
   máquina e bandeira, edita a % de cada parcela, o débito e o máx. de parcelas,
   adiciona e remove máquina, e restaura a fábrica (com confirmação).
   Fica em card separado atrás de um botão — **quem calcula no balcão não esbarra
   na edição**. `maqPref()`/`maqBand()`/`maqMax()` ganharam fallback: remover a
   maquininha ativa cai na primeira que existir em vez de quebrar. Não dá pra
   remover a última.

3. **Top Deck na cotação** — a loja **existe** no comprasparaguai e é ofertante
   (conferido ao vivo: aparece num switch TP-Link junto com Nissei, Cellshop e
   Mega). **Só precisou entrar no filtro, não precisa de função própria.**
   ⚠️ O nome real no site é **"Topdek Informática"** — com **K**, sem espaço. O
   apelido é `topdek`. `'top deck'`/`'topdeck'` não casam com nada.
   É loja de **informática** (pen drive, adaptador, cartucho, switch), não aparece
   em iPhone.

4. **Módulo Recibo/Garantia** (`garantiaScreen`) — pré-visualização ao lado do
   formulário, gerar PDF, imprimir e histórico (`chip7_gar_hist`) pra reimprimir
   sem redigitar. Arquivo sai como `Garantia_NomeDoCliente_ddmmaaaa.pdf`. Não gera
   sem cliente, produto e prazo.

   **O PDF é cópia 1:1 do modelo da loja** (o `.doc` "CERTIFICADO DE GARANTIA",
   que na verdade é um RECIBO/GARANTIA): mesmos quadros, mesma ordem, mesmos
   textos. `garMontarPDF()` redesenha o formulário linha por linha com
   `garLinhaPDF()`.

   **Decisões da loja (jul/2026 — não mudar sem perguntar):**
   - **O formulário só edita CLIENTE, DATA, PRODUTO, TEMPO DE GARANTIA e
     FORMA DE PAGAMENTO.** Loja (EMITENTE), CFOP, natureza da operação e termos
     são fixos no `GAR_LOJA` e **não vão pra tela**.
   - **Forma de pagamento** (`garPagoBox`/`garPagoSel`/`garPagoTexto`): checkbox,
     **aceita mais de uma** (ex.: entrada no Débito + resto no Crédito). Marca
     `(X)` nas escolhidas, o resto fica `( )` como o modelo em branco.
   - **Troca**: marcar "Troca total" ou "Troca parcial" abre dois campos — o que
     entrou no negócio e quanto foi avaliado. Eles caem na linha
     **INFORMAÇÕES TROCA / VALOR**, que já existe no modelo. `garValorTxt()`
     formata número como R$ e deixa texto livre passar ("a combinar").
   - O histórico antigo guardava `pago` como string; `garReabrir` aceita string
     ou lista pra não quebrar garantia emitida antes.
   - **Os outros quadros de recibo saem no papel, mas em branco**: nº,
     SAÍDA/ENTRADA (o X fica no SAÍDA como no modelo), Fatura, vendedor,
     informações troca, valor, quantidade. Valor unitário/total saem só com o
     "R$", igual ao modelo em branco. A loja preenche à mão se precisar.
   - ⚠️ **O bloco da loja é o CABEÇALHO do Word — vai no TOPO da página**, não no
     rodapé. (Dump de texto do `.doc` joga ele no fim e engana; conferido via
     `Sections.Headers`.) `GAR_LOJA.cabecalho`.
   - **Prazo em meses, campo livre** — não é dropdown de dias, e **não existe
     cálculo de vencimento**: o modelo não tem esse campo e a loja não quis
     ("a data de compra já está no documento").
   - **Endereço é o do app** (`CHIP7`), não o do `.doc` — o modelo estava velho
     ("CHIP7 NOTEBOOKS / Rua João Gabriel Martins, 467"). Confirmado com a loja.
   - **Os textos das cláusulas são cópia literal do modelo**, inclusive o typo
     "sendo está contada". É documento assinado pelo cliente: **não reescrever,
     não corrigir, não inventar cláusula.** Só `{MESES}` é variável.
   - Endereço, município e UF do cliente já vêm com "São Mateus do Sul"/"PR" —
     **é assim que o modelo em branco vem**, e são editáveis.
   - ⚠️ A pré-visualização (HTML) e o PDF (jsPDF) são **dois renderizadores**.
     Mexeu num, confira o outro. Os rótulos **não** levam `text-transform` porque
     "Fatura" e "Vendedor responsável:" são caixa mista no modelo.
   - **`logo-garantia.png` foi extraída do próprio `.doc` da loja** (JPEG embutido
     no offset 21073, 1280×720). É **diferente** da `logo-chip7.png` do app — aquela
     é redonda, esta é retangular 16:9, e é a que o documento usa. Vai no topo em
     114×64pt, do jeito que o Word põe. Entra no PDF como **JPEG** (`garLogoCarrega`
     converte): em PNG o arquivo dava 272 KB, em JPEG dá 26 KB — e isso é PDF que
     vai por WhatsApp. Está no `ASSETS` do `sw.js`.

     > Como foi extraída, se precisar de novo: o `.doc` é OLE binário; achar a
     > assinatura `FF-D8-FF` (JPEG) nos bytes e cortar até `FF-D9`. **O Word desta
     > máquina trava em qualquer exportação** (XPS/HTML/docx/PDF), então não conte
     > com COM pra isso. Cuidado: `` `u{...} `` **não existe no PowerShell 5.1** —
     > uma busca de assinatura escrita assim falha silenciosamente e faz parecer
     > que não há imagem nenhuma. Use `[BitConverter]::ToString` e procure no hex.

## Segurança — dívida conhecida

`index.html` ~5253 tem `FIREBASE_TEAM_EMAIL` / `FIREBASE_TEAM_PASS` **em texto
puro**. É código do cliente: **qualquer um que abra o site e veja o fonte lê essa
senha.** (A `apiKey` do lado é pública por natureza e não é problema.) O `USUARIOS`
(~5523) é gate de UI, não é segurança.

Não bloqueia nada hoje, mas **este repositório carrega essa credencial** — cuidado
ao compartilhar. O caminho certo é regra de segurança no Firebase, não esconder a
senha.

## Ao mexer aqui

- **Leia o `index.html` inteiro antes de escrever.** É grande, mas é um arquivo só
  e tudo está interligado pelas convenções acima.
- Não refatorar o que já funciona. Manter o padrão que já está lá.
- Se faltar informação, **perguntar antes de inventar**.
- Testar servindo a pasta e abrindo no navegador. **Não logar com a conta real no
  preview** pra não escrever na nuvem da equipe (o Firebase é restrito por domínio,
  então em localhost ele já não conecta — `cloud.on` fica `false`).
- Subir o `sw.js` de versão a cada release.
