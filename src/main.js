/* ===========================================================================
   main — punto de entrada. Arranca el juego y, la primera vez que alguien lo
   abre, lo manda directo al tutorial (§12.5).
   =========================================================================== */
import { CONFIG, almacen } from './config.js';
import { Game } from './game.js';

if (Game.init()){
  /* Enganches de arranque por URL, del mismo palo que las teclas F1-F6 (§17.5):
     sirven para testear un tramo sin jugar los 90 s que hay antes.
       ?jugar          arranca la partida derecho, sin tutorial
       ?jugar&t=95     ademas salta al segundo 95
       ?jugar&comp=3   ademas arranca con 3 companieras rescatadas
       ?jugar&patron=peaje   fuerza ese patron una y otra vez (= F5)
       ?stats          abre el overlay de F3                                  */
  const q = new URLSearchParams(location.search);
  if (q.has('stats')){
    CONFIG.debug.stats = true;
    document.getElementById('stats').classList.remove('hide');
  }
  if (q.has('hitboxes')) CONFIG.debug.hitboxes = true;
  if (q.has('invencible')) CONFIG.debug.invencible = true;

  if (q.has('jugar')){
    Game.empezar(false);
    if (q.has('t')) Game.tiempo = Math.max(0, Math.min(CONFIG.duracion - 1, +q.get('t') || 0));
    if (q.has('patron')) Game.spawner.forzarPatron(q.get('patron'));
    const n = Math.max(0, Math.min(4, +q.get('comp') || 0));
    for (let i = 1; i <= n; i++){
      Game.player.companieras.push(i);
      if (i === 1) Game.player.hab.chola = true;
      if (i === 2) Game.player.hab.nene = true;
      if (i === 3){ Game.player.hab.beba = true; Game.player.escudo = true; }
      if (i === 4) Game.player.hab.tuca = true;
    }
  }
  // El juego arranca SIEMPRE en la pantalla de titulo. El tutorial esta a un
  // click de ahi ("Como se juega") y no se lanza solo: caer adentro de un
  // tutorial sin haber apretado nada se siente como que el juego no te dejo
  // elegir.
}

// Para tocar el balance desde la consola sin recargar (§15, §17.5).
// GC2.CONFIG.luzRufa = 2; GC2.recargarConfig()  ← asi se balancea la luz.
window.GC2 = Game;
Game.CONFIG = CONFIG;
