/* ===========================================================================
   STRINGS + t() — §12.6
   Reglas duras: (1) nunca concatenar, cada frase completa es una clave con
   placeholders. (2) plurales con claves .one/.other resueltas por un helper.
   No se traducen: el titulo del juego ni los nombres propios de las mineras.
   =========================================================================== */
import { almacen } from './config.js';

export const STRINGS = {
es: {
  'titulo.bajada'          : 'Cinco minas en una mina. Y solo dos minutos.',
  'titulo.jugar'           : 'Bajar a la mina',
  'titulo.tutorial'        : 'Cómo se juega',
  'titulo.ayuda'           : 'Guía',
  'titulo.opciones'        : 'Sonido',
  'titulo.record'          : 'Mejor puntaje: {n}',
  'titulo.sinRecord'       : 'Todavía no bajó nadie',

  'ayuda.titulo'           : 'Guía',
  'ayuda.intro'            : 'Hay una sola acción en todo el juego: lanzar el gancho.',
  'ayuda.intro2'           : 'Un clic lo lanza a ese punto. Lo que pase depende de a qué le pegues.',
  'ayuda.pared'            : 'Clic en una pared',
  'ayuda.paredR'           : 'El carrito se mueve un carril hacia ese lado. Es la única forma de moverse.',
  'ayuda.gema'             : 'Clic en una gema',
  'ayuda.gemaR'            : 'La trae, y con ella el resto de la línea de ese carril (hasta cinco).',
  'ayuda.bicho'            : 'Clic en un murciélago',
  'ayuda.bichoR'           : 'Lo elimina y suelta dos gemas.',
  'ayuda.comp'             : 'Clic en una compañera',
  'ayuda.compR'            : 'Se sube al carrito y te deja una habilidad.',
  'ayuda.encima'           : 'Sin hacer nada',
  'ayuda.encimaR'          : 'Todo lo que pasa por debajo del carrito se recoge gratis.',
  'ayuda.cierre'           : 'El gancho tarda un momento en volver, y es el mismo para moverse, para recoger y para esquivar. Por eso hay que elegir.',
  'ayuda.compsTitulo'      : 'Hay cuatro mineras atrapadas. Subir a una te devuelve una vida, si te falta, y te deja algo para siempre:',
  'ayuda.teclado'          : 'Todo se juega con el mouse o con el dedo. La única tecla es {esc}, que pausa.',
  'ayuda.volver'           : 'Volver',
  'ayuda.siguiente'        : 'Siguiente',
  'ayuda.anterior'         : 'Anterior',

  'opciones.titulo'        : 'Sonido',
  'opciones.musica'        : 'Música',
  'opciones.efectos'       : 'Efectos',
  'opciones.general'       : 'General',
  'opciones.volver'        : 'Listo',

  'pausa.titulo'           : 'En pausa',
  'pausa.seguir'           : 'Seguir',
  'pausa.salir'            : 'Salir',

  'hud.gemas'              : 'Gemas',
  'hud.tiempo'             : 'Tiempo',
  'hud.puntaje'            : 'Puntaje',
  'hud.audioSuspendido'    : 'Tocá para activar el sonido',
  'hud.pausa'              : 'Pausa',
  'hud.vidaExtra'          : '+1 vida',
  'girar.titulo'           : 'Giralo',
  'girar.cuerpo'           : 'El juego se juega apaisado. Girá el teléfono y listo.',


  'tramo.1'                : 'Bocamina',
  'tramo.2'                : 'Galería',
  'tramo.3'                : 'Nivel inundado',
  'tramo.4'                : 'Derrumbe',
  'tramo.5'                : 'Boca de salida',

  'tutorial.beat1'         : 'Hacé clic en la pared para mover el carrito',
  'tutorial.beat2'         : '',
  'tutorial.beat3'         : 'Hacé clic en las gemas: el gancho llega más lejos que el carrito',
  'tutorial.beat4'         : 'Hacé clic en el murciélago antes de que llegue',
  'tutorial.beat5'         : 'Hacé clic en la compañera para subirla al carrito',
  'tutorial.bien'          : '¡Eso!',
  'tutorial.listo'         : 'Listo. Ya sabés todo lo que hay que saber.',
  'tutfin.titulo'          : 'Ya está',
  'tutfin.bajada'          : 'Eso es todo el juego. Ahora son dos minutos y una salida.',
  'tutfin.jugar'           : 'Jugar',
  'tutfin.menu'            : 'Volver al menú',

  'comp.1.nombre'          : 'Chola',
  'comp.1.oficio'          : 'la ganchera',
  'comp.1.habilidad'       : 'Cooldown del gancho −30 %',
  'comp.2.nombre'          : 'Nené',
  'comp.2.oficio'          : 'la de la lámpara',
  'comp.2.habilidad'       : 'Los obstáculos se marcan antes',
  'comp.3.nombre'          : 'Beba',
  'comp.3.oficio'          : 'la barretera',
  'comp.3.habilidad'       : 'Escudo: absorbe un impacto',
  'comp.4.nombre'          : 'Tuca',
  'comp.4.oficio'          : 'la voladora',
  'comp.4.habilidad'       : 'Los murciélagos te esquivan, las gemas se imantan',

  'final.0.titulo'         : 'No la contás',
  'final.0.cierre'         : 'La mina se cierra. Nadie sube.',
  'final.1.titulo'         : 'Salida raspando',
  'final.1.cierre'         : 'Sale sola y con lo puesto. Sobrevivir también es un resultado.',
  'final.2.titulo'         : 'La dueña de la veta',
  'final.2.cierre'         : 'Sale forrada de gemas, mira atrás, no hay nadie atrás.',
  'final.3.titulo'         : 'Salimos todas',
  'final.3.cierre'         : 'Sin un mango pero completas. El mejor final humano.',
  'final.4.titulo'         : 'Cosas de Minas',
  'final.4.cierre'         : 'Las cinco afuera, el carrito lleno, la mina se derrumba atrás.',
  'final.teFalta'          : 'Te falta',
  'pista.titulo'           : 'Probá',
  'pista.4'                : 'sacar a las cuatro con {n} gemas',
  'pista.3'                : 'sacar más compañeras',
  'pista.2'                : 'volver con más de {n} gemas',
  'pista.1'                : 'salir viva',
  'pista.0'                : 'no escapar',
  'pista.todos'            : 'batir tu récord de {n}',
  'final.otra'             : 'Otra vuelta',
  'final.alTitulo'         : 'Al título',
  'final.puntaje'          : 'Puntaje',
  'final.record'           : 'Récord',
  'final.recordNuevo'      : '¡Récord nuevo!',
  'final.gemas'            : 'Gemas',
  'final.companieras'      : 'Compañeras',
  'final.tiempoRestante'   : 'Restante',
  'final.rachaMax'         : 'Racha máx.',

  'stat.gemas.one'         : '{n} gema',
  'stat.gemas.other'       : '{n} gemas',
  'stat.comp.one'          : '{n} compañera',
  'stat.comp.other'        : '{n} compañeras',
  'stat.vidas.one'         : '{n} vida',
  'stat.vidas.other'       : '{n} vidas',

  'fatal.titulo'           : 'No arranca',
  'fatal.cuerpo'           : 'Este navegador no pudo inicializar WebGL. Probá con otro navegador o activá la aceleración por hardware.',
},
en: {
  'titulo.bajada'          : 'Five women. One mine. Two minutes.',
  'titulo.jugar'           : 'Head down',
  'titulo.tutorial'        : 'How to play',
  'titulo.ayuda'           : 'Guide',
  'titulo.opciones'        : 'Sound',
  'titulo.record'          : 'Best score: {n}',
  'titulo.sinRecord'       : 'Nobody has gone down yet',

  'ayuda.titulo'           : 'Guide',
  'ayuda.intro'            : 'There is one action in the whole game: throwing the hook.',
  'ayuda.intro2'           : 'A click throws it at that point. What happens depends on what it hits.',
  'ayuda.pared'            : 'Click a wall',
  'ayuda.paredR'           : 'The cart moves one lane that way. It is the only way to move.',
  'ayuda.gema'             : 'Click a gem',
  'ayuda.gemaR'            : 'It comes to you, and brings the rest of that lane\'s line (up to five).',
  'ayuda.bicho'            : 'Click a bat',
  'ayuda.bichoR'           : 'It is gone, and it drops two gems.',
  'ayuda.comp'             : 'Click a companion',
  'ayuda.compR'            : 'She climbs aboard and leaves you an ability.',
  'ayuda.encima'           : 'Doing nothing',
  'ayuda.encimaR'          : 'Anything that passes under the cart is picked up for free.',
  'ayuda.cierre'           : 'The hook takes a moment to come back, and it is the same hook for moving, for grabbing and for dodging. That is why you have to choose.',
  'ayuda.compsTitulo'      : 'Four miners are trapped down there. Bringing one aboard gives you a life back, if you are missing one, and leaves you something for good:',
  'ayuda.teclado'          : 'It is all played with the mouse or your finger. The only key is {esc}, which pauses.',
  'ayuda.volver'           : 'Back',
  'ayuda.siguiente'        : 'Next',
  'ayuda.anterior'         : 'Previous',

  'opciones.titulo'        : 'Sound',
  'opciones.musica'        : 'Music',
  'opciones.efectos'       : 'Effects',
  'opciones.general'       : 'Master',
  'opciones.volver'        : 'Done',

  'pausa.titulo'           : 'Paused',
  'pausa.seguir'           : 'Resume',
  'pausa.salir'            : 'Quit',

  'hud.gemas'              : 'Gems',
  'hud.tiempo'             : 'Time',
  'hud.puntaje'            : 'Score',
  'hud.audioSuspendido'    : 'Tap to turn the sound on',
  'hud.pausa'              : 'Pause',
  'hud.vidaExtra'          : '+1 life',
  'girar.titulo'           : 'Turn it',
  'girar.cuerpo'           : 'This one is played in landscape. Turn your phone and you are set.',


  'tramo.1'                : 'Adit',
  'tramo.2'                : 'Gallery',
  'tramo.3'                : 'Flooded Level',
  'tramo.4'                : 'Cave-in',
  'tramo.5'                : 'Mine Mouth',

  'tutorial.beat1'         : 'Click the wall to move the cart',
  'tutorial.beat2'         : '',
  'tutorial.beat3'         : 'Click the gems: the hook reaches further than the cart does',
  'tutorial.beat4'         : 'Click the bat before it reaches you',
  'tutorial.beat5'         : 'Click the companion to bring her aboard',
  'tutorial.bien'          : 'That is it!',
  'tutorial.listo'         : 'That is it. You know everything you need.',
  'tutfin.titulo'          : 'That is it',
  'tutfin.bajada'          : 'That is the whole game. Now it is two minutes and one way out.',
  'tutfin.jugar'           : 'Play',
  'tutfin.menu'            : 'Back to menu',

  'comp.1.nombre'          : 'Chola',
  'comp.1.oficio'          : 'the Grapple',
  'comp.1.habilidad'       : 'Hook cooldown −30%',
  'comp.2.nombre'          : 'Nené',
  'comp.2.oficio'          : 'on the Lamp',
  'comp.2.habilidad'       : 'Obstacles get outlined early',
  'comp.3.nombre'          : 'Beba',
  'comp.3.oficio'          : 'the Crowbar',
  'comp.3.habilidad'       : 'Shield: soaks one hit',
  'comp.4.nombre'          : 'Tuca',
  'comp.4.oficio'          : 'the Flier',
  'comp.4.habilidad'       : 'Bats dodge you, gems come to you',

  'final.0.titulo'         : "That's All She Wrote",
  'final.0.cierre'         : 'The mine closes. Nobody comes up.',
  'final.1.titulo'         : 'Out by a Whisker',
  'final.1.cierre'         : 'Out alone with nothing but her helmet. Surviving counts too.',
  'final.2.titulo'         : 'Queen of the Vein',
  'final.2.cierre'         : 'Out loaded with gems. She looks back. Nobody behind her.',
  'final.3.titulo'         : 'Nobody Left Behind',
  'final.3.cierre'         : 'Broke, but all five of them. The best human ending.',
  'final.4.titulo'         : "Women's Work",
  'final.4.cierre'         : 'All five out, the cart full, the mine folding shut behind them.',
  'final.teFalta'          : 'Still missing',
  'pista.titulo'           : 'Try',
  'pista.4'                : 'getting all four out with {n} gems',
  'pista.3'                : 'getting more companions out',
  'pista.2'                : 'coming back with more than {n} gems',
  'pista.1'                : 'making it out alive',
  'pista.0'                : 'not escaping',
  'pista.todos'            : 'beating your best of {n}',
  'final.otra'             : 'Again',
  'final.alTitulo'         : 'Title screen',
  'final.puntaje'          : 'Score',
  'final.record'           : 'Best',
  'final.recordNuevo'      : 'New best!',
  'final.gemas'            : 'Gems',
  'final.companieras'      : 'Companions',
  'final.tiempoRestante'   : 'Left',
  'final.rachaMax'         : 'Best streak',

  'stat.gemas.one'         : '{n} gem',
  'stat.gemas.other'       : '{n} gems',
  'stat.comp.one'          : '{n} companion',
  'stat.comp.other'        : '{n} companions',
  'stat.vidas.one'         : '{n} life',
  'stat.vidas.other'       : '{n} lives',

  'fatal.titulo'           : 'It will not start',
  'fatal.cuerpo'           : 'This browser could not initialise WebGL. Try another browser or turn on hardware acceleration.',
},
};

let LANG = (() => {
  const guardado = almacen.leer('gc2.lang', null);
  if (guardado === 'es' || guardado === 'en') return guardado;
  return (navigator.language || 'es').startsWith('es') ? 'es' : 'en';
})();

export const idioma = () => LANG;

export function t(clave, params){
  const tabla = STRINGS[LANG] || STRINGS.es;
  let s = tabla[clave];
  if (s === undefined) s = STRINGS.es[clave];
  if (s === undefined){ console.warn('falta la clave de texto:', clave); return clave; }
  if (params) for (const k in params) s = s.split('{' + k + '}').join(params[k]);
  return s;
}

// Plural (§12.6, regla 2). Ni español ni inglés necesitan mas que one/other.
export const tp = (base, n) => t(base + (n === 1 ? '.one' : '.other'), { n });

// Los suscriptores se registran; asi strings.js no tiene que importar el HUD y
// no hay ciclo de modulos.
const suscriptores = [];
export const alCambiarIdioma = fn => suscriptores.push(fn);

export function setLang(l){
  if (l !== 'es' && l !== 'en') return;
  LANG = l;
  almacen.escribir('gc2.lang', l);
  document.documentElement.lang = l;        // accesibilidad (§12.6)
  for (const fn of suscriptores) fn(l);
}

// Paridad de claves: que se entere quien desarrolla, no quien juega (§16).
(function verificar(){
  const faltanEn = Object.keys(STRINGS.es).filter(k => !(k in STRINGS.en));
  const faltanEs = Object.keys(STRINGS.en).filter(k => !(k in STRINGS.es));
  console.assert(faltanEn.length === 0, 'claves sin traducir al ingles:', faltanEn);
  console.assert(faltanEs.length === 0, 'claves que sobran en ingles:', faltanEs);
})();

document.documentElement.lang = LANG;
