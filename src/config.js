/* ===========================================================================
   CONFIG — todo el tuning del juego vive aca. Nada de numeros magicos afuera.
   F6 recarga en caliente lo que se haya cambiado desde la consola (§17.5).
   =========================================================================== */
export const CONFIG = {
  // --- Partida ---------------------------------------------------------
  duracion: 120,                 // s exactos (§6)
  tickHz: 60,                    // timestep fijo de la logica (§4)

  // --- Velocidad -------------------------------------------------------
  // §6 da la curva en px/s (340→760). El juego es 3D en unidades de mundo y
  // §14.3 usa 32 u/s como referencia, asi que se divide por pxPorUnidad.
  velPxIni: 340,
  velPxFin: 760,
  // El divisor entre la curva en px/s del §6 y las unidades de mundo. Es LA
  // perilla de la velocidad: mas alto = mas lento. Arranco en 14 (0.26 s de
  // anticipacion en el peor caso: injugable), paso por 18, y termino en 23
  // porque hasta ahi seguia sin darse tiempo a leer los obstaculos.
  // A 23: 14.8 → 33 u/s, y el alcance de 14 u da entre 0.95 s y 0.42 s.
  pxPorUnidad: 23,               // 340/23 = 14.8 u/s → 760/23 = 33.0 u/s

  // --- Tunel y carriles (§5) -------------------------------------------
  carrilesX: [-2.8, -1.4, 0, 1.4, 2.8],
  anchoTunel: 7,
  altoTunel: 4,
  paredX: 3.5,
  largoSegmento: 4,              // §14.3 depende de esto para el clack
  segmentosVivos: 16,
  zSpawn: -50,
  zReciclado: 8,
  zSinTecho: -6,                 // §5: el techo ya se derrumbo atras tuyo

  // --- Camara (§5) -----------------------------------------------------
  camPos: [0, 7.0, 7.5],
  camMira: [0, 0.6, -9],
  camFov: 55,
  camLag: 0.12,                  // por tick
  camRollMax: 4 * Math.PI / 180,
  camYaw: 0,                     // [CONFIRMADO] yaw fijo, sin ladeo lateral
  shakeBase: 0.010,
  shakeConT: 0.045,              // sube con t (§6)
  shakeImpacto: 0.34,

  // --- Niebla (§4.5-5) -------------------------------------------------
  fogNear: 8,
  fogFar: 45,
  fogColor: 0x0B0A12,

  // --- Luz (§13) -------------------------------------------------------
  // El §15 manda: todo numero de tuning vive aca. Estos cuatro son los que
  // deciden si la mina se ve o no, asi que son los primeros que hay que tocar.
  luzColor: 0xFFD166,            // el haz de la lampara, unico amarillo
  luzRufa: 3.6,                  // intensidad de la lampara de Rufa
  luzCompaniera: 2.5,            // la de cada companiera rescatada
  luzAlcance: 42,                // u: a que distancia se apaga del todo
  luzDerrame: 5.5,               // u: radio en que la lampara ilumina sin apuntar
  luzConoDesde: 0.28,            // borde exterior del cono (coseno)
  luzConoHasta: 0.86,            // borde interior
  ambiente: 0x38314F,            // piso de luz: sin esto no se ve una silueta

  // --- Render PS1 (§4.5) -----------------------------------------------
  // El alto interno es FIJO en 240 (la vertical de la PS1) y el ancho se
  // adapta a la pantalla entre 320 y 448. El §4.5-1 pedia 320x240 con
  // letterbox 4:3, pero en un celular apaisado (844x390) eso deja el juego en
  // 520 px de ancho usados de 844: dos franjas negras enormes y todo chico.
  // Ensanchar el buffer, en cambio, MUESTRA MAS TUNEL — que es exactamente lo
  // que el §17.6 dice que esta camara necesita — y no estira ni deforma nada:
  // el pixel sigue siendo cuadrado y del mismo tamaño.
  resInterna: [320, 240],
  resAnchoMin: 320,
  resAnchoMax: 560,   // celulares 20:9 apaisados llegan a ~2.2 de proporcion
  nivelesColor: 32,              // 15 bits de color: 32 niveles por canal
  ditherFuerza: 1.0,

  // --- Gancho (§7) -----------------------------------------------------
  // Cooldown base 180 ms: manda la fila de Chola del §8, no los 350 del §7.5.
  // Los de pared del §7.2 escalan proporcionalmente (340/350 y 240/350).
  hookAlcance: 14,
  hookVel: 60,                   // u/s de salida
  hookRetraccion: 0.080,         // s
  hookCooldown: 0.180,           // s, base
  hookCdParedPerp: 0.175,        // pegar en la pared al lado tuyo
  hookCdParedRas: 0.123,         // pegar en la pared bien adelante
  hookAsistenciaPx: 28,          // radio en px de la resolucion interna
  // Fraccion del ancho de pantalla, a cada lado, que cuenta como "la pared"
  // aunque el click caiga fuera del tunel. Es lo que hace que tocar el borde
  // (o el letterbox, o afuera en celular) siempre sea un movimiento valido.
  hookBordePantalla: 0.17,
  // La asistencia del §7.1 es un radio unico de 28 px, pero no todos los
  // objetivos valen lo mismo ni duran lo mismo en pantalla. Multiplicadores:
  asistCompaniera: 2.4,          // aparece 1 vez por tramo y dura 1.2 s
  asistMurcielago: 1.9,          // se mueve, aletea y es una oferta, no un muro
  hookAnguloCorte: 35 * Math.PI / 180,
  // El §7.2 pedia 2 carriles pegandole a la pared de al lado y 1 pegandole
  // adelante. En la practica el tiron de 2 se comia contra el borde y el gancho
  // "a veces no te movia": desde el carril 1 hacia afuera no hay 2 carriles a
  // donde ir. Ahora la pared SIEMPRE mueve exactamente un carril, y el angulo
  // decide solo que tan rapido se recupera el gancho. Para volver al diseño
  // original alcanza con poner carriles: 2 en hookTironPerp.
  hookTironPerp: { carriles: 1, dur: 0.175 },
  hookTironRas:  { carriles: 1, dur: 0.140 },
  hookBufferVentana: 0.140,      // s
  freezeEnganche: 0.040,         // s
  freezeImpacto: 0.080,          // s

  // --- Gemas (§7.3) ----------------------------------------------------
  // A 1.2 las filas de un patron quedan tan pegadas que una gema y la trampa
  // de la fila siguiente llegan con 30 ms de diferencia: no se distinguen. A
  // 1.5 el patron se estira un 25 % y cada fila se lee sola. La cadena usa el
  // mismo numero para que una linea vertical siga saliendo de un solo gancho.
  gemaCadenaRadio: 1.5,
  gemaCadenaMax: 5,
  gemaSeparacion: 1.5,           // las lineas se generan con esta separacion
  gemaImanRadio: 90 / 14,        // Tuca: 90 px → unidades de mundo
  gemaResetTono: 1.5,            // s sin juntar y el tono vuelve a la base

  // --- Colision (§10) --------------------------------------------------
  hitboxAncho: 1.0,
  hitboxProf: 1.4,
  hitboxGema: 1.6,               // juntar perdona, chocar no
  transicionCorte: 0.60,         // <0.6 colisiona con origen, ≥0.6 con destino

  // --- Vidas (§10) -----------------------------------------------------
  vidas: 3,
  invulnerable: 0.9,
  frenadoImpacto: 0.4,           // s de perdida de velocidad
  frenadoFactor: 0.55,           // a cuanto baja
  escudoRecarga: 20,             // Beba

  // --- Companieras (§8) ------------------------------------------------
  // Separacion entre vagones. A 1.45 el cuarto vagon caia atras de la camara y
  // rescatar no se veia: el §8 pide que el carrito crezca como feedback, y un
  // feedback fuera de cuadro no es feedback.
  vagonSepar: 1.0,
  // Y la camara se abre un poco por cada companiera, asi el tren entra siempre.
  camAtrasPorComp: 0.85,
  /* Rescatar devuelve una vida, si te falta alguna. Es lo que cierra el trato
     que propone el §8: rescatar es la decision mas cara del juego y hasta ahora
     solo pagaba a futuro (una habilidad y un final). Con esto tambien paga en
     el momento, y encima en la moneda que mas duele — asi el que viene golpeado
     tiene una razon real para gastar el gancho en alguien que no es el. */
  vidaPorRescate: true,
  compAvisoSeg: 3.0,
  compVentana: 1.2,              // s corriendo a la par del carrito
  cholaCooldown: 0.70,           // -30 %
  neneAviso: 1.0,                // s de contorno antes de entrar en pantalla
  tucaEsquiva: true,

  // --- Spawner (§9) ----------------------------------------------------
  gapFactorBase: 0.9,
  gapFactorTramo: 0.08,
  gapMinSeg: 0.35,
  gemasEnCaminoFacil: 0.60,      // 60/40 (§9): el riesgo se paga
  desvioAvisoSeg: 1.4,
  vigaAvisoSeg: 0.8,
  // §9 lo tenia zigzagueando cada 0.45 s. Se saco: un bicho que se te cruza de
  // carril mientras lo mirás no se puede leer a 320x240, y encima compite con
  // el gancho por la misma decision. Ahora viene derecho por su carril y la
  // decision es limpia: lo enganchas o te corres. Para devolverle el zigzag,
  // murcielagoZigzag: true.
  murcielagoZigzag: false,
  murcielagoCambio: 0.45,
  /* La trampa movil del §9 se queda QUIETA. Se probaron las dos formas que
     tenia sentido probar: cambio de carril al azar (azaroso, no dificil) y
     vagoneta suelta que deriva y se inclina (mas linda, igual de confusa —
     sobre todo el patron de dos vagonetas saliendo de los bordes, que se
     cruzan hacia el centro a la vez y no hay como leer eso a 320x240).
     Sigue siendo una entidad propia: es la vagoneta descarrilada, y se lee
     distinta de la viga y del pico. Pero no se mueve.
     Para devolverle el movimiento: movilCambiaCarril: true.                */
  movilCambiaCarril: false,
  trampaMovilCambio: 0.6,
  // La movil deja de cambiar de carril cuando le faltan menos de estos segundos
  // para llegar. Sin esto cambia hasta el ultimo momento y no te podes
  // comprometer a un esquive: eso no es dificil, es azaroso.
  movilCongelaSeg: 0.75,
  carrilVisLag: 0.22,            // s que tarda el dibujo en alcanzar al carril
  desvioFuerzaDur: 0.3,

  // --- Tramos (§6) -----------------------------------------------------
  tramos: [
    { n:1, t0:0,   t1:25,  nombre:'bocamina'  },
    { n:2, t0:25,  t1:55,  nombre:'galeria'   },
    { n:3, t0:55,  t1:85,  nombre:'inundado'  },
    { n:4, t0:85,  t1:110, nombre:'derrumbe'  },
    { n:5, t0:110, t1:120, nombre:'salida'    },
  ],

  // --- Finales (§11) ---------------------------------------------------
  gemasUmbral: 120,
  gemasUmbralVerdadero: 200,

  // --- Puntaje (§11.5) -------------------------------------------------
  ptsGema: 10, ptsMurcielago: 25, ptsCompaniera: 250,
  ptsRacha: 50, ptsVida: 100,
  rachaMostrarDesde: 3,

  // --- Pools (§9): dimensionados al maximo simultaneo ------------------
  pool: { gema:64, trampa:24, movil:16, murcielago:12, desvio:8, viga:4,
          companiera:2, particula:180, chispa:12 },

  // --- Audio (§14) -----------------------------------------------------
  bpmIni: 128, bpmFin: 156,
  duckGain: 0.4, duckDur: 0.25,
  clackSepar: 0.055,             // s entre eje delantero y trasero
  rodamHzMin: 250, rodamHzMax: 900,
  rumbleDesde: 100,              // s: rumble grave en los ultimos 20

  // --- Debug (§17.5) ---------------------------------------------------
  debug: { hitboxes:false, invencible:false, stats:false, patronForzado:null },
};

/* Resolucion interna VIVA. Es un objeto y no dos constantes a proposito: todos
   los modulos leen RES.w / RES.h y se enteran solos cuando cambia el tamaño de
   la ventana. */
export const RES = { w: CONFIG.resInterna[0], h: CONFIG.resInterna[1] };

export const TICK = 1 / CONFIG.tickHz;
export const NCARRILES = CONFIG.carrilesX.length;

/* --- utilidades minimas ------------------------------------------------ */
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeOut = t => 1 - (1 - t) * (1 - t);
export const easeIn = t => t * t;

// PRNG con semilla (mulberry32): las corridas se pueden reproducir, que es lo
// unico que hace debuggeable un spawner.
export function rngCon(semilla){
  let a = semilla >>> 0;
  return function(){
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// localStorage envuelto: en modo privado de Safari tira excepcion, y un juego
// no se cae por no poder guardar el volumen (§14.1, §11.5, §12.5).
export const almacen = {
  leer(clave, porDefecto){
    try { const v = localStorage.getItem(clave); return v === null ? porDefecto : JSON.parse(v); }
    catch { return porDefecto; }
  },
  escribir(clave, valor){
    try { localStorage.setItem(clave, JSON.stringify(valor)); } catch { /* sin persistencia */ }
  },
};

// Velocidad del carrito en u/s a los t segundos de partida (§6)
export function velocidadEn(t){
  const p = clamp(t / CONFIG.duracion, 0, 1);
  return (CONFIG.velPxIni + p * (CONFIG.velPxFin - CONFIG.velPxIni)) / CONFIG.pxPorUnidad;
}

export function tramoEn(t){
  const ts = CONFIG.tramos;
  for (let i = 0; i < ts.length; i++) if (t < ts[i].t1) return ts[i].n;
  return ts[ts.length - 1].n;
}

/* --- prefers-reduced-motion (§4, §16) ---------------------------------
   Apaga shake, jitter extra y particulas ambientales. El vertex snapping NO
   se toca: es el look del juego (§4.5-2), no un efecto de movimiento.      */
const _rm = typeof matchMedia === 'function'
  ? matchMedia('(prefers-reduced-motion: reduce)') : { matches:false };
export let reducedMotion = _rm.matches;
_rm.addEventListener?.('change', e => { reducedMotion = e.matches; });
