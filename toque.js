// Fire Ash Alvorada no navegador (celular e computador).
// 1) window.alvJogo: entrega o jogo ao motor (chamado pelo código da página, ver tools/web_montar.py).
//    Usa a cópia guardada no aparelho; se o site tiver o jogo (versao.json com temJogo) baixa a versão nova;
//    senão pede o arquivo fireash.mkxpz (no iPhone, pelo app Arquivos: AirDrop do Mac, iCloud Drive...).
// 2) Controles de toque: analógico flutuante à esquerda e botões à direita no visual dos menus do Fire Ash.
//    Os botões mudam com o momento do jogo, que o próprio jogo conta no arquivo alv_ponte.json
//    (mod/20_Alvorada_Web.rb). Cada botão aperta a mesma tecla do teclado que o jogo já entende.
(() => {
  const PASTA_SAVE = ['saves', 'mkxp-z', 'mkxp-z', 'mkxp-z', 'Saves', 'Fire Ash-'];
  const q = new URLSearchParams(location.search);
  const TOQUE = q.get('toque') === '1' || (q.get('toque') !== '0' && (matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1));
  const $ = (id) => document.getElementById(id);

  // ---------------- armazenamento do navegador (OPFS) ----------------
  async function pasta(caminho, criar = true) {
    let d = await navigator.storage.getDirectory();
    for (const p of caminho) d = await d.getDirectoryHandle(p, { create: criar });
    caminhoDe.set(d, caminho);
    return d;
  }
  const caminhoDe = new Map(); // pasta -> caminho, para o worker reabrir a mesma pasta
  async function arquivo(caminho, nome) {
    try { return await (await (await pasta(caminho, false)).getFileHandle(nome)).getFile(); } catch { return null; }
  }
  async function gravarTexto(caminho, nome, txt) {
    const w = await escritor(await pasta(caminho), nome);
    await w.write(new TextEncoder().encode(txt)); await w.close();
  }
  async function apagar(caminho, nome) { try { await (await pasta(caminho, false)).removeEntry(nome); } catch {} }

  // Grava em pedaços. O Safari antigo não tem createWritable: aí quem grava é um worker com createSyncAccessHandle.
  async function escritor(dir, nome) {
    const fh = await dir.getFileHandle(nome, { create: true });
    if ('createWritable' in fh) {
      const w = await fh.createWritable();
      return { write: (b) => w.write(b), close: () => w.close() };
    }
    const cod = `let h,pos=0;onmessage=async(e)=>{const m=e.data;try{if(m.abrir){const r=await navigator.storage.getDirectory();let d=r;for(const p of m.abrir)d=await d.getDirectoryHandle(p,{create:true});h=await (await d.getFileHandle(m.nome,{create:true})).createSyncAccessHandle();h.truncate(0);}else if(m.dados){pos+=h.write(new Uint8Array(m.dados),{at:pos});}else if(m.fechar){h.flush();h.close();}postMessage({ok:1});}catch(err){postMessage({erro:String(err)})}}`;
    const wk = new Worker(URL.createObjectURL(new Blob([cod], { type: 'text/javascript' })));
    const pede = (m, t) => new Promise((ok, falha) => { wk.onmessage = (e) => e.data.erro ? falha(new Error(e.data.erro)) : ok(); wk.postMessage(m, t || []); });
    await pede({ abrir: caminhoDe.get(dir) || [], nome });
    return {
      write: (b) => { const buf = b instanceof Uint8Array ? b.slice().buffer : b; return pede({ dados: buf }, [buf]); },
      close: async () => { await pede({ fechar: 1 }); wk.terminate(); },
    };
  }

  async function copiar(origem, dir, nome, total, aoAvancar) {
    const w = await escritor(dir, nome);
    const leitor = origem.getReader(); let feito = 0;
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      await w.write(value); feito += value.byteLength; aoAvancar(feito / total);
    }
    await w.close();
  }

  // ---------------- tela de entrada ----------------
  function entrada(titulo, texto, comArquivo) {
    const el = $('tq-entrada');
    el.hidden = false;
    el.querySelector('h1').textContent = titulo;
    el.querySelector('p').textContent = texto;
    el.querySelector('.barra').hidden = comArquivo;
    el.querySelector('label').hidden = !comArquivo;
    return (f) => { el.querySelector('.barra i').style.width = (f * 100).toFixed(1) + '%'; };
  }

  window.alvJogo = async (nome) => {
    navigator.storage.persist?.().catch(() => {});
    if (TOQUE) await gravarTexto(PASTA_SAVE, 'alv_toque.txt', String(Math.max(innerWidth, innerHeight) / Math.min(innerWidth, innerHeight))); // proporção: o jogo fica mais largo para encher a tela (mod/00) else await apagar(PASTA_SAVE, 'alv_toque.txt');
    const raiz = await pasta([]);
    const guardado = await arquivo([], nome);
    const v = await fetch('versao.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const atual = guardado && guardado.size > 1e6 && (!v || !v.temJogo || localStorage.getItem('alv-versao') === String(v.v));
    if (atual) return guardado;
    if (v && v.temJogo) {
      const prog = entrada('Downloading the game', guardado ? 'New version available. Your saves are kept.' : 'Only the first time. After that it opens right away.', false);
      const r = await fetch(nome, { cache: 'no-store' });
      await copiar(r.body, raiz, nome, v.tam || +r.headers.get('content-length') || 1, prog);
      try { localStorage.setItem('alv-versao', String(v.v)); } catch {}
      $('tq-entrada').hidden = true;
      return await arquivo([], nome);
    }
    if (guardado && guardado.size > 1e6) return guardado;
    return await importarJogo(raiz, nome);
  };

  function importarJogo(raiz, nome) {
    entrada('Fire Ash Alvorada', 'Choose the file fireash.mkxpz (on iPhone: Files app). It stays on this device; next time the game opens right away.', true);
    return new Promise((resolve) => {
      const inp = $('tq-arq');
      inp.onchange = async () => {
        const f = inp.files[0]; if (!f) return;
        const prog = entrada('Saving the game', 'Copying it to this device...', false);
        await copiar(f.stream(), raiz, nome, f.size, prog);
        $('tq-entrada').hidden = true;
        resolve(await arquivo([], nome));
      };
    });
  }

  // ---------------- teclas ----------------
  const TECLAS = {
    cima: ['ArrowUp', 'ArrowUp', 38], baixo: ['ArrowDown', 'ArrowDown', 40], esq: ['ArrowLeft', 'ArrowLeft', 37], dir: ['ArrowRight', 'ArrowRight', 39],
    a: ['c', 'KeyC', 67], b: ['x', 'KeyX', 88], correr: ['z', 'KeyZ', 90],
    g1: ['1', 'Digit1', 49], g2: ['2', 'Digit2', 50], g3: ['3', 'Digit3', 51], g4: ['4', 'Digit4', 52],
    esquiva: [' ', 'Space', 32], trocar: ['Tab', 'Tab', 9], bola: ['b', 'KeyB', 66], outraBola: ['g', 'KeyG', 71], pocao: ['h', 'KeyH', 72], fugir: ['f', 'KeyF', 70],
  };
  const presas = new Set();
  function tecla(acao, baixo) {
    if (baixo === presas.has(acao)) return;
    baixo ? presas.add(acao) : presas.delete(acao);
    const [key, code, keyCode] = TECLAS[acao];
    const ev = new KeyboardEvent(baixo ? 'keydown' : 'keyup', { key, code, keyCode, which: keyCode, bubbles: true, cancelable: true });
    ($('canvas') || document).dispatchEvent(ev);
  }

  // ---------------- botões ----------------
  // Lugar de cada botão em px (multiplicados por --k), medidos da borda útil (fora do recorte da câmera).
  // lado d/e = direita/esquerda; y = distância do fundo; topo = distância do topo.
  const L = (lado, x, y, w, h, extra = {}) => ({ lado, x, y, w, h, ...extra });
  const LUGAR = {
    mapa: { a: L('d', 14, 44, 78, 78), b: L('d', 100, 14, 60, 60), correr: L('d', 14, 136, 78, 34) },
    menu: { a: L('d', 14, 44, 78, 78), b: L('d', 100, 14, 60, 60) },
    luta: {
      // tudo abaixo da barra do topo da batalha (~76 px) e sem encostar um no outro
      g1: L('d', 6, 212, 128, 62), g2: L('d', 6, 144, 128, 62), g3: L('d', 6, 76, 128, 62), g4: L('d', 6, 8, 128, 62),
      esquiva: L('d', 144, 8, 70, 70),
      trocar: L('e', 6, 0, 76, 34, { topo: 84 }), pocao: L('e', 88, 0, 76, 34, { topo: 84 }),
      bola: L('e', 6, 0, 76, 34, { topo: 124 }), outraBola: L('e', 88, 0, 76, 34, { topo: 124 }),
      fugir: L('e', 6, 0, 76, 34, { topo: 164 }),
    },
  };
  const REDONDO = new Set(['a', 'b', 'esquiva']);
  const ROTULO = {
    a: ['A', '', 1], b: ['B', 'menu', 1], correr: ['Run', ''], esquiva: ['Dodge', ''], trocar: ['Switch', ''], pocao: ['Potion', ''],
    bola: ['Ball', ''], outraBola: ['Next ball', ''], fugir: ['Flee', ''],
  };
  function posicionar(b, p) {
    const k = +getComputedStyle(document.documentElement).getPropertyValue('--k') || 1;
    const lado = p.lado === 'd' ? 'right' : 'left', outro = p.lado === 'd' ? 'left' : 'right', ins = p.lado === 'd' ? '--sr' : '--sl';
    b.style[lado] = `calc(${p.x * k}px + var(${ins}))`; b.style[outro] = '';
    if (p.topo != null) { b.style.top = `calc(${p.topo * k}px + var(--st))`; b.style.bottom = ''; }
    else { b.style.bottom = `calc(${p.y * k}px + var(--sb))`; b.style.top = ''; }
    b.style.width = p.w * k + 'px'; b.style.height = p.h * k + 'px';
  }
  const botoes = {};
  let estado = { m: 'menu' };

  function criarBotao(acao) {
    const b = document.createElement('button');
    b.className = 'tb px tq-off' + (acao.startsWith('g') ? ' move' : '') + (REDONDO.has(acao) ? ' redondo' : '');
    if (acao === 'a') b.id = 't-a';
    b.dataset.acao = acao;
    if (!acao.startsWith('g')) { const [r, s, letra] = ROTULO[acao]; if (letra) b.classList.add('letra'); b.innerHTML = `<span class="rot">${r}</span><span class="sub">${s}</span>`; }
    // toque rápido demais some entre dois quadros do jogo: a tecla fica apertada pelo menos 90 ms
    let t0 = 0;
    const solta = (e) => {
      b.classList.remove('on'); try { b.releasePointerCapture(e.pointerId); } catch {}
      setTimeout(() => tecla(acao, false), Math.max(0, 90 - (performance.now() - t0)));
    };
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); try { b.setPointerCapture(e.pointerId); } catch {} b.classList.add('on'); t0 = performance.now(); tecla(acao, true); });
    b.addEventListener('pointerup', solta); b.addEventListener('pointercancel', solta);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    $('tbtns').appendChild(b);
    botoes[acao] = b;
  }

  function aplicar(novo) {
    estado = novo;
    const m = novo.m === 'luta' ? 'luta' : novo.m === 'mapa' ? 'mapa' : 'menu';
    const lugar = LUGAR[m];
    const visivel = {};
    for (const k of Object.keys(lugar)) visivel[k] = true;
    if (m === 'luta') {
      const gs = novo.g || [];
      for (let i = 0; i < 4; i++) {
        const b = botoes['g' + (i + 1)], g = gs[i];
        visivel['g' + (i + 1)] = !!g;
        if (!g) continue;
        const html = `<span class="rot">${esc(g.n)}</span><span class="linha"><span class="tipo">${esc(g.t)}</span><span class="pp">PP ${g.pp}</span></span><i class="rec"></i>`;
        if (b.dataset.html !== html) { b.innerHTML = html; b.dataset.html = html; }
        b.style.setProperty('--tc', g.c);
        b.style.setProperty('--cd', novo.cd || 0);
        b.classList.toggle('esfria', (novo.cd || 0) > 0);
        b.classList.toggle('sem-pp', !g.ok);
      }
      visivel.trocar = (novo.eq || 0) > 1;
      visivel.bola = !!novo.sel; visivel.outraBola = !!novo.sel; visivel.fugir = !!novo.sel;
      if (novo.sel) botoes.bola.querySelector('.rot').textContent = `Ball x${novo.bolas || 0}`;
    }
    botoes.b.querySelector('.sub').textContent = m === 'mapa' ? 'menu' : '';
    for (const [k, b] of Object.entries(botoes)) {
      const on = !!visivel[k];
      if (!on && presas.has(k)) tecla(k, false);
      b.classList.toggle('tq-off', !on);
      if (on) posicionar(b, lugar[k]);
    }
    $('tq-mais').hidden = m === 'luta';
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------------- analógico ----------------
  function analogico() {
    const zona = $('stick-zona'), base = $('stick'), knob = $('stick-knob');
    let id = null, ox = 0, oy = 0;
    const R = 52;
    const posPadrao = () => { base.style.left = ''; base.style.top = ''; base.style.bottom = ''; knob.style.transform = ''; };
    const direcoes = (dx, dy) => {
      const d = Math.hypot(dx, dy), quer = { cima: false, baixo: false, esq: false, dir: false };
      if (d > R * 0.3) {
        if (estado.m === 'luta') { // 8 direções na batalha
          const lim = d * 0.38;
          quer.cima = dy < -lim; quer.baixo = dy > lim; quer.esq = dx < -lim; quer.dir = dx > lim;
        } else if (Math.abs(dx) > Math.abs(dy)) quer[dx < 0 ? 'esq' : 'dir'] = true; // 4 no mapa e nos menus
        else quer[dy < 0 ? 'cima' : 'baixo'] = true;
      }
      for (const [k, v] of Object.entries(quer)) tecla(k, v);
    };
    zona.addEventListener('pointerdown', (e) => {
      if (id !== null) return;
      e.preventDefault(); id = e.pointerId; try { zona.setPointerCapture(id); } catch {}
      ox = e.clientX; oy = e.clientY;
      Object.assign(base.style, { left: ox - 60 + 'px', top: oy - 60 + 'px', bottom: 'auto' });
      base.classList.add('on');
    });
    zona.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      let dx = e.clientX - ox, dy = e.clientY - oy; const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      direcoes(dx, dy);
    });
    const fim = (e) => { if (e.pointerId !== id) return; id = null; base.classList.remove('on'); posPadrao(); direcoes(0, 0); };
    zona.addEventListener('pointerup', fim); zona.addEventListener('pointercancel', fim);
  }

  function escala() {
    const k = Math.min(1.3, Math.max(0.8, Math.min(innerWidth, innerHeight) / 390));
    document.documentElement.style.setProperty('--k', k.toFixed(3));
    if (Object.keys(botoes).length) aplicar(estado);
  }

  // ---------------- leitura do estado do jogo ----------------
  let ultimo = '';
  async function lerPonte() {
    try {
      const f = await arquivo(PASTA_SAVE, 'alv_ponte.json');
      if (f) { const t = await f.text(); if (t && t !== ultimo) { ultimo = t; aplicar(JSON.parse(t)); } }
    } catch {}
    setTimeout(lerPonte, 120);
  }

  // ---------------- saves ----------------
  async function exportarSaves() {
    const d = await pasta([...PASTA_SAVE, 'Save Files']);
    let n = 0;
    for await (const [nome, h] of d.entries()) {
      if (h.kind !== 'file') continue;
      const f = await h.getFile();
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(f), download: nome });
      document.body.appendChild(a); a.click(); a.remove(); n++;
      await new Promise((r) => setTimeout(r, 400));
    }
    return n;
  }
  async function importarSaves(files) {
    const d = await pasta([...PASTA_SAVE, 'Save Files']);
    for (const f of files) await copiar(f.stream(), d, f.name, f.size, () => {});
  }

  function painel() {
    const p = $('tq-painel'), msg = p.querySelector('p');
    $('tq-mais').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); p.hidden = !p.hidden; msg.textContent = 'Saves are kept on this device. Export them now and then so you never lose them.'; });
    p.addEventListener('click', async (e) => {
      const a = e.target.closest('button')?.dataset.a; if (!a) return;
      if (a === 'fechar') p.hidden = true;
      if (a === 'exportar') { const n = await exportarSaves(); msg.textContent = n ? `${n} save file(s) downloaded.` : 'No save yet.'; }
      if (a === 'importar') $('tq-saves').click();
      if (a === 'jogo') { await apagar([], 'fireash.mkxpz'); try { localStorage.removeItem('alv-versao'); } catch {} location.reload(); }
    });
    $('tq-saves').addEventListener('change', async (e) => {
      const fs = [...e.target.files]; if (!fs.length) return;
      await importarSaves(fs);
      msg.textContent = 'Save imported. Reopening the game...';
      setTimeout(() => location.reload(), 900);
    });
  }

  // ---------------- montagem ----------------
  document.addEventListener('DOMContentLoaded', () => {
    document.body.insertAdjacentHTML('beforeend', `
      <div id="tq-entrada" hidden><div class="caixa-vidro px"><h1></h1><p></p><div class="barra"><i></i></div>
        <label for="tq-arq">Choose file</label><input id="tq-arq" type="file"></div></div>
      <div id="touch" hidden><div id="stick-zona"></div><div id="stick"><div id="stick-knob"></div></div><div id="tbtns"></div></div>
      <button id="tq-mais" class="tb px" hidden>...</button>
      <div id="tq-painel" class="caixa-vidro px" hidden><h2>Fire Ash Alvorada</h2><p></p>
        <button data-a="exportar">Export save</button><button data-a="importar">Import save</button>
        <button data-a="jogo">Change game file</button><button data-a="fechar">Close</button>
        <input id="tq-saves" type="file" multiple hidden></div>`);
    for (const k of ['a', 'b', 'correr', 'g1', 'g2', 'g3', 'g4', 'esquiva', 'trocar', 'pocao', 'bola', 'outraBola', 'fugir']) criarBotao(k);
    painel();
    escala(); addEventListener('resize', escala);
  });

  window.alvTeste = { aplicar: (e) => aplicar(e), mostrar: () => { $('touch').hidden = false; } }; // conferência de layout

  window.alvPronto = () => {
    $('tq-mais').hidden = false;
    if (!TOQUE) return;
    $('touch').hidden = false;
    analogico();
    aplicar({ m: 'menu' });
    lerPonte();
  };
})();
