import * as THREE from 'three';
import { CONFIG } from './config.js';
import { TextureGen } from './texturas.js';

/* ===========================================================================
   Shaders — §4.5. Las tecnicas 2, 3, 4, 5 viven en PSXMaterial; la 1, 6 y 7
   en el quad de post. Juntas leen como PS1; sueltas parecen un bug.
   =========================================================================== */
const MAX_LUCES = 5;   // Rufa + las 4 companieras (§4.5-4). Limite de diseño.

// Uniforms compartidos por TODOS los materiales PSX: una sola escritura por
// frame actualiza la escena entera y ademas mantiene el material compartido,
// que es lo que deja el conteo de draw calls abajo de 15 (§9).
const LUCES_U = {
  uRes:      { value: new THREE.Vector2(...CONFIG.resInterna) },
  uLuzPos:   { value: Array.from({length: MAX_LUCES}, () => new THREE.Vector3()) },
  uLuzDir:   { value: Array.from({length: MAX_LUCES}, () => new THREE.Vector3(0,0,-1)) },
  uLuzCol:   { value: Array.from({length: MAX_LUCES}, () => new THREE.Color(CONFIG.luzColor)) },
  uLuzInt:   { value: new Float32Array(MAX_LUCES) },
  uNumLuces: { value: 1 },
  uAmbiente: { value: new THREE.Color(CONFIG.ambiente) },
  uCono:     { value: new THREE.Vector4(CONFIG.luzConoDesde, CONFIG.luzConoHasta,
                                        CONFIG.luzDerrame, CONFIG.luzAlcance) },
  uFogCol:   { value: new THREE.Color(CONFIG.fogColor) },
  uFogNear:  { value: CONFIG.fogNear },
  uFogFar:   { value: CONFIG.fogFar },
};

const PSX_VERT = /* glsl */`
uniform vec2  uRes;
uniform vec3  uLuzPos[${MAX_LUCES}];
uniform vec3  uLuzDir[${MAX_LUCES}];
uniform vec3  uLuzCol[${MAX_LUCES}];
uniform float uLuzInt[${MAX_LUCES}];
uniform int   uNumLuces;
uniform vec3  uAmbiente;
uniform vec4  uCono;   // (desde, hasta, derrame, alcance)
uniform float uFogNear;
uniform float uFogFar;
uniform vec2  uUvScroll;
uniform vec3  uTinte;

varying vec2  vUv;
varying float vW;
varying vec3  vCol;
varying float vFog;

void main(){
  mat4 modelo = modelMatrix;
  vec4 posLocal = vec4(position, 1.0);

  #ifdef USE_INSTANCING
    posLocal = instanceMatrix * posLocal;
    modelo = modelMatrix * instanceMatrix;
  #endif

  vec4 mundo = modelMatrix * posLocal;
  vec4 vista = viewMatrix * mundo;
  vec4 clip  = projectionMatrix * vista;

  // --- Tecnica 2: vertex snapping. La PS1 no tenia precision sub-pixel. -----
  vec2 grid = uRes * 0.5;
  clip.xy = floor((clip.xy / clip.w) * grid + 0.5) / grid * clip.w;
  gl_Position = clip;

  // --- Tecnica 3: mapeado afin. Se cancela la correccion de perspectiva. ----
  vUv = (uv + uUvScroll) * clip.w;
  vW  = clip.w;

  // --- Tecnica 4: iluminacion POR VERTICE, hasta 5 spots. -------------------
  #ifdef UNLIT
    vCol = uTinte;
  #else
    vec3 nrm = normalize(mat3(modelo) * normal);
    vec3 luz = uAmbiente;
    for (int i = 0; i < ${MAX_LUCES}; i++){
      if (i >= uNumLuces) break;
      vec3  haciaFrag = mundo.xyz - uLuzPos[i];
      float dist = length(haciaFrag);
      vec3  dir  = haciaFrag / max(dist, 0.0001);
      // El cono es ancho a proposito: con uno cerrado el tunel no se lee y el
      // juego deja de ser jugable a 320x240, que es la resolucion real.
      float cono = smoothstep(uCono.x, uCono.y, dot(dir, normalize(uLuzDir[i])));
      // Derrame: una lampara ilumina lo que tiene al lado aunque no le apunte.
      // Sin esto el carrito y Rufa quedan en negro, porque estan DENTRO de la
      // luz y el cono nunca los toca.
      cono = max(cono, (1.0 - smoothstep(0.0, uCono.z, dist)) * 0.85);
      float att  = pow(1.0 - clamp(dist / uCono.w, 0.0, 1.0), 1.35);
      // wrap lighting: 0.42 de piso para que nada quede en negro puro y se
      // pierda la silueta contra la niebla
      float nl = max(dot(nrm, -dir), 0.0) * 0.58 + 0.42;
      luz += uLuzCol[i] * (uLuzInt[i] * cono * att * nl);
    }
    vCol = luz * uTinte;
    #ifdef USE_INSTANCING_COLOR
      vCol *= instanceColor;
    #endif
  #endif

  // --- Tecnica 5: niebla lineal, del color del fondo, como draw distance ----
  vFog = clamp((-vista.z - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
}`;

const PSX_FRAG = /* glsl */`
uniform sampler2D uMapa;
uniform vec3  uFogCol;
uniform float uAlfa;
uniform vec4  uTileRect;   // (u0, v0, ancho, alto) del tile dentro del atlas

varying vec2  vUv;
varying float vW;
varying vec3  vCol;
varying float vFog;

void main(){
  vec2 uvAfin = vUv / vW;              // Tecnica 3, la otra mitad
  #ifdef WRAP_TILE
    // Repeticion dentro de un tile del atlas: deja que las UVs se desplacen
    // libremente (rieles del §5) sin sangrar al tile de al lado.
    uvAfin = uTileRect.xy + fract(uvAfin) * uTileRect.zw;
  #endif
  vec4 tex = texture2D(uMapa, uvAfin);
  #ifdef ALPHATEST
    if (tex.a < 0.5) discard;
  #endif
  vec3 col = tex.rgb * vCol;
  #ifdef ADITIVO
    // lo aditivo no se apaga con niebla: se apaga solo, por distancia
    gl_FragColor = vec4(col * (1.0 - vFog), tex.a * uAlfa);
  #else
    col = mix(col, uFogCol, vFog);
    gl_FragColor = vec4(col, tex.a * uAlfa);
  #endif
}`;

// Fabrica de materiales PSX. Todos comparten LUCES_U por referencia, asi que
// actualizar las luces una vez por frame alcanza para la escena entera.
function crearPSX(opts = {}){
  const defines = {};
  if (opts.unlit)     defines.UNLIT = '';
  if (opts.aditivo) { defines.ADITIVO = ''; defines.UNLIT = ''; }
  if (opts.alphaTest) defines.ALPHATEST = '';
  if (opts.wrapTile)  defines.WRAP_TILE = '';
  const r = opts.wrapTile ? TextureGen.uv(opts.wrapTile.tile) : null;

  const m = new THREE.ShaderMaterial({
    defines,
    uniforms: Object.assign({}, LUCES_U, {
      uMapa:     { value: opts.mapa || null },
      uUvScroll: { value: new THREE.Vector2(0, 0) },
      uTinte:    { value: new THREE.Color(opts.tinte === undefined ? 0xffffff : opts.tinte) },
      uAlfa:     { value: opts.alfa === undefined ? 1 : opts.alfa },
      uTileRect: { value: r ? new THREE.Vector4(r.u0, r.v0, r.u1 - r.u0, r.v1 - r.v0)
                            : new THREE.Vector4(0, 0, 1, 1) },
    }),
    vertexShader: PSX_VERT,
    fragmentShader: PSX_FRAG,
    transparent: !!(opts.aditivo || opts.transparente),
    depthWrite: opts.aditivo ? false : true,
    blending: opts.aditivo ? THREE.AdditiveBlending : THREE.NormalBlending,
    side: opts.side || THREE.FrontSide,
    fog: false,
  });
  // Los uniforms compartidos se reemplazan por la MISMA referencia para que
  // una escritura en LUCES_U valga para todos los materiales.
  for (const k in LUCES_U) m.uniforms[k] = LUCES_U[k];
  return m;
}

/* --- Tecnica 1 + 6 + 7: el quad de post ---------------------------------
   Baja resolucion (320x240, nearest) + posterizado a 32 niveles por canal
   (15 bits) + dither ordenado de Bayer 4x4 antes de cuantizar. El dither se
   evalua en coordenadas de pixel INTERNO, no de pantalla: si no, al escalar
   el patron se estira y deja de leerse como una consola de 1996.            */
const POST_FRAG = /* glsl */`
precision mediump float;
uniform sampler2D uEscena;
uniform vec2  uRes;
uniform float uNiveles;
uniform float uDither;
uniform float uFlash;
uniform vec3  uFlashCol;
varying vec2 vUv;

float bayer2(vec2 a){ return 2.0*a.x + 3.0*a.y - 4.0*a.x*a.y; }
float bayer4(vec2 p){
  vec2 a = mod(p, 2.0);
  vec2 b = mod(floor(p * 0.5), 2.0);
  return (bayer2(b) * 4.0 + bayer2(a)) / 16.0;
}

void main(){
  vec3 c = texture2D(uEscena, vUv).rgb;
  c = mix(c, uFlashCol, uFlash);
  vec2 pix = floor(vUv * uRes);
  c += (bayer4(pix) - 0.5) * (uDither / uNiveles);
  c = floor(c * uNiveles + 0.5) / uNiveles;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

const POST_VERT = /* glsl */`
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export { MAX_LUCES, LUCES_U, crearPSX, POST_FRAG, POST_VERT };
// Materiales compartidos; los llena el arranque del render (§4.5-4).
export const MATS = {};
