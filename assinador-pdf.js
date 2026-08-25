/* =====================================================================
   ASSINADOR DE PDF (100% no navegador, sem serviço externo)
   ---------------------------------------------------------------------
   O usuário posiciona uma imagem PNG de assinatura sobre o PDF
   (arrastar / redimensionar, multi-página) e o módulo devolve os bytes
   do PDF carimbado. Nada sai do navegador.

   Requisitos (carregar ANTES deste arquivo):
     <script src="libs/pdf-lib.min.js"></script>   (carimbar   - MIT)
     <script src="libs/pdf.min.js"></script>       (visualizar - Apache-2.0)
     <script>pdfjsLib.GlobalWorkerOptions.workerSrc='libs/pdf.worker.min.js';</script>

   Uso:
     AssinadorPDF.abrir({
       pdfBytes:      Uint8Array,          // o PDF original
       assinaturaPng: Uint8Array,          // PNG (fundo transparente)
       pagina:        'ultima',            // ou um número (1 = primeira)
       caixa: { largura:180, margemInferior:54, margemDireita:40 }, // inicial, em pontos
       textos: { titulo:'Posicione a assinatura', confirmar:'Confirmar e assinar' },
       onAssinado: function(bytes, info){ ... },  // Uint8Array do PDF assinado
       onCancelar: function(){ ... }              // opcional
     });
   info = { pagina, x, y, largura, altura }  (em pontos, origem embaixo-esquerda)
   ===================================================================== */
(function(){
  'use strict';

  var POS = { busy:false, sessao:0, doc:null, pdfBytes:null, sigBytes:null, sigUrl:null, sigRatio:0.4,
              page:1, npages:1, scale:1, pageW_pt:612, pageH_pt:792, pageRot:0, opts:null };

  var CSS = ''+
    '.asspdf-modal{position:fixed;inset:0;background:rgba(20,26,38,.78);display:none;flex-direction:column;z-index:99990;font-family:system-ui,Segoe UI,Arial,sans-serif}'+
    '.asspdf-modal.on{display:flex}'+
    '.asspdf-bar{background:#fff;padding:10px 14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;border-bottom:2px solid #2c3646}'+
    '.asspdf-bar b{color:#1d2735;font-size:14px}'+
    '.asspdf-bar .asspdf-dica{color:#6b7686;font-size:12px}'+
    '.asspdf-nav{display:flex;align-items:center;gap:6px;font-size:13px;color:#1d2735}'+
    '.asspdf-nav button{border:1px solid #d8dee8;background:#f5f7fa;border-radius:8px;padding:4px 10px;font-weight:700;cursor:pointer}'+
    '.asspdf-btn{border:0;border-radius:9px;padding:10px 16px;font-weight:700;font-size:14px;cursor:pointer}'+
    '.asspdf-btn.ok{background:#1f7a4d;color:#fff}'+
    '.asspdf-btn.cancel{background:#e8ecf2;color:#1d2735}'+
    '.asspdf-btn:disabled{opacity:.5;cursor:default}'+
    '.asspdf-palcoWrap{flex:1;overflow:auto;display:flex;justify-content:center;align-items:flex-start;padding:16px}'+
    '.asspdf-palco{position:relative;box-shadow:0 6px 30px rgba(0,0,0,.5);background:#fff;touch-action:none}'+
    '.asspdf-palco canvas{display:block}'+
    '.asspdf-drag{position:absolute;left:0;top:0;cursor:move;border:1.5px dashed #d97a1e;background:rgba(217,122,30,.07);touch-action:none}'+
    '.asspdf-drag img{width:100%;height:100%;display:block;pointer-events:none;-webkit-user-drag:none}'+
    '.asspdf-rez{position:absolute;right:-8px;bottom:-8px;width:18px;height:18px;background:#d97a1e;border:2px solid #fff;border-radius:50%;cursor:nwse-resize;box-shadow:0 1px 4px rgba(0,0,0,.4)}';

  function montarDOM(){
    if (document.getElementById('asspdfModal')) return;
    var st=document.createElement('style'); st.textContent=CSS; document.head.appendChild(st);
    var d=document.createElement('div'); d.className='asspdf-modal'; d.id='asspdfModal';
    d.innerHTML=
      '<div class="asspdf-bar">'+
        '<b id="asspdfTitulo">Posicione a assinatura</b>'+
        '<span class="asspdf-dica">arraste para mover &middot; bolinha laranja redimensiona</span>'+
        '<span class="asspdf-nav" id="asspdfNav"></span>'+
        '<span style="flex:1"></span>'+
        '<button class="asspdf-btn cancel" id="asspdfCancelar" type="button">Cancelar</button>'+
        '<button class="asspdf-btn ok" id="asspdfConfirmar" type="button">Confirmar e assinar</button>'+
      '</div>'+
      '<div class="asspdf-palcoWrap"><div class="asspdf-palco" id="asspdfPalco">'+
        '<canvas id="asspdfCanvas"></canvas>'+
        '<div class="asspdf-drag" id="asspdfDrag"><img id="asspdfImg" alt=""><span class="asspdf-rez" id="asspdfRez"></span></div>'+
      '</div></div>';
    document.body.appendChild(d);
    document.getElementById('asspdfCancelar').addEventListener('click', function(){ fechar(true); });
    document.getElementById('asspdfConfirmar').addEventListener('click', confirmar);
    ligarArrasto();
  }

  /* arrastar / redimensionar (mouse + toque) */
  function ligarArrasto(){
    var mode=null,sx=0,sy=0,ox=0,oy=0,ow=0;
    function P(e){ return e.touches?e.touches[0]:e; }
    function start(e,m){ mode=m; var p=P(e); sx=p.clientX; sy=p.clientY;
      var d=document.getElementById('asspdfDrag'); ox=d.offsetLeft; oy=d.offsetTop; ow=d.offsetWidth;
      e.preventDefault(); e.stopPropagation(); }
    function move(e){ if(!mode) return; var p=P(e), dx=p.clientX-sx, dy=p.clientY-sy;
      var d=document.getElementById('asspdfDrag'), cv=document.getElementById('asspdfCanvas');
      if(mode==='drag'){
        d.style.left=Math.max(0,Math.min(ox+dx,cv.width-d.offsetWidth))+'px';
        d.style.top =Math.max(0,Math.min(oy+dy,cv.height-d.offsetHeight))+'px';
      } else {
        var w=Math.max(30,ow+dx); w=Math.min(w,cv.width-d.offsetLeft);
        var h=w*(POS.sigRatio||0.4);
        if(d.offsetTop+h>cv.height){ h=cv.height-d.offsetTop; w=h/(POS.sigRatio||0.4); }
        d.style.width=w+'px'; d.style.height=h+'px';
      }
      e.preventDefault(); }
    function end(){ mode=null; }
    var d=document.getElementById('asspdfDrag'), r=document.getElementById('asspdfRez');
    d.addEventListener('mousedown',function(e){ if(e.target!==r) start(e,'drag'); });
    d.addEventListener('touchstart',function(e){ if(e.target!==r) start(e,'drag'); },{passive:false});
    r.addEventListener('mousedown',function(e){ start(e,'rez'); });
    r.addEventListener('touchstart',function(e){ start(e,'rez'); },{passive:false});
    window.addEventListener('mousemove',move);
    window.addEventListener('touchmove',move,{passive:false});
    window.addEventListener('mouseup',end);
    window.addEventListener('touchend',end);
  }

  function renderPagina(){
    return POS.doc.getPage(POS.page).then(function(page){
      POS.pageRot=((page.rotate||0)%360+360)%360;
      var wrap=document.querySelector('.asspdf-palcoWrap');
      var maxW=Math.max(320,(wrap.clientWidth||760)-32), maxH=Math.max(320,(wrap.clientHeight||600)-32);
      var vp1=page.getViewport({scale:1});
      var scale=Math.min(maxW/vp1.width, maxH/vp1.height, 2); if(!isFinite(scale)||scale<=0) scale=1;
      POS.scale=scale; POS.pageW_pt=vp1.width; POS.pageH_pt=vp1.height;
      var vp=page.getViewport({scale:scale});
      var canvas=document.getElementById('asspdfCanvas');
      canvas.width=Math.round(vp.width); canvas.height=Math.round(vp.height);
      var palco=document.getElementById('asspdfPalco');
      palco.style.width=canvas.width+'px'; palco.style.height=canvas.height+'px';
      return page.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise.then(function(){
        // caixa inicial (do options; o usuario arrasta depois)
        var A=(POS.opts&&POS.opts.caixa)||{largura:180,margemInferior:54,margemDireita:40};
        var w=Math.min((A.largura||180)*scale, canvas.width*0.9), h=w*(POS.sigRatio||0.4);
        if(h>canvas.height*0.9){ h=canvas.height*0.9; w=h/(POS.sigRatio||0.4); }
        var l=Math.max(0,Math.min(canvas.width -w-(A.margemDireita ||40)*scale, canvas.width -w));
        var t=Math.max(0,Math.min(canvas.height-h-(A.margemInferior||54)*scale, canvas.height-h));
        var d=document.getElementById('asspdfDrag');
        d.style.width=w+'px'; d.style.height=h+'px'; d.style.left=l+'px'; d.style.top=t+'px';
        var nav=document.getElementById('asspdfNav');
        nav.innerHTML = POS.npages>1
          ? '<button type="button" id="asspdfPgA">&lsaquo;</button> p&aacute;g. '+POS.page+'/'+POS.npages+' <button type="button" id="asspdfPgB">&rsaquo;</button>'
          : '';
        if(POS.npages>1){
          document.getElementById('asspdfPgA').onclick=function(){ mudarPagina(-1); };
          document.getElementById('asspdfPgB').onclick=function(){ mudarPagina(1); };
        }
      });
    });
  }
  function mudarPagina(delta){ var p=POS.page+delta; if(p>=1&&p<=POS.npages){ POS.page=p; renderPagina(); } }

  function fechar(cancelou){
    var m=document.getElementById('asspdfModal'); if(m) m.classList.remove('on');
    if(POS.sigUrl){ URL.revokeObjectURL(POS.sigUrl); POS.sigUrl=null; }
    var cb=(POS.opts&&POS.opts.onCancelar);
    POS.doc=null; POS.pdfBytes=null; POS.sigBytes=null; POS.busy=false;
    if(cancelou && typeof cb==='function'){ POS.opts=null; cb(); } else { POS.opts=null; }
  }

  function confirmar(){
    if(!POS.busy || !POS.doc || !POS.pdfBytes) return;   // ainda carregando, ou ja fechado
    if(POS.pageRot!==0){ alert('Esta página está girada (rotação '+POS.pageRot+'°) — assine em outra página ou normalize o PDF.'); return; }
    var btn=document.getElementById('asspdfConfirmar'); btn.disabled=true;
    var d=document.getElementById('asspdfDrag'), s=POS.scale;
    var w_pt=d.offsetWidth/s, h_pt=d.offsetHeight/s;
    var x_pt=d.offsetLeft/s;
    var y_pt=POS.pageH_pt-(d.offsetTop/s)-h_pt;               // pdf-lib: origem embaixo-esquerda
    PDFLib.PDFDocument.load(POS.pdfBytes,{ignoreEncryption:true}).then(function(pdoc){
      return pdoc.embedPng(POS.sigBytes).then(function(png){
        var pg=pdoc.getPages()[POS.page-1];
        var bx=0,by=0; try{ var mb=pg.getMediaBox?pg.getMediaBox():null; if(mb){bx=mb.x||0;by=mb.y||0;} }catch(e){}
        pg.drawImage(png,{x:x_pt+bx,y:y_pt+by,width:w_pt,height:h_pt});
        return pdoc.save();
      });
    }).then(function(bytes){
      var info={pagina:POS.page, x:x_pt, y:y_pt, largura:w_pt, altura:h_pt};
      var cb=POS.opts&&POS.opts.onAssinado;
      btn.disabled=false; fechar(false);
      if(typeof cb==='function') cb(bytes, info);
    }).catch(function(e){
      btn.disabled=false;
      alert('Não consegui assinar este PDF: '+(e&&e.message?e.message:e));
    });
  }

  function abrir(opts){
    if(POS.busy) return;
    if(!opts || !opts.pdfBytes || !opts.assinaturaPng){ throw new Error('AssinadorPDF.abrir: informe pdfBytes e assinaturaPng (Uint8Array)'); }
    if(!window.pdfjsLib || !window.PDFLib){ throw new Error('AssinadorPDF: carregue libs/pdf.min.js e libs/pdf-lib.min.js antes'); }
    montarDOM();
    POS.busy=true; POS.opts=opts;
    POS.sessao++; var sess=POS.sessao;    // handlers atrasados de uma sessao anterior nao fazem nada
    POS.pdfBytes=(opts.pdfBytes instanceof Uint8Array)?opts.pdfBytes:new Uint8Array(opts.pdfBytes);
    POS.sigBytes=(opts.assinaturaPng instanceof Uint8Array)?opts.assinaturaPng:new Uint8Array(opts.assinaturaPng);
    if(opts.textos){
      if(opts.textos.titulo)    document.getElementById('asspdfTitulo').textContent=opts.textos.titulo;
      if(opts.textos.confirmar) document.getElementById('asspdfConfirmar').textContent=opts.textos.confirmar;
    }
    if(POS.sigUrl){ URL.revokeObjectURL(POS.sigUrl); }
    POS.sigUrl=URL.createObjectURL(new Blob([POS.sigBytes],{type:'image/png'}));
    // Confirmar so habilita quando a pagina terminar de renderizar
    document.getElementById('asspdfConfirmar').disabled=true;
    var im=new Image();
    im.onload=function(){
      if(sess!==POS.sessao || !POS.busy || !POS.pdfBytes) return;   // sessao antiga / fechado
      POS.sigRatio=(im.naturalHeight/im.naturalWidth)||0.4;
      document.getElementById('asspdfImg').src=POS.sigUrl;
      pdfjsLib.getDocument({data:POS.pdfBytes.slice(0)}).promise.then(function(doc){  // slice: o pdf.js "detacha" o buffer
        if(sess!==POS.sessao || !POS.busy) return;                  // sessao antiga / fechado
        POS.doc=doc; POS.npages=doc.numPages;
        POS.page=(opts.pagina==='ultima'||!opts.pagina)?doc.numPages:Math.max(1,Math.min(doc.numPages,opts.pagina|0));
        document.getElementById('asspdfModal').classList.add('on');
        return renderPagina().then(function(){ if(sess===POS.sessao) document.getElementById('asspdfConfirmar').disabled=false; });
      }).catch(function(e){ if(sess!==POS.sessao) return; fechar(true); alert('Não consegui abrir o PDF: '+(e&&e.message?e.message:e)); });
    };
    im.onerror=function(){ if(sess!==POS.sessao || !POS.busy) return; fechar(true); alert('A assinatura precisa ser um PNG válido.'); };
    im.src=POS.sigUrl;
  }

  window.AssinadorPDF = { abrir: abrir, fechar: function(){ fechar(true); } };
})();
