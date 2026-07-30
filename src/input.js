/* ===========================================================================
   Input — §7.7. Traduce mouse/touch/teclado a coordenadas de la resolucion
   interna (320x240). En celular las zonas tactiles ocupan las mitades de TODA
   la pantalla, no solo del canvas (§17.6): por eso se clampea en vez de
   descartar lo que cae en el letterbox.
   =========================================================================== */
import { CONFIG, clamp } from './config.js';

const [RW, RH] = CONFIG.resInterna;

export const estado = {
  x: RW / 2, y: RH / 2,       // puntero en coordenadas internas
  hayPuntero: false,          // en touch puro la reticula solo aparece al tocar
  cola: [],
  teclas: new Set(),
};

// El input no importa el Game: registra acciones y el Game se suscribe. Sin
// esto habria un ciclo de modulos entre input.js y game.js.
const acciones = {};
export const registrarAccion = (nombre, fn) => { acciones[nombre] = fn; };
const disparar = (nombre, arg) => { acciones[nombre]?.(arg); };

let stage = null;
function aInterno(px, py){
  stage = stage || document.getElementById('stage');
  const r = stage.getBoundingClientRect();
  return {
    x: clamp((px - r.left) / r.width  * RW, 0, RW),
    y: clamp((py - r.top)  / r.height * RH, 0, RH),
  };
}

function empujar(ev){ if (estado.cola.length < 4) estado.cola.push(ev); }

/* --- puntero ---------------------------------------------------------- */
addEventListener('pointermove', e => {
  const p = aInterno(e.clientX, e.clientY);
  estado.x = p.x; estado.y = p.y;
  if (e.pointerType === 'mouse') estado.hayPuntero = true;
}, { passive: true });

addEventListener('pointerdown', e => {
  disparar('gesto');                              // desbloquea el AudioContext
  if (e.target.closest('button, input, .pantalla')) return;   // eso no es un gancho
  const p = aInterno(e.clientX, e.clientY);
  estado.x = p.x; estado.y = p.y; estado.hayPuntero = true;
  empujar({ tipo:'apuntado', x:p.x, y:p.y, t: performance.now() / 1000 });
}, { passive: true });

/* --- teclado ----------------------------------------------------------
   El §7.7 daba A/D, flechas y Espacio. Se sacaron todos a pedido: el juego se
   juega ENTERO con el puntero, y el unico verbo es el gancho apuntado (§7).
   Del teclado solo queda la pausa y las teclas de debug.
   Costo conocido: sin teclas de gancho no hay camino de teclado para jugar,
   asi que el criterio de accesibilidad del §16 queda sin cumplir.            */

addEventListener('keydown', e => {
  if (e.repeat) return;
  estado.teclas.add(e.code);
  disparar('gesto');
  const t = performance.now() / 1000;

  if (e.code === 'Escape' || e.code === 'KeyP'){ disparar('pausa'); e.preventDefault(); return; }

  // --- debug (§17.5): se construyen en el hito 1, no al final ----------
  const D = CONFIG.debug;
  switch (e.code){
    case 'F1': D.hitboxes = !D.hitboxes; disparar('aviso', 'hitboxes ' + D.hitboxes); e.preventDefault(); break;
    case 'F2': D.invencible = !D.invencible; disparar('aviso', 'invencible ' + D.invencible); e.preventDefault(); break;
    case 'F3': D.stats = !D.stats;
               document.getElementById('stats').classList.toggle('hide', !D.stats); e.preventDefault(); break;
    case 'F4': disparar('saltarTramo'); e.preventDefault(); break;
    case 'F5': disparar('forzarPatron', prompt('patron a forzar (vacio = ninguno):') || null); e.preventDefault(); break;
    case 'F6': disparar('recargarConfig'); e.preventDefault(); break;
  }
});
addEventListener('keyup', e => estado.teclas.delete(e.code));
addEventListener('blur', () => estado.teclas.clear());

// Ni zoom por doble tap ni menu contextual arruinando un tap de gancho
addEventListener('contextmenu', e => { if (!e.target.closest('.pantalla')) e.preventDefault(); });
addEventListener('dblclick', e => e.preventDefault());

export function tomarEventos(){ const c = estado.cola; estado.cola = []; return c; }
export function limpiar(){ estado.cola.length = 0; }
