/* ===========================================================================
   Audio — §14.1. Todo sintetizado, cero archivos, igual que las texturas.
       MUSICA  ─┐
       CARRITO ─┼─→ MASTER → limitador → salida
       EFECTOS ─┘
   Presupuesto: menos de 30 nodos sostenidos. Los efectos crean y descartan sus
   nodos; musica y carrito corren sobre nodos fijos.
   =========================================================================== */
import { CONFIG, clamp, almacen } from './config.js';

const POR_DEFECTO = { musica: 70, efectos: 85, general: 80 };

export const Audio = {
  ctx: null, master: null, limitador: null,
  buses: { musica: null, carrito: null, efectos: null },
  vol: almacen.leer('gc2.audio', { ...POR_DEFECTO }),
  ruidoBlanco: null, ruidoRosa: null,
  listo: false,
  _duckHasta: 0,

  init(){
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;                                   // sin audio el juego anda igual
    this.ctx = new AC({ latencyHint: 'interactive' });

    // §14.1: el limitador es lo que deja meter golpes fuertes sin clipear
    this.limitador = this.ctx.createDynamicsCompressor();
    this.limitador.threshold.value = -8;
    this.limitador.knee.value = 6;
    this.limitador.ratio.value = 12;
    this.limitador.attack.value = 0.003;
    this.limitador.release.value = 0.18;

    this.master = this.ctx.createGain();
    this.master.connect(this.limitador);
    this.limitador.connect(this.ctx.destination);

    for (const b of ['musica', 'carrito', 'efectos']){
      const g = this.ctx.createGain();
      g.connect(this.master);
      this.buses[b] = g;
    }

    this.ruidoBlanco = this._bufferRuido(false);
    this.ruidoRosa   = this._bufferRuido(true);
    this.aplicarVolumenes();
    this.listo = true;
  },

  /* §14.1: el contexto arranca suspendido hasta el primer gesto, como exige el
     navegador. En iOS ademas hay dos trampas propias:

     1. El interruptor de silencio del costado del telefono apaga el WebAudio.
        Se esquiva reproduciendo un <audio> mudo en loop: eso cambia la
        categoria de sesion de audio a "playback" y a partir de ahi el WebAudio
        suena aunque el telefono este en silencio. Es feo y es lo que hay.

     2. El resume() tiene que salir de adentro del gesto. Por eso init() y
        resume() se llaman sincronicos, antes de cualquier await.             */
  _mudo: null,
  _desbloquearIOS(){
    // OJO: aca dentro `Audio` es ESTE objeto, no el constructor del navegador.
    // `new Audio(url)` tira TypeError, y como asegurar() es async la excepcion
    // se convierte en una promesa rechazada: el .then() que arranca la musica
    // no corre nunca y el juego se queda mudo. Por eso va createElement, y por
    // eso todo esto va adentro de un try: desbloquear el audio de iOS no puede
    // ser capaz de romper el audio de nadie mas.
    if (this._mudo) { this._mudo.play?.().catch(() => {}); return; }
    try {
    // WAV de un cuarto de segundo en silencio, armado a mano (44 bytes de
    // cabecera + ceros): mas corto que pegar un base64 y se lee.
    const n = 1102, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    const txt = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    txt(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); txt(8, 'WAVEfmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 44100, true); v.setUint32(28, 88200, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    txt(36, 'data'); v.setUint32(40, n * 2, true);
    const a = document.createElement('audio');
    a.src = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
    a.loop = true; a.volume = 0.001;
    a.setAttribute('playsinline', '');
    this._mudo = a;
    a.play().catch(() => {});
    } catch { /* sin el truco de iOS el juego suena igual en todo lo demas */ }
  },

  async asegurar(){
    this.init();
    try { this._desbloquearIOS(); } catch { /* nunca puede frenar el arranque */ }
    if (this.ctx && this.ctx.state === 'suspended'){
      try { await this.ctx.resume(); } catch { /* el usuario decide */ }
    }
    return this.ctx && this.ctx.state === 'running';
  },
  get suspendido(){ return !this.ctx || this.ctx.state !== 'running'; },

  /* En pausa se suspende el CONTEXTO, no se baja el master. Bajando el volumen
     el secuenciador seguia corriendo mudo y agendando notas contra un reloj que
     no paraba: al volver, la musica habia "avanzado" sola. Suspendido, el reloj
     del audio se congela y todo retoma exactamente donde estaba. */
  pausar(){ if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); },
  reanudar(){
    if (!this.ctx) return;
    this.ctx.resume().catch(() => {});
    this.aplicarVolumenes();
  },

  // §14.1: curva logaritmica, no lineal — un slider lineal se siente todo
  // apretado arriba.
  _g(v){ const x = clamp(v, 0, 100) / 100; return x * x; },

  aplicarVolumenes(){
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this._g(this.vol.general), t, 0.02);
    this.buses.musica.gain.setTargetAtTime(this._g(this.vol.musica), t, 0.02);
    this.buses.efectos.gain.setTargetAtTime(this._g(this.vol.efectos), t, 0.02);
    // el carrito va con los efectos: es diegetico, no musica
    this.buses.carrito.gain.setTargetAtTime(this._g(this.vol.efectos) * 0.9, t, 0.02);
  },

  setVol(cual, v){
    this.vol[cual] = clamp(v | 0, 0, 100);
    almacen.escribir('gc2.audio', this.vol);
    this.aplicarVolumenes();
  },

  // §14.1: en cada impacto la musica baja a 40 % por 250 ms y vuelve. Hace que
  // el golpe se sienta sin subir el volumen de nada.
  duck(){
    if (!this.ctx) return;
    const t = this.ctx.currentTime, g = this.buses.musica.gain;
    const pleno = this._g(this.vol.musica);
    g.cancelScheduledValues(t);
    g.setValueAtTime(pleno * CONFIG.duckGain, t);
    g.linearRampToValueAtTime(pleno, t + CONFIG.duckDur);
  },

  _bufferRuido(rosa){
    const n = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    if (!rosa){
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    } else {
      // aproximacion de Paul Kellet: ruido rosa barato y suficiente
      let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
      for (let i = 0; i < n; i++){
        const w = Math.random() * 2 - 1;
        b0 = 0.99886*b0 + w*0.0555179; b1 = 0.99332*b1 + w*0.0750759;
        b2 = 0.96900*b2 + w*0.1538520; b3 = 0.86650*b3 + w*0.3104856;
        b4 = 0.55000*b4 + w*0.5329522; b5 = -0.7616*b5 - w*0.0168980;
        d[i] = (b0+b1+b2+b3+b4+b5+b6 + w*0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    }
    return buf;
  },

  fuenteRuido(rosa){
    const s = this.ctx.createBufferSource();
    s.buffer = rosa ? this.ruidoRosa : this.ruidoBlanco;
    s.loop = true;
    return s;
  },
};

/* ===========================================================================
   Efectos — §14.4. Crean y descartan sus nodos; ninguno queda sostenido.
   =========================================================================== */
const A = Audio;
const ahora = () => A.ctx.currentTime;

function env(nodo, t0, pico, ataque, caida){
  const g = nodo.gain;
  g.setValueAtTime(0.0001, t0);
  g.exponentialRampToValueAtTime(Math.max(pico, 0.0001), t0 + ataque);
  g.exponentialRampToValueAtTime(0.0001, t0 + ataque + caida);
}

function conectar(nodo, bus){ nodo.connect(A.buses[bus] || A.buses.efectos); }

export const Sfx = {
  // Gancho impacta pared: click metalico
  paredImpacto(){
    if (A.suspendido) return;
    const t = ahora(), g = A.ctx.createGain(), f = A.ctx.createBiquadFilter();
    const n = A.fuenteRuido(false), o = A.ctx.createOscillator();
    f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = 2.5;
    o.type = 'square'; o.frequency.setValueAtTime(880, t);
    o.frequency.exponentialRampToValueAtTime(420, t + 0.06);
    n.connect(f); f.connect(g); o.connect(g); conectar(g, 'efectos');
    env(g, t, 0.35, 0.002, 0.060);
    n.start(t); o.start(t); n.stop(t + 0.09); o.stop(t + 0.09);
  },

  // Gema: el tono sube 1 semitono por gema encadenada (§14.4)
  gema(paso){
    if (A.suspendido) return;
    const t = ahora(), o = A.ctx.createOscillator(), g = A.ctx.createGain();
    o.type = 'sine';
    o.frequency.value = 660 * Math.pow(2, clamp(paso, 0, 16) / 12);
    o.connect(g); conectar(g, 'efectos');
    env(g, t, 0.30, 0.004, 0.170);
    o.start(t); o.stop(t + 0.20);
  },

  // Gancho al vacio / trampa: tiene que sonar a error. Sordo y sin brillo.
  clank(){
    if (A.suspendido) return;
    const t = ahora(), n = A.fuenteRuido(false), f = A.ctx.createBiquadFilter();
    const g = A.ctx.createGain();
    f.type = 'lowpass'; f.frequency.value = 700; f.Q.value = 0.7;
    n.connect(f); f.connect(g); conectar(g, 'efectos');
    env(g, t, 0.30, 0.003, 0.130);
    n.start(t); n.stop(t + 0.16);
  },

  impacto(){
    if (A.suspendido) return;
    const t = ahora(), n = A.fuenteRuido(false), f = A.ctx.createBiquadFilter();
    const sh = A.ctx.createWaveShaper(), g = A.ctx.createGain();
    const c = new Float32Array(257);
    for (let i = 0; i < 257; i++){ const x = i / 128 - 1; c[i] = Math.tanh(x * 3.2); }
    sh.curve = c;
    f.type = 'lowpass'; f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(120, t + 0.30);
    n.connect(f); f.connect(sh); sh.connect(g); conectar(g, 'efectos');
    env(g, t, 0.85, 0.004, 0.300);
    n.start(t); n.stop(t + 0.34);
    A.duck();                                   // §14.1
  },

  murcielago(){
    if (A.suspendido) return;
    const t = ahora(), o = A.ctx.createOscillator(), g = A.ctx.createGain();
    o.type = 'sawtooth';
    const base = 1500 + Math.random() * 900;
    o.frequency.setValueAtTime(base, t);
    o.frequency.exponentialRampToValueAtTime(base * 0.55, t + 0.18);
    o.connect(g); conectar(g, 'efectos');
    env(g, t, 0.16, 0.006, 0.170);
    o.start(t); o.stop(t + 0.20);
  },

  murcielagoMuere(){
    if (A.suspendido) return;
    const t = ahora(), o = A.ctx.createOscillator(), g = A.ctx.createGain();
    o.type = 'square'; o.frequency.setValueAtTime(1800, t);
    o.frequency.exponentialRampToValueAtTime(200, t + 0.05);
    o.connect(g); conectar(g, 'efectos');
    env(g, t, 0.30, 0.002, 0.050);              // corte seco
    o.start(t); o.stop(t + 0.07);
  },

  // El unico sonido "lindo" del juego (§14.4)
  rescate(){
    if (A.suspendido) return;
    const t = ahora();
    [0, 4, 7].forEach((semi, i) => {
      const o = A.ctx.createOscillator(), g = A.ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = 440 * Math.pow(2, semi / 12);
      o.connect(g); conectar(g, 'efectos');
      env(g, t + i * 0.075, 0.28, 0.008, 0.45);
      o.start(t + i * 0.075); o.stop(t + i * 0.075 + 0.5);
    });
  },

  escudo(roto){
    if (A.suspendido) return;
    const t = ahora(), o = A.ctx.createOscillator(), g = A.ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(roto ? 700 : 400, t);
    o.frequency.exponentialRampToValueAtTime(roto ? 180 : 900, t + 0.22);
    o.connect(g); conectar(g, 'efectos');
    env(g, t, 0.22, 0.005, 0.22);
    o.start(t); o.stop(t + 0.26);
  },

  crujido(){
    if (A.suspendido) return;
    const t = ahora(), n = A.fuenteRuido(true), f = A.ctx.createBiquadFilter();
    const g = A.ctx.createGain();
    f.type = 'bandpass'; f.frequency.value = 300 + Math.random() * 500; f.Q.value = 8;
    n.connect(f); f.connect(g); conectar(g, 'efectos');
    env(g, t, 0.12, 0.02, 0.32);
    n.start(t); n.stop(t + 0.38);
  },

  ui(agudo){
    if (A.suspendido) return;
    const t = ahora(), o = A.ctx.createOscillator(), g = A.ctx.createGain();
    o.type = 'square'; o.frequency.value = agudo ? 880 : 440;
    o.connect(g); conectar(g, 'efectos');
    env(g, t, 0.14, 0.003, 0.07);
    o.start(t); o.stop(t + 0.09);
  },
};
