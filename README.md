# Gancho Carrito 2: Cosas de Minas

Sos una minera atrapada en una mina que se viene abajo. Tenés dos minutos para
llegar a la salida arriba de un carrito que no frena nunca. No manejás el
carrito: manejás un **gancho** que tirás contra las paredes del túnel para
tirarte de carril en carril, esquivando trampas, murciélagos y desvíos,
juntando gemas y rescatando a las otras mineras que quedaron adentro.

Corredor sobre rieles con estética PlayStation 1, en el navegador. Sin build,
sin dependencias, sin un solo archivo de imagen ni de audio: **todas las
texturas se generan en un `<canvas>` al arrancar y todo el sonido se sintetiza
con WebAudio**.

## Cómo correrlo

Necesita servirse por HTTP — son módulos ES, y `file://` los bloquea por CORS.

```sh
python3 -m http.server 8000
# después: http://localhost:8000
```

Sobre cualquier hosting estático con HTTPS anda directo, sin configurar nada.

## Cómo se juega

Una sola acción: **hacer clic**. El gancho sale hacia ese punto y lo que pasa
depende de a qué le pegues.

| A qué le pegás | Qué pasa |
|---|---|
| Una **pared** | El carrito se mueve un carril hacia ese lado. Es la única forma de moverse |
| Una **gema** | La trae, y con ella el resto de la línea de ese carril (hasta cinco) |
| Un **murciélago** | Lo elimina y suelta dos gemas |
| Una **compañera** | Se sube al carrito y te deja una habilidad permanente |
| Nada | Clank, y perdés el cooldown |

Lo que pasa por debajo del carrito se recoge gratis — pero llegar a ese carril
costó un gancho. Y es el mismo gancho para moverse, para recoger y para
esquivar: por eso hay que elegir. Ese es todo el juego.

La única tecla es `Esc`, que pausa (también hay botón).

## Estructura

`index.html` es la cáscara: el canvas, el HUD en DOM y todo el CSS. El juego
vive en `src/`, en módulos que siguen el orden del documento de diseño.

La separación que importa: **la lógica del juego no sabe que Three.js existe.**
`entities.js`, `patrones.js`, `spawner.js`, `player.js` y `score.js` no
importan nada de 3D — la capa visual lee ese estado y lo dibuja. Por eso el
validador de patrones puede simular partidas enteras sin renderizar un frame.

| | |
|---|---|
| `config.js` | Todo el tuning en un solo objeto. Si algo se siente mal, se toca acá |
| `strings.js` | Tabla es/en y el resolver. Ningún texto vive fuera de acá |
| `texturas.js` | Genera el atlas procedural de 256×256 al arrancar |
| `shaders.js` | El material PS1: vertex snapping, mapeado afín, 5 luces por vértice |
| `geo.js` | Toda la geometría por código |
| `entities.js` | Entidades y mundo. Colisión en 2D `(carril, z)` |
| `patrones.js` | Los 24 patrones escritos a mano + los validadores |
| `spawner.js` | Qué patrón y cuándo |
| `player.js` | Rufa: carril, gancho, vidas, habilidades |
| `score.js` | Los 5 finales, el puntaje y las pistas |
| `audio.js` `music.js` `cartsfx.js` | Buses, secuenciador de 16 pasos, capas del carrito |
| `vista.js` `tunnel.js` `lights.js` `camara.js` `render.js` | La capa 3D |
| `hud.js` `tutorial.js` `game.js` | HUD en DOM, los 5 beats, y la máquina de estados |

### Los patrones se validan solos

Cada patrón es una grilla de texto. Al arrancar, `esResoluble()` simula un
jugador que solo esquiva y verifica que **todos** los patrones se puedan
sobrevivir gastando el gancho únicamente en no chocar. El que no pasa, no se
usa. `esAvaro()` avisa del caso contrario: si un patrón se puede esquivar *y*
limpiar de gemas *y* matar los bichos con los ganchos disponibles, entonces no
obliga a elegir, y elegir es el juego.

## Debug

| Tecla | |
|---|---|
| `F1` | Hitboxes, carriles y el estado de la transición entre carriles |
| `F2` | Invencibilidad |
| `F3` | fps, draw calls, triángulos, entidades vivas |
| `F4` | Saltar al tramo siguiente |
| `F5` | Forzar un patrón por nombre |
| `F6` | Recargar `CONFIG` en caliente |

También por URL: `?jugar` arranca sin tutorial, `?jugar&t=95` salta al segundo
95, `?jugar&comp=3` arranca con tres compañeras, `?jugar&patron=peaje` fuerza
ese patrón, `?stats` abre el overlay de `F3`.

Desde la consola: `GC2.CONFIG.luzRufa = 2; GC2.recargarConfig()`.

## Créditos

Three.js r160 (MIT), vendoreado para que el juego no haga una sola request a un
tercero. Todo lo demás es de acá.
