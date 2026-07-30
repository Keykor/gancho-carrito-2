/* ===========================================================================
   Music — §14.2. Secuenciador de 16 pasos agendado con AudioContext.currentTime.
   El scheduler mira 100 ms hacia adelante y corre cada 25 ms. NUNCA se dispara
   una nota desde setInterval ni desde el loop de render: el setInterval es solo
   la bomba, los tiempos son absolutos. Si no, en 2 minutos suena borracho.
   =========================================================================== */
import { CONFIG, clamp, lerp } from './config.js';
import { Audio } from './audio.js';

const MIRAR_ADELANTE = 0.100;   // s
const PERIODO_BOMBA  = 25;      // ms

// La menor: Am – F – C – G. Sencilla, motora, no se cansa en 2 minutos (§14.2).
const PROGRESION = [
  { raiz: 110.00, tonos: [220.00, 261.63, 329.63] },  // Am
  { raiz:  87.31, tonos: [174.61, 220.00, 261.63] },  // F
  { raiz: 130.81, tonos: [261.63, 329.63, 392.00] },  // C
  { raiz:  98.00, tonos: [196.00, 246.94, 293.66] },  // G
];

// Pulso de 25 % de duty como PeriodicWave: a_n = (2/(n·pi))·sin(n·pi·d)
function ondaPulso(ctx, duty = 0.25, armonicos = 24){
  const re = new Float32Array(armonicos + 1), im = new Float32Array(armonicos + 1);
  for (let n = 1; n <= armonicos; n++) im[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
  return ctx.createPeriodicWave(re, im, { disableNormalization: false });
}

export const Music = {
  corriendo: false,
  paso: 0,
  proxima: 0,
  bomba: null,
  progreso: 0,        // 0..1 de la partida
  tramo: 1,
  pulso: null,
  drone: null,

  arrancar(){
    if (!Audio.ctx || this.corriendo) return;
    const ctx = Audio.ctx;
    this.pulso = this.pulso || ondaPulso(ctx);
    this.paso = 0;
    this.proxima = ctx.currentTime + 0.06;
    this.corriendo = true;
    this._armarDrone();
    this.bomba = setInterval(() => this._bombear(), PERIODO_BOMBA);
  },

  parar(){
    this.corriendo = false;
    clearInterval(this.bomba); this.bomba = null;
    if (this.drone){
      const t = Audio.ctx.currentTime;
      this.drone.g.gain.cancelScheduledValues(t);
      this.drone.g.gain.setTargetAtTime(0.0001, t, 0.25);
      const d = this.drone; this.drone = null;
      setTimeout(() => { try { d.a.stop(); d.b.stop(); } catch {} }, 900);
    }
  },

  actualizar(progreso, tramo){
    this.progreso = clamp(progreso, 0, 1);
    this.tramo = tramo;
    if (this.drone && Audio.ctx){
      const t = Audio.ctx.currentTime;
      // el drone sube de volumen con t (§14.2)
      this.drone.g.gain.setTargetAtTime(0.055 + 0.075 * this.progreso, t, 0.4);
      this.drone.f.frequency.setTargetAtTime(320 + 700 * this.progreso, t, 0.8);
    }
  },

  // §14.2: el tempo sube con la partida porque vos acelerás
  get bpm(){ return lerp(CONFIG.bpmIni, CONFIG.bpmFin, this.progreso); },
  get durPaso(){ return 60 / this.bpm / 4; },      // semicorcheas

  _armarDrone(){
    const ctx = Audio.ctx;
    const a = ctx.createOscillator(), b = ctx.createOscillator();
    const f = ctx.createBiquadFilter(), g = ctx.createGain();
    a.type = b.type = 'sawtooth';
    a.frequency.value = 110; b.frequency.value = 110;
    a.detune.value = -6; b.detune.value = 6;        // 6 cents de desafinacion
    f.type = 'lowpass'; f.frequency.value = 320; f.Q.value = 1.2;
    g.gain.value = 0.0001;
    a.connect(f); b.connect(f); f.connect(g); g.connect(Audio.buses.musica);
    a.start(); b.start();
    g.gain.setTargetAtTime(0.055, ctx.currentTime, 0.6);
    this.drone = { a, b, f, g };
  },

  _bombear(){
    if (!this.corriendo || !Audio.ctx) return;
    const ctx = Audio.ctx;
    let guardia = 0;
    while (this.proxima < ctx.currentTime + MIRAR_ADELANTE && guardia++ < 64){
      this._agendar(this.paso, this.proxima);
      this.proxima += this.durPaso;
      this.paso = (this.paso + 1) % 64;             // 4 compases de 16 pasos
    }
  },

  _agendar(paso, t){
    const compas = (paso / 16) | 0;
    const s = paso % 16;
    const acorde = PROGRESION[compas];
    const T = this.tramo;

    // Tramo 5: cortan percusion y arpegio de golpe. Queda el drone y entra una
    // nota larga y limpia que sube. El silencio relativo es la señal (§14.2).
    if (T >= 5){
      if (paso === 0) this._salida(t);
      return;
    }

    if (T >= 1){
      if (s % 2 === 0) this._bajo(acorde.raiz, t);            // corcheas
      if (s === 0 || s === 6 || s === 10) this._bombo(t);
    }
    if (T >= 2){
      if (s === 4 || s === 12) this._redoblante(t);
    }
    if (T >= 3){
      // tresillos sobre el acorde: 3 notas cada 4 semicorcheas
      if (s % 4 === 0){
        for (let k = 0; k < 3; k++)
          this._arpegio(acorde.tonos[(s / 4 + k) % 3] * 2, t + k * this.durPaso * 4 / 3);
      }
    }
    if (T >= 4){
      if (paso === 0 || paso === 32) this._campana(acorde.tonos[0] * 2, t);
    }
  },

  _voz(nodo, t, pico, ataque, caida){
    const g = Audio.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(pico, t + ataque);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ataque + caida);
    nodo.connect(g); g.connect(Audio.buses.musica);
    return g;
  },

  _bajo(f, t){
    const ctx = Audio.ctx, o = ctx.createOscillator(), fl = ctx.createBiquadFilter();
    o.type = 'square'; o.frequency.value = f;
    fl.type = 'lowpass'; fl.frequency.value = 400; fl.Q.value = 1;
    o.connect(fl);
    this._voz(fl, t, 0.16, 0.006, this.durPaso * 1.6);
    o.start(t); o.stop(t + this.durPaso * 2.2);
  },

  _bombo(t){
    const ctx = Audio.ctx, o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.060);   // pitch drop
    this._voz(o, t, 0.42, 0.003, 0.16);
    o.start(t); o.stop(t + 0.20);
  },

  _redoblante(t){
    const ctx = Audio.ctx, n = Audio.fuenteRuido(false), f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 1.4;
    n.connect(f);
    this._voz(f, t, 0.20, 0.002, 0.120);
    n.start(t); n.stop(t + 0.16);
  },

  _arpegio(f, t){
    const ctx = Audio.ctx, o = ctx.createOscillator();
    o.setPeriodicWave(this.pulso); o.frequency.value = f;
    this._voz(o, t, 0.085, 0.004, this.durPaso * 0.9);
    o.start(t); o.stop(t + this.durPaso * 1.4);
  },

  // Campana de alarma: seno + FM, cada 2 compases
  _campana(f, t){
    const ctx = Audio.ctx, port = ctx.createOscillator(), mod = ctx.createOscillator();
    const modG = ctx.createGain();
    port.type = 'sine'; port.frequency.value = f;
    mod.type = 'sine'; mod.frequency.value = f * 1.41;
    modG.gain.value = f * 1.9;
    mod.connect(modG); modG.connect(port.frequency);
    this._voz(port, t, 0.13, 0.004, 1.1);
    port.start(t); mod.start(t); port.stop(t + 1.3); mod.stop(t + 1.3);
  },

  // Tramo 5: una nota larga y limpia que sube. Sobreviviste.
  _salida(t){
    const ctx = Audio.ctx, o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(220, t);
    o.frequency.linearRampToValueAtTime(440, t + 3.0);
    this._voz(o, t, 0.12, 0.9, 2.6);
    o.start(t); o.stop(t + 4.0);
  },
};
