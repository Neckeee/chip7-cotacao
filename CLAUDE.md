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
  senão o celular da equipe continua com a versão velha. Hoje: **v85**.
- Dados em `localStorage`, com sync opcional no Firebase (conta compartilhada).
- PDF com jsPDF + jsPDF-autotable, **já embarcados**. Não adicionar biblioteca nova.
- **Cabeçalho dos PDFs = `pdfCabecalho()`** (orçamento, câmera, reparo, taxas; a
  garantia tem o seu, que copia o `.doc`). ⚠️ **Usa a logo RETANGULAR
  (`logo-garantia.png`) sobre fundo BRANCO.** Antes cada PDF desenhava uma faixa
  azul-escura com a `logo-chip7.png` (redonda, **fundo azul-escuro**): o círculo se
  fundia na faixa e virava uma mancha com borda verde — era o "PDF esquisito" que a
  loja reclamou (ago/2026). Bônus: o orçamento caiu de **108 KB → 19 KB**.
  **Nunca pôr logo redonda em faixa escura de novo.**
- Funções Netlify em `netlify/functions/`: `buscar.js` (comprasparaguai),
  `mazer.js` e `guarapuava.js` (fornecedores BR, login em env var **no Netlify**,
  nunca no código).
- O botão "Resumo feito por IA" **não chama IA nenhuma** — é texto montado por regra
  em `resumoIAtexto()`. Não existe chamada de LLM no app e não é pra existir agora.
- **Dólar — atualiza sozinho.** `dolarInit()` roda ao abrir a cotação e a cada
  pesquisa; `DOLAR_CACHE` segura 10 min pra não martelar a API. O ↻ (`dolarForcar`)
  força a busca **e sai do modo manual**.
  - **O PADRÃO é o dólar do COMPRAS PARAGUAI** (`dolarCP`, tipo `cp`) — é a cotação
    que o próprio site usa pra converter os preços, então é a que faz o orçamento
    bater com o que a loja paga. Sai na home: `Dólar hoje: <strong>R$ 5,28</strong>`.
    Vem da função Netlify (`?dolar=1`) e cai no proxy CORS se ela não existir.
    ⚠️ **Comercial e turismo NÃO servem de padrão** — dão valores diferentes
    (em ago/2026: CP 5,28 · comercial 5,18 · turismo 5,55). Ficam só de comparação.
  - **Tipos, escolhidos por chip** (`chip7_dolar_tipo`, sincronizado): `cp` (padrão)
    · `com` = comercial (USD-BRL *bid*) · `tur` = turismo (USD-BRLT ***ask***).
    Os três aparecem na tela com o valor, então dá pra comparar.
  - ⚠️ **O ↻ tinha DOIS defeitos** (relatados ago/2026, ambos corrigidos): o
    `onclick` chamava `buscarDolar()` **sem argumento**, então `forcar` era
    `undefined` e o cache de 10 min segurava; e `dolarAplica()` sobrescrevia com o
    valor manual, então quem digitasse uma vez ficava preso pra sempre. **Botão que
    "não faz nada" = confira se ele está furando o cache E saindo do modo manual.**
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
Reparo de celular · Calcular Taxas · **Garantia** · **Etiquetas** · **Pedidos** · **Licenças** · Histórico.

### 🏷️ Etiquetas de OS (`etiquetasScreen`)
Folha de numeração de OS, **medida do `MODELO ETIQUETAS OS.docx` da loja**
(twips ÷ 20 = pt): A4 · margem sup **38,25pt**, lateral **22,7pt** · **7 colunas**
de 78,6pt · linha **42,55pt** (`hRule=exact`) · fonte **14pt** · **sem borda**
(`tblBorders` todas `none`) → **126 por folha** (18×7). O modelo ia de `OS 16754`
a `OS 16879` — o app reproduz isso exatamente (conferido: 126 células, mesmos
extremos, mesmas coordenadas). Passou de 126, abre outra folha.
`chip7_etq_ultima` guarda a última impressa pro botão "continuar de onde parei".

### 🛍️ Pedido a fornecedor (`pedidosScreen`)
"Tela de consulta maior no computador" (pedido da loja, ago/2026): **foto grande à
esquerda (sticky) + grade de miniaturas à direita**, filtrando por fornecedor. A
partir de 900px vira 2 colunas com a grade rolando sozinha; no celular empilha.
- Reaproveita `fornecedorPesquisa()` (catálogo + Mazer + Guarapuava) — **não** tem
  busca própria. Os fornecedores do chip saem de `catLoad()` + Mazer/Guarapuava.
- As fotos entram **depois** da grade aparecer (`pedBuscarFotos`, teto de 25) pra
  não travar a lista esperando a rede.
- Fecha nos dois lados que a loja pediu: **`pedWhatsApp`/`pedCopiar`** manda a lista
  pro fornecedor (agrupada por fornecedor) e **`pedParaOrcamento`** joga os itens no
  `COT_CART` já com lucro de 30% e parcelamento. Item **sem preço não vai** pro
  orçamento (não dá pra calcular venda sem custo) — e o toast diz quantos ficaram.

### 🔑 Licenças de antivírus (`licencasScreen`)
Caso real: a loja compra **30 licenças = 3 chaves de 10 ativações**. Cada **lote**
tem chave, tipo (predefinições Kaspersky em `LIC_TIPOS`), nº de vagas e validade em
meses; cada **vaga** anota cliente, OS e a data em que foi instalada.
- ⚠️ **O vencimento é DO LOTE e conta da PRIMEIRA ativação** (`licPrimeiraAtivacao`
  pega a menor data preenchida) — é assim que chave multi-dispositivo do Kaspersky
  funciona: o relógio começa quando a primeira máquina ativa, **não** na compra nem
  em cada instalação. Se alguém preencher uma data mais antiga depois, o vencimento
  **recalcula** (testado). `venceManual` sobrepõe, pra licença que conte diferente.
- `licSomaMeses` tem trava de fim de mês: 29/02/2024 +12m = 28/02/2025, 31/03 +1m =
  30/04 (não escorrega pro mês seguinte).
- Reduzir o nº de vagas **avisa** antes de apagar linha já preenchida.
- `licSetAtiv` re-renderiza **só o resumo e o cabeçalho**, não a lista inteira —
  re-render completo a cada tecla tirava o foco do campo enquanto se digitava.
- Sincroniza (`cloudSaveLic` + `cloudSubscribeRep`, doc `cotacoes/licencas`): sem
  isso dois vendedores usariam a mesma ativação sem saber.

### Menu agrupado (`#chooser`)
Os 9 módulos ficam em **3 grupos** com título (`.wel-grupo`), a pedido da loja
(ago/2026): **💰 Cotação de valores** (cotar, montar PC, celulares, câmeras, taxas)
· **🩺 Atendimento** (diagnóstico, reparos) · **📋 Operacional** (garantia, etiquetas).
⚠️ Os títulos são **só do `#chooser`** — a tela `#welcome` (2 botões, Funcionário /
Cliente) compartilha `.wel-choice`/`.wel-card` e **não pode** ganhar título nenhum.

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

## Fornecedores — o que cada um deixa fazer (medido em ago/2026)

| Fornecedor | Preço | Foto | Como |
|---|---|---|---|
| Mazer | login | via função | `mazer.js` (env var no Netlify) |
| Guarapuava | login | via função | `guarapuava.js` (env var) |
| Fagundez | público | **público** ✅ | Magento, `catalogsearch/result/?q=` |
| **FAM Brasil** | login | **público** ✅ | OpenCart, `index.php?route=product/search&search=` |
| **BringIT** | **planilha** ✅ | — | tabela de preço `.xlsx` → importador do catálogo |
| **HPrime** | login | ❌ | **SPA**: o HTML vem com 2,7 KB e zero produto |

- **FAM Brasil** (`mrcheckout.or01.futurasistemas.com.br`): o preço exige login, mas
  **busca, nome e foto são públicos** → flag `fotoPublica:true` no `SUPPLIER_SITES`
  libera o `buscarFotoFornecedor` mesmo com `login:true`.
  ⚠️ A foto vem em **`data-src`** (lazy load) e o `src` do `<img>` vem **vazio** —
  parser que só olha `src` volta de mãos abanando. O `parseFotoHTML` procura
  `Img_ftr_rp_<id>` primeiro, de propósito.
- ⚠️⚠️ **`fotoEhLogo()` — busca sem resultado devolve 200 com a página do site**, e o
  fallback do `parseFotoHTML` pegava o **LOGO** achando que era o produto. O catálogo
  encheria de logo e ninguém veria, porque "tem imagem". Conferido: `pelicula` (que a
  FAM não vende) devolvia o logo; agora devolve vazio. **Voltar vazio > voltar errado.**
- **BringIT**: entra pela **planilha de preço**. O `mapearPlanilha` já acerta as
  colunas dela sozinho (`Produto`→nome, `Valor`→preço) — conferido com a tabela real
  de 2.389 itens. Não precisa de função nova.
- **HPrime**: é aplicativo JavaScript (Meus Pedidos). Raspar HTML **não funciona** —
  precisaria da API da plataforma ou navegador headless. Não tentar com `fetch`.

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
- **Mercado Livre = link, NÃO API.** ⚠️ Testado em ago/2026 com credencial oficial
  do ML (app criada, `client_credentials`, **token válido de 6h**): `/sites/MLB/search`
  **403** · `/products/search` **403** · `/users/me` **403** · `/items/{id}` **403**.
  Só `/categories/{id}` (estático) responde 200. **O ML fechou a busca de propósito**,
  pra impedir coleta de preço — a `search_products` foi descontinuada. Scraping também
  não vai: `lista.mercadolivre.com.br` devolve a página `suspicious-traffic` pra proxy.
  **Não perca tempo tentando de novo sem aprovação comercial do ML.**
  O que existe é `COT_ML` (chip "🛒 Comparar no Mercado Livre", padrão DESLIGADO,
  sincronizado): ligado, põe um botão `🛒 ML` em cada produto que **abre a busca do ML
  numa aba**, já ordenada do mais barato (`_OrderId_PRICE` no fim da URL).
- ⚠️ **Preço por loja (detalhe) — NÃO usar `promocao-produtos-item` nem `'advertiser'`
  solto.** Esses são os **PRODUTOS RELACIONADOS** (acessórios, "goma" de US$ 0,25) e
  o `'advertiser'` aparece em todo botão (100+/página). Isso puxava o preço de OUTRO
  produto como "menor preço" (bug relatado ago/2026: iPhone colava por sorte porque
  os relacionados eram outros iPhones; "Fonte Psvita" virava US$ 0,25 de uma goma).
  A oferta REAL é o botão "ver na loja": gtag **`external_website_advertiser`** com
  `'advertiser'`+`'product'`, e o **1º `US$` que segue** é o preço. É o que
  `cpParseDetalhe` (cliente) e `parseDetalhe` (`buscar.js`) usam agora — mesmo regex
  nos dois. Se o site mudar o nome do evento, o parser devolve 0 ofertas (degrada
  limpo) em vez de valor errado.

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

   **Lote jul/2026 (2ª rodada de pedidos da loja):**
   - Título virou **VENDA** (era "RECIBO"). Logo **à esquerda**, dados da loja ao
     lado na mesma linha (`gp-cb` é flex; no PDF a logo é 92×52pt em x=M).
   - **Produtos viraram lista** (`GAR_PRODS`, `garProdRender/Add/Del/Set`): cada um
     com descrição, quantidade e valor unitário; total por linha e **TOTAL geral**
     calculados. Cabe ~15 produtos numa folha.
   - **Pagamento com valor por forma**: `garPagoBox` = checkbox + input de R$ por
     método; `garPagoSel` devolve `[{m,v}]`; `garPagoTexto` imprime `(X) Débito R$ …`.
   - **Vendedor responsável** editável (`garVendedor`), default = usuário logado.
   - **Removidos do lado do cliente**: as duas inscrições estaduais e a "Fatura".
     A linha virou NATUREZA | CFOP | VENDEDOR. O EMITENTE mantém a IE dele.
   - **CPF/CNPJ e telefone com máscara ao vivo** (`formatDocMask`, `formatPhoneBR`).
   - **Uma folha só, e agora OCUPANDO a folha** (`garMontarPDFCheio`, ago/2026):
     desenha, mede onde terminou e redesenha na escala certa (`GAR_ESC`; a fonte
     cresce só ~55% do que a altura cresce). Antes usava 66% da página e sobravam
     ~10cm em branco; agora fica em 92–98% de 1 a 25 produtos.
     ⚠️ **Também ENCOLHE quando não cabe** — o jsPDF **não quebra página sozinho**:
     antes, com ~18 produtos, o rodapé saía pra fora do papel e o cliente recebia o
     documento cortado, sem erro nenhum. `getNumberOfPages()` continuava dizendo 1.
     **Pra saber se cabe, meça o Y final (`doc.__fim`), não conte páginas.**
   - Histórico/`garReabrir` aceitam o formato antigo (equip string, pago string[]).

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
