/* ===========================================================================
   Spawner — §9. Sistema de PATRONES, no de spawns aleatorios sueltos: decide
   cual patron y cuando, nunca que hay en cada celda. Logica pura, sin Three.
   =========================================================================== */
import { CONFIG, NCARRILES, clamp, rngCon, velocidadEn, tramoEn } from './config.js';
import { TIPO } from './entities.js';
import { PATRONES, validarPatrones, bloqueadosEnFila } from './patrones.js';

// Espejar un patron duplica el contenido gratis y es lo que permite aplicar el
// 60/40 del §9 sin reescribir las grillas: el mismo patron paga de un lado o
// del otro segun como caiga.
function espejar(patron){
  const swap = c => (c === '<' ? '>' : c === '>' ? '<' : c);
  return {
    ...patron,
    espejado: true,
    filas: patron.filas.map(f => f.split('').reverse().map(swap).join('')),
  };
}

// Carril que sobrevive el patron entero sin gastar un solo gancho, si existe.
// Es el "camino facil" contra el que se mide la colocacion de gemas.
function carrilMasSeguro(patron){
  let mejor = -1, mejorPuntaje = -1;
  for (let c = 0; c < NCARRILES; c++){
    let puntaje = 0, vivo = true;
    for (const fila of patron.filas){
      if (bloqueadosEnFila(fila).has(c)){ vivo = false; break; }
      if (fila[c] === 'g') puntaje++;
    }
    if (vivo && puntaje > mejorPuntaje){ mejor = c; mejorPuntaje = puntaje; }
  }
  return mejor;
}

// Cuantas gemas caen sobre el carril seguro. Sirve para elegir orientacion.
function gemasEnCaminoFacil(patron){
  const c = carrilMasSeguro(patron);
  if (c < 0) return 0;
  return patron.filas.reduce((n, f) => n + (f[c] === 'g' ? 1 : 0), 0);
}

export class Spawner {
  constructor(semilla = 12345){
    this.rnd = rngCon(semilla);
    this.buenos = validarPatrones();
    this.porTramo = [1,2,3,4].map(t => this.buenos.filter(p => p.tramo === t && !p.esCompaniera));
    this.compDeTramo = [1,2,3,4].map(t => this.buenos.find(p => p.tramo === t && p.esCompaniera));
    this.reset();
  }

  reset(){
    this.distancia = 12;                 // un respiro antes del primer patron
    this.bolsa = [[], [], [], []];       // bolsa por tramo: no repite hasta agotar
    this.compHecha = [false, false, false, false];
    this.ultimo = null;
    this.forzado = null;
  }

  forzarPatron(nombre){
    this.forzado = nombre ? this.buenos.find(p => p.nombre === nombre) || null : null;
    return this.forzado;
  }

  // Bolsa sin reposicion: se juegan los 5 del tramo antes de repetir ninguno,
  // que es lo que evita que una corrida se sienta a dos patrones en loop.
  sacarDeBolsa(tramo){
    const i = tramo - 1;
    if (!this.bolsa[i].length){
      this.bolsa[i] = this.porTramo[i].slice();
      // barajado Fisher-Yates con el PRNG con semilla
      for (let k = this.bolsa[i].length - 1; k > 0; k--){
        const j = (this.rnd() * (k + 1)) | 0;
        [this.bolsa[i][k], this.bolsa[i][j]] = [this.bolsa[i][j], this.bolsa[i][k]];
      }
      if (this.bolsa[i].length > 1 && this.bolsa[i][this.bolsa[i].length - 1] === this.ultimo)
        this.bolsa[i].unshift(this.bolsa[i].pop());
    }
    return this.bolsa[i].pop();
  }

  /* §9: las gemas van sobre el camino resoluble el 60 % de las veces y sobre
     el dificil el 40 % restante — el riesgo se paga. Se resuelve eligiendo la
     orientacion del patron en vez de moverle las gemas, asi lo que se juega es
     siempre contenido escrito a mano. */
  orientar(patron){
    const der = patron, izq = espejar(patron);
    const gDer = gemasEnCaminoFacil(der), gIzq = gemasEnCaminoFacil(izq);
    if (gDer === gIzq) return this.rnd() < 0.5 ? der : izq;
    const facil = gDer > gIzq ? der : izq;
    const dificil = gDer > gIzq ? izq : der;
    return this.rnd() < CONFIG.gemasEnCaminoFacil ? facil : dificil;
  }

  // §9: gap = velocidad * (0.9 - tramo*0.08). Dimensionalmente eso es una
  // DISTANCIA (velocidad x segundos); el piso de 0.35 s se aplica al tiempo.
  gapDe(tramo, vel){
    const factor = Math.max(CONFIG.gapFactorBase - tramo * CONFIG.gapFactorTramo,
                            CONFIG.gapMinSeg);
    return vel * factor;
  }

  paso(dt, t, mundo){
    const tramo = tramoEn(t);
    if (tramo >= 5) return null;         // §6: el tramo 5 se limpia, es la recompensa
    const vel = velocidadEn(t);
    this.distancia -= vel * dt;
    if (this.distancia > 0) return null;

    let patron;
    const tr = CONFIG.tramos[tramo - 1];
    const avance = (t - tr.t0) / (tr.t1 - tr.t0);
    // La companiera del tramo no se sortea: se fuerza en un momento fijo (§9.5)
    if (!this.compHecha[tramo - 1] && avance > 0.5 && this.compDeTramo[tramo - 1]){
      this.compHecha[tramo - 1] = true;
      patron = this.compDeTramo[tramo - 1];
    } else {
      patron = this.forzado || this.sacarDeBolsa(tramo);
    }
    if (!patron) return null;

    const orientado = this.orientar(patron);
    this.ultimo = patron;
    const largo = this.volcar(orientado, mundo, tramo);
    this.distancia = this.gapDe(tramo, vel) + largo;
    return orientado;
  }

  // Traduce la grilla a entidades. La ultima fila es la que llega primero, asi
  // que es la que queda mas cerca del carrito (§9.5).
  volcar(patron, mundo, tramo){
    const n = patron.filas.length, sep = CONFIG.gemaSeparacion;
    const largo = (n - 1) * sep;
    for (let i = 0; i < n; i++){
      const z = CONFIG.zSpawn - (n - 1 - i) * sep;
      const fila = patron.filas[i];
      for (let c = 0; c < NCARRILES; c++){
        const ch = fila[c];
        if (ch === '.') continue;
        switch (ch){
          case 'g': mundo.crear(TIPO.GEMA, c, z); break;
          case '#': {
            const e = mundo.crear(TIPO.TRAMPA, c, z);
            if (e) e.variante = ((c + i) % 3);          // 3 modelos, §9
            break;
          }
          case 'm': mundo.crear(TIPO.MOVIL, c, z); break;
          case 'b': mundo.crear(TIPO.MURCIELAGO, c, z); break;
          case '<': case '>': {
            const e = mundo.crear(TIPO.DESVIO, c, z);
            if (e) e.lado = ch === '>' ? 1 : -1;
            break;
          }
          case 'V': {
            // celdas contiguas marcadas = una sola viga (§9.5)
            if (c > 0 && fila[c - 1] === 'V') break;    // ya la creo la primera
            let ancho = 1;
            while (c + ancho < NCARRILES && fila[c + ancho] === 'V') ancho++;
            const e = mundo.crear(TIPO.VIGA, c, z);
            if (e) e.ancho = ancho;
            break;
          }
          case 'C': {
            const e = mundo.crear(TIPO.COMPANIERA, c, z);
            if (e){
              e.idx = tramo;                            // companiera 1..4 por tramo
              // en el saliente del lado mas cercano; si esta al medio, alterna
              e.lado = c < 2 ? -1 : c > 2 ? 1 : (this.rnd() < 0.5 ? -1 : 1);
            }
            break;
          }
        }
      }
    }
    return largo;
  }
}
