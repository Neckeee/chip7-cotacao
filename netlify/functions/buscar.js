// Busca no comprasparaguai.com.br — verificada contra o HTML real do site.
// Roda no servidor (Netlify Functions) -> sem o bloqueio de CORS do navegador.
//
// 2 modos:
//   ?q=placa mae b550        -> pesquisa: lista produtos {nome, precoUSD(menor), ofertas, link}
//   ?detalhe=/caminho_123/&lojas=nissei,mobilezone
//                            -> ofertas por loja {loja, precoUSD, nome} (filtra pelas lojas)

const LOJAS = {
  nissei:        ['nissei'],
  mega:          ['mega eletr'],       // Mega Eletrônicos / Mega Eletro
  cellshop:      ['cellshop', 'cell shop'],
  shoppingchina: ['shopping china'],
  mobilezone:    ['mobile zone'],
  atacado:       ['atacado connect'],
  visaovip:      ['visãovip', 'visaovip', 'visão vip', 'visao vip'],
  stargames:     ['star games']
};

const PRICE = /US\$(?:&nbsp;|[\s ])*([\d.]+,\d{2})/i;

function precoNum(s) {
  if (!s) return null;
  s = String(s).trim();
  if (/,\d{2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); // 1.234,56 -> 1234.56
  const n = parseFloat(s);
  return (!isNaN(n) && n > 0) ? n : null;
}
function decode(s) {
  return (s || '')
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim();
}
async function baixar(url) {
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' }
  });
  return r.text();
}

function parseBusca(html) {
  const m = html.match(/resultados-busca([\s\S]*?)(?:paginacao|<footer|rodape)/i);
  const area = m ? m[1] : html;
  const cards = area.split(/<div class="promocao-produtos-item col-sm-12"/i).slice(1);
  const out = [];
  for (const c of cards) {
    const nm = c.match(/promocao-item-nome[\s\S]*?<a[^>]*>\s*([\s\S]*?)\s*<\/a>/i);
    const pm = c.match(PRICE);
    const lk = c.match(/href="(\/[^"]+_\d+\/)"/i);
    const of = c.match(/(\d+)\s*OFERTAS?/i);
    const im = c.match(/data-src="(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i) || c.match(/data-src="([^"]+)"/i);
    const preco = pm ? precoNum(pm[1]) : null;
    if (nm && preco) {
      out.push({
        nome: decode(nm[1].replace(/<[^>]+>/g, '')),
        precoUSD: preco,
        ofertas: of ? +of[1] : 1,
        link: lk ? lk[1] : '',
        img: im ? im[1] : ''
      });
    }
  }
  return out;
}

const CORES = /(deep\s*blue|cosmic\s*orange|space\s*black|space\s*gray|sierra\s*blue|alpine\s*green|jet\s*black|rose\s*gold|product\s*red|natural\s*titanium|desert\s*titanium|preto|branco|azul|verde|vermelho|rosa|roxo|dourado|prateado|prata|cinza|chumbo|grafite|tit[âa]nio|meia.?noite|estelar|natural|deserto?|areia|coral|menta|lil[áa]s|bege|marrom|laranja|amarelo|midnight|starlight|graphite|black|white|blue|green|red|pink|purple|violet|golden|gold|silver|gray|grey|teal|orange|yellow|cosmic|titanium|space|sierra|jet|ultramarine|sky)/i;
function extrairGrade(nome) { const m = (nome || '').match(/(?:grad[eo]?|swap)\s*([a-cA-C][+\-]?)(?![a-z])/i); return m ? ('Grade ' + m[1].toUpperCase()) : ''; }
const COR_MAP = {blue:'Azul',black:'Preto',white:'Branco',silver:'Prata',gold:'Dourado',golden:'Dourado',gray:'Cinza',grey:'Cinza',red:'Vermelho',green:'Verde',pink:'Rosa',purple:'Roxo',violet:'Roxo',orange:'Laranja',yellow:'Amarelo',graphite:'Grafite',titanium:'Titânio',natural:'Natural',midnight:'Meia-noite',starlight:'Estelar',teal:'Azul',sky:'Azul'};
function corCanon(c) {
  if (!c) return '';
  c = c.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  const low = c.toLowerCase();
  if (COR_MAP[low]) return COR_MAP[low];
  return c.charAt(0).toUpperCase() + c.slice(1);
}
function extrairCor(nome) {
  if (!nome) return '';
  const parts = nome.split(/\s[-–]\s/);
  if (parts.length > 1) { const last = parts[parts.length - 1].trim(); if (last.length <= 28 && CORES.test(last)) return corCanon(last); }
  const m = nome.match(CORES); return m ? corCanon(m[1]) : '';
}
function parseDetalhe(html) {
  const blocks = html.split(/<div class="promocao-produtos-item"/i).slice(1);
  const map = {};                                    // loja|variante -> oferta mais barata
  for (const b of blocks) {
    const adv = b.match(/'advertiser':\s*'([^']+)'/);
    const pm = b.match(PRICE);
    const nm = b.match(/promocao-item-nome[\s\S]*?<a[^>]*>\s*([\s\S]*?)\s*<\/a>/i);
    const preco = pm ? precoNum(pm[1]) : null;
    if (adv && preco) {
      const loja = decode(adv[1]);
      const nome = nm ? decode(nm[1].replace(/<[^>]+>/g, '')) : '';
      const grade = extrairGrade(nome), cor = extrairCor(nome), va = grade || cor;
      const k = loja.toLowerCase() + '|' + va.toLowerCase();
      if (!map[k] || preco < map[k].precoUSD) map[k] = { loja, precoUSD: preco, variante: va, grade, cor, nome };
    }
  }
  return Object.values(map);
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json; charset=utf-8'
  };
  const p = event.queryStringParameters || {};

  try {
    // ---- MODO DETALHE: ofertas por loja ----
    if (p.detalhe) {
      let path = p.detalhe;
      if (!/^https?:/i.test(path)) path = 'https://www.comprasparaguai.com.br' + (path.startsWith('/') ? '' : '/') + path;
      if (!/comprasparaguai\.com\.br/i.test(path)) {
        return { statusCode: 400, headers, body: JSON.stringify({ erro: 'Link inválido.' }) };
      }
      const html = await baixar(path);
      const ofertas = parseDetalhe(html).sort((a, b) => a.precoUSD - b.precoUSD);  // todas; filtro de loja é no cliente
      const nome = (html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) || [])[1] || '';
      const img = (html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) || [])[1] || '';
      return { statusCode: 200, headers, body: JSON.stringify({ ofertas, total: ofertas.length, nome: decode(nome), img, link: path }) };
    }

    // ---- MODO BUSCA: lista de produtos ----
    const q = (p.q || '').trim();
    if (!q) return { statusCode: 400, headers, body: JSON.stringify({ erro: 'Informe o que pesquisar (q).' }) };
    const urlBusca = 'https://www.comprasparaguai.com.br/busca/?q=' + encodeURIComponent(q);
    const html = await baixar(urlBusca);
    const itens = parseBusca(html).slice(0, 30);   // ordem de relevância do site
    return { statusCode: 200, headers, body: JSON.stringify({ itens, urlBusca }) };

  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ erro: String(e) }) };
  }
};
