# Gancho Carrito 2: Cosas de Minas
### Documento de diseño e implementación (para agente de desarrollo web)

---

## 0. Cómo usar este documento

Este es el spec completo del juego. Implementalo **tal cual**, salvo en los puntos marcados como `[AJUSTABLE]`, donde podés tomar la decisión que mejor funcione en la práctica. Todos los números están puestos como punto de partida jugable: si al testear algo se siente mal, ajustá el número, no la mecánica.

El entregable es **un solo archivo `index.html`** que corra abriéndolo en el navegador, sin build, sin dependencias, sin assets externos.

---

## 1. Pitch

Sos una minera atrapada en una mina que se está viniendo abajo. Tenés **2 minutos** para llegar a la salida arriba de un carrito descontrolado que no frena nunca. No manejás el carrito: manejás un **gancho** que disparás contra la pared izquierda o derecha del túnel para tirarte de carril en carril, esquivando trampas, murciélagos y desvíos, juntando gemas y —lo nuevo de esta entrega— **rescatando a las otras minas que quedaron adentro**.

El título es un chiste doble: "minas" son las minas de piedra y, en lunfardo, las mujeres. El juego se lo toma en serio como acción y con humor en la superficie: la protagonista y sus compañeras son mineras competentes, el chiste está en el lenguaje, nunca en ellas.

**Tono:** acción arcade rápida, humor rioplatense seco, tensión de derrumbe. Nada de chistes a costa de las personajes.

---

## 2. Qué se hereda del juego 1

| Elemento | Se mantiene |
|---|---|
| Género | Infinite runner sobre rieles |
| Objetivo | Escapar de la mina antes del derrumbe |
| Control central | Gancho que rebota contra la pared izquierda/derecha para cambiar de carril |
| Obstáculos | Rieles que te desvían, trampas en los carriles, murciélagos |
| Coleccionable | Monedas → ahora **gemas** |
| Duración | 2 minutos exactos |
| Cierre | Finales múltiples según lo que juntaste |

## 3. Qué es nuevo en el 2

1. **Protagonista femenina con nombre e identidad:** *Rufa*, minera, gancho propio.
2. **Compañeras rescatables** (la mecánica nueva, ver §7). Hay 4 mineras atrapadas en el recorrido. Cada rescate suma una **habilidad pasiva** y cambia el final.
3. **Finales en matriz** (gemas × compañeras) en lugar de solo gemas.
4. **Vagón que crece:** cada compañera rescatada se sube al carrito y el carrito se dibuja más largo. Es feedback visual del progreso, no afecta la hitbox.

---

## 4. Stack técnico

**3D en navegador con estética PlayStation 1.** El look no es un filtro decorativo puesto encima: es exactamente lo que hace que el juego sea barato de renderizar. Todo lo que se ve mal a propósito ahorra plata en GPU.

- **Three.js (versión pinneada, r160+, ESM)** cargado con `<script type="importmap">` desde CDN. Nada más: sin React, sin bundler, sin build step.
- Un único `index.html`. Opcionalmente vendorá `three.module.js` al lado del HTML; en ese caso el juego no hace **ninguna** request.
- **Cero assets externos.** Todas las texturas se generan proceduralmente al arrancar (ruido + formas dibujadas en un `<canvas>` de 64×64, volcadas a un atlas de 256×256). Toda la geometría se construye por código con `BufferGeometry`. Todo el audio con WebAudio.
- Lógica con **timestep fijo de 60 Hz** y acumulador; render desacoplado, interpolando posiciones entre ticks.
- `WebGLRenderer` con `antialias: false`, `powerPreference: 'high-performance'`, `setPixelRatio(1)`.
- `prefers-reduced-motion`: apaga shake de cámara, jitter extra y partículas ambientales. El juego sigue siendo el mismo.
- **Presupuestos duros:** < 25.000 triángulos en pantalla, < 40 draw calls, < 12 MB de texturas, cero allocations por frame en el loop caliente (pooling de todo).
- **Fallback:** si `WebGLRenderer` no inicializa, mostrar una placa de error clara en HTML. No hay modo 2D de respaldo.

---

## 4.5 El look PS1: cómo se logra

Estas ocho técnicas son el corazón visual. Implementalas todas — juntas leen como PS1, sueltas parecen un bug.

**1. Render interno a baja resolución.** Todo se renderiza a un `WebGLRenderTarget` de **320 × 240** con `NearestFilter` en mag y min, y después se estira a pantalla completa con un quad fullscreen. Es el mayor ahorro de fillrate del proyecto y la mitad del look. Relación de aspecto 4:3, letterbox en cualquier ventana.

**2. Vertex snapping (el temblor característico).** La PS1 no tenía precisión sub-pixel en la transformación de vértices. En el vertex shader, después de calcular `gl_Position`, cuantizá la posición a una grilla:

```glsl
vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
vec2 grid = uResolution * 0.5;              // uResolution = (320, 240)
clip.xy = floor((clip.xy / clip.w) * grid + 0.5) / grid * clip.w;
gl_Position = clip;
```

**3. Mapeado de texturas afín (el warpeo).** La PS1 interpolaba UVs en espacio de pantalla, sin corrección de perspectiva, y por eso las texturas se retuercen en los polígonos grandes cerca de cámara. WebGL siempre interpola con corrección, así que hay que cancelarla:

```glsl
// vertex
vUv = uv * gl_Position.w;
vW  = gl_Position.w;
// fragment
vec2 affineUv = vUv / vW;
```

**4. Iluminación por vértice, nunca por píxel.** Nada de `MeshStandardMaterial`, nada de PBR, nada de sombras dinámicas. Un único `ShaderMaterial` propio que calcula hasta **5 luces spot en el vertex shader** (Rufa + las 4 compañeras, §8) y pasa el resultado como color interpolado. El fragment shader es una multiplicación de textura por color y nada más.

**5. Niebla densa como draw distance.** Fog lineal, `near = 8`, `far = 45` unidades, del color del fondo. La niebla es lo que justifica que no se renderice el túnel más allá de 45 unidades — y en una mina a oscuras es diegética, no un truco.

**6. Profundidad de color de 15 bits + dithering.** En el shader del quad final, posterizá cada canal a 32 niveles y aplicá un dither ordenado de Bayer 4×4 antes de cuantizar. Sin esto, los degradés de la niebla se bandean feo; con esto, se ven exactamente como una consola de 1996.

**7. Texturas chicas, sin mipmaps, sin filtrado.** 64×64 por elemento, `NearestFilter`, `generateMipmaps: false`. El aliasing de texturas es parte del look.

**8. Presupuesto poligonal de la época.** Personaje: 150–300 tris. Carrito: ~200. Segmento de túnel: ~40. Obstáculo: 20–60. Si algo necesita más, está mal modelado.

**Lo que NO hay que hacer:** post-procesado moderno (bloom, SSAO, DOF, motion blur), sombras, normal maps, anti-aliasing, reflejos. Todo eso rompe el look *y* cuesta frames.

---

## 5. Cámara, túnel y carriles

Cámara **3/4 alta**: elevada y picada hacia abajo, atrás del carrito. Con el gancho apuntado (§7) el jugador necesita **leer el frente y clickear con precisión**, así que la cámara está más arriba de lo que pediría un runner común: aplana la escena hacia el plano de juego y hace que apuntar sea confiable.

Rufa queda fija en el origen y **el mundo viene hacia ella**: nada se mueve hacia adelante, el túnel se recicla hacia atrás.

**Convención de ejes:** `+X` derecha, `+Y` arriba, `−Z` hacia el fondo del túnel. 1 unidad ≈ 1 metro.

- **5 carriles**, índices `0..4` de izquierda a derecha, en `x = -2.8, -1.4, 0, 1.4, 2.8`.
- Ancho del túnel: **7 unidades**. Alto: 4. Las paredes izquierda y derecha (`x = ±3.5`) son la superficie contra la que impacta el gancho.
- Los obstáculos se instancian en `z = -50` y avanzan en `+Z` a la velocidad del carrito (§6). Se reciclan al pasar `z = +8`.

### Cámara

- Carrito en `z = 0`. Cámara en `(0, 7.0, 7.5)`, mirando a `(0, 0.6, -9)`. Picada ≈ **38°**, FOV 55°.
- **Yaw fijo en 0**, sin desplazamiento lateral. `[CONFIRMAR]` — el 3/4 "en diagonal" se logra con la picada, no rotando la cámara al costado: con un gancho apuntado, cualquier offset lateral hace que una pared se vea más grande que la otra en pantalla y ese lado pasa a ser objetivamente más fácil de clickear. Si igual querés el ladeo, que no pase de **6°** y hacelo espejar según el carril para compensar.
- **Sigue el carril con lag**: interpola su `x` hacia el `x` del carrito con factor ~0.12 por tick. El tirón se siente violento porque la cámara llega tarde.
- Roll de hasta **4°** hacia el lado del tirón, de vuelta a 0 con `easeOut`.

### El techo

Con la cámara alta, el techo del túnel se mete entre la cámara y el jugador. Solución diegética: **el techo ya se derrumbó atrás tuyo.** Los segmentos con `z > -6` se generan sin techo, con bordes rotos y polvo cayendo por la abertura, y de ahí para adelante el túnel se cierra normalmente. No hace falta fade ni clipping: es geometría que directamente no existe.

### Túnel

Anillo de sección irregular (8–10 vértices, no un cilindro limpio: es roca) extruido en segmentos de **4 unidades de largo**. Se mantienen **16 segmentos vivos** en un pool circular: el que sale por atrás se recicla al frente y se le re-randomiza la silueta y las UVs. Con la niebla a 45 unidades, nunca se ve el final del pool.

Los rieles son dos tiras de geometría por carril, con el atlas de textura desplazándose — el desplazamiento de UV a alta velocidad es más barato y se ve mejor que modelar durmientes.

**Colisión:** puramente lógica, en 2D `(carril, z)`. La geometría 3D no participa nunca del cálculo de colisiones.

---

## 6. Velocidad y curva de dificultad

Partida = 120 segundos.

```
velocidad(t) = 340 + (t / 120) * 420        // px/s, de 340 a 760
```

Tramos de dificultad (para el spawner, §9):

| Tramo | Tiempo | Nombre | Qué introduce |
|---|---|---|---|
| 1 | 0–25 s | Bocamina | Gemas, trampas simples, 1 desvío |
| 2 | 25–55 s | Galería | Murciélagos, desvíos dobles |
| 3 | 55–85 s | Nivel inundado | Trampas móviles, patrones más densos |
| 4 | 85–110 s | Derrumbe | Todo junto, vigas cayendo, densidad máxima |
| 5 | 110–120 s | Boca de salida | Se limpia la pista, recta final, luz al fondo |

En el tramo 5 no se spawnea nada peligroso: es la recompensa, se ve la salida acercándose y suena distinto.

### Objetivos de balance

Sin números objetivo, "está difícil" no se puede discutir. Estos son los blancos; si el juego no cae acá, hay que mover `CONFIG`, no rediseñar:

| Perfil | Resultado esperado |
|---|---|
| Primera partida | Muere entre los 40 y los 70 s |
| Tercera partida | Muere en el tramo 4, con 1–2 compañeras |
| Jugador que entendió | Escapa con 1 vida, 90–140 gemas, 2 compañeras |
| Jugador bueno | Escapa con 200+ gemas, 3–4 compañeras, racha máxima 12+ |
| Final verdadero | Alcanzable, pero no en las primeras 10 partidas |

El tramo 4 tiene que ser el que más mata, por lejos. Si mata más el 2 o el 3, la curva está mal.

**Derrumbe visible:** durante toda la partida caen piedritas y polvo del techo (partículas), y la intensidad del shake de cámara sube con `t`. En los últimos 20 s se agrega un rumble grave continuo.

---

## 7. Control: el gancho

**Un solo verbo.** Todo lo que hace el jugador es tirar el gancho a un punto de la pantalla.

### 7.0 Las dos formas de agarrar

Hay dos maneras de levantar cualquier cosa, y esto es el centro del diseño:

1. **Pasarle por encima.** El carrito junta todo lo que está en su carril, gratis y sin gastar nada. Pero para estar en ese carril tuviste que llegar hasta ahí.
2. **Engancharlo.** Llega a lo que está en cualquier otro carril, dentro de las 14 unidades de alcance. Cuesta el cooldown.

Y acá está el nudo: **el gancho también es la única forma de moverse.** Así que las dos opciones salen del mismo bolsillo. Ir hasta la línea de gemas de la izquierda cuesta un gancho; enganchar esa línea desde donde estás cuesta un gancho. En ambos casos es el mismo gancho que después no vas a tener para esquivar la viga.

Eso convierte cada decisión en la misma pregunta: **¿me muevo hacia lo que quiero, o lo traigo hacia mí, o me quedo con el gancho por si acaso?**

| El gancho pega en… | Pasa | ¿Se consigue también pasándole por encima? |
|---|---|---|
| **Pared** izquierda o derecha | Te tira de carril (§7.2) | — |
| **Gema** | La levantás a distancia, **con cadena a las vecinas** (§7.3) | Sí, de a una |
| **Murciélago** | Lo matás y suelta 2 gemas | No: al contacto te lastima |
| **Compañera** | La rescatás | Sí, desde el carril del borde (§8) |
| **Trampa o nada** | Clank, chispa, y perdiste el cooldown | — |

**Ventaja del gancho sobre pasar por encima:** alcance, y la cadena de gemas. **Ventaja de pasar por encima:** es gratis. Un jugador bueno se posiciona con anticipación para juntar sin gastar, y se guarda el gancho para lo que no podía prever.

### 7.1 Apuntado

- Click / tap en cualquier punto de la pantalla → raycast al mundo → el gancho sale hacia el primer objetivo válido.
- **Alcance máximo: 14 unidades.** Lo que está más lejos no es hookeable todavía, aunque se vea. Esto es lo que crea la ventana de timing: hay que esperar a que las cosas entren en rango, y para entonces ya están casi encima.
- **Asistencia de puntería (obligatoria, no opcional):** si hay un objetivo hookeable dentro de un radio de **28 px** del punto clickeado (en las coordenadas de 320×240), el gancho va a ese objetivo. Prioridad ante empate: compañera > murciélago > gema. La pared es el fallback cuando no hay nada.
- La pared es un objetivo enorme y siempre disponible: clickear cerca del borde de la pantalla siempre es un movimiento de carril válido.
- **Retícula:** un cursor de 2 frames sigue al mouse. Cuando hay un objetivo bajo asistencia, se agranda y cambia **de forma y de color**: rombo turquesa (gema), cruz roja (murciélago), círculo dorado (compañera), corchete blanco (pared). **La forma no es decorativa** — rojo y dorado son indistinguibles para una parte de los jugadores, y esta retícula es la única información de apuntado que hay. Sin esto el apuntado tampoco se lee a 320×240.

### 7.2 Tirón de pared: el ángulo importa

El gancho tira del carrito hacia el punto de impacto, así que **cuánto te movés de costado depende del ángulo**:

- Pegás en la pared **al lado tuyo** (perpendicular, `z` cercano) → tirón lateral máximo: **2 carriles**, 260 ms, cooldown 340 ms.
- Pegás en la pared **bien adelante** (ángulo rasante) → el tirón es sobre todo hacia adelante: **1 carril**, 140 ms, cooldown 240 ms.
- El corte está en los **35°** respecto del eje del túnel. `[AJUSTABLE]`

Es intuitivo físicamente y le da techo de habilidad al movimiento sin agregar un solo botón: el jugador experto elige el ángulo, el novato clickea la pared y se mueve igual.

En el carril 0, clickear la pared izquierda **no mueve** el carrito: chispa, rebote, shake, y perdiste el cooldown. Error castigado con tiempo, no con muerte.

### 7.3 Cadena de gemas

Pasar por encima levanta las gemas **de a una**. Enganchar una gema levanta también **las que estén a menos de 1.2 unidades de otra ya enganchada**, hasta un máximo de **5**.

Las líneas de gemas se generan con esa separación exacta, así que una línea bien apuntada es un click y cinco gemas, con el tono ascendente encadenado del §14. Ese multiplicador es toda la razón para gastar el gancho en juntar: te da en un click lo que pasando por encima te costaría meterte en ese carril y quedarte ahí varios metros.

### 7.4 Murciélagos

Enganchar un murciélago lo mata en el aire y suelta **2 gemas que se auto-recolectan**. Si no lo matás, hay que esquivarlo, y esquivar cuesta el mismo gancho. Los murciélagos no son obstáculos: son una oferta.

### 7.5 Cooldown y feel

- Ciclo completo del gancho: salida a **60 u/s**, impacto, retracción de 80 ms. **Cooldown de 350 ms** desde el impacto (240 / 340 en el caso de pared, arriba).
- **Buffer de 1 input** con ventana de 140 ms: un click durante el cooldown se ejecuta apenas termina, apuntando a la posición del click original **corregida por el scroll transcurrido** (si no, el jugador apunta a donde la gema estaba, no a donde está).
- Freeze frame de 40 ms en cada enganche exitoso. Es barato y hace toda la diferencia.
- Chola (§8) baja el cooldown 30 %, lo que en este diseño no es "moverse más rápido" sino **poder hacer dos cosas donde antes hacías una**. Es, de lejos, la habilidad más fuerte, y está bien que lo sea: es la primera compañera y engancha al jugador con el sistema.

### 7.6 Representación 3D

El gancho es una **cadena de 6 cajitas** (no un `Line`: las líneas de 1 px se pierden a 320×240) que se estira desde el carrito hasta el punto de impacto, más una punta de 12 tris. Al impactar: sprite de chispa aditivo de 2 frames. Todo el gancho es un solo objeto reusado, nunca se instancia uno nuevo.

### 7.7 Controles

| Acción | Mouse / Touch | Teclado (accesibilidad) |
|---|---|---|
| Gancho apuntado | Click / tap en el punto | — |
| Gancho a pared izquierda | Click cerca del borde izquierdo | `←` o `A` (perpendicular, 2 carriles) |
| Gancho a pared derecha | Click cerca del borde derecho | `→` o `D` |
| Gancho al objetivo más cercano | — | `Espacio` |
| Pausa | Botón en el HUD | `Esc` o `P` |

El teclado es un camino completo pero inferior a propósito: no podés elegir el ángulo ni el objetivo. Sirve para jugar, no para sacar el final verdadero.

---

## 8. Compañeras (mecánica nueva)

Durante el recorrido aparecen **4 mineras atrapadas**, una por tramo de dificultad (tramos 1 a 4). Cada una aparece en un carril específico, aferrada a un saliente al costado del riel, con un **halo de luz de casco parpadeante** bien visible **3 segundos antes** de entrar en pantalla (indicador en el borde superior con flecha al carril correcto).

**Rescate:** **engancharla**. Hay que gastar un gancho en ella, y esa es la decisión más cara del juego: en esos mismos metros hay gemas y casi siempre algo que esquivar. **No hay penalidad por no rescatarla**, solo te perdés la habilidad y el final bueno.

**La otra forma:** si estás en el **carril del borde de su lado** (0 o 4) cuando pasa, se sube sola de un salto, sin gastar gancho. Gratis, pero te obliga a estar pegado a la pared justo ahí — que es el peor lugar para esquivar, porque de ese lado no te podés mover más.

**Ventana:** la compañera **corre por el saliente a la par del carrito durante 1.2 s** antes de quedarse atrás. Ese es el tiempo real para engancharla — una ventana fija en distancia sería de 80 ms a velocidad máxima, injugable. Visualmente corre desesperada al costado; si no la enganchás, se frena y la cámara la deja atrás.

Al enganchar, la cadena la trae y se sube al carrito.

Las cuatro están diseñadas para que el jugador tenga que **elegir**: la compañera siempre aparece en un carril que obliga a cruzar el mapa, y en ese mismo tramo hay una línea gorda de gemas en el carril opuesto.

| # | Compañera | Tramo | Habilidad pasiva al rescatarla |
|---|---|---|---|
| 1 | **Chola**, la ganchera | 1 | Cooldown del gancho −30 % (180 ms → 126 ms) |
| 2 | **Nené**, la de la lámpara | 2 | Los obstáculos se marcan con un contorno luminoso 1 s antes de entrar en pantalla |
| 3 | **Beba**, la barretera | 3 | Escudo: absorbe **un** impacto. Se recarga a los 20 s |
| 4 | **Tuca**, la voladora | 4 | Los murciélagos te esquivan y las gemas se imantan en un radio de 90 px |

Cada rescate: **fogonazo de luz, grito de aliento (sintetizado, breve), +1 al contador de compañeras del HUD, el carrito se dibuja un vagón más largo.** Las compañeras rescatadas se ven en el vagón y reaccionan a los sustos (animación de idle simple).

**Si Rufa choca**, no se pierde ninguna compañera: se pierde vida (§10).

---

## 9. Entidades y spawner

### Entidades

| Entidad | ¿Hookeable? | Al chocarla | Notas |
|---|---|---|---|
| **Gema** | **Sí** | +1 gema | Líneas de 3–8 separadas 1.2 u para la cadena del §7.3. También se levantan por contacto |
| **Trampa fija** (viga caída, pico clavado, vagoneta rota) | No | Impacto | Ocupa 1 carril, 1.2 u de alto |
| **Trampa móvil** | No | Impacto | Cambia de carril cada 0.6 s mientras se acerca. Desde tramo 3 |
| **Murciélago** | **Sí** (lo mata, §7.4) | Impacto | Zigzag, cambia de carril cada 0.45 s. Chilla al aparecer |
| **Desvío** (cambio de agujas) | No | No daña: **te fuerza** un carril al costado, ignorando input, 0.3 s | Flecha en el riel 1 s antes. Rompe planes, no mata |
| **Viga cayendo** | No | Impacto | Cae del techo sobre 2 carriles contiguos, sombra en el piso 0.8 s antes. Solo tramo 4 |
| **Compañera** | **Sí** (la rescata, §8) | Se sube sola si estás en el carril del borde | 1 por tramo, 4 en total |

**Regla de diseño:** lo que se puede enganchar te da algo; lo que no, te obliga a gastar el gancho en la pared. Un patrón es interesante cuando pone las dos cosas en la misma ventana de 350 ms.

**Colocación de gemas.** Como pasar por encima es gratis, una línea de gemas en el carril seguro no es una decisión: es un regalo. Las líneas van **en el carril que no ibas a tomar** — el de al lado del obstáculo, el que te deja pegado a la pared, el que te aleja de la compañera. La gema tiene que costar posición o costar gancho, nunca ninguna de las dos.

### Rendering de entidades

- **Una `InstancedMesh` por tipo de entidad**, con el pool dimensionado al máximo simultáneo (gemas: 64, trampas: 24, murciélagos: 12, desvíos: 8, vigas: 4). Nunca se crea ni se destruye un mesh en runtime: se mueve fuera de cámara y se reusa.
- Todas las entidades comparten el mismo atlas y el mismo `ShaderMaterial` → el escenario completo debería resolverse en **menos de 15 draw calls**.
- Las gemas rotan con una sola matriz compartida por frame (todas giran igual, nadie lo nota) en vez de una por instancia.

### Spawner

- Sistema de **patrones**, no de spawns aleatorios sueltos. Definí un array de patrones por tramo; cada patrón es una matriz `carril × fila` con qué va en cada celda.
- Regla dura: **todo patrón debe ser sobrevivible gastando el gancho solo en esquivar**. Escribí `esResoluble(patron, velocidad, cooldown)` que simule con un jugador que nunca junta ni mata nada, y verificá todos los patrones al arrancar (un `console.assert` alcanza). Si un patrón no pasa, no se usa.
- Regla blanda, la que hace bueno al juego: **el camino que además junta todo no debe ser resoluble**. Si un patrón se puede esquivar *y* limpiar de gemas *y* matar los bichos con los ganchos disponibles, no obliga a elegir y hay que apretarlo. Escribí también `esAvaro(patron, ...)` y logueá una advertencia en los que pasen.
- Distancia entre patrones: `gap = velocidad * (0.9 - tramo * 0.08)` segundos. Nunca menos de 0.35 s.
- Las gemas se colocan **sobre el camino resoluble** en un 60 % de los casos y **sobre el camino difícil** en el 40 % restante: el riesgo se paga.

---

## 9.5 Patrones: formato y ejemplos

Los patrones son **el contenido del juego**. Sin ellos escritos a mano, el spawner produce ruido aleatorio y el juego no tiene decisiones. Hacen falta unos **24 en total, 6 por tramo**. Estos cuatro son la referencia de estilo; el resto se escribe imitándolos.

**Formato:** una grilla de texto. Cada fila es una rebanada del túnel separada **1.2 unidades** de la siguiente; cada columna es un carril, de 0 a 4. Se lee **de abajo hacia arriba** (la última fila es la que llega primero).

| Char | Qué es |
|---|---|
| `.` | vacío |
| `g` | gema |
| `#` | trampa fija |
| `m` | trampa móvil |
| `b` | murciélago |
| `V` | viga cayendo (ocupa las celdas contiguas que marques) |
| `<` `>` | desvío que te empuja a ese lado |
| `C` | compañera (en el saliente del lado más cercano) |

```js
{ nombre: 'primera-eleccion', tramo: 1, filas: [
  '.....',
  '..#..',
  'g....',
  'g....',
  'g....',
  '.....',
]}
```

**Los cuatro de referencia:**

**T1 · `primera-eleccion`** — estás en el carril 2, la trampa te obliga a moverte, y solo uno de los dos lados paga. Enseña que moverse y juntar son la misma decisión.

```
.....      .....      ..b..      ..VVV
..#..      ..#..      .#.#.      gg...
g....      .g.g.      .g.g.      gg...
g....      ...g.      .#.#.      ##...
g....      ...g.      ..g..      .....
.....      .....      .#.#.      .....

T1                T2              T3              T4
primera-eleccion  el-bicho        peaje           la-viga
```

**T2 · `el-bicho`** — el murciélago baja por la derecha, justo donde está la línea de gemas más larga. Enganchar el bicho te deja sin gancho para las gemas; ir a buscar las gemas te deja el bicho encima.

**T3 · `peaje`** — las gemas están entre las trampas, en zigzag. No hay forma de juntarlas todas: cada una cuesta un gancho y el cooldown no alcanza. Es el patrón que enseña a renunciar.

**T4 · `la-viga`** — la viga tapa los carriles 2-3-4 y te empuja a la izquierda, que es donde están las gemas… y las trampas que vienen atrás. Premio inmediato, castigo diferido.

**Patrones de compañera:** uno por tramo, marcados `esCompaniera: true`, y el spawner los fuerza en un momento fijo del tramo en vez de sortearlos. La `C` va siempre en el borde opuesto al camino más obvio del patrón.

---

## 10. Vida, impacto y muerte

### Hitboxes y transición

- Hitbox del carrito: **1.0 u de ancho × 1.4 u de profundidad**, centrada en el carril. Más angosta que el carril de 1.4 u a propósito: pasar raspando tiene que ser posible.
- **La regla crítica, la que arruina el juego si se hace mal:** durante el tirón el carrito está entre dos carriles. Resolvelo así — **hasta el 60 % de la transición colisionás solo con el carril de origen; a partir del 60 %, solo con el de destino.** Nunca con los dos, y nunca con ninguno. Si colisiona con ambos, esquivar se vuelve azaroso; si no colisiona con ninguno, el tirón es un dash invulnerable y el juego se rompe.
- Las gemas se levantan por contacto con una hitbox **más generosa** (1.6 u de ancho): juntar perdona, chocar no.

### Vidas

- Rufa tiene **3 vidas** (cascos en el HUD).
- Impacto: −1 vida, **0.9 s de invulnerabilidad** con parpadeo, freeze frame de 80 ms, shake fuerte, y el carrito pierde velocidad 0.4 s (recupera con `easeIn`).
- Si Beba está rescatada, el escudo consume el impacto antes que la vida.
- **0 vidas → derrumbe: fin de partida inmediato**, final "No la contás".
- **Se acaba el tiempo → fin de partida**, mismo final (no llegaste).
- Llegar al segundo 120 con al menos 1 vida = escapaste, y ahí se evalúa la matriz de finales.

---

## 11. Finales

Se evalúan al escapar. `G` = gemas, `C` = compañeras rescatadas.

| Final | Condición | Título | Cierre |
|---|---|---|---|
| 0 | Moriste o se acabó el tiempo | **"No la contás"** | La mina se cierra. Placa oscura con la cuenta de lo que habías juntado. |
| 1 | Escapó, `C ≤ 1`, `G < 120` | **"Salida raspando"** | Sale sola y con lo puesto. Sobrevivir también es un resultado. |
| 2 | Escapó, `C ≤ 1`, `G ≥ 120` | **"La dueña de la veta"** | Sale forrada de gemas, mira atrás, no hay nadie atrás. |
| 3 | Escapó, `C ≥ 3`, `G < 120` | **"Salimos todas"** | Sin un mango pero completas. El mejor final humano. |
| 4 | Escapó, `C = 4`, `G ≥ 200` | **"Cosas de minas"** (final verdadero) | Las cinco afuera, el carrito lleno de gemas, la mina se derrumba atrás. Placa con el título del juego. |
| — | Cualquier otro caso | Cae al final 1 o 3 según `C ≥ 2` | |

La pantalla de final muestra: título del final, gemas, compañeras (con sus retratos, apagados los que no rescataste), tiempo restante, y **qué final te falta** (lista de 5 con los no conseguidos en silueta). Ese "te falta el 4" es el motor del replay.

---

## 11.5 Puntaje

Las **gemas** son la moneda que decide el final (§11) y es lo único que se muestra durante la partida. El **puntaje** es una métrica aparte, se calcula al terminar y existe para dar una razón de rejugar cuando ya sacaste los 5 finales.

```
puntaje = gemas × 10
        + murciélagos × 25
        + compañeras × 250
        + racha_máxima × 50
        + vidas_restantes × 100
```

**Racha:** cada enganche útil consecutivo (gema, murciélago, compañera) suma 1. Se corta con un gancho al vacío o con un impacto. Los ganchos a la pared **no suman ni cortan** — moverse es neutral, si no, el juego castigaría esquivar.

Durante la partida la racha se muestra solo cuando está en 3 o más: un numerito discreto al lado del contador de gemas, que crece y pulsa. Nada de banners.

**Récord:** se guarda el mejor puntaje en `localStorage` (`gc2.record`) y se muestra en el título y en la pantalla de final. Un solo número, sin tabla ni nombres.

**Por qué el puntaje no decide el final:** los finales son sobre a quién sacaste de la mina. Si el puntaje los manejara, la lectura sería "las compañeras valen 250 puntos" en vez de "las sacaste". Que sean dos números separados es deliberado.

---

## 12. HUD y pantallas

**HUD (in-game), mínimo y en las esquinas — el centro es zona de juego:**
- Arriba izquierda: cronómetro regresivo `1:23`, en rojo y pulsando bajo los 20 s.
- Arriba derecha: contador de gemas.
- Abajo izquierda: 3 cascos (vidas), + ícono de escudo si está activo.
- Abajo derecha: 4 retratos de compañeras, apagados hasta rescatarlas.
- Indicadores de borde superior: flecha al carril de la compañera entrante (dorada), sombra previa de viga (roja).
- **Retícula del gancho** (§7.1) y, pegado a ella, un arco de cooldown de 8 px que se vacía. El estado del cooldown tiene que ser legible sin sacar la vista del punto donde estás apuntando.

**Pantallas:**
1. **Título:** logo "GANCHO CARRITO 2 / Cosas de Minas", carrito en loop de fondo, botón "Bajar a la mina", link "Cómo se juega".
2. **Tutorial jugable** (§12.5), no una pantalla de texto.
3. **Juego.**
4. **Pausa:** oscurece, "Seguir" / "Salir".
5. **Final:** §11.

**Idioma:** el juego es **bilingüe español / inglés**, elegible por el jugador (§12.6).

**Copy:** en español, botones en voz activa y en rioplatense neutro ("Bajar a la mina", "Otra vuelta", "Seguir"). En inglés, el mismo registro seco y directo ("Head down", "Again", "Resume"). Nada de "Submit" ni "Start Game" en ninguno de los dos.

---

## 12.5 Tutorial

Una pantalla de instrucciones no alcanza: el gancho hace cuatro cosas distintas según a qué le apuntes, y además se junta por contacto. Hay que **hacerlo**, no leerlo.

**Formato:** un tramo jugable aparte, **sin cronómetro y sin daño**, de unos 40 segundos. Se lanza automáticamente la primera vez que alguien abre el juego, es **salteable en cualquier momento** con un botón fijo en pantalla, y queda disponible desde el título para siempre.

**Cinco beats, cada uno bloqueado hasta que lo hacés.** El carrito frena hasta casi detenerse en cada beat y arranca cuando cumplís:

| # | Enseña | Cómo lo pide |
|---|---|---|
| 1 | Pared → moverse | Túnel vacío, una flecha a la pared. "Clickeá la pared para tirar el carrito" |
| 2 | Pasar por encima junta | Una línea de gemas en tu carril, sin obstáculos. No dice nada: las juntás sin querer y suena el arpegio |
| 3 | Gancho → alcance y cadena | Línea de gemas en el carril opuesto, con una trampa en el medio que te impide llegar. Única salida: engancharlas |
| 4 | Murciélago | Uno solo, de frente, lento. "Enganchalo antes de que te alcance" |
| 5 | La elección | Trampa en tu carril **y** gemas al costado, con un solo gancho de margen. No hay texto y no hay respuesta correcta: los dos resultados dejan seguir |

El beat 5 es el juego entero en diez segundos. Es el que hay que cuidar más.

**Ayudas contextuales en la primera partida real:** la primera vez que aparece un desvío, una viga cayendo y una compañera, un cartel de dos palabras por 1.5 s. Solo la primera vez de cada uno, nunca más, y guardado en `localStorage` (`gc2.hints`).

---

## 12.6 Idiomas

El juego está en **español e inglés**, elegible y cambiable en cualquier momento.

### Mecánica

- Selector en el **título** y en la **pausa**. Cambia al instante: el HUD es DOM (§13), así que basta con re-renderizar.
- Se guarda en `localStorage` (`gc2.lang`). Por defecto: `navigator.language.startsWith('es') ? 'es' : 'en'`.
- Actualizá el atributo `lang` del `<html>` al cambiar, por accesibilidad.
- Un solo objeto `STRINGS = { es: {...}, en: {...} }` con claves planas y namespace por punto (`final.4.titulo`, `tutorial.beat3`, `audio.musica`). Función `t(clave, params)` de diez líneas; no hace falta librería.

### Dos reglas que hay que respetar sí o sí

1. **Nunca concatenes strings en el código.** Cada frase completa es una clave, con placeholders: `t('final.gemas', {n: 143})`, no `t('juntaste') + n + t('gemas')`. El orden de las palabras no coincide entre los dos idiomas y esa es la forma clásica de terminar con frases rotas.
2. **Plurales con claves separadas** `.one` / `.other`, resueltas por un helper. "1 compañera / 2 compañeras", "1 companion / 2 companions".

Y una de layout: el HUD y los botones se diseñan contra **la más larga de las dos versiones** de cada string, no contra el español.

### Qué NO se traduce

- **El título.** "Gancho Carrito 2: Cosas de Minas" queda igual en los dos idiomas: es el nombre del juego, un nombre propio. El chiste no sobrevive la traducción y forzarlo lo empeora. En inglés, poné debajo una bajada que haga el trabajo del chiste sin intentar el juego de palabras: *"Five women. One mine. Two minutes."*
- **Los nombres de las compañeras.** Chola, Nené, Beba y Tuca son nombres propios. Se traducen sus oficios, no ellas.

### Advertencia de traducción

⚠️ **"La ganchera" NO se traduce literalmente al inglés.** El calco obvio es una obscenidad y sería un desastre en un juego con protagonistas mujeres. Usá **"Chola the Grapple"** o **"Chola on the Chain"**. Esto vale como regla general: cada epíteto pasa por una revisión humana antes de quedar, no por traducción directa.

| Español | Inglés |
|---|---|
| Chola, la ganchera | Chola the Grapple |
| Nené, la de la lámpara | Nené on the Lamp |
| Beba, la barretera | Beba the Crowbar |
| Tuca, la voladora | Tuca the Flier |

### Finales

| # | Español | Inglés |
|---|---|---|
| 0 | No la contás | That's All She Wrote |
| 1 | Salida raspando | Out by a Whisker |
| 2 | La dueña de la veta | Queen of the Vein |
| 3 | Salimos todas | Nobody Left Behind |
| 4 | Cosas de Minas | Women's Work |

El final verdadero es el único que conserva la fuerza del chiste en inglés: *"women's work"* es, igual que *"cosas de minas"*, una frase con la que se minimiza a alguien. Que sea el nombre del mejor final es exactamente la misma broma, y funciona como title drop en los dos idiomas.

---

## 13. Dirección visual

No uses el look genérico de "juego indie de cueva" (marrón + naranja + fuente serif). Dirección propuesta:

**Paleta** — luz de casco contra oscuridad total:
```
--roca-fondo   #0B0A12   fondo del túnel, casi negro azulado
--roca-pared   #241F35   paredes, violeta piedra
--luz-casco    #FFD166   el haz de la lámpara, único amarillo del juego
--gema         #4CE0D2   turquesa, el único otro color saturado
--peligro      #FF3D5A   trampas, alertas, cronómetro final
--polvo        #8A7FA8   partículas y niebla
```
Regla: **el amarillo es luz, el turquesa es premio, el rojo es muerte.** Ningún elemento decorativo usa esos tres colores. Todo lo demás vive en la escala de violetas.

**Signature element:** la **lámpara de casco** de Rufa es la única fuente de luz de la escena, y es una de las 5 luces spot del vertex shader (§4.5-4). Ilumina un cono hacia adelante que revela los obstáculos recién cuando entran en el cono; más allá, la niebla. El haz visible es un **cono de geometría con blending aditivo** y textura de degradé — el truco exacto que usaban los juegos de la época, y cuesta un draw call.

Cada compañera rescatada **enciende su propia lámpara** → una luz más en el shader, un cono aditivo más, más túnel visible. **El mundo literalmente se ve mejor cuanto más gente rescatás.** Esa es la tesis del juego expresada como mecánica de render, y es la razón por la que el límite de 5 luces es un límite de diseño y no una restricción técnica que haya que sortear.

**Texturas:** todas proceduraes, 64×64, en un atlas de 256×256. Roca (ruido de valor + grietas dibujadas a mano en código), madera de durmiente, metal del riel, gema (rombo con specular pintado, no calculado), y un sheet de personajes. Paleta limitada por textura: 16 colores, tomados de la lista de arriba.

**Personajes:** cabeza-torso-brazos en cajas de pocos polígonos, texturizados con la cara pintada (nada de geometría facial). Animación por **rotación de huesos falsos** (jerarquía de `Object3D`, sin skinning) a **10 fps** con interpolación apagada: el stepping de animación es tan característico de la época como el temblor de los vértices.

**Tipografía:** display condensado y pesado (grotesca industrial) para títulos y números del HUD, sans neutra para el resto, siempre con `font-variant-numeric: tabular-nums` en el cronómetro. Stack de fuentes de sistema (`Oswald, 'Arial Narrow', Impact, sans-serif`), sin webfonts. **El HUD va en DOM/CSS por encima del canvas**, no dibujado en 3D: es más nítido, más barato y más fácil de hacer accesible.

**Movimiento:** el shake de cámara, el roll en el tirón y el freeze frame del impacto hacen todo el trabajo de "peso". Sumá solo el chispazo del gancho y el polvo. Nada más.

---

## 14. Audio (WebAudio, sin archivos)

Todo sintetizado. Cero archivos de audio, igual que las texturas.

### 14.1 Mezcla y controles

Tres buses con su propio `GainNode`, en cadena a un limitador (`DynamicsCompressorNode`) y de ahí al destino:

```
MÚSICA  ─┐
CARRITO ─┼─→ MASTER → limitador → salida
EFECTOS ─┘
```

- **Tres sliders independientes:** Música, Efectos, General. Están en el **título y en la pausa**, y el general también como botón de mute rápido en el HUD.
- Rango 0–100, curva de volumen **logarítmica** (`gain = (v/100)²`), no lineal — un slider lineal se siente todo apretado arriba.
- Se guardan en `localStorage` bajo `gc2.audio`. Es lo único que persiste entre sesiones junto con el récord (§11.5).
- `AudioContext` arranca **suspendido** hasta el primer gesto del usuario, como exige el navegador. Si al entrar al juego sigue suspendido, mostrar un cartelito discreto "Tocá para activar el sonido".
- **Ducking:** en cada impacto, el bus de música baja a 40 % por 250 ms y vuelve. Hace que el golpe se sienta sin subir el volumen de nada.
- Presupuesto: **menos de 30 nodos sostenidos**. Los efectos crean y descartan sus nodos, pero música y carrito corren sobre nodos fijos.

### 14.2 La musiquita

**Motor:** secuenciador de 16 pasos agendado con `AudioContext.currentTime`, con un scheduler que mira 100 ms hacia adelante y corre cada 25 ms. **Nunca dispares notas desde `setInterval` ni desde el loop de render** — se desincroniza y suena borracho.

**Tempo:** sube con la partida, de **128 BPM** en el tramo 1 a **156 BPM** en el tramo 4, interpolado con la velocidad del carrito. La música acelera porque vos acelerás.

**Armonía:** La menor, progresión de 4 compases **Am – F – C – G**. Sencilla, motora, no se cansa en 2 minutos.

**Voces, que entran por tramo** — así la música es el medidor de dificultad:

| Voz | Síntesis | Entra en |
|---|---|---|
| Drone | 2 sierras desafinadas 6 cents + lowpass lento | Siempre, sube volumen con `t` |
| Bajo | Cuadrada + lowpass 400 Hz, corcheas | Tramo 1 |
| Bombo | Seno con pitch drop 120→45 Hz en 60 ms | Tramo 1 |
| Redoblante | Ruido blanco + bandpass 1.8 kHz, decay 120 ms | Tramo 2 |
| Arpegio | Pulso 25 % duty, tresillos sobre el acorde | Tramo 3 |
| Campana de alarma | Seno + FM, cada 2 compases | Tramo 4 |

**Tramo 5 (salida):** cortan percusión y arpegio de golpe. Queda el drone y entra una nota larga y limpia que sube. El silencio relativo es la señal de que sobreviviste.

### 14.3 El carrito

Tres capas, siempre corriendo, todas manejadas por la velocidad:

1. **Rodamiento.** Ruido rosa por un bandpass cuyo centro va de **250 Hz a 900 Hz** y cuya ganancia sube, ambos en función de la velocidad. Un solo nodo, encendido toda la partida.
2. **Clack de las juntas.** Un click corto (ruido + envelope de 25 ms) **cada 4 unidades recorridas** — que es justo el largo del segmento de túnel (§5), así que la frecuencia sale sola de la velocidad: a 32 u/s son 8 clacks por segundo. Dispará **dos clicks separados 55 ms** (eje delantero y trasero): con uno solo suena a metrónomo, con dos suena a tren.
3. **Chirrido de cambio de carril.** Sierra con pitch bend hacia arriba por un bandpass, 180 ms, en cada tirón. Cuanto más brusco el tirón (2 carriles), más agudo.

Estas tres capas son el 80 % de la sensación de velocidad del juego. Con el sonido apagado, el juego se siente notablemente más lento aunque se mueva igual.

### 14.4 Efectos

| Evento | Sonido |
|---|---|
| Gancho impacta pared | Click metálico: ruido filtrado + cuadrada, decay 60 ms |
| Gema | Seno; el tono sube **1 semitono por gema encadenada**, se resetea a los 1.5 s sin juntar |
| Gancho al vacío / trampa | Clank sordo y sin brillo. Tiene que sonar a error |
| Impacto | Ruido grave + waveshaper, 300 ms, + ducking de música |
| Murciélago | Chirrido agudo con pitch aleatorio; al matarlo, corte seco |
| Rescate | Acorde ascendente de 3 notas, el único sonido "lindo" del juego |
| Ambiente | Crujidos de madera aleatorios; rumble grave que escala con `t` |

---

## 15. Estructura del código

Un archivo, pero organizado:

```
CONFIG            // todas las constantes de tuning en un solo objeto, arriba de todo
STRINGS + t()     // tabla es/en y el resolver; ningún texto suelto en el resto del código
TextureGen        // genera el atlas procedural al arrancar, una sola vez
Shaders           // PSXMaterial (snap + afín + 5 spots por vértice) y el shader del post-quad
GeoFactory        // constructores de geometría: túnel, carrito, personaje, obstáculos, gema
Input             // teclado + touch, buffer de inputs
Audio             // buses, sliders, ducking
Music             // secuenciador de 16 pasos con scheduler adelantado
CartSfx           // rodamiento, clacks de junta, chirrido
Pools             // InstancedMesh por tipo + pool de partículas
Entities          // Gema, Trampa, Murcielago, Desvio, Viga, Companiera (lógica pura, sin Three)
Patterns          // definición de patrones por tramo + validador esResoluble()
Spawner           // decide qué patrón y cuándo
Player            // Rufa: carril, gancho, estado, vidas, habilidades
TunnelPool        // 16 segmentos reciclados
Lights            // hasta 5 spots: uniforms del shader + conos aditivos
CameraRig         // seguimiento con lag, roll, shake, freeze frame
Renderer          // escena → RenderTarget 320x240 → quad de posterizado+dither → pantalla
HUD               // DOM/CSS, sincronizado con el estado del juego
Score             // racha, cálculo final, récord en localStorage
Tutorial          // los 5 beats, cada uno con su condición de salida
Game              // FSM: TITULO | TUTORIAL | JUGANDO | PAUSA | FINAL
loop()            // timestep fijo para lógica, render interpolado
```

**Separación clave:** la lógica del juego (carriles, colisiones, timer, patrones) no importa nada de Three.js y se puede testear sola. La capa 3D solo lee ese estado y lo dibuja.

**Todo número de tuning va en `CONFIG`.** Velocidades, cooldowns, umbrales de finales, densidades. Que se pueda balancear el juego entero tocando un solo objeto.

---

## 16. Criterios de aceptación

- [ ] Corre abriendo `index.html`, sin build, sin errores en consola. Como mucho una request: Three.js.
- [ ] **60 fps estables durante los 120 s**, incluso en el tramo 4, en una notebook integrada y en un celular de gama media.
- [ ] Se cumplen los presupuestos: < 25k tris, < 40 draw calls, < 12 MB de texturas. Verificable con `renderer.info` mostrado en un overlay de debug con `F3`.
- [ ] El look PS1 tiene las 8 técnicas de §4.5, no solo la baja resolución.
- [ ] Ninguna textura viene de un archivo: todo el atlas se genera en runtime.
- [ ] El gancho se siente responsivo: el buffer de input funciona y corrige por scroll, no se "come" clicks.
- [ ] Se puede enganchar cada tipo de objetivo: pared (a los dos ángulos), gema con cadena, murciélago, compañera.
- [ ] La asistencia de puntería funciona con mouse **y** con dedo grueso en celular.
- [ ] Existe al menos un patrón por tramo donde el jugador tiene que renunciar a gemas para sobrevivir.
- [ ] Se puede jugar una corrida entera juntando solo por contacto, sin enganchar una sola gema: debería rendir bastante menos, pero ser viable.
- [ ] Se puede terminar una partida completa sin encontrar un patrón imposible.
- [ ] Las 4 compañeras aparecen en una corrida y se pueden rescatar todas.
- [ ] Los 5 finales son alcanzables y se testearon.
- [ ] Funciona con teclado y con touch en pantalla vertical de celular.
- [ ] `prefers-reduced-motion` desactiva shake y partículas ambientales.
- [ ] Los tres sliders de audio funcionan por separado y persisten entre sesiones.
- [ ] La música cambia de capa al pasar de tramo y acelera con la velocidad, sin desincronizarse en 2 minutos.
- [ ] El clack del carrito acelera con la velocidad y no se despega del ritmo visual de los segmentos.
- [ ] El tutorial se puede completar y se puede saltear, y no vuelve a aparecer solo.
- [ ] **No hay un solo texto visible hardcodeado**: todo sale de `STRINGS`. Verificable buscando comillas en el código de UI.
- [ ] Se puede cambiar de idioma en plena pausa y todo se actualiza, incluido el HUD.
- [ ] Ningún string se desborda ni se corta en su versión más larga, en las dos pantallas más apretadas (HUD y final).
- [ ] El idioma por defecto sale del navegador y la elección sobrevive a un reload.
- [ ] El puntaje se calcula bien y el récord sobrevive a un reload.
- [ ] Ningún string ni asset externo: cero requests de red.

---

## 17. Decisiones que asumí (confirmar o corregir)

1. **El gancho apuntado es el único verbo del juego** (§7), y convive con la recolección por contacto: pasar por encima junta igual. Es la consecuencia directa de que en el 1 el gancho sirviera para monedas, bichos y pared — si mover y agarrar salen del mismo recurso, entonces el juego es *elegir para qué*.
2. **La mecánica "de minas" es rescatar compañeras** con habilidades pasivas, en vez de chistes temáticos. Es lo que mejor conecta el doble sentido del título con una mecánica real y con el sistema de finales.
3. **Monedas → gemas** por coherencia con la mina. Se puede volver a monedas sin tocar nada más.
4. **3 vidas** en lugar de muerte de un golpe. Si el 1 era one-hit-death, cambiarlo es un número en `CONFIG`.
5. **Cámara 3/4 alta con yaw 0** (§5). Ver ahí por qué recomiendo no ladearla, y qué hacer si igual la querés en diagonal.
6. **4:3 apaisado (320 × 240 interno)** en vez de vertical, porque es el formato nativo de la referencia PS1 y porque una cámara third-person en un túnel necesita ancho. En celular el canvas va centrado y las zonas táctiles ocupan las mitades izquierda y derecha de **toda la pantalla**, no solo del canvas — no hace falta rotar el teléfono.
7. **Three.js y no WebGL a pelo.** Escribir el renderer desde cero para este juego es semanas de trabajo para ahorrar 600 KB; con `ShaderMaterial` propio y `InstancedMesh` tenés control total igual, y Three no impone nada del pipeline moderno que no quieras.

---

## 17.5 Orden de construcción

**No lo construyas por secciones de este documento.** El orden importa: si el pipeline PS1 se hace antes que el gameplay, terminás con un túnel hermoso que no es divertido y con ningún presupuesto para arreglarlo.

| Hito | Qué incluye | Cómo sé que terminó |
|---|---|---|
| **1. Rebanada vertical** | Túnel gris scrolleando, 5 carriles, gancho apuntado completo (§7), colisión, gemas, cronómetro de 120 s. Sin arte, sin shaders, sin audio, sin patrones — obstáculos puestos a mano. | **Es divertido.** Ver abajo. |
| 2. Contenido | Patrones (§9.5), spawner, validadores `esResoluble` / `esAvaro`, curva de dificultad | Se juegan 120 s sin repetir patrón ni encontrar uno imposible |
| 3. Sistemas | Compañeras, habilidades, vidas, finales, puntaje | Los 5 finales son alcanzables |
| 4. Pipeline PS1 | Render target, snapping, mapeado afín, dither, luces por vértice, niebla (§4.5) | Las 8 técnicas están, y los presupuestos se cumplen |
| 5. Arte | Atlas procedural, modelos, animación a 10 fps | Se parece a 1996 y no a un low-poly moderno |
| 6. Audio | Buses, música, carrito, efectos (§14) | Con el sonido apagado el juego se siente más lento |
| 7. Envoltorio | Tutorial, HUD, pantallas, sliders, **las dos tablas de idioma** | Alguien que nunca lo vio puede jugar sin explicación, en cualquiera de los dos idiomas |
| 8. Pulido | Shake, freeze frame, partículas, balance contra §6 | Los números de balance caen donde dicen |

**El hito 1 es una compuerta, no un paso.** Antes de seguir, alguien tiene que jugar la rebanada gris durante cinco minutos seguidos y querer una partida más. Si no pasa eso, el problema está en el cooldown, en el alcance del gancho o en la velocidad — y se arregla ahí, tocando `CONFIG`, no más adelante. Ningún shader, ninguna musiquita y ningún final arreglan un núcleo que no engancha; solo lo disimulan hasta que es carísimo cambiarlo.

### Herramientas de debug

Construilas en el hito 1, no al final. Cuestan media hora y se pagan solas:

| Tecla | Qué hace |
|---|---|
| `F1` | Dibuja hitboxes, carriles y el estado de transición del §10 |
| `F2` | Invencibilidad |
| `F3` | Overlay de stats: fps, `renderer.info` (draw calls, tris), nodos de audio activos |
| `F4` | Saltar al tramo siguiente |
| `F5` | Forzar un patrón por nombre |
| `F6` | Recargar `CONFIG` en caliente |

---

## 18. Fuera de alcance (v1)

Lo único que persiste entre sesiones es lo mínimo: preferencias de audio, mejor puntaje, y qué ayudas ya se mostraron.

Fuera: tabla de récords online, desbloqueables, niveles adicionales, skins, logros, música con archivos, y **cualquier idioma más allá de español e inglés** — pero dejá `STRINGS` armado de forma que agregar un tercero sea copiar un objeto. Si el core se siente bien, eso viene después.