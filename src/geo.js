import * as THREE from 'three';
import { CONFIG, clamp, rngCon } from './config.js';
import { TextureGen, TX } from './texturas.js';
import { MATS } from './shaders.js';

/* ===========================================================================
   GeoFactory — §13, §4.5-8. Toda la geometria por codigo. Presupuesto de la
   epoca: personaje 150-300 tris, carrito ~200, segmento ~40, obstaculo 20-60.
   =========================================================================== */
const GeoFactory = (() => {

  // --- helpers de atlas -------------------------------------------------
  // Envuelve al rango [0,1] dejando el 1 como 1. El modulo pelado manda el
  // borde superior al 0, y una cara cuyas UVs van de 0 a 1 termina entera
  // sobre un solo texel de la esquina del tile: si ese texel es transparente,
  // el alphaTest la descarta y el objeto desaparece. Asi se hacian invisibles
  // los murcielagos, los desvios, los conos de luz y las chispas.
  const envolver = v => {
    const f = v - Math.floor(v);
    return (f === 0 && v > 0) ? 1 : f;
  };

  // Manda las UVs de una geometria entera adentro del rect de un tile.
  function uvTile(geo, tile, rep = 1){
    const r = TextureGen.uv(tile), uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++){
      const u = rep === 1 ? clamp(uv.getX(i), 0, 1) : envolver(uv.getX(i) * rep);
      const v = rep === 1 ? clamp(uv.getY(i), 0, 1) : envolver(uv.getY(i) * rep);
      uv.setXY(i, r.u0 + u * (r.u1 - r.u0), r.v0 + v * (r.v1 - r.v0));
    }
    uv.needsUpdate = true;
    return geo;
  }

  // BoxGeometry ordena las caras px,nx,py,ny,pz,nz con 4 vertices cada una.
  // rects: array de 6 {u0,v0,u1,v1} (o null para dejar la cara como esta).
  function uvCaja(geo, rects){
    const uv = geo.attributes.uv;
    for (let f = 0; f < 6; f++){
      const r = rects[f]; if (!r) continue;
      for (let k = 0; k < 4; k++){
        const i = f * 4 + k;
        uv.setXY(i, r.u0 + uv.getX(i) * (r.u1 - r.u0), r.v0 + uv.getY(i) * (r.v1 - r.v0));
      }
    }
    uv.needsUpdate = true;
    return geo;
  }

  // Sub-rect de un tile (las celdas de 16x16 del tile de caras)
  function subTile(tile, cx, cy, n = 4){
    const r = TextureGen.uv(tile), w = (r.u1 - r.u0) / n, h = (r.v1 - r.v0) / n;
    // el cuadrante 0 esta ARRIBA en el canvas → v alto, porque flipY
    return { u0: r.u0 + cx*w, u1: r.u0 + (cx+1)*w,
             v0: r.v1 - (cy+1)*h, v1: r.v1 - cy*h };
  }

  const rectDe = tile => TextureGen.uv(tile);
  const seisIguales = tile => { const r = rectDe(tile); return [r,r,r,r,r,r]; };

  function caja(w, h, d, tile){
    return uvCaja(new THREE.BoxGeometry(w, h, d), seisIguales(tile));
  }

  // Fusion propia: three.module.js no trae BufferGeometryUtils y no vale la
  // pena arrastrar examples/jsm para concatenar tres arrays.
  function fusionar(geos){
    const planas = geos.map(g => (g.index ? g.toNonIndexed() : g));
    let n = 0; for (const g of planas) n += g.attributes.position.count;
    const pos = new Float32Array(n*3), nor = new Float32Array(n*3), uv = new Float32Array(n*2);
    let o = 0;
    for (const g of planas){
      const c = g.attributes.position.count;
      pos.set(g.attributes.position.array, o*3);
      nor.set(g.attributes.normal.array, o*3);
      uv.set(g.attributes.uv.array, o*2);
      o += c;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal',   new THREE.BufferAttribute(nor, 3));
    out.setAttribute('uv',       new THREE.BufferAttribute(uv, 2));
    return out;
  }

  const conMatriz = (geo, m) => { const g = geo.clone(); g.applyMatrix4(m); return g; };
  const mover = (geo, x, y, z) => conMatriz(geo, new THREE.Matrix4().makeTranslation(x, y, z));

  /* --- Tunel: anillo de seccion irregular (§5) -------------------------
     No es un cilindro limpio: es roca. 9 puntos con jitter por semilla, y sin
     techo cuando el segmento ya paso por atras (§5, el techo derrumbado).   */
  function perfilTunel(semilla, conTecho){
    const r = rngCon(semilla), j = () => (r() - 0.5) * 0.55;
    const X = CONFIG.paredX, Y = CONFIG.altoTunel;
    const p = [
      [-X, 0], [X, 0],                              // piso, plano y firme
      [X + j()*0.4, 1.2 + j()], [X - 0.1 + j()*0.4, 2.6 + j()],
    ];
    if (conTecho) p.push(
      [2.2 + j(), Y - 0.3 + j()*0.5], [j()*0.8, Y + j()*0.4], [-2.2 + j(), Y - 0.3 + j()*0.5]);
    p.push([-X + 0.1 + j()*0.4, 2.6 + j()], [-X + j()*0.4, 1.2 + j()]);
    return p;
  }

  function tunelSegmento(semilla, conTecho){
    const p = perfilTunel(semilla, conTecho);
    const L = CONFIG.largoSegmento;
    const pos = [], nor = [], uvs = [];
    const rTecho = rectDe(TX.ROCA_A), rPared = rectDe(TX.ROCA_B);
    const n = p.length;
    // Sin techo, el anillo queda abierto arriba: hay que saltear la arista que
    // cruza de la punta de la pared derecha a la de la izquierda, que es donde
    // estaria el techo. Saltear la ULTIMA en cambio deja sin cerrar la pared
    // izquierda contra el piso, y esa pared se ve desaparecer.
    const aristaHueco = conTecho ? -1 : 3;   // [pisoI, pisoD, derMed, derAlt, izqAlt, izqMed]
    for (let i = 0; i < n; i++){
      if (i === aristaHueco) continue;
      const a = p[i], b = p[(i + 1) % n];
      // dos triangulos, normal hacia adentro del tunel
      const A = [a[0], a[1], 0],  B = [b[0], b[1], 0];
      const C = [b[0], b[1], -L], D = [a[0], a[1], -L];
      const ex = b[0]-a[0], ey = b[1]-a[1];
      const len = Math.hypot(ex, ey) || 1;
      // normal hacia adentro: perpendicular al borde, apuntando al centro
      let nx = ey/len, ny = -ex/len;
      const cx = (a[0]+b[0])/2, cy = (a[1]+b[1])/2;
      if (nx*(0 - cx) + ny*(2 - cy) < 0) { nx = -nx; ny = -ny; }
      const rc = (a[1] > 2.9 && b[1] > 2.9) ? rTecho : rPared;
      const empuja = (v, u, w) => {
        pos.push(v[0], v[1], v[2]); nor.push(nx, ny, 0);
        uvs.push(rc.u0 + u*(rc.u1-rc.u0), rc.v0 + w*(rc.v1-rc.v0));
      };
      empuja(A,0,0); empuja(B,1,0); empuja(C,1,1);
      empuja(A,0,0); empuja(C,1,1); empuja(D,0,1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal',   new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs, 2));
    return g;
  }

  /* --- Rieles y durmientes (§5) ----------------------------------------
     Una tira por carril, UVs que se desplazan. Mas barato y se ve mejor que
     modelar durmientes.                                                     */
  /* SUBDIVIDIDAS cada 2 u a proposito. El mapeado afin del §4.5-3 interpola las
     UVs en espacio de pantalla: sobre un triangulo de 66 unidades eso no es el
     warpeo simpatico de la PS1, es el piso rompiendose. Los juegos de la epoca
     teselaban el suelo por exactamente este motivo. */
  function tiras(largo, ancho, y, sep, repZ){
    const geos = [];
    const cortes = Math.max(1, Math.round(largo / 2));
    for (const lx of CONFIG.carrilesX){
      for (const s of (sep ? [-sep, sep] : [0])){
        const g = new THREE.PlaneGeometry(ancho, largo, 1, cortes);
        g.rotateX(-Math.PI / 2);
        g.translate(lx + s, y, -largo / 2 + CONFIG.zReciclado);
        const uv = g.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i) * repZ);
        geos.push(g);
      }
    }
    return fusionar(geos);
  }
  const rieles     = largo => tiras(largo, 0.16, 0.060, 0.45, largo / 2.0);
  const durmientes = largo => tiras(largo, 1.20, 0.022, 0,    largo / 2.2);

  /* --- Carrito (~200 tris) --------------------------------------------- */
  function carrito(vagones){
    const g = [];
    const rMetal = rectDe(TX.METAL), rMad = rectDe(TX.MADERA);
    const caraMetal = [rMetal, rMetal, rMad, rMetal, rMetal, rMetal];
    for (let v = 0; v <= vagones; v++){
      const z = v * CONFIG.vagonSepar;     // los vagones crecen hacia atras (§8)
      const cuerpo = uvCaja(new THREE.BoxGeometry(1.05, 0.62, 1.25), caraMetal);
      g.push(mover(cuerpo, 0, 0.42, z));
      // borde superior
      const borde = caja(1.15, 0.10, 1.35, TX.METAL);
      g.push(mover(borde, 0, 0.76, z));
      // ruedas: octogonos chatos, 8 tris cada una
      for (const sx of [-0.52, 0.52]) for (const sz of [-0.42, 0.42]){
        const r = new THREE.CylinderGeometry(0.24, 0.24, 0.1, 6);
        r.rotateZ(Math.PI / 2);
        uvTile(r, TX.METAL);
        g.push(mover(r, sx, 0.24, z + sz));
      }
    }
    // enganches entre vagones
    for (let v = 0; v < vagones; v++)
      g.push(mover(caja(0.16, 0.16, 0.22, TX.METAL), 0, 0.4, v * CONFIG.vagonSepar + 0.62));
    return fusionar(g);
  }

  /* --- Minera: cabeza-torso-brazos en cajas, cara PINTADA (§13) ---------
     Jerarquia de Object3D, sin skinning: se anima rotando huesos falsos, a
     10 fps y con la interpolacion apagada (el stepping de animacion es tan de
     la epoca como el temblor de los vertices).
     Todo lo que NO se anima va fusionado en una sola malla: son 3 draw calls
     por personaje en vez de 8, y con 5 mineras en pantalla eso es la
     diferencia entre entrar y no entrar en el presupuesto del §16.          */
  function minera(idxCara, completa = true){
    const raiz = new THREE.Object3D();
    const mat = MATS.psx;
    const rCuerpo = rectDe(TX.CUERPO), rCasco = rectDe(TX.CASCO);
    const rCara = subTile(TX.CARAS, idxCara % 4, (idxCara / 4) | 0);

    const partes = [];
    // torso
    partes.push(mover(uvCaja(new THREE.BoxGeometry(0.34, 0.42, 0.22),
      [rCuerpo, rCuerpo, rCuerpo, rCuerpo, rCuerpo, rCuerpo]), 0, 0.50, 0));
    // cabeza: la cara solo en +Z, nada de geometria facial
    partes.push(mover(uvCaja(new THREE.BoxGeometry(0.26, 0.26, 0.24),
      [rCara, rCara, rCasco, rCara, rCara, rCara]), 0, 0.86, 0));
    // casco
    partes.push(mover(uvCaja(new THREE.BoxGeometry(0.30, 0.14, 0.28),
      seisIguales(TX.CASCO)), 0, 1.03, 0));
    // brazo izquierdo (quieto) y piernas
    partes.push(mover(caja(0.10, 0.34, 0.10, TX.CUERPO), -0.22, 0.50, 0));
    for (const s of [-1, 1]) partes.push(mover(caja(0.12, 0.30, 0.12, TX.CUERPO), s * 0.10, 0.14, 0));

    const cuerpo = new THREE.Mesh(fusionar(partes), mat);
    raiz.add(cuerpo);

    // Trenza: la camara va DETRAS del carrito, asi que la cara casi no se ve.
    // Lo que hace leer "es una mujer arriba de un carrito" a 320x240 es la
    // silueta de atras: casco amarillo, hombros, y una trenza que cuelga.
    partes.push(mover(caja(0.11, 0.34, 0.11, TX.CUERPO), 0, 0.74, -0.15));
    partes.push(mover(caja(0.15, 0.10, 0.10, TX.CUERPO), 0, 0.92, -0.15));

    // brazo derecho: el unico hueso falso que se rota (tira el gancho)
    const bg = caja(0.10, 0.34, 0.10, TX.CUERPO);
    bg.translate(0, -0.17, 0);
    const brazo = new THREE.Mesh(bg, mat);
    brazo.position.set(0.22, 0.67, 0);
    raiz.add(brazo);

    // la lampara: de aca sale el cono aditivo y la spot del vertex shader
    let lamp = null;
    if (completa){
      lamp = new THREE.Mesh(caja(0.10, 0.08, 0.06, TX.CASCO), MATS.lampara);
      lamp.position.set(0, 1.00, 0.16);
      raiz.add(lamp);
    }
    raiz.userData = { cuerpo, brazo, lamp };
    raiz.scale.setScalar(1.4);              // a escala 1 es un pixel y medio
    return raiz;                            // ~132 tris, 3 draw calls
  }

  /* --- Entidades -------------------------------------------------------- */
  function gema(){
    const g = new THREE.OctahedronGeometry(0.30, 0);
    g.scale(0.78, 1.35, 0.78);
    const geo = g.index ? g.toNonIndexed() : g;
    // proyeccion planar rapida: alcanza, la gema gira y nadie mira la costura
    const pos = geo.attributes.position, uv = [];
    for (let i = 0; i < pos.count; i++)
      uv.push(pos.getX(i) / 0.6 + 0.5, pos.getY(i) / 0.9 + 0.5);
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    return uvTile(geo, TX.GEMA);            // 8 tris
  }

  // 3 variantes de trampa fija (§9): viga caida, pico clavado, vagoneta rota.
  // Las tres llevan rojo y las tres tienen silueta propia: si un obstaculo se
  // lee como "una caja mas", el jugador no sabe que lo mato (§13: rojo = muerte).
  function trampaFija(v){
    if (v === 0){
      // Viga caida: tablon cruzado, con los extremos pintados de peligro
      const tabla = caja(1.15, 0.40, 0.34, TX.PIEDRA);
      tabla.rotateZ(0.14);
      const puntaI = caja(0.30, 0.46, 0.38, TX.PELIGRO);
      const puntaD = caja(0.30, 0.46, 0.38, TX.PELIGRO);
      const soporte = caja(0.20, 0.55, 0.20, TX.MADERA);
      return fusionar([mover(tabla, 0, 0.50, 0),
                       mover(puntaI, -0.50, 0.54, 0), mover(puntaD, 0.50, 0.42, 0),
                       mover(soporte, 0, 0.28, 0)]);                      // ~48 tris
    }
    if (v === 1){
      // Pico clavado: cono alto, se lee de lejos por la punta
      const cono = new THREE.ConeGeometry(0.26, 1.15, 5);
      uvTile(cono, TX.PELIGRO);
      const base = caja(0.60, 0.22, 0.60, TX.PIEDRA);
      const aro  = caja(0.44, 0.13, 0.44, TX.PELIGRO);
      return fusionar([mover(cono, 0, 0.76, 0), mover(base, 0, 0.11, 0),
                       mover(aro, 0, 0.28, 0)]);                          // ~34 tris
    }
    // Vagoneta rota: volcada de costado, con la rueda al aire
    const cuerpo = caja(1.05, 0.62, 0.72, TX.METAL);
    cuerpo.rotateZ(0.55);
    const franja = caja(1.10, 0.20, 0.78, TX.PELIGRO);
    franja.rotateZ(0.55);
    const rueda = new THREE.CylinderGeometry(0.24, 0.24, 0.1, 6);
    rueda.rotateZ(Math.PI / 2); uvTile(rueda, TX.METAL);
    return fusionar([mover(cuerpo, 0, 0.42, 0), mover(franja, 0.06, 0.70, 0),
                     mover(rueda, -0.44, 0.26, 0.2), mover(rueda, 0.38, 0.58, -0.2)]); // ~46 tris
  }

  /* Vagoneta suelta: es LO UNICO del tunel que tiene sentido que se mueva de
     carril, porque anda sobre los mismos rieles que vos y los rieles tienen
     desvios. Una caja desplazandose sola se lee como un bug; una vagoneta
     descarrilando se lee como una mina. */
  function trampaMovil(){
    const g = [];
    const rMetal = rectDe(TX.METAL), rPel = rectDe(TX.PELIGRO);
    // caja de carga, con la boca hacia vos
    g.push(mover(uvCaja(new THREE.BoxGeometry(1.02, 0.58, 0.78),
      [rMetal, rMetal, rPel, rMetal, rPel, rMetal]), 0, 0.46, 0));
    g.push(mover(caja(1.10, 0.12, 0.86, TX.PELIGRO), 0, 0.78, 0));   // borde
    // chasis y ejes
    g.push(mover(caja(0.90, 0.10, 0.16, TX.METAL), 0, 0.20, -0.26));
    g.push(mover(caja(0.90, 0.10, 0.16, TX.METAL), 0, 0.20, 0.26));
    // cuatro ruedas: son las que hacen leer que RUEDA
    for (const sx of [-0.50, 0.50]) for (const sz of [-0.26, 0.26]){
      const r = new THREE.CylinderGeometry(0.21, 0.21, 0.09, 6);
      r.rotateZ(Math.PI / 2); uvTile(r, TX.METAL);
      g.push(mover(r, sx, 0.21, sz));
    }
    // enganche suelto adelante: se ve que se solto de algo
    g.push(mover(caja(0.14, 0.14, 0.30, TX.METAL), 0, 0.34, -0.52));
    return fusionar(g);                     // ~80 tris
  }

  function murcielago(){
    // Un solo quad grande con la textura entera: dos planos chicos a 320x240
    // no se leen, y el bicho tiene que verse SI O SI o el juego es injusto.
    const g = new THREE.PlaneGeometry(1.15, 1.15);
    uvTile(g, TX.MURCIELAGO);
    return g;                               // 2 tris
  }

  // El desvio no mata: te empuja. Por eso tiene que gritar hacia donde, y a
  // 320x240 una flecha chata en el piso no se lee. Va grande, levantada del
  // suelo y con un cartel vertical atras que se ve de lejos.
  function desvio(lado){
    const piso = new THREE.PlaneGeometry(2.4, 2.2);
    piso.rotateX(-Math.PI / 2);
    if (lado < 0) piso.rotateY(Math.PI);
    uvTile(piso, TX.DESVIO);
    const cartel = new THREE.PlaneGeometry(1.5, 0.85);
    if (lado < 0) cartel.rotateY(Math.PI);
    uvTile(cartel, TX.DESVIO);
    return fusionar([mover(piso, 0, 0.06, 0), mover(cartel, 0, 0.75, -0.2)]);  // 4 tris
  }

  function viga(){
    // 2.4 u de ancho = escala 1 para una viga de 2 carriles; el ancho real lo
    // pone la escala X por instancia segun cuantas celdas marque el patron.
    const cuerpo = caja(2.4, 0.40, 0.40, TX.MADERA);
    const punta1 = caja(0.36, 0.46, 0.46, TX.PELIGRO);
    const punta2 = caja(0.36, 0.46, 0.46, TX.PELIGRO);
    return fusionar([cuerpo, mover(punta1, -1.15, 0, 0), mover(punta2, 1.15, 0, 0)]);
  }

  /* Sombra de la viga (§9): la marca en el piso que avisa 0.8 s antes de que
     caiga. Es el unico anuncio que tiene, asi que va en el mundo y no en el
     HUD — el borde superior quedo reservado para la companiera. */
  function marcaViga(){
    const g = new THREE.PlaneGeometry(2.4, 2.0);
    g.rotateX(-Math.PI / 2);
    uvTile(g, TX.PELIGRO);
    return mover(g, 0, 0.09, 0);            // 2 tris
  }

  function chispa(){
    const g = new THREE.PlaneGeometry(0.9, 0.9);
    return uvTile(g, TX.CHISPA);
  }
  function particula(){
    const g = new THREE.PlaneGeometry(0.14, 0.14);
    return uvTile(g, TX.POLVO);
  }

  /* --- Gancho: cadena de 6 cajitas, no un Line (§7.6) -------------------
     Se dibuja hacia +Z y se escala en Z al largo real. Va hacia +Z y no hacia
     -Z porque Object3D.lookAt() de Three apunta el +Z del objeto al destino
     (la convencion invertida es solo para camaras y luces).
     La PUNTA va aparte: la cadena se escala en Z para estirarse, y si la punta
     viaja en la misma malla se estira con ella y deja de leerse como gancho.  */
  function ganchoCadena(){
    const g = [];
    // 6 eslabones GRUESOS. A 320x240 una cadena fina es una linea de un pixel
    // que se pierde contra la roca, y la soga es la unica pista de a donde
    // esta yendo el gancho.
    for (let i = 0; i < 6; i++){
      const z = i * 0.166 + 0.083;
      g.push(mover(caja(0.115, 0.115, 0.135, TX.CASCO), 0, 0, z));
      // nudo intermedio girado: da la lectura de eslabones encadenados
      const nudo = caja(0.085, 0.085, 0.075, TX.METAL);
      nudo.rotateZ(Math.PI / 4);
      g.push(mover(nudo, 0, 0, z + 0.083));
    }
    return fusionar(g);
  }

  // Punta: un ANCLA. Nunca se escala, asi que mide lo mismo a 1 u que a 14 u,
  // y es lo unico que el jugador sigue con la vista mientras la soga vuela.
  function ganchoPunta(){
    const g = [];
    const caña = caja(0.13, 0.13, 0.78, TX.CASCO);        // el asta
    g.push(mover(caña, 0, 0, 0.05));
    // arganeo: el aro de arriba, de donde sale la soga
    g.push(mover(caja(0.26, 0.10, 0.10, TX.METAL), 0, 0, -0.36));
    g.push(mover(caja(0.10, 0.24, 0.10, TX.METAL), 0, 0, -0.36));
    // cepo: el travesaño cruzado, es LO que hace que se lea como ancla
    g.push(mover(caja(0.86, 0.11, 0.11, TX.CASCO), 0, 0, -0.20));
    g.push(mover(caja(0.11, 0.11, 0.20, TX.METAL), -0.40, 0, -0.20));
    g.push(mover(caja(0.11, 0.11, 0.20, TX.METAL),  0.40, 0, -0.20));
    // brazos y uñas: se abren hacia los costados y curvan hacia atras
    for (const sx of [-1, 1]){
      const brazo = caja(0.44, 0.12, 0.12, TX.CASCO);
      brazo.rotateZ(sx * 0.55);
      g.push(mover(brazo, sx * 0.21, -0.11, 0.34));
      const uña = caja(0.14, 0.30, 0.14, TX.CASCO);
      uña.rotateZ(sx * 0.35);
      g.push(mover(uña, sx * 0.40, -0.02, 0.30));
      const punta = new THREE.ConeGeometry(0.11, 0.26, 4);
      punta.rotateX(Math.PI / 2); uvTile(punta, TX.PELIGRO);
      g.push(mover(punta, sx * 0.44, 0.12, 0.34));
    }
    return fusionar(g);                     // ~130 tris
  }

  /* --- Cono de luz de casco: geometria aditiva, el truco de la epoca ----- */
  function conoLuz(){
    const g = new THREE.ConeGeometry(1, 1, 10, 1, true);
    // el cono de Three apunta +Y; lo giramos a -Z y le corremos el apice al origen
    g.rotateX(Math.PI / 2);
    g.translate(0, 0, -0.5);
    uvTile(g, TX.CONO);
    return g;                               // 20 tris
  }

  return { uvTile, uvCaja, subTile, caja, fusionar, mover, rectDe,
           tunelSegmento, rieles, durmientes, carrito, minera, gema,
           trampaFija, trampaMovil, murcielago, desvio, viga, marcaViga, chispa,
           particula, ganchoCadena, ganchoPunta, conoLuz };
})();

export { GeoFactory };
