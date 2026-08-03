/* ===========================================================================
   Player — Rufa: carril, gancho, estado, vidas, habilidades. §7, §8, §10.
   LOGICA PURA (§15): no importa nada de Three. Para apuntar recibe un
   `resolver(x, y)` inyectado desde la capa 3D, que es la unica que sabe
   proyectar el mundo a la pantalla.
   =========================================================================== */
import { CONFIG, NCARRILES, clamp, lerp, easeOut, easeIn } from './config.js';
import { TIPO, HOOKEABLE } from './entities.js';

export const FASE = { LISTO:0, SALIENDO:1, VOLVIENDO:2 };

export class Player {
  constructor(){ this.reset(); }

  reset(){
    const centro = (NCARRILES - 1) >> 1;
    this.carrilOrigen = centro;
    this.carrilDestino = centro;
    this.tTrans = 1;                 // 0..1; en 1 no hay transicion en curso
    this.durTrans = 0.1;
    this.x = CONFIG.carrilesX[centro];

    this.gancho = { fase: FASE.LISTO, t: 0, dur: 0, destino: {x:0,y:0,z:0},
                    objetivo: null, clase: null, tiron: null };
    this.cooldown = 0;
    this.buffer = null;              // §7.5: buffer de 1 input, ventana 140 ms

    this.vidas = CONFIG.vidas;
    this.invul = 0;
    // El tutorial no hace daño (§12.5). Va como flag propio y no forzando
    // invul: la invulnerabilidad hace parpadear a Rufa, y forzarla cada tick
    // la dejaba titilando toda la partida como si la estuvieran lastimando.
    this.sinDaño = false;
    this.frenado = 0;
    this.forzado = 0;                // desvio: input ignorado 0.3 s

    this.hab = { chola:false, nene:false, beba:false, tuca:false };
    this.escudo = false;
    this.escudoRecarga = 0;

    this.gemas = 0;
    this.murcielagos = 0;
    this.companieras = [];           // indices 1..4 rescatadas
    this.racha = 0;
    this.rachaMax = 0;
    this.tonoCadena = 0;             // §14.4: sube 1 semitono por gema encadenada
    this.tUltimaGema = -99;

    this.eventos = [];               // los consumen Audio, HUD y CameraRig
    this._cadena = [];
    this._gemasTmp = [];
  }

  emitir(tipo, datos){ this.eventos.push(datos ? { tipo, ...datos } : { tipo }); }
  tomarEventos(){ const e = this.eventos; this.eventos = []; return e; }

  /* --- §10, la regla critica -------------------------------------------
     Hasta el 60 % de la transicion colisiona SOLO con el carril de origen; a
     partir del 60 %, SOLO con el de destino. Nunca con los dos (esquivar se
     volveria azaroso) y nunca con ninguno (el tiron seria un dash invulnerable
     y el juego se rompe).                                                    */
  get carrilColision(){
    return this.tTrans < CONFIG.transicionCorte ? this.carrilOrigen : this.carrilDestino;
  }

  get enTransicion(){ return this.tTrans < 1; }

  cooldownBase(){ return CONFIG.hookCooldown * (this.hab.chola ? CONFIG.cholaCooldown : 1); }
  factorCooldown(){ return this.hab.chola ? CONFIG.cholaCooldown : 1; }

  /* --- movimiento ------------------------------------------------------ */
  tirarA(carrilNuevo, dur){
    const destino = clamp(carrilNuevo, 0, NCARRILES - 1);
    if (destino === this.carrilDestino && this.tTrans >= 1) return false;
    this.carrilOrigen = this.carrilColision;
    this.carrilDestino = destino;
    this.durTrans = dur;
    this.tTrans = 0;
    return true;
  }

  /* --- disparo del gancho (§7) ---------------------------------------- */
  // ev: {tipo:'apuntado',x,y} | {tipo:'pared',lado} | {tipo:'cercano'}
  // resolver(ev) devuelve {clase:'pared'|'entidad'|'vacio', ...}
  intentarDisparo(ev, resolver, ahora){
    if (this.cooldown > 0 || this.gancho.fase !== FASE.LISTO){
      // §7.5: se guarda el objetivo YA RESUELTO, no el punto de pantalla. Asi
      // el disparo diferido apunta a donde la gema esta, no a donde estaba.
      const obj = resolver(ev);
      if (obj) this.buffer = { obj, t: ahora };
      return false;
    }
    const obj = resolver(ev);
    if (obj) this.disparar(obj);
    return true;
  }

  disparar(obj){
    const g = this.gancho;
    g.clase = obj.clase;
    g.objetivo = obj.ent || null;
    g.destino.x = obj.punto.x; g.destino.y = obj.punto.y; g.destino.z = obj.punto.z;
    g.tiron = obj.tiron || null;
    const d = Math.hypot(obj.punto.x - this.x, obj.punto.y - 0.55, obj.punto.z);
    g.dur = Math.max(d / CONFIG.hookVel, 0.02);
    g.t = 0;
    g.fase = FASE.SALIENDO;
    this.emitir('gancho-sale');
  }

  // El impacto: aca pasa todo lo que el gancho hace (§7.0)
  impacto(mundo){
    const g = this.gancho;
    let cd = this.cooldownBase();

    if (g.clase === 'pared'){
      // §7.2: cuanto te movés depende del angulo. El experto elige el angulo,
      // el novato clickea la pared y se mueve igual.
      const t = g.tiron;
      cd = (t.perp ? CONFIG.hookCdParedPerp : CONFIG.hookCdParedRas) * this.factorCooldown();
      const destino = this.carrilColision + t.lado * t.carriles;
      if (destino < 0 || destino > NCARRILES - 1){
        // §7.2: en el carril del borde, pegarle a esa pared no mueve nada.
        // Error castigado con tiempo, no con muerte.
        this.emitir('gancho-rebote');
      } else {
        this.tirarA(destino, t.dur);
        this.emitir('tiron', { carriles: t.carriles, perp: t.perp });
      }
      // los ganchos a la pared no suman ni cortan racha (§11.5): moverse es
      // neutral, si no el juego castigaria esquivar.
    }
    else if (g.clase === 'entidad' && g.objetivo && g.objetivo.vivo){
      const e = g.objetivo;
      if (e.tipo === TIPO.GEMA){
        const cadena = mundo.cadenaDeGemas(e, this._cadena);
        for (const gem of cadena) mundo.matar(gem, true);
        this.sumarGemas(cadena.length, true);
        this.sumarRacha();
        this.emitir('freeze', { dur: CONFIG.freezeEnganche });
      }
      else if (e.tipo === TIPO.MURCIELAGO){
        mundo.matar(e, true);
        this.murcielagos++;
        this.sumarGemas(2, true);          // §7.4: suelta 2 que se auto-recolectan
        this.sumarRacha();
        this.emitir('murcielago-muerto', { carril: e.carril, z: e.z });
        this.emitir('freeze', { dur: CONFIG.freezeEnganche });
      }
      else if (e.tipo === TIPO.COMPANIERA){
        this.rescatar(e, mundo);
        this.emitir('freeze', { dur: CONFIG.freezeEnganche });
      }
    }
    else {
      // §7.0: trampa o nada. Clank, chispa, y perdiste el cooldown.
      this.cortarRacha();
      this.emitir('gancho-vacio');
    }

    this.cooldown = cd;
    g.fase = FASE.VOLVIENDO;
    g.t = 0;
    this.emitir('gancho-impacto', { clase: g.clase, x: g.destino.x, y: g.destino.y, z: g.destino.z });
  }

  sumarGemas(n, encadenada){
    this.gemas += n;
    this.emitir('gema', { n, encadenada });
  }

  sumarRacha(){
    this.racha++;
    if (this.racha > this.rachaMax) this.rachaMax = this.racha;
    this.emitir('racha', { n: this.racha });
  }
  cortarRacha(){
    if (this.racha > 0) this.emitir('racha', { n: 0 });
    this.racha = 0;
  }

  rescatar(e, mundo){
    if (this.companieras.includes(e.idx)) { mundo.matar(e, false); return; }
    this.companieras.push(e.idx);
    mundo.matar(e, true);            // con animacion: la cadena la trae volando
    switch (e.idx){
      case 1: this.hab.chola = true; break;
      case 2: this.hab.nene  = true; break;
      case 3: this.hab.beba  = true; this.escudo = true; break;
      case 4: this.hab.tuca  = true; break;
    }
    // §8 + regla propia: subir a una companiera devuelve una vida si falta
    let vidaExtra = false;
    if (CONFIG.vidaPorRescate && this.vidas < CONFIG.vidas){
      this.vidas++;
      vidaExtra = true;
    }
    this.sumarRacha();
    this.emitir('rescate', { idx: e.idx, vidaExtra, vidas: this.vidas });
  }

  golpe(){
    if (this.sinDaño || CONFIG.debug.invencible || this.invul > 0) return false;
    if (this.escudo){                    // Beba absorbe antes que la vida (§10)
      this.escudo = false;
      this.escudoRecarga = CONFIG.escudoRecarga;
      this.invul = CONFIG.invulnerable;
      this.cortarRacha();
      this.emitir('escudo-roto');
      return false;
    }
    this.vidas--;
    this.invul = CONFIG.invulnerable;
    this.frenado = CONFIG.frenadoImpacto;
    this.cortarRacha();
    this.emitir('impacto', { vidas: this.vidas });
    this.emitir('freeze', { dur: CONFIG.freezeImpacto });
    return true;
  }

  // Multiplicador de velocidad: el carrito pierde impulso 0.4 s y lo recupera
  // con easeIn (§10).
  factorVelocidad(){
    if (this.frenado <= 0) return 1;
    const p = 1 - this.frenado / CONFIG.frenadoImpacto;
    return lerp(CONFIG.frenadoFactor, 1, easeIn(p));
  }

  /* --- tick ------------------------------------------------------------ */
  paso(dt, mundo, ahora, resolver){
    // temporizadores
    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.invul > 0) this.invul = Math.max(0, this.invul - dt);
    if (this.frenado > 0) this.frenado = Math.max(0, this.frenado - dt);
    if (this.forzado > 0) this.forzado = Math.max(0, this.forzado - dt);
    if (this.hab.beba && !this.escudo){
      this.escudoRecarga -= dt;
      if (this.escudoRecarga <= 0){ this.escudo = true; this.emitir('escudo-listo'); }
    }
    if (ahora - this.tUltimaGema > CONFIG.gemaResetTono) this.tonoCadena = 0;

    // transicion de carril
    if (this.tTrans < 1){
      this.tTrans = Math.min(1, this.tTrans + dt / this.durTrans);
    }
    this.x = lerp(CONFIG.carrilesX[this.carrilOrigen],
                  CONFIG.carrilesX[this.carrilDestino], easeOut(this.tTrans));

    // ciclo del gancho
    const g = this.gancho;
    if (g.fase === FASE.SALIENDO){
      /* La cadena PERSIGUE al objetivo mientras vuela. Antes salia hacia el
         punto donde estaba el bicho en el momento del click, pero el mundo
         sigue avanzando: en los ~0.2 s de vuelo el objetivo se corrio varias
         unidades y el gancho se veia pasar de largo. El impacto igual contaba
         (se resuelve por referencia a la entidad, no por posicion), asi que lo
         que fallaba era solo lo que se ve — que es lo unico que el jugador
         tiene para saber si le pego. */
      if (g.objetivo && g.objetivo.vivo && resolver && resolver.puntoDe){
        const q = resolver.puntoDe(g.objetivo);
        g.destino.x = q.x; g.destino.y = q.y; g.destino.z = q.z;
        // si se acerco, llega antes; si se alejo, no se estira eternamente
        const d = Math.hypot(q.x - this.x, q.y - 0.55, q.z);
        g.dur = clamp(d / CONFIG.hookVel, 0.02, g.dur);
      }
      g.t += dt;
      if (g.t >= g.dur) this.impacto(mundo);
    } else if (g.fase === FASE.VOLVIENDO){
      g.t += dt;
      if (g.t >= CONFIG.hookRetraccion){ g.fase = FASE.LISTO; g.objetivo = null; }
    }

    // §7.5: el buffer se ejecuta apenas termina el cooldown
    if (this.buffer && this.cooldown <= 0 && g.fase === FASE.LISTO){
      if (ahora - this.buffer.t <= CONFIG.hookBufferVentana){
        const obj = this.buffer.obj;
        // el objetivo se movio con el scroll: se recalcula su punto actual
        if (obj.clase === 'entidad'){
          if (obj.ent && obj.ent.vivo){ obj.punto = resolver.puntoDe(obj.ent); this.disparar(obj); }
        } else this.disparar(obj);
      }
      this.buffer = null;
    }

    this.recolectarYChocar(dt, mundo, ahora);
  }

  recolectarYChocar(dt, mundo, ahora){
    const c = this.carrilColision;

    // §7.0 forma 1: pasarle por encima. Gratis, de a una, hitbox generosa.
    const gemas = mundo.gemasPorContacto(c, this.hab.tuca ? CONFIG.gemaImanRadio : 0, this._gemasTmp);
    if (gemas.length){
      for (const gem of gemas) mundo.matar(gem, true);
      this.sumarGemas(gemas.length, false);
      this.tUltimaGema = ahora;
    }

    // §8: la companiera se sube sola si estas en el carril del borde de su lado
    const comp = mundo.companieraGratis(c);
    if (comp) this.rescatar(comp, mundo);

    // §9: el desvio no daña, te fuerza un carril al costado ignorando input
    const desv = mundo.desvioEn(c);
    if (desv){
      this.forzado = CONFIG.desvioFuerzaDur;
      this.tirarA(c + desv.lado, CONFIG.desvioFuerzaDur);
      this.emitir('desvio', { lado: desv.lado });
    }

    // choque
    const golpeado = mundo.choqueCon(c);
    if (golpeado && this.invul <= 0){
      if (this.golpe()) mundo.matar(golpeado, true);
      else mundo.matar(golpeado, true);
    }
  }
}
