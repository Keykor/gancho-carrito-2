import * as THREE from 'three';
import { lerp, rngCon } from './config.js';

/* ===========================================================================
   TextureGen — §13. Atlas procedural 256x256 de tiles 64x64, generado una sola
   vez al arrancar. Cero assets externos. Paleta de 16 colores, NearestFilter,
   sin mipmaps (§4.5-7).
   =========================================================================== */
const ATLAS_LADO = 256, TILE = 64, TILES_FILA = ATLAS_LADO / TILE;

// Indices de tile. El orden es el layout fisico del atlas, no toques uno sin el otro.
const TX = {
  ROCA_A:0, ROCA_B:1, DURMIENTE:2, RIEL:3,
  GEMA:4,   CHISPA:5, POLVO:6,     CONO:7,
  METAL:8,  MADERA:9, PIEDRA:10,   MURCIELAGO:11,
  CUERPO:12, CARAS:13, CASCO:14,   DESVIO:15,
};
// El atlas de 256x256 con tiles de 64x64 da exactamente 16 y estan los 16
// usados (§13). PELIGRO no es un tile nuevo: es PIEDRA, reconvertido en franja
// de peligro, que es lo unico para lo que se usaba.
TX.PELIGRO = TX.PIEDRA;

// 16 colores derivados de la paleta del §13. El amarillo es luz, el turquesa
// es premio, el rojo es muerte: ningun elemento decorativo los usa.
const PALETA = [
  '#0B0A12','#14121E','#1C1829','#241F35','#2E2842','#3A3252','#4A4066','#5C5080',
  '#8A7FA8','#B3A9C9','#FFD166','#C79A45','#4CE0D2','#2E9C93','#FF3D5A','#E8E4F0',
].map(h => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)]);

const TextureGen = (() => {
  const cv = document.createElement('canvas');
  cv.width = cv.height = ATLAS_LADO;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;

  const rnd = rngCon(0xC0FFEE);

  // --- ruido de valor con octavas, sobre una grilla gruesa interpolada ---
  function campoRuido(lado, celdas, octavas){
    const out = new Float32Array(lado * lado);
    let amp = 1, total = 0;
    for (let o = 0; o < octavas; o++){
      const c = celdas << o;
      const g = new Float32Array((c + 1) * (c + 1));
      for (let i = 0; i < g.length; i++) g[i] = rnd();
      for (let y = 0; y < lado; y++){
        const fy = y / lado * c, y0 = Math.floor(fy), ty = fy - y0;
        const sy = ty * ty * (3 - 2 * ty);
        for (let x = 0; x < lado; x++){
          const fx = x / lado * c, x0 = Math.floor(fx), tx = fx - x0;
          const sx = tx * tx * (3 - 2 * tx);
          const a = g[y0 * (c+1) + x0],     b = g[y0 * (c+1) + x0+1];
          const d = g[(y0+1) * (c+1) + x0], e = g[(y0+1) * (c+1) + x0+1];
          out[y*lado + x] += amp * lerp(lerp(a,b,sx), lerp(d,e,sx), sy);
        }
      }
      total += amp; amp *= 0.5;
    }
    for (let i = 0; i < out.length; i++) out[i] /= total;
    return out;
  }

  function tileXY(i){ return [(i % TILES_FILA) * TILE, Math.floor(i / TILES_FILA) * TILE]; }

  function pintar(i, fn){
    const [ox, oy] = tileXY(i);
    ctx.save();
    ctx.beginPath(); ctx.rect(ox, oy, TILE, TILE); ctx.clip();
    ctx.translate(ox, oy);
    fn(ctx);
    ctx.restore();
  }

  // --- roca: ruido de valor + grietas dibujadas a mano en codigo ---------
  // OJO: putImageData ignora transform y clip, asi que el ruido se arma en un
  // canvas aparte y se vuelca con drawImage, que si los respeta. Escribirlo
  // directo mandaba todas las rocas al tile 0 y dejaba las paredes en negro.
  function roca(c, semillaGrietas){
    const n = campoRuido(TILE, 4, 3);
    const tmp = document.createElement('canvas');
    tmp.width = tmp.height = TILE;
    const tctx = tmp.getContext('2d');
    const img = tctx.createImageData(TILE, TILE);
    for (let i = 0; i < TILE*TILE; i++){
      const v = n[i];
      // rampa de violetas: de roca-fondo a roca-pared clarito
      const idx = v < .30 ? 3 : v < .44 ? 4 : v < .58 ? 5 : v < .72 ? 6 : v < .86 ? 7 : 8;
      const [r,g,b] = PALETA[idx];
      img.data[i*4] = r; img.data[i*4+1] = g; img.data[i*4+2] = b; img.data[i*4+3] = 255;
    }
    tctx.putImageData(img, 0, 0);
    c.drawImage(tmp, 0, 0);
    // grietas: caminatas aleatorias oscuras, 2 px, con ramitas
    const r2 = rngCon(semillaGrietas);
    c.strokeStyle = 'rgba(11,10,18,.55)'; c.lineWidth = 2; c.lineCap = 'butt';
    for (let k = 0; k < 4; k++){
      let x = r2() * TILE, y = r2() * TILE, ang = r2() * Math.PI * 2;
      c.beginPath(); c.moveTo(x, y);
      for (let s = 0; s < 10; s++){
        ang += (r2() - .5) * 1.1;
        x += Math.cos(ang) * 5; y += Math.sin(ang) * 5;
        c.lineTo(x, y);
      }
      c.stroke();
    }
    // brillos de mineral: puntitos claros, nunca en los 3 colores de señal
    c.fillStyle = PALETA_CSS(8);
    for (let k = 0; k < 22; k++) c.fillRect((r2()*TILE)|0, (r2()*TILE)|0, 1, 1);
  }

  const PALETA_CSS = i => `rgb(${PALETA[i][0]},${PALETA[i][1]},${PALETA[i][2]})`;

  function generar(){
    ctx.fillStyle = PALETA_CSS(0);
    ctx.fillRect(0, 0, ATLAS_LADO, ATLAS_LADO);

    pintar(TX.ROCA_A, c => roca(c, 0x1234));
    pintar(TX.ROCA_B, c => roca(c, 0x9ABC));

    // Durmiente: madera con veta, en tira horizontal
    pintar(TX.DURMIENTE, c => {
      c.fillStyle = PALETA_CSS(2); c.fillRect(0,0,TILE,TILE);
      const r2 = rngCon(0x5EED);
      for (let y = 0; y < TILE; y += 16){
        c.fillStyle = PALETA_CSS(4); c.fillRect(0, y+2, TILE, 12);
        c.fillStyle = PALETA_CSS(3);
        for (let k = 0; k < 8; k++) c.fillRect((r2()*TILE)|0, y+3+((r2()*10)|0), 3+((r2()*8)|0), 1);
        c.fillStyle = PALETA_CSS(1); c.fillRect(0, y+14, TILE, 2);
      }
    });

    // Riel: dos tiras metalicas verticales con brillo arriba (scrollea en V)
    pintar(TX.RIEL, c => {
      c.fillStyle = PALETA_CSS(1); c.fillRect(0,0,TILE,TILE);
      for (const x of [10, 42]){
        c.fillStyle = PALETA_CSS(5); c.fillRect(x, 0, 12, TILE);
        c.fillStyle = PALETA_CSS(8); c.fillRect(x+3, 0, 4, TILE);
        c.fillStyle = PALETA_CSS(15); c.fillRect(x+4, 0, 1, TILE);
      }
      const r2 = rngCon(0xBEEF);
      c.fillStyle = PALETA_CSS(3);
      for (let k = 0; k < 40; k++) c.fillRect((r2()*TILE)|0, (r2()*TILE)|0, 2, 1);
    });

    // Gema: rombo turquesa con specular PINTADO, no calculado (§13)
    pintar(TX.GEMA, c => {
      c.clearRect(0,0,TILE,TILE);
      const cx = 32, cy = 32;
      const rombo = (r, col) => {
        c.fillStyle = col; c.beginPath();
        c.moveTo(cx, cy-r); c.lineTo(cx+r*.72, cy); c.lineTo(cx, cy+r); c.lineTo(cx-r*.72, cy);
        c.closePath(); c.fill();
      };
      rombo(28, PALETA_CSS(13));
      rombo(22, PALETA_CSS(12));
      // facetas
      c.fillStyle = PALETA_CSS(13);
      c.beginPath(); c.moveTo(cx,cy-22); c.lineTo(cx+16,cy); c.lineTo(cx,cy+4); c.closePath(); c.fill();
      // specular: dos manchas claras fijas
      c.fillStyle = PALETA_CSS(15);
      c.fillRect(cx-9, cy-13, 4, 9); c.fillRect(cx-5, cy-15, 2, 4);
      c.fillStyle = 'rgba(232,228,240,.5)'; c.fillRect(cx+6, cy+4, 3, 6);
    });

    // Chispa: estrella aditiva de 4 puntas, blanca al centro
    pintar(TX.CHISPA, c => {
      c.clearRect(0,0,TILE,TILE);
      const g = c.createRadialGradient(32,32,0, 32,32,30);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(.25,'rgba(255,209,102,.85)');
      g.addColorStop(1, 'rgba(255,209,102,0)');
      c.fillStyle = g; c.fillRect(0,0,TILE,TILE);
      c.fillStyle = 'rgba(255,255,255,.9)';
      c.fillRect(4,30,56,4); c.fillRect(30,4,4,56);
    });

    // Polvo: punto suave, se usa para particulas y para el cono
    pintar(TX.POLVO, c => {
      c.clearRect(0,0,TILE,TILE);
      const g = c.createRadialGradient(32,32,0, 32,32,31);
      g.addColorStop(0,'rgba(138,127,168,.9)');
      g.addColorStop(1,'rgba(138,127,168,0)');
      c.fillStyle = g; c.fillRect(0,0,TILE,TILE);
    });

    // Cono de luz: degrade vertical, denso arriba (en la lampara) y desvanecido
    // abajo (lejos). Blending aditivo, el truco de la epoca (§13).
    pintar(TX.CONO, c => {
      const g = c.createLinearGradient(0,0,0,TILE);
      g.addColorStop(0,   'rgba(255,209,102,.55)');
      g.addColorStop(.45, 'rgba(255,209,102,.18)');
      g.addColorStop(1,   'rgba(255,209,102,0)');
      c.fillStyle = g; c.fillRect(0,0,TILE,TILE);
      // bandeado horizontal: se lee como haz con polvo en suspension
      c.fillStyle = 'rgba(255,209,102,.10)';
      for (let y = 0; y < TILE; y += 6) c.fillRect(0, y, TILE, 2);
    });

    // Metal del carrito: chapa remachada
    pintar(TX.METAL, c => {
      c.fillStyle = PALETA_CSS(4); c.fillRect(0,0,TILE,TILE);
      const r2 = rngCon(0x77AA);
      c.fillStyle = PALETA_CSS(5);
      for (let k = 0; k < 60; k++) c.fillRect((r2()*TILE)|0,(r2()*TILE)|0, 3, 2);
      c.fillStyle = PALETA_CSS(2);
      for (let k = 0; k < 30; k++) c.fillRect((r2()*TILE)|0,(r2()*TILE)|0, 2, 4);
      c.fillStyle = PALETA_CSS(8);                 // remaches
      for (let y = 8; y < TILE; y += 20) for (let x = 8; x < TILE; x += 20) c.fillRect(x,y,3,3);
      c.strokeStyle = PALETA_CSS(1); c.lineWidth = 3;
      c.strokeRect(1.5,1.5,TILE-3,TILE-3);
    });

    // Madera de viga: tablon con vetas largas
    pintar(TX.MADERA, c => {
      c.fillStyle = PALETA_CSS(3); c.fillRect(0,0,TILE,TILE);
      const r2 = rngCon(0x3311);
      c.fillStyle = PALETA_CSS(4);
      for (let k = 0; k < 14; k++) c.fillRect(0, (r2()*TILE)|0, TILE, 1 + ((r2()*3)|0));
      c.fillStyle = PALETA_CSS(2);
      for (let k = 0; k < 10; k++) c.fillRect(0, (r2()*TILE)|0, TILE, 1);
      c.fillStyle = PALETA_CSS(1); c.fillRect(0,0,TILE,3); c.fillRect(0,TILE-3,TILE,3);
    });

    // Franja de peligro: la usan las tres trampas, la movil y las puntas de la
    // viga. Tiene que gritar contra la roca violeta, asi que va con el rojo del
    // §13 (rojo = muerte) y blanco, que son los dos valores que la mina no usa
    // en ningun otro lado.
    pintar(TX.PIEDRA, c => {
      c.fillStyle = PALETA_CSS(14); c.fillRect(0,0,TILE,TILE);
      c.fillStyle = PALETA_CSS(15);
      for (let x = -TILE; x < TILE*2; x += 22){
        c.beginPath();
        c.moveTo(x, TILE); c.lineTo(x+11, TILE); c.lineTo(x+11+TILE, 0); c.lineTo(x+TILE, 0);
        c.closePath(); c.fill();
      }
      // borde oscuro: recorta la pieza contra el fondo
      c.strokeStyle = PALETA_CSS(0); c.lineWidth = 6;
      c.strokeRect(3, 3, TILE-6, TILE-6);
    });

    // Murcielago: tiene que despegarse de la roca. Alas claras con contorno
    // oscuro y ojos rojos — el rojo es muerte (§13), y un bicho que te lastima
    // se gana el rojo. Sin este contraste, a 320x240 se lo come el fondo.
    pintar(TX.MURCIELAGO, c => {
      c.clearRect(0,0,TILE,TILE);
      const ala = (dx, dy) => {
        c.beginPath();
        c.moveTo(32,20); c.lineTo(4,8); c.lineTo(11,26); c.lineTo(2,36);
        c.lineTo(21,35); c.lineTo(32,46);
        c.lineTo(43,35); c.lineTo(62,36); c.lineTo(53,26); c.lineTo(60,8);
        c.closePath();
      };
      // contorno oscuro grueso: es lo que lo recorta contra la pared
      c.lineJoin = 'round'; c.lineWidth = 7; c.strokeStyle = PALETA_CSS(0);
      ala(); c.stroke();
      c.fillStyle = PALETA_CSS(7); ala(); c.fill();
      // nervaduras de las alas
      c.strokeStyle = PALETA_CSS(5); c.lineWidth = 2;
      for (const [x,y] of [[12,14],[10,30],[20,34],[52,14],[54,30],[44,34]]){
        c.beginPath(); c.moveTo(32,22); c.lineTo(x,y); c.stroke();
      }
      // cuerpo claro
      c.fillStyle = PALETA_CSS(9); c.fillRect(27,17,10,21);
      c.fillStyle = PALETA_CSS(0);  c.fillRect(26,16,12,2);
      c.fillStyle = PALETA_CSS(8); c.fillRect(28,13,3,6); c.fillRect(33,13,3,6);  // orejas
      c.fillStyle = PALETA_CSS(14); c.fillRect(28,23,3,4); c.fillRect(33,23,3,4); // ojos
      c.fillStyle = PALETA_CSS(15); c.fillRect(28,23,1,1); c.fillRect(33,23,1,1);
    });

    // Cuerpo de minera: overol + cinturon. La cara va aparte (TX.CARAS).
    pintar(TX.CUERPO, c => {
      c.fillStyle = PALETA_CSS(6); c.fillRect(0,0,TILE,TILE);
      c.fillStyle = PALETA_CSS(5); c.fillRect(0,0,TILE,20);
      c.fillStyle = PALETA_CSS(3); c.fillRect(0,30,TILE,8);       // cinturon
      c.fillStyle = PALETA_CSS(10); c.fillRect(26,31,12,6);       // hebilla
      c.fillStyle = PALETA_CSS(4);
      c.fillRect(6,42,10,22); c.fillRect(48,42,10,22);            // bolsillos
      const r2 = rngCon(0x8899);
      c.fillStyle = PALETA_CSS(7);
      for (let k = 0; k < 20; k++) c.fillRect((r2()*TILE)|0,(r2()*TILE)|0, 2, 2);
    });

    // Caras: grilla de 4x4 de 16x16. Hacen falta CINCO (Rufa + las 4
    // companieras) y en cuadrantes de 32x32 solo entran cuatro, con lo que
    // Tuca terminaba usando la cara de Rufa. Nada de geometria facial: la cara
    // es textura (§13).
    pintar(TX.CARAS, c => {
      const caras = [
        { piel:9,  pelo:2,  boca:11 },   // 0 Rufa
        { piel:9,  pelo:1,  boca:11 },   // 1 Chola
        { piel:8,  pelo:5,  boca:11 },   // 2 Nene
        { piel:9,  pelo:11, boca:10 },   // 3 Beba
        { piel:8,  pelo:7,  boca:11 },   // 4 Tuca
      ];
      c.fillStyle = PALETA_CSS(0); c.fillRect(0, 0, TILE, TILE);
      caras.forEach((cara, i) => {
        const ox = (i % 4) * 16, oy = ((i / 4) | 0) * 16;
        c.fillStyle = PALETA_CSS(cara.piel); c.fillRect(ox + 3, oy + 4, 10, 11);
        c.fillStyle = PALETA_CSS(cara.pelo); c.fillRect(ox + 2, oy + 1, 12, 4);
        c.fillRect(ox + 2, oy + 4, 2, 7); c.fillRect(ox + 12, oy + 4, 2, 7);
        c.fillStyle = PALETA_CSS(0);  c.fillRect(ox + 5, oy + 8, 2, 2); c.fillRect(ox + 9, oy + 8, 2, 2);
        c.fillStyle = PALETA_CSS(15); c.fillRect(ox + 5, oy + 8, 1, 1); c.fillRect(ox + 9, oy + 8, 1, 1);
        c.fillStyle = PALETA_CSS(cara.boca); c.fillRect(ox + 6, oy + 12, 4, 1);
      });
    });

    // Casco: amarillo luz + la lampara. Cuarta cara (Tuca) en el cuadrante 4.
    pintar(TX.CASCO, c => {
      c.fillStyle = PALETA_CSS(10); c.fillRect(0,0,TILE,TILE);
      c.fillStyle = PALETA_CSS(11); c.fillRect(0,TILE-14,TILE,14);   // visera
      c.fillStyle = PALETA_CSS(15); c.fillRect(24,TILE-12,16,10);    // lampara
      c.fillStyle = PALETA_CSS(11);
      for (let x = 6; x < TILE; x += 20) c.fillRect(x, 4, 3, TILE-20); // nervaduras
    });

    // Desvio: flecha en el riel. Se rota por instancia segun el lado.
    pintar(TX.DESVIO, c => {
      c.fillStyle = PALETA_CSS(2); c.fillRect(0,0,TILE,TILE);
      c.fillStyle = PALETA_CSS(10);
      c.beginPath();
      c.moveTo(8,26); c.lineTo(38,26); c.lineTo(38,14); c.lineTo(58,32);
      c.lineTo(38,50); c.lineTo(38,38); c.lineTo(8,38); c.closePath(); c.fill();
      c.fillStyle = PALETA_CSS(11); c.fillRect(8,26,30,3);
    });

    const tex = new THREE.CanvasTexture(cv);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    // NoColorSpace a proposito: si el atlas se marca sRGB, Three lo decodifica
    // a lineal al muestrear y el shader lo escribe sin re-codificar, con lo que
    // todo sale ~6x mas oscuro. Una consola del 96 no hacia gestion de gamma:
    // el color que se pinta en el canvas es el color que sale por pantalla.
    tex.colorSpace = THREE.NoColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  // Rect UV de un tile. Three da flipY=true en CanvasTexture, asi que la fila 0
  // del canvas (arriba) cae en v alto.
  function uv(i){
    const cx = i % TILES_FILA, cy = Math.floor(i / TILES_FILA);
    const s = 1 / TILES_FILA;
    return { u0: cx * s, u1: (cx + 1) * s, v0: 1 - (cy + 1) * s, v1: 1 - cy * s };
  }

  // Dibuja un tile suelto a un canvas chico: sirve para los retratos del HUD.
  function recorte(i, destino, lado){
    destino.width = destino.height = lado;
    const c = destino.getContext('2d');
    c.imageSmoothingEnabled = false;
    const [ox, oy] = tileXY(i);
    c.drawImage(cv, ox, oy, TILE, TILE, 0, 0, lado, lado);
  }
  // Una celda de 16x16 del tile de caras, para los retratos del HUD.
  function recorteCara(idx, destino, lado){
    destino.width = destino.height = lado;
    const c = destino.getContext('2d');
    c.imageSmoothingEnabled = false;
    const [ox, oy] = tileXY(TX.CARAS);
    c.drawImage(cv, ox + (idx % 4) * 16, oy + ((idx/4)|0) * 16, 16, 16, 0, 0, lado, lado);
  }

  return { generar, uv, recorte, recorteCara, canvas: cv, PALETA_CSS };
})();

export { TextureGen, TX, PALETA, ATLAS_LADO, TILE };
