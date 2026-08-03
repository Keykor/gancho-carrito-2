/* ===========================================================================
   Score — §11 (finales) y §11.5 (puntaje). Logica pura.
   Los finales son sobre a quien sacaste de la mina; el puntaje es otra cosa.
   Que sean dos numeros separados es deliberado: si el puntaje decidiera el
   final, la lectura seria "las companieras valen 250 puntos" en vez de "las
   sacaste".
   =========================================================================== */
import { CONFIG, almacen } from './config.js';

/* §11. Los cinco finales.

   La tabla del §11 se contradice sola: la fila del final 3 pide C >= 3, pero la
   regla de "cualquier otro caso" lo daba con C >= 2. Con dos de cuatro el juego
   te felicitaba por sacar a todas, y el titulo del final es una afirmacion
   sobre lo que hiciste — si miente, todo el sistema de finales miente.
   Gana la fila: "Salimos todas" necesita 3 o 4. Lo que queda con menos se
   decide por gemas, que es el otro eje del §11.                              */
export function evaluarFinal(escapo, gemas, comps){
  if (!escapo) return 0;
  const G = gemas, C = comps;
  if (C === 4 && G >= CONFIG.gemasUmbralVerdadero) return 4;   // Cosas de Minas
  if (C >= 3) return 3;                                        // Salimos todas
  if (G >= CONFIG.gemasUmbral) return 2;                       // La dueña de la veta
  return 1;                                                    // Salida raspando
}

export function calcularPuntaje(p){
  return p.gemas        * CONFIG.ptsGema
       + p.murcielagos  * CONFIG.ptsMurcielago
       + p.companieras  * CONFIG.ptsCompaniera
       + p.rachaMax     * CONFIG.ptsRacha
       + p.vidas        * CONFIG.ptsVida;
}

/* Un solo numero, sin tabla ni nombres (§11.5). */
export const leerRecord = () => almacen.leer('gc2.record', 0);
export function guardarRecord(p){
  const viejo = leerRecord();
  if (p > viejo){ almacen.escribir('gc2.record', p); return true; }
  return false;
}

/* Que finales ya se vieron, para la lista en silueta del §11 — el "te falta el
   4" es el motor del replay, y sin persistir no hay tal motor. Son 5 bits, la
   misma categoria que las ayudas ya mostradas del §12.5. */
export const leerFinalesVistos = () => almacen.leer('gc2.finales', []);
export function marcarFinalVisto(n){
  const v = leerFinalesVistos();
  if (!v.includes(n)){ v.push(n); almacen.escribir('gc2.finales', v); }
  return v;
}

/* §11: "qué final te falta" es el motor del replay, pero una lista de siluetas
   no dice COMO. Esto elige un final que te falte — el que estas mas cerca de
   sacar segun lo que acabas de hacer — y devuelve la clave de una pista
   concreta, con tus propios numeros adentro. Logica pura: decide cual, no como
   se escribe.                                                                */
export function pistaDeFinal(datos, vistos){
  const { gemas: G, companieras: C, escapo } = datos;
  const falta = n => !vistos.includes(n);
  const U = CONFIG.gemasUmbral, V = CONFIG.gemasUmbralVerdadero;

  if (vistos.length >= 5) return { clave: 'pista.todos', params: { n: datos.puntaje } };

  // Si te acabas de morir, lo primero es salir viva: todo lo demas se cuenta
  // recien despues de escapar, y sugerir "rescata dos companieras" a alguien
  // que no llego al final del tunel es hablarle del postre antes del plato.
  if (!escapo && falta(1)) return { clave: 'pista.1' };

  // el verdadero primero, pero solo si ya estas en camino: sugerirlo a alguien
  // que nunca rescato a nadie no es una pista, es una burla
  if (falta(4) && (C >= 2 || G >= U))
    return { clave: 'pista.4', params: { c: C, g: G, faltanG: Math.max(0, V - G),
                                         faltanC: Math.max(0, 4 - C) } };
  if (falta(3) && C < 3)  return { clave: 'pista.3', params: { c: C } };
  if (falta(2) && G < U)  return { clave: 'pista.2', params: { faltanG: Math.max(1, U - G) } };
  if (falta(1) && !escapo) return { clave: 'pista.1' };
  if (falta(0))            return { clave: 'pista.0' };
  if (falta(4))            return { clave: 'pista.4', params: { c: C, g: G,
                                     faltanG: Math.max(0, V - G), faltanC: Math.max(0, 4 - C) } };
  if (falta(3))            return { clave: 'pista.3', params: { c: C } };
  if (falta(2))            return { clave: 'pista.2', params: { faltanG: Math.max(1, U - G) } };
  if (falta(1))            return { clave: 'pista.1' };
  return { clave: 'pista.todos', params: { n: datos.puntaje } };
}

export function resumenDePartida(player, escapo, tiempoRestante){
  const comps = player.companieras.length;
  const final = evaluarFinal(escapo, player.gemas, comps);
  const datos = {
    gemas: player.gemas,
    murcielagos: player.murcielagos,
    companieras: comps,
    rescatadas: player.companieras.slice(),
    rachaMax: player.rachaMax,
    vidas: Math.max(0, player.vidas),
    tiempoRestante: Math.max(0, tiempoRestante),
    escapo, final,
  };
  datos.puntaje = calcularPuntaje(datos);
  datos.record = leerRecord();
  datos.recordNuevo = guardarRecord(datos.puntaje);
  if (datos.recordNuevo) datos.record = datos.puntaje;
  // la lista ANTES de anotar este final: la pantalla la usa para saber cual
  // tildar a la vista y cuales ya estaban tildados de partidas anteriores
  datos.finalesPrevios = leerFinalesVistos();
  datos.pista = pistaDeFinal(datos, datos.finalesPrevios);
  datos.finalesVistos = marcarFinalVisto(final);
  return datos;
}
