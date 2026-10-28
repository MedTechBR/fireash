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
    if (TOQUE) await gravarTexto(PASTA_SAVE, 'alv_toque.txt', '1'); else await apagar(PASTA_SAVE, 'alv_toque.txt');
    const raiz = await pasta([]);
    const guardado = await arquivo([], nome);
    const v = await fetch('versao.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const atual = guardado && guardado.size > 1e6 && (!v || !v.temJogo || localStorage.getItem('alv-versao') === String(v.v));
    if (atual) return guardado;
    if (v && v.temJogo) {
      const prog = entrada('Baixando o jogo', guardado ? 'Tem versão nova. Os saves continuam guardados.' : 'Só na primeira vez. Depois abre direto.', false);
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
    entrada('Fire Ash Alvorada', 'Escolha o arquivo fireash.mkxpz (no iPhone: app Arquivos). Ele fica guardado no aparelho; da próxima vez o jogo abre direto.', true);
    return new Promise((resolve) => {
      const inp = $('tq-arq');
      inp.onchange = async () => {
        const f = inp.files[0]; if (!f) return;
        const prog = entrada('Guardando o jogo', 'Copiando para o aparelho...', false);
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
  // [direita, baixo, largura, altura] em px a partir do canto inferior direito do cacho
  const LUGAR = {
    mapa: { a: [0, 44, 80, 66], b: [90, 0, 80, 66], correr: [0, 120, 80, 48] },
    menu: { a: [0, 44, 80, 66], b: [90, 0, 80, 66] },
    luta: {
      g1: [120, 62, 114, 56], g2: [0, 62, 114, 56], g3: [120, 0, 114, 56], g4: [0, 0, 114, 56],
      esquiva: [240, 0, 84, 56], fugir: [240, 62, 84, 56],
      trocar: [0, 128, 84, 40], pocao: [0, 174, 84, 40], bola: [0, 220, 84, 40], outraBola: [0, 266, 84, 40],
    },
  };
  const ROTULO = {
    a: ['A', 'Falar', 1], b: ['B', 'Menu', 1], correr: ['Correr', ''], esquiva: ['Esquiva', ''], trocar: ['Trocar', ''], pocao: ['Poção', ''],
    bola: ['Bola', ''], outraBola: ['Outra bola', ''], fugir: ['Fugir', ''],
  };
  const botoes = {};
  let estado = { m: 'menu' };

  function criarBotao(acao) {
    const b = document.createElement('button');
    b.className = 'tb fa-caixa tq-off' + (acao.startsWith('g') ? ' move' : '');
    b.dataset.acao = acao;
    if (!acao.startsWith('g')) { const [r, s, letra] = ROTULO[acao]; if (letra) b.classList.add('letra'); b.innerHTML = `<span class="rot">${r}</span><span class="sub">${s}</span>`; }
    // toque rápido demais some entre dois quadros do jogo: a tecla fica apertada pelo menos 90 ms
    let t0 = 0;
    const solta = (e) => {
      b.classList.remove('on'); try { b.releasePointerCapture(e.pointerId); } catch {}
      setTimeout(() => tecla(acao, false), Math.max(0, 90 - (performance.now() - t0)));
    };
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); b.setPointerCapture(e.pointerId); b.classList.add('on'); t0 = performance.now(); tecla(acao, true); });
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
        const html = `<span class="rot">${esc(g.n)}</span><span class="tipo">${esc(g.t)}</span><span class="pp">PP ${g.pp}</span>`;
        if (b.dataset.html !== html) { b.innerHTML = html; b.dataset.html = html; }
        b.style.setProperty('--tc', g.c);
        b.style.setProperty('--cd', novo.cd || 0);
        b.classList.toggle('sem-pp', !g.ok);
      }
      visivel.trocar = (novo.eq || 0) > 1;
      visivel.bola = !!novo.sel; visivel.outraBola = !!novo.sel; visivel.fugir = !!novo.sel;
      if (novo.sel) botoes.bola.querySelector('.sub').textContent = `x${novo.bolas || 0}`;
    }
    botoes.b.querySelector('.sub').textContent = m === 'mapa' ? 'Menu' : 'Voltar';
    botoes.a.querySelector('.sub').textContent = m === 'mapa' ? 'Falar' : 'OK';
    for (const [k, b] of Object.entries(botoes)) {
      const on = !!visivel[k];
      if (!on && presas.has(k)) tecla(k, false);
      b.classList.toggle('tq-off', !on);
      if (on) { const [r, bx, w, h] = lugar[k]; Object.assign(b.style, { right: r + 'px', bottom: bx + 'px', width: w + 'px', height: h + 'px' }); }
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
      e.preventDefault(); id = e.pointerId; zona.setPointerCapture(id);
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
    // ~25% maiores que no começo (pedido dele): iPhone deitado fica perto de 1,2
    const k = Math.min(1.4, Math.max(0.75, Math.min(innerWidth / 620, innerHeight / 355)));
    document.documentElement.style.setProperty('--tq-k', k.toFixed(3));
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
    $('tq-mais').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); p.hidden = !p.hidden; msg.textContent = 'Os saves ficam guardados neste aparelho. Exporte de vez em quando para não perder.'; });
    p.addEventListener('click', async (e) => {
      const a = e.target.closest('button')?.dataset.a; if (!a) return;
      if (a === 'fechar') p.hidden = true;
      if (a === 'exportar') { const n = await exportarSaves(); msg.textContent = n ? `${n} arquivo(s) de save baixado(s).` : 'Ainda não tem save.'; }
      if (a === 'importar') $('tq-saves').click();
      if (a === 'jogo') { await apagar([], 'fireash.mkxpz'); try { localStorage.removeItem('alv-versao'); } catch {} location.reload(); }
    });
    $('tq-saves').addEventListener('change', async (e) => {
      const fs = [...e.target.files]; if (!fs.length) return;
      await importarSaves(fs);
      msg.textContent = 'Save importado. Reabrindo o jogo...';
      setTimeout(() => location.reload(), 900);
    });
  }

  // ---------------- montagem ----------------
  document.addEventListener('DOMContentLoaded', () => {
    document.body.insertAdjacentHTML('beforeend', `
      <div id="tq-entrada" hidden><div class="fa-caixa"><h1></h1><p></p><div class="barra"><i></i></div>
        <label class="fa-caixa" for="tq-arq">Escolher arquivo</label><input id="tq-arq" type="file"></div></div>
      <div id="touch" hidden><div id="stick-zona"></div><div id="stick"><div id="stick-knob"></div></div><div id="tbtns"></div></div>
      <button id="tq-mais" class="fa-caixa" hidden>...</button>
      <div id="tq-painel" class="fa-caixa" hidden><h2>Fire Ash Alvorada</h2><p></p>
        <button data-a="exportar">Exportar save</button><button data-a="importar">Importar save</button>
        <button data-a="jogo">Trocar arquivo do jogo</button><button data-a="fechar">Fechar</button>
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
