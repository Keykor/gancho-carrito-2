/* ===========================================================================
   CartSfx — §14.3. Tres capas, siempre corriendo, todas manejadas por la
   velocidad. Son el 80 % de la sensacion de velocidad del juego: con el sonido
   apagado el juego se siente notablemente mas lento aunque se mueva igual.
   =========================================================================== */
import { CONFIG, clamp, lerp, velocidadEn } from './config.js';
import { Audio, Sfx } from './audio.js';

export const CartSfx = {
  corriendo: false,
  rodam: null,
  rumble: null,
  distanciaClack: 0,
  tProxCrujido: 0,

  arrancar(){
    if (!Audio.ctx || this.corriendo) return;
    const ctx = Audio.ctx;

    // 1. Rodamiento: un solo nodo encendido toda la partida.
    const n = Audio.fuenteRuido(true);
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    f.type = 'bandpass'; f.frequency.value = CONFIG.rodamHzMin; f.Q.value = 0.9;
    g.gain.value = 0.0001;
    n.connect(f); f.connect(g); g.connect(Audio.buses.carrito);
    n.start();
    this.rodam = { n, f, g };

    // Rumble grave del derrumbe: entra en los ultimos 20 s (§6)
    const rn = Audio.fuenteRuido(true);
    const rf = ctx.createBiquadFilter();
    const rg = ctx.createGain();
    rf.type = 'lowpass'; rf.frequency.value = 70; rf.Q.value = 0.7;
    rg.gain.value = 0.0001;
    rn.connect(rf); rf.connect(rg); rg.connect(Audio.buses.carrito);
    rn.start();
    this.rumble = { n: rn, f: rf, g: rg };

    this.distanciaClack = 0;
    this.tProxCrujido = 1.5;
    this.corriendo = true;
  },

  parar(){
    if (!this.corriendo) return;
    this.corriendo = false;
    const t = Audio.ctx.currentTime;
    for (const capa of [this.rodam, this.rumble]){
      if (!capa) continue;
      capa.g.gain.cancelScheduledValues(t);
      capa.g.gain.setTargetAtTime(0.0001, t, 0.15);
      const c = capa;
      setTimeout(() => { try { c.n.stop(); } catch {} }, 600);
    }
    this.rodam = this.rumble = null;
  },

  // vel en u/s, t en segundos de partida, dist = distancia recorrida total
  actualizar(dt, vel, t, dist){
    if (!this.corriendo || !Audio.ctx) return;
    const ctx = Audio.ctx, ahora = ctx.currentTime;
    const vMin = velocidadEn(0), vMax = velocidadEn(CONFIG.duracion);
    const p = clamp((vel - vMin) / (vMax - vMin), 0, 1);

    // el centro del bandpass y la ganancia salen los dos de la velocidad
    this.rodam.f.frequency.setTargetAtTime(lerp(CONFIG.rodamHzMin, CONFIG.rodamHzMax, p), ahora, 0.08);
    this.rodam.g.gain.setTargetAtTime(lerp(0.10, 0.26, p), ahora, 0.10);

    const rum = clamp((t - CONFIG.rumbleDesde) / (CONFIG.duracion - CONFIG.rumbleDesde), 0, 1);
    this.rumble.g.gain.setTargetAtTime(0.0001 + rum * 0.45, ahora, 0.30);

    // 2. Clack de las juntas: cada 4 u recorridas — que es justo el largo del
    // segmento de tunel, asi que la frecuencia sale sola de la velocidad.
    this.distanciaClack += vel * dt;
    while (this.distanciaClack >= CONFIG.largoSegmento){
      this.distanciaClack -= CONFIG.largoSegmento;
      const t0 = ahora + 0.005;
      this._click(t0, p);
      this._click(t0 + CONFIG.clackSepar, p * 0.85);   // eje trasero: con uno
    }                                                   // solo suena a metronomo

    // Ambiente: crujidos de madera aleatorios (§14.4)
    this.tProxCrujido -= dt;
    if (this.tProxCrujido <= 0){
      this.tProxCrujido = 2.5 + Math.random() * 5;
      Sfx.crujido();
    }
  },

  _click(t, p){
    const ctx = Audio.ctx;
    const n = Audio.fuenteRuido(false), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'bandpass'; f.frequency.value = 1200 + p * 1400; f.Q.value = 3.5;
    n.connect(f); f.connect(g); g.connect(Audio.buses.carrito);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16 + p * 0.14, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);
    n.start(t); n.stop(t + 0.04);
  },

  // 3. Chirrido de cambio de carril: cuanto mas brusco el tiron, mas agudo.
  chirrido(carriles){
    if (!this.corriendo || Audio.suspendido) return;
    const ctx = Audio.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    const alto = carriles >= 2;
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(alto ? 300 : 220, t);
    o.frequency.exponentialRampToValueAtTime(alto ? 1500 : 900, t + 0.18);
    f.type = 'bandpass'; f.frequency.value = alto ? 2200 : 1500; f.Q.value = 5;
    o.connect(f); f.connect(g); g.connect(Audio.buses.carrito);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(alto ? 0.22 : 0.15, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.start(t); o.stop(t + 0.20);
  },
};
