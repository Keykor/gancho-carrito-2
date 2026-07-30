/* ===========================================================================
   Tutorial — §12.5. Una pantalla de instrucciones no alcanza: el gancho hace
   cuatro cosas distintas segun a que le apuntes, y ademas se junta por
   contacto. Hay que HACERLO, no leerlo.
   Sin cronometro y sin daño. Cada beat esta bloqueado hasta que lo hacés: el
   carrito frena hasta casi detenerse y arranca cuando cumplis.
   =========================================================================== */
import { CONFIG, NCARRILES, clamp } from './config.js';
import { TIPO } from './entities.js';

const Z_PONER = -34;   // lejos: las cosas LLEGAN por la niebla, no aparecen
/* Cinco beats. El §12.5 tenia la pared, el pasar por encima, el gancho a
   distancia, el murcielago y "la eleccion". Los tres primeros ensenan el verbo;
   el cuarto y el quinto ensenan las dos cosas que el gancho hace y que nadie
   descubre solo: matar al bicho y subir a una companiera. "La eleccion" se
   aprende jugando — que un obstaculo y una gema compitan por el mismo gancho
   pasa solo, todo el tiempo, y no hace falta un beat para eso. */
const BEATS = 5;

export class Tutorial {
  constructor(){ this.reset(); }

  reset(){
    this.beat = 0;
    this.puesto = false;
    this.cumplido = false;
    this.tSalida = 0;
    this.gemasAlEmpezar = 0;
    this.reintento = 0;
    this.terminado = false;
    this.recienCumplido = false;
    this.vel = 1;               // factor suavizado
  }

  // El carrito frena hasta casi detenerse en cada beat y arranca cuando cumplis
  velObjetivo(){
    if (this.terminado || this.cumplido) return 1;
    switch (this.beat){
      case 0: return 0.18;        // pared: no hace falta avanzar nada
      case 1: return 0.70;
      case 2: return 0.64;
      case 3: return 0.60;
      case 4: return 0.55;
      default: return 1;
    }
  }

  /* El factor va SUAVIZADO. Saltar de 0.18 a 1 de un frame al otro es un tiron
     de camara y de audio que se siente como un bug; el tutorial es lo primero
     que ve alguien que nunca jugo, y no puede parecer roto. */
  factorVelocidad(){ return this.vel; }

  textoActual(t){
    if (this.terminado) return t('tutorial.listo');
    if (this.cumplido) return t('tutorial.bien');
    return t(`tutorial.beat${this.beat + 1}`);
  }

  paso(dt, mundo, player, eventos, vel){
    this.recienCumplido = false;
    // acelera rapido y frena despacio: entrar en un beat se nota, salir fluye
    const obj = this.velObjetivo();
    const k = 1 - Math.pow(obj > this.vel ? 0.06 : 0.4, dt);
    this.vel += (obj - this.vel) * k;
    if (this.terminado) return;

    if (!this.puesto){ this.preparar(mundo, player); this.puesto = true; }

    if (!this.cumplido){
      if (this.chequear(mundo, player, eventos)){
        this.cumplido = true;
        this.recienCumplido = true;
        this.tSalida = this.beat === BEATS - 1 ? 1.0 : 0.8;
      } else if (this.expiro(mundo)){
        // si lo dejaste pasar, se vuelve a poner: el beat no se saltea solo
        this.reintento++;
        this.preparar(mundo, player);
      }
    } else {
      this.tSalida -= dt;
      if (this.tSalida <= 0){
        this.beat++;
        this.puesto = false;
        this.cumplido = false;
        if (this.beat >= BEATS) this.terminado = true;
      }
    }
  }

  // Solo se borra lo que todavia esta lejos. Lo que ya viene encima se deja
  // pasar de largo: hacer desaparecer cosas delante del jugador se ve peor que
  // dejarlas terminar de pasar.
  limpiar(mundo){
    for (const e of mundo.ents) if (e.vivo && e.z < -12) mundo.matar(e, false);
  }

  preparar(mundo, player){
    this.limpiar(mundo);
    this.gemasAlEmpezar = player.gemas;
    const carril = player.carrilColision;
    const opuesto = carril <= 2 ? NCARRILES - 1 : 0;
    const sep = CONFIG.gemaSeparacion;

    switch (this.beat){
      case 0:
        // Tunel vacio. Solo hace falta que le pegue a una pared.
        break;

      case 1:
        // §12.5-2: una linea de gemas en TU carril, sin obstaculos. No dice
        // nada: las juntas sin querer y suena el arpegio.
        for (let i = 0; i < 5; i++) mundo.crear(TIPO.GEMA, carril, Z_PONER - i * sep);
        break;

      case 2: {
        // §12.5-3: linea de gemas en el carril opuesto, con una trampa en el
        // medio que te impide llegar. Unica salida: engancharlas.
        for (let i = 0; i < 5; i++) mundo.crear(TIPO.GEMA, opuesto, Z_PONER - i * sep);
        const medio = opuesto > carril ? carril + 1 : carril - 1;
        for (let i = 0; i < 3; i++){
          const e = mundo.crear(TIPO.TRAMPA, clamp(medio, 0, NCARRILES - 1), Z_PONER - i * sep);
          if (e) e.variante = 1;
        }
        break;
      }

      case 3:
        // §12.5-4: uno solo, de frente, lento. Sin nada mas en pantalla.
        mundo.crear(TIPO.MURCIELAGO, carril, Z_PONER);
        break;

      case 4: {
        // La companiera. En la partida corre a la par 1.2 s (§8); aca la
        // ventana es el triple, porque es la unica vez que se puede fallar sin
        // que cueste, y errarle en el tutorial es no aprender la mecanica.
        const e = mundo.crear(TIPO.COMPANIERA, carril <= 2 ? 0 : NCARRILES - 1, Z_PONER);
        if (e){
          e.idx = 1;                                   // Chola
          e.lado = carril <= 2 ? -1 : 1;
          e.ventana = CONFIG.compVentana * 3;
        }
        break;
      }
    }
  }

  chequear(mundo, player, eventos){
    switch (this.beat){
      case 0: return eventos.some(e => e.tipo === 'tiron');
      case 1: return player.gemas - this.gemasAlEmpezar >= 3;
      case 2: return eventos.some(e => e.tipo === 'gema' && e.encadenada);
      case 3: return eventos.some(e => e.tipo === 'murcielago-muerto');
      case 4: return eventos.some(e => e.tipo === 'rescate');
    }
    return false;
  }

  // Todo lo que hacia falta ya paso de largo sin que se cumpliera el beat
  expiro(mundo){
    if (this.beat === 0) return false;
    return !mundo.ents.some(e => e.vivo && e.z < CONFIG.zReciclado - 1);
  }
}
