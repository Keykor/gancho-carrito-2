/* ===========================================================================
   HUD — §12, §13. DOM/CSS por encima del canvas, no dibujado en 3D: es mas
   nitido, mas barato y mas facil de hacer accesible. Minimo y en las esquinas,
   el centro es zona de juego.
   Ningun texto sale hardcodeado: todo pasa por t() (§16).
   =========================================================================== */
import { CONFIG, NCARRILES, clamp, reducedMotion } from './config.js';
import { t, tp, setLang, idioma, alCambiarIdioma } from './strings.js';
import { TextureGen, TX } from './texturas.js';
import { TIPO } from './entities.js';
import { Audio, Sfx } from './audio.js';
import { leerRecord } from './score.js';

const $ = id => document.getElementById(id);
const [RW, RH] = CONFIG.resInterna;

/* Corazones y no cascos. El §12 pedia cascos porque son diegeticos, pero
   nadie los leyo como vidas: un icono de HUD tiene que entenderse sin que te
   lo expliquen, y el corazon es el unico que cumple eso sin instrucciones. */
const SVG_CASCO = `<svg viewBox="0 0 16 16" aria-hidden="true">
  <path d="M8 14.2 2.6 8.7A3.4 3.4 0 0 1 8 4.5a3.4 3.4 0 0 1 5.4 4.2z"
        fill="#FF3D5A" stroke="#0B0A12" stroke-width="1.1" stroke-linejoin="round"/>
  <path d="M5.6 7.1a1.7 1.7 0 0 1 1.5-1.2" stroke="#E8E4F0" stroke-width="1.1"
        fill="none" stroke-linecap="round"/></svg>`;
const SVG_PAUSA = `<svg viewBox="0 0 16 16" aria-hidden="true">
  <rect x="3.4" y="2.6" width="3.4" height="10.8" rx="1" fill="#E8E4F0"/>
  <rect x="9.2" y="2.6" width="3.4" height="10.8" rx="1" fill="#E8E4F0"/></svg>`;
const SVG_ESCUDO = `<svg viewBox="0 0 16 16" aria-hidden="true">
  <path d="M8 1.2 14 3.6v5.2c0 3.2-2.6 5.3-6 6-3.4-.7-6-2.8-6-6V3.6z"
        fill="none" stroke="#4CE0D2" stroke-width="1.8"/></svg>`;

// §7.1: la forma NO es decorativa. Rojo y dorado son indistinguibles para una
// parte de los jugadores, y la reticula es la unica informacion de apuntado
// que hay. Sin forma distinta, el apuntado tampoco se lee a 320x240.
const FORMAS = {
  pared:      { d:'M11 9 L6 9 L6 31 L11 31 M29 9 L34 9 L34 31 L29 31', color:'#E8E4F0', r:1.0 },
  gema:       { d:'M20 5 L33 20 L20 35 L7 20 Z',                        color:'#4CE0D2', r:1.25 },
  murcielago: { d:'M8 8 L32 32 M32 8 L8 32',                            color:'#FF3D5A', r:1.25 },
  companiera: { d:'M20 6 A14 14 0 1 1 19.9 6 Z',                        color:'#FFD166', r:1.35 },
};

function arco(cx, cy, r, frac){
  if (frac <= 0.001) return '';
  if (frac >= 0.999) frac = 0.999;
  const a0 = -Math.PI / 2, a1 = a0 + frac * Math.PI * 2;
  const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${frac > 0.5 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

export const HUD = {
  el: {},
  vagonesDibujados: -1,
  rachaPrev: 0,
  hintTimer: 0,
  beatTimer: 0,
  proyector: null,
  onAccion: {},          // el Game se suscribe: 'jugar','tutorial','seguir',...

  init(){
    const el = this.el;
    for (const id of ['reloj','gemas-n','racha','vidas','escudo','companieras','avisos',
                      'reticula','ret-forma','ret-arco','hint','beat','stats','debug2d',
                      'audio-aviso','b-pausa','ficha','stage'])
      el[id] = $(id);

    // retratos de las 4 companieras, apagados hasta rescatarlas (§12)
    el['companieras'].innerHTML = '';
    this.retratos = [1,2,3,4].map(i => {
      const d = document.createElement('div');
      d.className = 'retrato';
      const c = document.createElement('canvas');
      TextureGen.recorteCara(i, c, 32);
      d.appendChild(c);
      el['companieras'].appendChild(d);
      return d;
    });

    el['vidas'].innerHTML = '';
    this.cascos = [];
    for (let i = 0; i < CONFIG.vidas; i++){
      const d = document.createElement('div');
      d.className = 'casco';
      d.innerHTML = SVG_CASCO;
      el['vidas'].appendChild(d);
      this.cascos.push(d);
    }
    el['escudo'].innerHTML = SVG_ESCUDO;
    el['b-pausa'].innerHTML = SVG_PAUSA;

    this.cablearPantallas();
    this.reRender();
    alCambiarIdioma(() => this.reRender());
  },

  /* --- textos: se re-renderiza todo, el HUD es DOM asi que alcanza (§12.6) */
  reRender(){
    const set = (id, txt) => { const e = $(id); if (e) e.textContent = txt; };
    set('t-bajada', t('titulo.bajada'));
    set('b-jugar', t('titulo.jugar'));
    set('b-tutorial', t('titulo.tutorial'));
    set('b-ayuda', t('titulo.ayuda'));
    set('b-opciones', t('titulo.opciones'));
    const r = leerRecord();
    set('t-record', r > 0 ? t('titulo.record', { n: r }) : t('titulo.sinRecord'));

    set('ayuda-titulo', t('ayuda.titulo'));
    /* Guia paginada. Los iconos son LOS MISMOS que los de la reticula (§7.1),
       asi que el dibujo que se aprende aca es literalmente el que despues
       aparece bajo el cursor. */
    const icono = f => f
      ? `<svg viewBox="0 0 40 40"><path d="${f.d}" fill="none" stroke="${f.color}"
           stroke-width="3.2" stroke-linecap="square"/></svg>`
      : `<svg viewBox="0 0 40 40"><path d="M8 26h24M20 14v12M14 20l6 6 6-6"
           fill="none" stroke="#8A7FA8" stroke-width="3.2" stroke-linecap="square"/></svg>`;
    const flecha = der => `<svg viewBox="0 0 24 24"><path d="${der
      ? 'M9 4l8 8-8 8' : 'M15 4l-8 8 8 8'}" fill="none" stroke="currentColor"
      stroke-width="2.6" stroke-linecap="square"/></svg>`;
    const filas = [
      ['pared', FORMAS.pared], ['gema', FORMAS.gema],
      ['bicho', FORMAS.murcielago], ['comp', FORMAS.companiera], ['encima', null],
    ];

    $('ayuda-cuerpo').innerHTML =
      `<button class="flecha izq" aria-label="${esc(t('ayuda.anterior'))}">${flecha(false)}</button>` +
      `<div class="paginas">` +
        `<div class="pagina activa">` +
          `<p class="intro">${esc(t('ayuda.intro'))}<br>${esc(t('ayuda.intro2'))}</p>` +
          `<dl class="controles">` + filas.map(([k, f]) =>
            `<div class="ctrl"><span class="ico">${icono(f)}</span>` +
            `<dt>${esc(t('ayuda.' + k))}</dt>` +
            `<dd>${esc(t('ayuda.' + k + 'R'))}</dd></div>`).join('') + `</dl>` +
          `<p class="cierre">${esc(t('ayuda.cierre'))}</p>` +
        `</div>` +
        `<div class="pagina">` +
          `<p class="intro">${esc(t('ayuda.compsTitulo'))}</p>` +
          `<div class="habs">` + [1,2,3,4].map(i =>
            `<div class="hab"><canvas data-c="${i}"></canvas>` +
            `<b>${esc(t(`comp.${i}.nombre`))}</b>` +
            `<span>${esc(t(`comp.${i}.habilidad`))}</span></div>`).join('') + `</div>` +
          `<p class="cierre">${esc(t('ayuda.teclado', { esc: 'Esc' }))}</p>` +
        `</div>` +
        `<div class="puntos"><i class="on"></i><i></i></div>` +
      `</div>` +
      `<button class="flecha der" aria-label="${esc(t('ayuda.siguiente'))}">${flecha(true)}</button>`;
    $('ayuda-cuerpo').querySelectorAll('.hab canvas').forEach(c =>
      TextureGen.recorteCara(+c.dataset.c, c, 24));
    this.cablearGuia();
    set('b-ayuda-volver', t('ayuda.volver'));
    $('b-ayuda-volver').classList.add('pegado');
    $('b-opciones-volver').classList.add('pegado');

    set('opciones-titulo', t('opciones.titulo'));
    set('b-opciones-volver', t('opciones.volver'));
    set('pausa-titulo', t('pausa.titulo'));
    set('b-seguir', t('pausa.seguir'));
    set('b-salir', t('pausa.salir'));
    set('b-otra', t('final.otra'));
    set('b-final-titulo', t('final.alTitulo'));
    set('tutfin-titulo', t('tutfin.titulo'));
    set('tutfin-bajada', t('tutfin.bajada'));
    set('b-tutfin-jugar', t('tutfin.jugar'));
    set('b-tutfin-menu', t('tutfin.menu'));
    $('audio-aviso').textContent = t('hud.audioSuspendido');
    $('b-pausa').setAttribute('aria-label', t('hud.pausa'));
    $('girar').querySelector('h1').textContent = t('girar.titulo');
    $('girar').querySelector('p').textContent = t('girar.cuerpo');

    this.armarMezcla('mezcla-opciones');
    this.armarMezcla('mezcla-pausa');
    for (const id of ['idioma-titulo','idioma-opciones','idioma-pausa']) this.armarIdioma(id);
    this.retratos?.forEach((d, i) => {
      d.title = `${t(`comp.${i+1}.nombre`)}, ${t(`comp.${i+1}.oficio`)} — ${t(`comp.${i+1}.habilidad`)}`;
    });

    if (this.ultimoResumen) this.pintarFinal(this.ultimoResumen);
  },

  /* Paginacion de la guia: dos paginas, flechas a los costados y puntitos.
     La pagina se guarda para que volver a entrar no te devuelva siempre a la 1
     si estabas mirando las habilidades. */
  cablearGuia(){
    const cont = $('ayuda-cuerpo');
    const pags = [...cont.querySelectorAll('.pagina')];
    const pts = [...cont.querySelectorAll('.puntos i')];
    const izq = cont.querySelector('.flecha.izq');
    const der = cont.querySelector('.flecha.der');
    const ir = n => {
      this.guiaPag = clamp(n, 0, pags.length - 1);
      pags.forEach((p, i) => p.classList.toggle('activa', i === this.guiaPag));
      pts.forEach((p, i) => p.classList.toggle('on', i === this.guiaPag));
      izq.disabled = this.guiaPag === 0;
      der.disabled = this.guiaPag === pags.length - 1;
    };
    izq.onclick = () => { Sfx.ui(false); ir(this.guiaPag - 1); };
    der.onclick = () => { Sfx.ui(true);  ir(this.guiaPag + 1); };
    ir(this.guiaPag || 0);
  },

  armarIdioma(id){
    const cont = $(id); if (!cont) return;
    cont.innerHTML = '';
    for (const l of ['es','en']){
      const b = document.createElement('button');
      b.textContent = l === 'es' ? 'ES' : 'EN';
      b.className = idioma() === l ? 'activo' : '';
      b.onclick = () => { Sfx.ui(false); setLang(l); };
      cont.appendChild(b);
    }
  },

  armarMezcla(id){
    const cont = $(id); if (!cont) return;
    cont.innerHTML = '';
    for (const [clave, etiqueta] of [['musica','opciones.musica'],
                                     ['efectos','opciones.efectos'],
                                     ['general','opciones.general']]){
      const fila = document.createElement('div');
      fila.className = 'slider-fila';
      const lab = document.createElement('label');
      lab.textContent = t(etiqueta);
      const inp = document.createElement('input');
      inp.type = 'range'; inp.min = 0; inp.max = 100;
      inp.value = Audio.vol[clave];
      const val = document.createElement('span');
      val.className = 'val'; val.textContent = Audio.vol[clave];
      inp.oninput = () => {
        Audio.setVol(clave, +inp.value);
        val.textContent = inp.value;
        // los otros sliders del mismo bus se mantienen sincronizados
        document.querySelectorAll('.mezcla input').forEach(o => {
          if (o !== inp && o.dataset.clave === clave){ o.value = inp.value; o.nextSibling.textContent = inp.value; }
        });
      };
      inp.dataset.clave = clave;
      lab.setAttribute('for', id + '-' + clave);
      inp.id = id + '-' + clave;
      fila.append(lab, inp, val);
      cont.appendChild(fila);
    }
  },

  cablearPantallas(){
    const on = (id, fn) => { const e = $(id); if (e) e.onclick = () => { Sfx.ui(true); fn(); }; };
    on('b-jugar',          () => this.onAccion.jugar?.());
    on('b-tutorial',       () => this.onAccion.tutorial?.());
    on('b-ayuda',          () => this.mostrar('ayuda'));
    on('b-opciones',       () => this.mostrar('opciones'));
    on('b-ayuda-volver',   () => this.mostrar('titulo'));
    on('b-opciones-volver',() => this.mostrar('titulo'));
    on('b-seguir',         () => this.onAccion.seguir?.());
    on('b-salir',          () => this.onAccion.salir?.());
    on('b-otra',           () => this.onAccion.jugar?.());
    on('b-final-titulo',   () => this.mostrar('titulo'));
    on('b-pausa',          () => this.onAccion.pausa?.());
    on('b-tutfin-jugar',   () => this.onAccion.jugarYa?.());
    on('b-tutfin-menu',    () => this.mostrar('titulo'));
    $('audio-aviso').onclick = () => Audio.asegurar();
  },

  mostrar(cual){
    for (const p of ['titulo','ayuda','opciones','pausa','final','tutfin'])
      $('p-' + p).classList.toggle('hide', p !== cual);
    const jugando = cual === null;
    $('hud').style.opacity = (cual === null || cual === 'pausa') ? 1 : 0;
    $('b-pausa').classList.toggle('hide', !jugando);
    if (cual === 'titulo') this.reRender();
  },

  /* Al rescatar: quien es y que habilidad deja (§8). Se muestra 2.6 s, que es
     lo que tarda en leerse sin sacar la vista del tunel mas de un instante. */
  rescate(idx){
    const f = this.el['ficha'];
    TextureGen.recorteCara(idx, f.querySelector('canvas'), 32);
    f.querySelector('b').textContent = t(`comp.${idx}.nombre`);
    f.querySelector('span').textContent = t(`comp.${idx}.habilidad`);
    f.classList.remove('hide');
    f.classList.add('on');
    this.fichaTimer = 2.6;
  },

  hint(clave){
    const e = this.el['hint'];
    e.textContent = t(clave);
    e.classList.add('on');
    this.hintTimer = 1.5;
  },
  beat(texto){
    const e = this.el['beat'];
    e.textContent = texto;
    e.classList.toggle('on', !!texto);
    this.beatTimer = texto ? 99 : 0;
  },

  /* --- por frame ------------------------------------------------------- */
  actualizar(dt, ctx){
    const { player, tiempo, mundo, vista, vel, enJuego } = ctx;

    if (this.hintTimer > 0){
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.el['hint'].classList.remove('on');
    }
    if (this.fichaTimer > 0){
      this.fichaTimer -= dt;
      if (this.fichaTimer <= 0) this.el['ficha'].classList.remove('on');
    }

    // cronometro regresivo, en rojo y pulsando bajo los 20 s (§12)
    const restante = Math.max(0, tiempo);
    const mm = Math.floor(restante / 60), ss = Math.floor(restante % 60);
    this.el['reloj'].textContent = `${mm}:${ss < 10 ? '0' : ''}${ss}`;
    this.el['reloj'].classList.toggle('urgente', restante <= 20);

    this.el['gemas-n'].textContent = player.gemas;

    // §11.5: la racha se muestra solo a partir de 3. Nada de banners.
    const mostrarRacha = player.racha >= CONFIG.rachaMostrarDesde;
    const rEl = this.el['racha'];
    rEl.classList.toggle('on', mostrarRacha);
    if (mostrarRacha){
      rEl.textContent = '×' + player.racha;
      if (player.racha !== this.rachaPrev && !reducedMotion){
        rEl.classList.remove('crece'); void rEl.offsetWidth; rEl.classList.add('crece');
      }
    }
    this.rachaPrev = player.racha;

    this.cascos.forEach((c, i) => c.classList.toggle('gastado', i >= player.vidas));
    const escEl = this.el['escudo'];
    escEl.classList.toggle('on', player.hab.beba);
    escEl.classList.toggle('recargando', player.hab.beba && !player.escudo);

    this.retratos.forEach((d, i) => d.classList.toggle('rescatada', player.companieras.includes(i + 1)));

    this.actualizarReticula(dt, ctx);
    if (enJuego) this.actualizarAvisos(ctx);
    else this.el['avisos'].innerHTML = '';

    $('audio-aviso').classList.toggle('hide', !Audio.suspendido || !enJuego);
  },

  actualizarReticula(dt, { player, mundo, vista, entrada }){
    const ret = this.el['reticula'];
    if (!entrada.hayPuntero){ ret.classList.add('oculta'); return; }
    ret.classList.remove('oculta');

    // la reticula vive en px de pantalla; el margen negativo del CSS la centra
    const sw = this.el['stage'].clientWidth, sh = this.el['stage'].clientHeight;
    ret.style.transform =
      `translate(${(entrada.x / RW * sw).toFixed(1)}px, ${(entrada.y / RH * sh).toFixed(1)}px)`;

    const objetivo = vista ? vista.objetivoBajo(entrada.x, entrada.y, mundo, player.x) : null;
    const clase = objetivo
      ? (objetivo.tipo === TIPO.GEMA ? 'gema'
        : objetivo.tipo === TIPO.MURCIELAGO ? 'murcielago' : 'companiera')
      : 'pared';
    const f = FORMAS[clase];
    if (this._formaPrev !== clase){
      this._formaPrev = clase;
      this.el['ret-forma'].innerHTML =
        `<path class="forma" d="${f.d}" stroke="${f.color}"/>`;
      this.el['ret-forma'].setAttribute('transform', `translate(20 20) scale(${f.r}) translate(-20 -20)`);
    }

    // §12: arco de cooldown pegado a la reticula. El estado del cooldown tiene
    // que ser legible sin sacar la vista de donde estas apuntando.
    const cdTotal = player.cooldownBase();
    const frac = cdTotal > 0 ? clamp(player.cooldown / cdTotal, 0, 1) : 0;
    this.el['ret-arco'].setAttribute('d', arco(20, 20, 18, frac));
    this.el['ret-arco'].style.opacity = frac > 0 ? 0.9 : 0;
  },

  /* Indicadores de borde superior (§12). La posicion sale de PROYECTAR el punto
     del mundo, no de repartir los carriles linealmente sobre el ancho: con
     perspectiva el carril 0 no cae en el 8 % de la pantalla, y el aviso
     terminaba señalando un carril que no era. La companiera ademas muestra su
     retrato, asi se sabe cual viene y no solo que viene alguna.             */
  actualizarAvisos({ mundo, vel, vista }){
    const cont = this.el['avisos'];
    this._avisoPool = this._avisoPool || [];
    const tmp = { x:0, y:0, detras:false };
    let n = 0;

    const poner = (clase, xMundo, zMundo, texto, idxCara) => {
      vista.proyectar(xMundo, 0.8, zMundo, tmp);
      if (tmp.detras) return;
      let el = this._avisoPool[n];
      if (!el){
        el = document.createElement('div');
        el.innerHTML = '<canvas class="cara"></canvas><span class="txt"></span><span class="punta"></span>';
        cont.appendChild(el);
        this._avisoPool[n] = el;
      }
      const clases = 'aviso ' + clase;
      if (el.className !== clases) el.className = clases;
      const cv = el.firstChild;
      if (idxCara !== undefined){
        if (cv.dataset.c !== String(idxCara)){
          TextureGen.recorteCara(idxCara, cv, 16);
          cv.dataset.c = String(idxCara);
        }
        cv.style.display = '';
      } else cv.style.display = 'none';
      const sp = el.children[1];
      if (sp.textContent !== texto) sp.textContent = texto;
      el.style.left = clamp(tmp.x / RW * 100, 4, 96).toFixed(1) + '%';
      el.style.display = '';
      n++;
    };

    for (const e of mundo.ents){
      if (!e.vivo) continue;
      const seg = vel > 0 ? (0 - e.z) / vel : 99;
      /* SOLO la companiera. El §12 pedia tambien sombra de viga, y yo le habia
         sumado una flecha de desvio: entre las tres el borde superior era un
         semaforo permanente y el aviso dejaba de significar nada. La companiera
         aparece una vez por tramo — que el cartel salga sea, por si solo, la
         noticia. La viga y el desvio ya se anuncian en el mundo (la viga cae
         soltando polvo, el desvio tiene flecha en el piso y cartel). */
      if (e.tipo === TIPO.COMPANIERA && e.estado === 0 && seg > 0 && seg < CONFIG.compAvisoSeg){
        // exactamente donde va a aparecer: su saliente, no el borde del HUD
        poner('comp', e.lado * (CONFIG.paredX - 0.4), Math.max(e.z, -18),
              t(`comp.${e.idx}.nombre`), e.idx);
      }
    }
    for (let i = n; i < this._avisoPool.length; i++) this._avisoPool[i].style.display = 'none';
  },

  /* --- pantalla final (§11) -------------------------------------------- */
  pintarFinal(r){
    // se guarda la foto previa una sola vez por partida: si se re-renderiza
    // (cambio de idioma), el tilde no se vuelve a animar de la nada
    if (this.ultimoResumen !== r) this.finalesPrevios = r.finalesPrevios || [];
    this.ultimoResumen = r;
    $('final-titulo').textContent = t(`final.${r.final}.titulo`);
    $('final-cierre').textContent = t(`final.${r.final}.cierre`);

    /* Los retratos van SIEMPRE que hayas rescatado a alguien, tambien si te
       moriste: las que sacaste hasta ahi son la mejor parte de la corrida.
       Lo que sale son las rescatadas y nada mas — los cuatro huecos en gris
       sobre una placa de muerte leen como "te faltaron cuatro" cuando en
       realidad la noticia es que sacaste dos. */
    const escapo = r.escapo;
    const muestra = escapo ? [1,2,3,4] : r.rescatadas.slice().sort();
    $('final-retratos').classList.toggle('hide', muestra.length === 0);
    $('final-retratos').innerHTML = muestra.map(i =>
      `<div class="retrato${r.rescatadas.includes(i) ? ' rescatada' : ''}"
            title="${esc(t(`comp.${i}.nombre`))}"><canvas data-c="${i}"></canvas></div>`).join('');
    $('final-retratos').querySelectorAll('canvas').forEach(c =>
      TextureGen.recorteCara(+c.dataset.c, c, 32));

    // La racha maxima quedo afuera de la placa: suma al puntaje (§11.5) pero
    // como numero suelto no le dice nada a nadie — no es una meta ni se
    // persigue, solo pasa.
    const seg = Math.max(0, Math.round(r.tiempoRestante));
    const stats = escapo
      ? [[r.gemas, t('final.gemas')],
         [r.companieras + '/4', t('final.companieras')],
         [seg + 's', t('final.tiempoRestante')],
         [r.puntaje, t('final.puntaje'), true],
         [r.record, r.recordNuevo ? t('final.recordNuevo') : t('final.record')]]
      : [[r.gemas, t('final.gemas')],
         ...(r.companieras > 0 ? [[r.companieras, t('final.companieras')]] : []),
         [r.puntaje, t('final.puntaje'), true],
         [r.record, r.recordNuevo ? t('final.recordNuevo') : t('final.record')]];
    $('final-stats').innerHTML = stats.map(([n, et, oro]) =>
      `<div class="stat"><div class="n${oro ? ' oro' : ''}">${esc(String(n))}</div><div class="et">${esc(et)}</div></div>`).join('');

    /* §11: la lista de los 5, tildandose. Los que faltan quedan en silueta y el
       que acabas de sacar se tilda a la vista — ese "me falta el 4" es el motor
       del replay, y solo funciona si se ve tachar uno. */
    const esNuevo = i => i === r.final && !this.finalesPrevios?.includes(i);
    $('final-finales').innerHTML =
      `<div class="f" style="color:var(--polvo);grid-template-columns:1fr">` +
      `<span class="txt">${esc(t('final.teFalta'))}</span></div>` +
      [0,1,2,3,4].map(i => {
        const visto = r.finalesVistos.includes(i);
        const cls = ['f', visto ? 'logrado' : 'silueta',
                     i === r.final ? 'actual' : '', esNuevo(i) ? 'nuevo' : ''].join(' ').trim();
        const txt = visto ? t(`final.${i}.titulo`) : '· · · · ·';
        return `<div class="${cls}"><span class="caja"></span>` +
               `<span class="txt">${esc(txt)}</span></div>`;
      }).join('');

    // La pista: un final que te falta, elegido segun lo que acabas de hacer
    const pista = r.pista;
    const cont = $('final-pista');
    if (pista){
      const params = { ...(pista.params || {}) };
      // cada pista habla de un numero distinto; se resuelve aca y no en score
      if (pista.clave === 'pista.4') params.n = CONFIG.gemasUmbralVerdadero;
      if (pista.clave === 'pista.2') params.n = CONFIG.gemasUmbral;
      cont.innerHTML = `<b>${esc(t('pista.titulo'))}</b><span>${esc(t(pista.clave, params))}</span>`;
      cont.classList.remove('hide');
    } else cont.classList.add('hide');
  },

  /* --- overlay de debug (§17.5) ---------------------------------------- */
  stats(txt){ this.el['stats'].textContent = txt; },

  dibujarHitboxes(ctx3){
    const cv = this.el['debug2d'];
    if (!CONFIG.debug.hitboxes){
      if (cv.width) { cv.width = 0; }
      return;
    }
    const w = this.el['stage'].clientWidth, h = this.el['stage'].clientHeight;
    if (cv.width !== w){ cv.width = w; cv.height = h; }
    const c = cv.getContext('2d');
    c.clearRect(0, 0, w, h);
    const { player, mundo, vista } = ctx3;
    const p = { x:0, y:0, detras:false };
    const punto = (X, Y, Z) => { vista.proyectar(X, Y, Z, p); return { x:p.x/RW*w, y:p.y/RH*h }; };

    // carriles
    c.strokeStyle = 'rgba(138,127,168,.35)'; c.lineWidth = 1;
    for (const lx of CONFIG.carrilesX){
      c.beginPath();
      const a = punto(lx, 0.05, 2), b = punto(lx, 0.05, -CONFIG.hookAlcance);
      c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
    }
    // hitbox del carrito + estado de transicion del §10
    const cc = CONFIG.carrilesX[player.carrilColision];
    c.strokeStyle = player.enTransicion ? '#FFD166' : '#4CE0D2'; c.lineWidth = 2;
    const e1 = punto(cc - CONFIG.hitboxAncho/2, 0.05,  CONFIG.hitboxProf/2);
    const e2 = punto(cc + CONFIG.hitboxAncho/2, 0.05, -CONFIG.hitboxProf/2);
    c.strokeRect(e1.x, e2.y, e2.x - e1.x, e1.y - e2.y);
    // entidades
    for (const e of mundo.ents){
      if (!e.vivo) continue;
      const q = vista.puntoDe(e);
      const a = punto(q.x - 0.5, 0.05, e.z + 0.4), b = punto(q.x + 0.5, 0.05, e.z - 0.4);
      c.strokeStyle = e.tipo === TIPO.GEMA ? '#4CE0D2' : '#FF3D5A';
      c.lineWidth = 1;
      c.strokeRect(a.x, b.y, b.x - a.x, a.y - b.y);
    }
    c.fillStyle = '#7CFF9E'; c.font = '11px monospace';
    c.fillText(`carril colision ${player.carrilColision}  tTrans ${player.tTrans.toFixed(2)}` +
               `  ${player.tTrans < CONFIG.transicionCorte ? 'ORIGEN' : 'DESTINO'}`, 8, h - 10);
  },
};

function esc(s){
  return String(s).replace(/[&<>"']/g, ch =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
}
