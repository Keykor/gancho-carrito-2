/* ===========================================================================
   Game — FSM: TITULO | TUTORIAL | JUGANDO | PAUSA | FINAL, mas el loop().
   Timestep fijo de 60 Hz con acumulador para la logica; el render va
   desacoplado e interpola las posiciones entre ticks (§4).
   =========================================================================== */
import * as THREE from 'three';
import { CONFIG, TICK, NCARRILES, clamp, almacen,
         velocidadEn, tramoEn, reducedMotion } from './config.js';
import { t } from './strings.js';
import { Render, ajustarLetterbox } from './render.js';
import { LUCES_U, MATS } from './shaders.js';
import { TunnelPool } from './tunnel.js';
import { Vista } from './vista.js';
import { Lights } from './lights.js';
import { CameraRig } from './camara.js';
import { Mundo, TIPO } from './entities.js';
import { Spawner } from './spawner.js';
import { Player } from './player.js';
import { Tutorial } from './tutorial.js';
import { HUD } from './hud.js';
import { Audio, Sfx } from './audio.js';
import { Music } from './music.js';
import { CartSfx } from './cartsfx.js';
import { resumenDePartida } from './score.js';
import * as Input from './input.js';

const ESTADO = { TITULO:'titulo', TUTORIAL:'tutorial', JUGANDO:'jugando',
                 PAUSA:'pausa', FINAL:'final' };

export const Game = {
  estado: ESTADO.TITULO,
  freeze: 0,
  tiempo: 0,            // segundos transcurridos de partida
  vel: 0,
  tramo: 1,
  acum: 0,
  ultimo: 0,
  fps: 60, _fpsAcum: 0, _fpsN: 0,
  aviso: '',
  avisoT: 0,

  init(){
    const canvas = document.getElementById('gl');
    if (!Render.init(canvas)){
      const f = document.getElementById('fatal');
      f.classList.remove('hide');
      f.querySelector('h1').textContent = t('fatal.titulo');
      f.querySelector('p').textContent = t('fatal.cuerpo');
      return false;
    }

    // Dos grupos: lo que scrollea hacia Rufa y lo que va montado en el carrito.
    // El offset de interpolacion entre ticks se aplica solo al primero.
    this.scroll = new THREE.Group();
    this.fijo = new THREE.Group();
    Render.escena.add(this.scroll, this.fijo);

    this.mundo = new Mundo();
    this.player = new Player();
    this.spawner = new Spawner(0xC0FFEE);
    this.tutorial = new Tutorial();

    this.tunel = new TunnelPool(this.scroll);
    this.vista = new Vista(this.scroll, this.fijo, Render.camara);
    this.luces = new Lights(this.fijo);
    this.rig = new CameraRig(Render.camara);

    HUD.init();
    HUD.onAccion = {
      // La primera vez, "Bajar a la mina" ES el tutorial: nadie elige aprender
      // a jugar, pero todo el mundo elige jugar.
      jugar:  () => this.empezar(!almacen.leer('gc2.tutorialHecho', false)),
      jugarYa: () => this.empezar(false),
      tutorial: () => this.empezar(true),
      seguir: () => this.despausar(),
      salir:  () => this.alTitulo(),
      pausa:  () => this.togglePausa(),
    };

    Input.registrarAccion('gesto', () => {
      Audio.asegurar().then(ok => { if (ok && this.enPartida) this.arrancarSonido(); });
    });
    Input.registrarAccion('pausa', () => this.togglePausa());
    Input.registrarAccion('aviso', txt => this.mostrarAviso(txt));
    Input.registrarAccion('saltarTramo', () => this.saltarTramo());
    Input.registrarAccion('forzarPatron', n => {
      const p = this.spawner.forzarPatron(n);
      this.mostrarAviso(n ? (p ? 'patron: ' + n : 'no existe: ' + n) : 'patron libre');
    });
    Input.registrarAccion('recargarConfig', () => this.recargarConfig());

    addEventListener('resize', () => { ajustarLetterbox(); this.chequearOrientacion(); });
    addEventListener('orientationchange', () => setTimeout(() => {
      ajustarLetterbox(); this.chequearOrientacion();
    }, 120));
    ajustarLetterbox();
    this.chequearOrientacion();
    this.alTitulo();
    this.ultimo = performance.now() / 1000;
    requestAnimationFrame(() => this.frame());
    return true;
  },

  get enPartida(){ return this.estado === ESTADO.JUGANDO || this.estado === ESTADO.TUTORIAL; },

  /* §17.5 F6: recarga CONFIG en caliente. Casi todo se lee cada frame, asi que
     solo hay que re-empujar lo que vive en uniforms del shader. Con esto se
     balancea la luz entera desde la consola sin recargar la pagina.          */
  recargarConfig(){
    LUCES_U.uAmbiente.value.setHex(CONFIG.ambiente);
    LUCES_U.uFogCol.value.setHex(CONFIG.fogColor);
    LUCES_U.uFogNear.value = CONFIG.fogNear;
    LUCES_U.uFogFar.value = CONFIG.fogFar;
    LUCES_U.uCono.value.set(CONFIG.luzConoDesde, CONFIG.luzConoHasta,
                            CONFIG.luzDerrame, CONFIG.luzAlcance);
    for (const c of LUCES_U.uLuzCol.value) c.setHex(CONFIG.luzColor);
    Render.postMat.uniforms.uNiveles.value = CONFIG.nivelesColor;
    Render.postMat.uniforms.uDither.value = CONFIG.ditherFuerza;
    this.mostrarAviso('CONFIG recargado');
  },

  mostrarAviso(txt){ this.aviso = txt; this.avisoT = 1.4; },

  /* El juego es 4:3 apaisado por diseño (§17.6). En vertical entra, pero queda
     tan chico que apuntar deja de ser posible, y el gancho apuntado es TODO el
     juego. Se pide girar el telefono en vez de rediseñar el HUD para un
     formato que la camara no soporta. Solo aplica a pantallas de mano: en un
     monitor angosto no molesta a nadie. */
  chequearOrientacion(){
    const deMano = matchMedia('(pointer: coarse)').matches;
    const vertical = innerHeight > innerWidth;
    const chico = Math.min(innerWidth, innerHeight) < 560;
    const pedir = deMano && vertical && chico;
    document.getElementById('girar').classList.toggle('hide', !pedir);
    if (pedir && this.enPartida) this.togglePausa();
  },

  /* --- transiciones ---------------------------------------------------- */
  alTitulo(){
    this.estado = ESTADO.TITULO;
    this.pararSonido();
    HUD.mostrar('titulo');
    HUD.beat('');
    this.reiniciarMundo();
    // el carrito da vueltas de fondo en el titulo
    this.tiempo = 0; this.vel = velocidadEn(0) * 0.55; this.tramo = 1;
  },

  empezar(esTutorial){
    // §12.5: el tutorial se lanza solo la primera vez que alguien abre el juego
    this.reiniciarMundo();
    this.estado = esTutorial ? ESTADO.TUTORIAL : ESTADO.JUGANDO;
    this.tiempo = 0;
    this.tramo = 1;
    HUD.mostrar(null);
    if (esTutorial) this.tutorial.reset();
    else HUD.beat('');
    Audio.asegurar().then(ok => { if (ok) this.arrancarSonido(); });
  },

  terminarTutorial(){
    almacen.escribir('gc2.tutorialHecho', true);
    this.estado = ESTADO.FINAL;        // congela el mundo detras de la placa
    this.pararSonido();
    HUD.beat('');
    HUD.mostrar('tutfin');
  },

  reiniciarMundo(){
    this.mundo.reset();
    this.player.reset();
    this.spawner.reset();
    this.tunel.reset();
    this.vista.reset();
    this.luces.reset();
    this.rig.reset();
    this.freeze = 0;
    Render.flash(0);
  },

  arrancarSonido(){
    Music.arrancar();
    CartSfx.arrancar();
  },
  pararSonido(){
    Music.parar();
    CartSfx.parar();
  },

  togglePausa(){
    if (this.estado === ESTADO.JUGANDO || this.estado === ESTADO.TUTORIAL){
      this.estadoPrevio = this.estado;
      this.estado = ESTADO.PAUSA;
      HUD.mostrar('pausa');
      if (Audio.ctx) Audio.master.gain.setTargetAtTime(0.0001, Audio.ctx.currentTime, 0.05);
    } else if (this.estado === ESTADO.PAUSA){
      this.despausar();
    }
  },

  despausar(){
    this.estado = this.estadoPrevio || ESTADO.JUGANDO;
    HUD.mostrar(null);
    Audio.aplicarVolumenes();
  },

  terminar(escapo){
    this.estado = ESTADO.FINAL;
    this.pararSonido();
    const r = resumenDePartida(this.player, escapo, CONFIG.duracion - this.tiempo);
    HUD.pintarFinal(r);
    HUD.mostrar('final');
    if (escapo) Sfx.rescate(); else Sfx.impacto();
  },

  // F4 (§17.5)
  saltarTramo(){
    const tr = CONFIG.tramos.find(x => x.n === Math.min(5, this.tramo + 1));
    if (tr){ this.tiempo = tr.t0 + 0.01; this.mostrarAviso('tramo ' + tr.n + ' ' + tr.nombre); }
  },

  /* --- tick de logica: 60 Hz fijo -------------------------------------- */
  tick(dt){
    const p = this.player;

    if (this.avisoT > 0) this.avisoT -= dt;

    if (this.estado === ESTADO.TITULO){
      this.tunel.paso(dt, this.vel, 1, 0);
      this.luces.paso(dt, 0, 0, this.vel);
      this.rig.paso(dt, 0, 0);
      this.vista.paso(dt, this.mundo, p, 0, this.vel, 1);
      return;
    }
    if (!this.enPartida) return;

    const esTut = this.estado === ESTADO.TUTORIAL;

    // --- tiempo y velocidad --------------------------------------------
    if (!esTut){
      this.tiempo += dt;
      if (this.tiempo >= CONFIG.duracion){ this.terminar(p.vidas > 0); return; }
    }
    const tramoNuevo = esTut ? 1 : tramoEn(this.tiempo);
    if (tramoNuevo !== this.tramo){ this.tramo = tramoNuevo; }
    this.vel = velocidadEn(esTut ? 8 : this.tiempo)
             * p.factorVelocidad()
             * (esTut ? this.tutorial.factorVelocidad() : 1);

    // --- input ----------------------------------------------------------
    const resolver = this.vista.hacerResolver(this.mundo, p);
    const ahora = performance.now() / 1000;
    if (p.forzado <= 0){
      for (const ev of Input.tomarEventos()) p.intentarDisparo(ev, resolver, ahora);
    } else Input.limpiar();

    // --- mundo ----------------------------------------------------------
    this.mundo.paso(dt, this.vel, p, p.hab);
    p.paso(dt, this.mundo, ahora, resolver);

    if (esTut){
      // sin daño y sin cronometro (§12.5)
      p.sinDaño = true; p.vidas = CONFIG.vidas;
      this.tutorial.paso(dt, this.mundo, p, p.eventos, this.vel);
      if (this.tutorial.recienCumplido){
        // sin fogonazo: en el tutorial el flash tapaba justo lo que acababas
        // de hacer, que es lo unico que hay para ver
        Sfx.rescate();
        this.vista.emitirPolvo(p.x, 0.9, 0, 10, 1.2);
      }
      HUD.beat(this.tutorial.textoActual(t));
      if (this.tutorial.terminado) this.terminarTutorial();
    } else {
      this.spawner.paso(dt, this.tiempo, this.mundo);
      if (p.vidas <= 0){ this.terminar(false); return; }
    }

    this.procesarEventos();

    // --- presentacion ---------------------------------------------------
    this.tunel.paso(dt, this.vel, this.tramo, this.tiempo);
    this.luces.paso(dt, p.x, p.companieras.length, this.vel);
    this.rig.paso(dt, p.x, this.tiempo, p.companieras.length);
    this.vista.paso(dt, this.mundo, p, this.tiempo, this.vel, this.tramo);

    /* El audio del tutorial NO va con la velocidad del tutorial. El volumen del
       drone sale del avance de partida y el del rodamiento sale de la
       velocidad (§14.2, §14.3); en el tutorial el reloj esta en 0 y el carrito
       va a 5 u/s, asi que todo queda en su minimo y suena a que no hay sonido.
       Se le da un piso: el tutorial tiene que sonar como suena el juego. */
    const progAudio = esTut ? 0.14 : this.tiempo / CONFIG.duracion;
    const velAudio  = esTut ? Math.max(this.vel, velocidadEn(0) * 0.9) : this.vel;
    Music.actualizar(progAudio, this.tramo);
    CartSfx.actualizar(dt, velAudio, esTut ? 10 : this.tiempo, this.mundo.zAcum);
  },

  procesarEventos(){
    for (const ev of this.player.tomarEventos()){
      switch (ev.tipo){
        case 'gancho-sale':   break;
        case 'gancho-impacto':
          this.vista.emitirChispa(ev.x, ev.y, ev.z);
          if (ev.clase === 'pared') Sfx.paredImpacto();
          break;
        case 'gancho-vacio':  Sfx.clank(); this.rig.sacudir(0.10); break;
        case 'gancho-rebote': Sfx.clank(); this.rig.sacudir(0.16); break;
        case 'tiron':
          this.rig.rolar(this.player.carrilDestino > this.player.carrilOrigen ? 1 : -1,
                         ev.carriles / 2);
          this.rig.sacudir(0.05 * ev.carriles);
          CartSfx.chirrido(ev.carriles);
          break;
        case 'gema': {
          const p = this.player;
          for (let i = 0; i < ev.n; i++) Sfx.gema(p.tonoCadena + i);
          p.tonoCadena = Math.min(p.tonoCadena + ev.n, 16);
          p.tUltimaGema = performance.now() / 1000;
          break;
        }
        case 'murcielago-muerto': Sfx.murcielagoMuere(); break;
        case 'rescate':
          HUD.rescate(ev.idx);
          Sfx.rescate();
          Render.flash(0.85, 0xFFD166);       // fogonazo de luz (§8)
          this.luces.encender(1 + this.player.companieras.length);
          break;
        case 'escudo-roto':  Sfx.escudo(true); this.rig.sacudir(0.2); break;
        case 'escudo-listo': Sfx.escudo(false); break;
        case 'impacto':
          Sfx.impacto();
          this.rig.sacudir(CONFIG.shakeImpacto);
          Render.flash(0.5, 0xFF3D5A);
          this.vista.emitirPolvo(this.player.x, 0.6, 0, 12, 1.4);
          break;
        case 'desvio':
          this.rig.rolar(ev.lado, 0.6);
          CartSfx.chirrido(1);
          break;
        case 'freeze':
          // §7.5: freeze frame en cada enganche. Es barato y hace toda la
          // diferencia.
          if (!reducedMotion) this.freeze = Math.max(this.freeze, ev.dur);
          break;
      }
    }
  },

  /* --- loop (§4) -------------------------------------------------------- */
  frame(){
    requestAnimationFrame(() => this.frame());
    const ahora = performance.now() / 1000;
    let dt = Math.min(ahora - this.ultimo, 0.25);
    this.ultimo = ahora;

    this._fpsAcum += dt; this._fpsN++;
    if (this._fpsAcum >= 0.5){
      this.fps = this._fpsN / this._fpsAcum;
      this._fpsAcum = 0; this._fpsN = 0;
    }

    // freeze frame: se congela la logica, no el render
    if (this.freeze > 0){ this.freeze -= dt; dt = 0; }

    if (this.estado !== ESTADO.PAUSA && this.estado !== ESTADO.FINAL){
      this.acum += dt;
      let guardia = 0;
      while (this.acum >= TICK && guardia++ < 6){ this.tick(TICK); this.acum -= TICK; }
    }

    // interpolacion entre ticks: todo lo que scrollea se corre la fraccion de
    // tick que falta. Rufa y el carrito no, porque no scrollean.
    const alfa = clamp(this.acum / TICK, 0, 1);
    this.scroll.position.z = this.vel * alfa * TICK;

    Render.decaerFlash(dt);
    Render.dibujar();

    HUD.actualizar(dt, {
      player: this.player, tiempo: CONFIG.duracion - this.tiempo,
      mundo: this.mundo, vista: this.vista, vel: this.vel,
      entrada: Input.estado, enJuego: this.enPartida,
    });
    HUD.dibujarHitboxes({ player: this.player, mundo: this.mundo, vista: this.vista });

    if (CONFIG.debug.stats) this.pintarStats();
  },

  pintarStats(){
    const i = Render.info;
    const nodos = (Music.corriendo ? 5 : 0) + (CartSfx.corriendo ? 6 : 0) + 5;
    HUD.stats(
      `fps      ${this.fps.toFixed(1)}\n` +
      `draws    ${i.render.calls}   (max 40)\n` +
      `tris     ${i.render.triangles}   (max 25000)\n` +
      `geoms    ${i.memory.geometries}  texturas ${i.memory.textures}\n` +
      `audio    ~${nodos} nodos sostenidos (max 30)\n` +
      `t        ${this.tiempo.toFixed(1)}s  tramo ${this.tramo}\n` +
      `vel      ${this.vel.toFixed(1)} u/s\n` +
      `ents     ${this.mundo.ents.filter(e => e.vivo).length} vivas` +
      `  (gemas ${this.mundo.vivos(TIPO.GEMA).filter(e => e.vivo).length})\n` +
      `carril   ${this.player.carrilColision}  tTrans ${this.player.tTrans.toFixed(2)}\n` +
      `cooldown ${this.player.cooldown.toFixed(3)}\n` +
      (this.avisoT > 0 ? `> ${this.aviso}\n` : ''));
  },
};
