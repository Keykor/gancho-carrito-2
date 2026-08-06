# Color de casco desbloqueable

## Problema

El jugador quiere poder **elegir el color del casco de las mineras**, desde una
opción en el juego. Los colores se **desbloquean con los finales**: cada uno de
los 5 finales habilita un color, y arranca con el amarillo de siempre como
default. El color elegido vale para Rufa y las 4 compañeras por igual, y se
recuerda entre partidas.

## Alcance

**Incluye:**
- Una tira de swatches en la pantalla de título (`p-titulo`) para elegir color.
- 6 colores: 1 default (amarillo actual) + 5 desbloqueables, uno por final.
- Los no desbloqueados se muestran en silueta/candado (como la lista de finales).
- Repintar el casco al elegir y al arrancar el juego, leyendo el color guardado.
- Persistir el color elegido en `localStorage` (`gc2.casco`).

**NO incluye:**
- Colores por minera distintos (todas comparten el color; es el atlas compartido).
- Tocar la lógica de finales, patrones o balance.
- Colores para nada que no sea el casco (lámpara, overol, cara).
- Animaciones o previsualización 3D en vivo del color en el menú (el swatch alcanza).

## Enfoque y por qué

El color del casco está horneado en el tile `TX.CASCO` del atlas procedural
(`pintarCasco`/`recolorarCasco` en [texturas.js](../../src/texturas.js)), un
canvas 256×256 que **comparten
todas las mineras**. Por eso **repintar ese tile cambia el casco de todas a la
vez** — que es lo que se quiere.

- **Elegido: repintar el tile del atlas** al seleccionar (y al bootear). Se
  extrae la pintura del casco a una función reusable, se cachea la textura del
  atlas y se expone `recolorarCasco(hex)` que repinta el tile y marca
  `tex.needsUpdate = true`. **Cero cambios en shaders, materiales o geometría**,
  y no cruza la separación lógica/3D del repo.

Los desbloqueos **no necesitan persistencia nueva**: `leerFinalesVistos()`
([score.js:46](../../src/score.js)) ya guarda qué finales se vieron en
`gc2.finales`. El color N está disponible si el final N está en esa lista. Solo
se agrega una clave para *cuál* eligió el jugador: `gc2.casco`.

### Colores (color → final que lo desbloquea)

| Color | Hex | Desbloquea con |
|---|---|---|
| Amarillo casco (default) | `#FFD166` | siempre |
| Gris polvo | `#8A7FA8` | Final 0 — moriste |
| Blanco | `#E8E4F0` | Final 1 — Salida raspando |
| Cobre | `#C79A45` | Final 2 — La dueña de la veta |
| Turquesa | `#4CE0D2` | Final 3 — Salimos todas |
| Coral | `#E86A5A` (nuevo) | Final 4 — Cosas de Minas |

## Pasos

1. **`src/texturas.js`** — Extraer la pintura del casco (líneas 308-314) a
   `pintarCasco(color)` que redibuja el tile completo: `color` como base, la
   visera como un tono más oscuro derivado del `color` (hoy fijo en índice 11),
   la lámpara intacta (índice 15) y las nervaduras. `generar()` la usa con el
   default. Cachear la textura que devuelve `generar()` y exportar
   `recolorarCasco(hex)` → `pintarCasco(hex)` + `tex.needsUpdate = true`.
   Agregar al objeto que retorna el IIFE.

2. **`src/config.js`** — Agregar tabla `CASCOS` (array de `{ hex, final }`,
   índice 0 = default con `final: null`). Helpers de persistencia:
   `leerCascoElegido()` / `guardarCascoElegido(i)` sobre `almacen`
   (clave `gc2.casco`), del mismo palo que `record`/`finales`.

3. **`index.html`** — En `p-titulo` (tras la fila de botones) agregar el
   contenedor de la tira: `<div class="fila"><div id="casco-tira"></div></div>`.
   CSS: `.casco-tira` (fila de swatches), `.swatch` (cuadrado con el color),
   `.swatch.sel` (elegido, con borde), `.swatch.trabado` (silueta + candado,
   `pointer-events` off).

4. **`src/strings.js`** — Etiquetas es/en: título/aria de la tira (ej.
   `casco.titulo` = "Casco"), y el aria de trabado (ej. `casco.trabado` =
   "Se desbloquea con un final"). Ningún texto fuera de acá.

5. **`src/hud.js`** — Construir la tira una vez y refrescarla cada vez que se
   muestra el título: pintar cada swatch con su hex, marcar `trabado` los cuyos
   `final` no esté en `leerFinalesVistos()` (el default nunca traba), marcar
   `sel` el elegido. Click en un swatch desbloqueado → `recolorarCasco(hex)`,
   `guardarCascoElegido(i)`, actualizar `sel`.

6. **Boot** — Donde se genera el atlas al arrancar (seguir el llamador de
   `TextureGen.generar()`), tras generarlo aplicar el color guardado:
   `recolorarCasco(CASCOS[leerCascoElegido()].hex)`, clampeando el índice a un
   color efectivamente desbloqueado (si borraron el save o quedó inconsistente,
   caer al default).

## Tests

Sin framework de tests (ver CLAUDE.md). La lógica no trivial es mínima:
"¿qué colores están desbloqueados dado `gc2.finales`?" es `includes()`, y el
clamp del índice guardado al set desbloqueado. Se verifica **jugando**:

- `?jugar&comp=4&t=118` para llegar rápido a un final y ver que aparece el color.
- La persistencia de finales ya existe y anda; el swatch la lee, no la cambia.
- Manual: elegir un color, recargar, confirmar que persiste; con `localStorage`
  vacío, confirmar que arranca en amarillo y solo ese está disponible.

## Riesgos

- **La lámpara comparte el tile `TX.CASCO`** ([geo.js:240](../../src/geo.js)) y
  la visera se dibuja encima. `pintarCasco` tiene que **redibujar visera y
  lámpara** después del color base, o el color se los come. La visera pasa de
  índice fijo a un tono derivado del color elegido — hay que elegir la fórmula
  (oscurecer ~35%).
- **Coral está fuera de los 16 de la paleta del §13.** Desviación mínima y
  deliberada (una tinta en un tile), anotada acá.
- Mutar el atlas compartido cambia el casco de todas las mineras a la vez: es lo
  buscado, pero es un efecto global — el único consumidor del tile es el casco
  (+ lámpara), así que no hay daño colateral.
- El turquesa es el color "premio" (gemas). Riesgo bajo de confusión a 320×240
  porque el casco vive arriba del carrito, no en el túnel. Se deja; si molesta al
  verlo, se cambia el hex sin tocar nada más.

## Alternativas descartadas

- **Tintar el casco con un material aparte** (separar el box del casco del mesh
  fusionado + material con `color`): más invasivo, toca `geo.js` y el material
  PS1, y como el tile base es amarillo tintaría sucio. Descartado por A.
- **Poner el selector en la pantalla de Opciones** (`p-opciones`, ya existe):
  válido y quizá más prolijo, pero el usuario pidió el título. Queda como
  fallback fácil si después se quiere mover — es mover el mismo bloque de DOM.
- **Persistir los desbloqueos aparte**: innecesario, `gc2.finales` ya los da.

## Decisiones abiertas

Ninguna. Colores, cantidad (5+1), ubicación (título) y enfoque (repintar tile)
acordados.
