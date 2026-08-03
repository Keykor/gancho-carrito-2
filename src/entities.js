import { CONFIG, NCARRILES, clamp, lerp, easeIn } from './config.js';

/* ===========================================================================
   Entities + Mundo — §9. LOGICA PURA: no importa nada de Three (§15). Todo el
   pool esta pre-alocado, cero allocations por frame en el loop caliente (§4).
   La colision vive en 2D (carril, z); la geometria no participa nunca.
   =========================================================================== */
const TIPO = { GEMA:0, TRAMPA:1, MOVIL:2, MURCIELAGO:3, DESVIO:4, VIGA:5, COMPANIERA:6 };
const NOMBRE_TIPO = ['gema','trampa','movil','murcielago','desvio','viga','companiera'];
const CAP = [ CONFIG.pool.gema, CONFIG.pool.trampa, CONFIG.pool.movil,
              CONFIG.pool.murcielago, CONFIG.pool.desvio, CONFIG.pool.viga,
              CONFIG.pool.companiera ];

const HOOKEABLE = [true, false, false, true, false, false, true];   // §7.0

// Alto/ancho logicos por tipo, para la colision de §10
const MEDIDA = [
  { z:0.5, ancho:1 },   // gema (usa hitbox generosa aparte)
  { z:0.6, ancho:1 },   // trampa fija: ocupa 1 carril, 1.2 u de alto
  { z:0.6, ancho:1 },   // trampa movil
  { z:0.5, ancho:1 },   // murcielago
  { z:0.8, ancho:1 },   // desvio
  { z:0.5, ancho:2 },   // viga: 2 carriles contiguos
  { z:0.7, ancho:1 },   // companiera
];

function nuevaEntidad(){
  return {
    tipo:-1, vivo:false, carril:0, z:0, semilla:0,
    // comportamiento
    tCambio:0, dirZig:1, fase:0,
    // viga: el ancho sale del patron (celdas contiguas marcadas, §9.5)
    y:0, cayendo:false, ancho:1,
    // desvio
    lado:1, usado:false,
    // companiera
    idx:0, estado:0, tVentana:0, avisada:false, ventana:0,
    // presentacion (la lee la capa 3D, no la logica)
    escala:1, resaltada:false, muriendo:0,
    // carril interpolado SOLO para dibujar. La colision sigue siendo en el
    // carril entero (§5): sin esto la movil se teletransporta de un carril a
    // otro en un frame y se lee como un bug, no como una trampa que se mueve.
    carrilVis:0,
  };
}

class Mundo {
  constructor(){
    this.ents = [];
    this.porTipo = CAP.map(() => []);
    for (let t = 0; t < CAP.length; t++)
      for (let i = 0; i < CAP[t]; i++){
        const e = nuevaEntidad(); e.tipo = t;
        this.ents.push(e); this.porTipo[t].push(e);
      }
    this.zAcum = 0;            // distancia total recorrida, la usa el clack (§14.3)
  }

  reset(){
    for (const e of this.ents){ e.vivo = false; e.muriendo = 0; e.resaltada = false; }
    this.zAcum = 0;
  }

  crear(tipo, carril, z){
    const lista = this.porTipo[tipo];
    for (let i = 0; i < lista.length; i++){
      const e = lista[i];
      if (e.vivo || e.muriendo > 0) continue;
      e.vivo = true; e.carril = carril; e.z = z;
      e.tCambio = 0; e.fase = (i * 1.37) % 6.283;
      e.dirZig = (carril >= NCARRILES - 1) ? -1 : (carril <= 0 ? 1 : ((i & 1) ? 1 : -1));
      e.y = 0; e.cayendo = false; e.usado = false; e.escala = 1;
      e.ancho = MEDIDA[tipo].ancho;
      e.resaltada = false; e.muriendo = 0; e.estado = 0; e.tVentana = 0;
      e.avisada = false; e.semilla = (i * 2654435761) >>> 0;
      e.ventana = CONFIG.compVentana;
      e.carrilVis = carril;
      return e;
    }
    return null;                // pool lleno: se descarta, nunca se aloca
  }

  matar(e, conAnimacion){
    e.vivo = false;
    // la companiera necesita mas tiempo: se la ve volar del saliente al carrito
    e.muriendo = conAnimacion ? (e.tipo === TIPO.COMPANIERA ? 0.34 : 0.22) : 0;
  }

  vivos(tipo){ return this.porTipo[tipo]; }

  /* --- avance del mundo ---------------------------------------------- */
  paso(dt, vel, jugador, hab){
    this.zAcum += vel * dt;
    for (const e of this.ents){
      if (e.muriendo > 0){ e.muriendo -= dt; if (e.muriendo <= 0) e.muriendo = 0; }
      if (!e.vivo) continue;

      // Todo avanza en +Z a la velocidad del carrito, salvo la companiera
      // mientras corre a la par (§8).
      if (!(e.tipo === TIPO.COMPANIERA && e.estado === 1)) e.z += vel * dt;

      switch (e.tipo){
        case TIPO.MURCIELAGO: this.pasoMurcielago(e, dt, jugador, hab); break;
        case TIPO.MOVIL:      this.pasoMovil(e, dt, vel); break;
        case TIPO.VIGA:       this.pasoViga(e, dt, vel); break;
        case TIPO.COMPANIERA: this.pasoCompaniera(e, dt, vel); break;
      }

      // el carril de dibujo persigue al logico; el salto se ve como corrimiento
      const k = Math.min(1, dt / CONFIG.carrilVisLag);
      e.carrilVis += (e.carril - e.carrilVis) * k;

      if (e.z > CONFIG.zReciclado) this.matar(e, false);
    }
  }

  /* El zigzag es DETERMINISTA: rebota contra las paredes y nada mas. Con un
     re-sorteo al azar el bicho cambia de carril mas rapido que tu cooldown y
     esquivarlo pasa a ser cara o cruca en vez de habilidad — y a 320x240, si el
     patron de movimiento no se puede leer, no existe. */
  pasoMurcielago(e, dt, jugador, hab){
    if (!CONFIG.murcielagoZigzag && !hab.tuca) return;   // viene derecho
    e.tCambio += dt;
    if (e.tCambio >= CONFIG.murcielagoCambio){
      e.tCambio -= CONFIG.murcielagoCambio;
      // Tuca (§8): los murcielagos te esquivan en vez de cruzarse
      if (hab.tuca && e.carril === jugador.carrilColision && e.z > -12)
        e.dirZig = jugador.carrilColision <= 2 ? 1 : -1;
      else if (e.carril + e.dirZig < 0 || e.carril + e.dirZig > NCARRILES - 1)
        e.dirZig *= -1;
      e.carril = clamp(e.carril + e.dirZig, 0, NCARRILES - 1);
    }
  }

  pasoMovil(e, dt, vel){
    if (!CONFIG.movilCambiaCarril) return;   // vagoneta descarrilada, quieta
    if (e.z >= 0) return;                    // solo cambia mientras se acerca
    // y se queda quieta en el ultimo tramo, para que el esquive sea decidible
    if (vel > 0 && -e.z / vel < CONFIG.movilCongelaSeg) return;
    e.tCambio += dt;
    if (e.tCambio >= CONFIG.trampaMovilCambio){
      e.tCambio -= CONFIG.trampaMovilCambio;
      if (e.carril + e.dirZig < 0 || e.carril + e.dirZig > NCARRILES - 1) e.dirZig *= -1;
      e.carril = clamp(e.carril + e.dirZig, 0, NCARRILES - 1);
    }
  }

  pasoViga(e, dt, vel){
    // Cae del techo para aterrizar justo sobre el carrito. La sombra en el piso
    // avisa vigaAvisoSeg antes (§9). Antes de tocar el piso no colisiona.
    const seg = vel > 0 ? (0 - e.z) / vel : 99;
    if (seg <= CONFIG.vigaAvisoSeg){
      e.cayendo = true;
      // la caida se concentra en el ultimo tercio del aviso: los primeros dos
      // tercios se ve la sombra en el piso y la viga todavia colgando, que es
      // lo que da tiempo a decidir
      const p = clamp(1 - seg / CONFIG.vigaAvisoSeg, 0, 1);
      e.y = lerp(CONFIG.altoTunel - 0.2, 0.45, easeIn(clamp((p - 0.55) / 0.45, 0, 1)));
    } else {
      e.y = CONFIG.altoTunel - 0.2;
    }
  }

  pasoCompaniera(e, dt, vel){
    if (e.estado === 0){
      // se acerca corriendo por el saliente; al llegar al carrito, engancha
      if (e.z >= -1.2){ e.estado = 1; e.tVentana = e.ventana || CONFIG.compVentana; e.z = -0.4; }
    } else if (e.estado === 1){
      // §8: corre a la par 1.2 s. Una ventana fija en DISTANCIA seria de 80 ms
      // a velocidad maxima, injugable.
      e.tVentana -= dt;
      e.z = -0.4 + Math.sin(e.tVentana * 9) * 0.35;
      if (e.tVentana <= 0) e.estado = 2;
    } else {
      e.z += vel * dt * 0.6;                 // se frena y la camara la deja atras
    }
  }

  /* --- consultas de colision (§10) ------------------------------------ */
  // Devuelve la primera entidad que choca con el carrito, o null.
  choqueCon(carrilColision){
    const medioZ = CONFIG.hitboxProf / 2;
    for (const e of this.ents){
      if (!e.vivo) continue;
      const t = e.tipo;
      if (t === TIPO.GEMA || t === TIPO.COMPANIERA || t === TIPO.DESVIO) continue;
      if (t === TIPO.VIGA && !e.cayendo) continue;
      if (Math.abs(e.z) > medioZ + MEDIDA[t].z) continue;
      if (carrilColision >= e.carril && carrilColision < e.carril + e.ancho) return e;
    }
    return null;
  }

  desvioEn(carrilColision){
    for (const e of this.ents){
      if (!e.vivo || e.tipo !== TIPO.DESVIO || e.usado) continue;
      if (Math.abs(e.z) > CONFIG.hitboxProf / 2 + MEDIDA[TIPO.DESVIO].z) continue;
      if (e.carril === carrilColision){ e.usado = true; return e; }
    }
    return null;
  }

  // Gemas por contacto: hitbox mas generosa, juntar perdona (§10)
  gemasPorContacto(carrilColision, imanRadio, out){
    out.length = 0;
    const medioZ = CONFIG.hitboxProf / 2 + CONFIG.hitboxGema / 2;
    for (const e of this.porTipo[TIPO.GEMA]){
      if (!e.vivo) continue;
      if (e.carril === carrilColision && Math.abs(e.z) <= medioZ){ out.push(e); continue; }
      if (imanRadio > 0){                    // Tuca: las gemas se imantan
        const dx = CONFIG.carrilesX[e.carril] - CONFIG.carrilesX[carrilColision];
        if (Math.hypot(dx, e.z) <= imanRadio) out.push(e);
      }
    }
    return out;
  }

  // Companiera que se sube sola desde el carril del borde (§8)
  companieraGratis(carrilColision){
    for (const e of this.porTipo[TIPO.COMPANIERA]){
      if (!e.vivo || e.estado !== 1) continue;
      const carrilBorde = e.lado < 0 ? 0 : NCARRILES - 1;
      if (carrilColision === carrilBorde) return e;
    }
    return null;
  }

  /* Cadena de gemas (§7.3): desde la enganchada, las de LA MISMA LINEA que
     sigan pegadas, hasta 5.
     Antes era por radio, y ahi se rompio: con las filas a 1.5 u y los carriles
     a 1.4, el radio de 1.5 alcanzaba tambien al carril de al lado, asi que un
     click se llevaba una cruz de gemas en vez de la linea. Eso vacia la regla
     del §9 — una gema en el carril seguro se llevaba puesta a la del carril
     peligroso, y las gemas dejaban de costar posicion. Ademas es impredecible:
     el jugador ve una linea, no un radio. */
  cadenaDeGemas(semilla, out){
    out.length = 0; out.push(semilla);
    const R = CONFIG.gemaCadenaRadio;
    const enLinea = this.porTipo[TIPO.GEMA]
      .filter(e => e.vivo && e.carril === semilla.carril && e !== semilla)
      .sort((a, b) => Math.abs(a.z - semilla.z) - Math.abs(b.z - semilla.z));
    let creció = true;
    while (creció && out.length < CONFIG.gemaCadenaMax){
      creció = false;
      for (const e of enLinea){
        if (out.includes(e)) continue;
        // pegada a alguna de las que ya vienen: asi la linea se recorre entera
        if (out.some(y => Math.abs(e.z - y.z) <= R + 0.001)){
          out.push(e); creció = true;
          if (out.length >= CONFIG.gemaCadenaMax) break;
        }
      }
    }
    return out;
  }
}

export { TIPO, NOMBRE_TIPO, HOOKEABLE, MEDIDA, Mundo };
