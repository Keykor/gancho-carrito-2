import { CONFIG, NCARRILES, clamp, velocidadEn } from './config.js';

/* ===========================================================================
   Patterns — §9.5. Los patrones SON el contenido del juego: sin ellos escritos
   a mano el spawner produce ruido y no hay decisiones. 24 en total, 6 por tramo.
   Formato: grilla de texto, una fila cada 1.2 u, columnas = carriles 0..4,
   SE LEE DE ABAJO HACIA ARRIBA (la ultima fila es la que llega primero).
   =========================================================================== */
const PATRONES = [

/* ---- TRAMO 1 · Bocamina: gemas, trampas simples, 1 desvio --------------- */

// Referencia del spec. Estas en el 2, la trampa te obliga a moverte y solo uno
// de los dos lados paga: moverse y juntar son la misma decision.
{ nombre:'primera-eleccion', tramo:1, filas:[
  '.....',
  '..#..',
  'g....',
  'g....',
  'g....',
  '.....',
]},

// La linea es gratis y esta en tu carril... hasta que ese carril se cierra.
// Ensena que juntar no es libre: es una posicion que despues hay que soltar.
{ nombre:'el-atajo', tramo:1, filas:[
  '.....',
  '..#..',
  '..g..',
  '..g..',
  '..g..',
  '.....',
]},

// Gemas pegadas a la pared derecha: para juntarlas quedas en el peor carril
// para esquivar, porque de ese lado ya no te podes mover.
{ nombre:'la-pared-derecha', tramo:1, filas:[
  '.....',
  '...#.',
  '....g',
  '....g',
  '....g',
  '.....',
]},

// El unico desvio del tramo 1: no mata, rompe el plan.
{ nombre:'el-primer-desvio', tramo:1, filas:[
  '.....',
  '.#...',
  '.....',
  '..>..',
  '.g...',
  '.g...',
  '.....',
]},

// El peaje chico. Los carriles 0, 2 y 4 son seguros todo el patron: no mata a
// nadie. Pero las gemas de 1 y 3 estan en carriles que son trampa una fila
// antes y una fila despues, asi que no se pueden recorrer, solo enganchar — y
// no alcanzan los ganchos para todas. Es el primer "no vas a poder con todo".
{ nombre:'no-alcanza', tramo:1, filas:[
  '.#.#.',
  'g.g.g',
  '.#.#.',
  '.g.g.',
  '.#.#.',
  'g.g.g',
  '.#.#.',
  '.g.g.',
  '.#.#.',
  'g.g.g',
  '.#.#.',
  '.g.g.',
  '.#.#.',
]},

// Companiera 1 (Chola) a la izquierda; la linea gorda de gemas, a la derecha.
{ nombre:'companiera-1', tramo:1, esCompaniera:true, filas:[
  '.....',
  '....g',
  '....g',
  'C...g',
  '....g',
  '.....',
]},

/* ---- TRAMO 2 · Galeria: murcielagos, desvios dobles --------------------- */

// Referencia del spec (§9.5). El bicho baja por la derecha, justo donde esta la
// linea de gemas mas larga: engancharlo te deja sin gancho para las gemas.
{ nombre:'el-bicho', tramo:2, filas:[
  '.....',
  '...b.',
  '....g',
  '....g',
  '....g',
  '..#..',
  '.....',
]},

// Dos desvios encontrados: te tiran al centro y el centro esta ocupado.
{ nombre:'doble-desvio', tramo:2, filas:[
  '.....',
  '..#..',
  '.....',
  '>...<',
  'g...g',
  '.....',
]},

// El bicho te empuja contra la pared y la pared no perdona.
{ nombre:'el-bicho-y-la-pared', tramo:2, filas:[
  '.....',
  '#....',
  'b....',
  '.g...',
  '.g...',
  '.....',
]},

// Pinza: se cierra de los dos lados y la salida es el centro, que paga poco.
{ nombre:'pinza', tramo:2, filas:[
  '.....',
  '#...#',
  '.#.#.',
  'g.g.g',
  '.....',
]},

// El peaje del tramo 2, con bicho. Las gemas de 1 y 3 estan en carriles que
// son trampa la fila de antes y la de despues: no se pueden recorrer, solo
// enganchar. Y el bicho al final se come el gancho que te quedaba.
{ nombre:'cruz', tramo:2, filas:[
  '..b..',
  '.#.#.',
  '.g.g.',
  '.#.#.',
  'g...g',
  '.#.#.',
  '.g.g.',
  '.#.#.',
  'g.g.g',
  '.#.#.',
  '.g.g.',
  '.#.#.',
  'g...g',
  '.#.#.',
]},

// Companiera 2 (Nene) a la derecha, gemas a la izquierda del todo.
{ nombre:'companiera-2', tramo:2, esCompaniera:true, filas:[
  '.....',
  'g....',
  'g...C',
  'g....',
  '..#..',
  '.....',
]},

/* ---- TRAMO 3 · Nivel inundado: trampas moviles, mas denso --------------- */

// Referencia del spec. Las gemas estan entre las trampas, en zigzag: no hay
// forma de juntarlas todas. Es el patron que ensena a renunciar.
{ nombre:'peaje', tramo:3, filas:[
  '..b..',
  '.#.#.',
  '.g.g.',
  '.#.#.',
  '..g..',
  '.#.#.',
  '.g.g.',
  '.#.#.',
  'g.g.g',
  '.#.#.',
  '.g.g.',
  '.#.#.',
]},

// Una movil sola, para aprender a leerla antes de que vengan de a dos.
{ nombre:'el-movil', tramo:3, filas:[
  '.....',
  '..m..',
  '.....',
  'g...g',
  'g...g',
  '.....',
]},

// Dos moviles: el carril seguro cambia mientras lo mirás.
{ nombre:'dos-moviles', tramo:3, filas:[
  '.....',
  'm...m',
  '.....',
  '..g..',
  '..g..',
  '.....',
]},

// Zigzag largo: cada gema esta del lado equivocado de la trampa siguiente.
{ nombre:'zigzag-inundado', tramo:3, filas:[
  '.....',
  '#..#.',
  '..g..',
  '.#..#',
  'g....',
  '#..#.',
  '.....',
]},

// Movil + bicho: dos cosas que se mueven y un solo gancho entre las dos.
{ nombre:'el-bicho-movil', tramo:3, filas:[
  '.....',
  '..b..',
  '.....',
  '...m.',
  'gg...',
  '.....',
]},

// Companiera 3 (Beba) a la izquierda, con la movil empujandote a la derecha.
{ nombre:'companiera-3', tramo:3, esCompaniera:true, filas:[
  '.....',
  '....g',
  'C...g',
  '..m..',
  '.....',
]},

/* ---- TRAMO 4 · Derrumbe: todo junto, vigas, densidad maxima ------------- */

// Referencia del spec. La viga tapa 2-3-4 y te empuja a la izquierda, que es
// donde estan las gemas... y las trampas que vienen ATRAS (= llegan despues).
// Se reordeno la grilla dibujada en §9.5 para que el orden de llegada coincida
// con la prosa: premio inmediato, castigo diferido.
{ nombre:'la-viga', tramo:4, filas:[
  '##...',
  'gg...',
  'gg...',
  '..VVV',
  '.....',
  '.....',
]},

// Dos vigas alternadas: la salida de la primera es la entrada de la segunda.
// Hacen falta 7 filas entre viga y viga: a 52 u/s eso son 162 ms, apenas mas
// que los 140 ms del tiron rasante. Con menos, el patron es imposible y no una
// decision — el validador lo caza.
{ nombre:'viga-doble', tramo:4, filas:[
  '.....',
  'VV...',
  '.....',
  '....g',
  '....g',
  '....g',
  '.....',
  '.....',
  '..VVV',
  '.....',
]},

// Densidad maxima. Las moviles van en 0 y 4 y no en 1 y 3: dos moviles
// vecinas tapan los cinco carriles y el patron deja de tener salida.
// Las filas vacias entre la movil y las trampas no son relleno: a 52 u/s
// hacen falta 7 filas para que entre un tiron rasante de 140 ms.
{ nombre:'derrumbe-total', tramo:4, filas:[
  '.....',
  '..b..',
  '.#.#.',
  '.g.g.',
  '.#.#.',
  'g.g.g',
  '.#.#.',
  '.g.g.',
  '#.#.#',
  '.g.g.',
  'g.g.g',
  '.....',
  '.....',
  '.....',
  '.....',
  '.....',
  '.....',
  'm...m',
  '.....',
]},

// La ultima gema: una sola, carisima, y una viga esperandote donde esta.
{ nombre:'la-ultima-gema', tramo:4, filas:[
  '.....',
  'VV...',
  'g....',
  '.....',
  '..#.#',
  '.....',
]},

// Tenaza: desvio que te mete adentro de la viga si no lo compensás.
{ nombre:'tenaza', tramo:4, filas:[
  '.....',
  '...VV',
  '.....',
  '...>.',
  'g.g..',
  '.....',
]},

// Companiera 4 (Tuca) a la derecha, con la viga tapando el camino corto.
{ nombre:'companiera-4', tramo:4, esCompaniera:true, filas:[
  '.....',
  'gg...',
  '....C',
  'VVV..',
  '.....',
]},
];

/* ===========================================================================
   Validadores — §9. Se corren al arrancar sobre los 24 (§16).
   =========================================================================== */

// Celdas que matan si estás ahí. La movil se trata como si bloqueara tambien
// los carriles vecinos: el validador no puede saber donde va a estar, asi que
// asume el peor caso y queda estricto a proposito.
function bloqueadosEnFila(fila){
  const b = new Set();
  for (let c = 0; c < fila.length; c++){
    const ch = fila[c];
    if (ch === '#' || ch === 'b') b.add(c);
    else if (ch === 'm'){
      b.add(c);
      // si la movil se mueve, el validador no puede saber donde va a estar:
      // asume el peor caso y bloquea tambien los vecinos. Quieta, ocupa un
      // carril y nada mas.
      if (CONFIG.movilCambiaCarril){
        if (c > 0) b.add(c-1);
        if (c < NCARRILES-1) b.add(c+1);
      }
    }
    else if (ch === 'V') b.add(c);
  }
  return b;
}

// Movimientos posibles con un gancho, segun el angulo elegido (§7.2)
function movimientos(cdEscala = 1){
  const P = CONFIG.hookTironPerp, R = CONFIG.hookTironRas;
  return [
    { d: -P.carriles, dur: P.dur, cd: CONFIG.hookCdParedPerp * cdEscala },
    { d:  P.carriles, dur: P.dur, cd: CONFIG.hookCdParedPerp * cdEscala },
    { d: -R.carriles, dur: R.dur, cd: CONFIG.hookCdParedRas  * cdEscala },
    { d:  R.carriles, dur: R.dur, cd: CONFIG.hookCdParedRas  * cdEscala },
  ];
}

// Tiempos de llegada de cada fila. La ULTIMA fila llega primero (§9.5).
function tiemposDeFilas(patron, vel){
  const n = patron.filas.length, sep = CONFIG.gemaSeparacion;
  return patron.filas.map((_, i) => CONFIG.gapMinSeg + (n - 1 - i) * sep / vel);
}

// Alcanzables desde un conjunto de estados antes de tLimite.
// estados: Map carril → tReady minimo (un tReady menor domina siempre).
function expandir(estados, tLimite, movs){
  const out = new Map(estados);
  let cambio = true;
  while (cambio){
    cambio = false;
    for (const [c, tr] of Array.from(out)){
      for (const m of movs){
        const c2 = c + m.d;
        if (c2 < 0 || c2 >= NCARRILES) continue;      // pegarle a la pared del
        if (tr + m.dur > tLimite) continue;           // borde no te mueve (§7.2)
        const tr2 = tr + m.cd;
        if (!out.has(c2) || out.get(c2) > tr2 + 1e-9){ out.set(c2, tr2); cambio = true; }
      }
    }
  }
  return out;
}

/* §9, regla dura: todo patron debe ser sobrevivible gastando el gancho SOLO en
   esquivar. Se exige desde CUALQUIER carril de entrada, porque el spawner no
   controla donde venís parada. */
function esResoluble(patron, vel, cdEscala = 1){
  const movs = movimientos(cdEscala);
  const tiempos = tiemposDeFilas(patron, vel);
  const orden = patron.filas.map((_, i) => i).sort((a, b) => tiempos[a] - tiempos[b]);

  for (let entrada = 0; entrada < NCARRILES; entrada++){
    let estados = new Map([[entrada, 0]]);
    let ok = true;
    for (const i of orden){
      const fila = patron.filas[i];
      estados = expandir(estados, tiempos[i], movs);
      const bloq = bloqueadosEnFila(fila);
      const sig = new Map();
      for (const [c, tr] of estados){
        if (bloq.has(c)) continue;
        // el desvio no mata: te empuja y te come 0.3 s de input (§9)
        let c2 = c, tr2 = tr;
        if (fila[c] === '<' || fila[c] === '>'){
          c2 = clamp(c + (fila[c] === '>' ? 1 : -1), 0, NCARRILES - 1);
          tr2 = Math.max(tr, tiempos[i] + CONFIG.desvioFuerzaDur);
        }
        if (!sig.has(c2) || sig.get(c2) > tr2) sig.set(c2, tr2);
      }
      if (sig.size === 0){ ok = false; break; }
      estados = sig;
    }
    if (!ok) return false;
  }
  return true;
}

/* §9, regla blanda — la que hace bueno al juego: el camino que ADEMAS junta
   todo no debe ser resoluble. Si se puede esquivar Y limpiar de gemas Y matar
   los bichos con los ganchos disponibles, el patron no obliga a elegir.
   Las gemas se encadenan en vertical (misma columna, 1.2 u): dos gemas del
   mismo carril en filas contiguas salen de un solo gancho, hasta 5 (§7.3). */
function gruposDeGemas(patron){
  const grupos = [];
  for (let c = 0; c < NCARRILES; c++){
    let run = [];
    for (let i = patron.filas.length - 1; i >= 0; i--){
      if (patron.filas[i][c] === 'g') run.push(i);
      else { if (run.length) grupos.push({ carril: c, filas: run }); run = []; }
      if (run.length === CONFIG.gemaCadenaMax){ grupos.push({ carril: c, filas: run }); run = []; }
    }
    if (run.length) grupos.push({ carril: c, filas: run });
  }
  return grupos;
}

function esAvaro(patron, vel, cdEscala = 1){
  const movs = movimientos(cdEscala);
  const tiempos = tiemposDeFilas(patron, vel);
  const orden = patron.filas.map((_, i) => i).sort((a, b) => tiempos[a] - tiempos[b]);
  const grupos = gruposDeGemas(patron);
  const bichos = patron.filas.join('').split('').filter(c => c === 'b').length;

  // Ganchos que entran en la ventana en la que el patron es accionable: desde
  // que la primera fila cae adentro del alcance de 14 u (§7.1) hasta que la
  // ultima pasa. Antes de eso no hay nada que enganchar, aunque se vea.
  const largo = (patron.filas.length - 1) * CONFIG.gemaSeparacion;
  const ventana = (CONFIG.hookAlcance + largo) / vel;
  const disponibles = Math.floor(ventana / (CONFIG.hookCooldown * cdEscala)) + 1;

  // DFS acotado sobre (fila, carril) contando ganchos de esquive y grupos que
  // el camino recorre gratis. Nos interesa el MEJOR caso para el jugador.
  let mejor = Infinity, nodos = 0;
  const rec = (k, carril, tReady, ganchos, visitadas) => {
    if (++nodos > 20000 || ganchos >= mejor) return;
    if (k === orden.length){
      const gratis = grupos.filter(g => g.filas.every(f => visitadas[f] === g.carril)).length;
      const costo = ganchos + (grupos.length - gratis) + bichos;
      if (costo < mejor) mejor = costo;
      return;
    }
    const i = orden[k], fila = patron.filas[i], bloq = bloqueadosEnFila(fila);
    const alc = expandir(new Map([[carril, tReady]]), tiempos[i], movs);
    for (const [c, tr] of alc){
      if (bloq.has(c)) continue;
      let c2 = c, tr2 = tr;
      if (fila[c] === '<' || fila[c] === '>'){
        c2 = clamp(c + (fila[c] === '>' ? 1 : -1), 0, NCARRILES - 1);
        tr2 = Math.max(tr, tiempos[i] + CONFIG.desvioFuerzaDur);
      }
      visitadas[i] = c2;
      rec(k + 1, c2, tr2, ganchos + (c === carril ? 0 : 1), visitadas);
      visitadas[i] = -1;
    }
  };
  for (let entrada = 0; entrada < NCARRILES; entrada++)
    rec(0, entrada, 0, 0, patron.filas.map(() => -1));

  return mejor <= disponibles;
}

// Un patron del tramo 1 nunca se juega a 54 u/s: se valida contra la velocidad
// MAXIMA de su propio tramo, que es el peor caso real.
function velMaxDeTramo(n){
  const tr = CONFIG.tramos.find(t => t.n === n);
  return velocidadEn(tr ? tr.t1 : CONFIG.duracion);
}

// §9 + §16: se verifican los 24 al arrancar. El que no pasa la regla dura no se
// usa; el que pasa la blanda solo se loguea, porque es criterio de diseño.
function validarPatrones(){
  const buenos = [], avaros = [];
  for (const p of PATRONES){
    const vel = velMaxDeTramo(p.tramo);
    const ok = esResoluble(p, vel);
    console.assert(ok, `patron IMPOSIBLE a la velocidad maxima de su tramo, no se usa: ${p.nombre}`);
    if (!ok) continue;
    buenos.push(p);
    if (esAvaro(p, vel)){
      avaros.push(p.nombre);
      console.warn(`patron avaro (se puede esquivar Y limpiar): ${p.nombre} — apretalo`);
    }
  }
  const porTramo = [1,2,3,4].map(t => buenos.filter(p => p.tramo === t).length);
  console.assert(porTramo.every(n => n >= 4), 'algun tramo se quedo sin patrones', porTramo);
  // §16: tiene que existir al menos un patron por tramo donde haya que
  // renunciar a gemas para sobrevivir.
  for (const t of [1,2,3,4])
    console.assert(buenos.some(p => p.tramo === t && !avaros.includes(p.nombre)),
      `el tramo ${t} no tiene ni un patron que obligue a renunciar a gemas`);
  return buenos;
}

export { PATRONES, esResoluble, esAvaro, validarPatrones, velMaxDeTramo, gruposDeGemas, bloqueadosEnFila };
