/* ===========================================================================
   Renderer — §4.5-1, 6, 7. escena → RenderTarget 320x240 → quad de posterizado
   + dither → canvas. El canvas es de 320x240 y el estirado a pantalla lo hace
   el CSS con image-rendering: pixelated: es exactamente la misma imagen que
   estirar con otro quad, pero sin pagar el fillrate de la pantalla entera —
   que es justo lo que el §4.5-1 dice que hay que ahorrar.
   =========================================================================== */
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { TextureGen } from './texturas.js';
import { crearPSX, LUCES_U, MATS, POST_VERT, POST_FRAG } from './shaders.js';

const [RW, RH] = CONFIG.resInterna;

export const Render = {
  renderer: null, escena: null, camara: null, rt: null,
  postEscena: null, postCamara: null, postMat: null,
  atlas: null, ok: false,

  init(canvas){
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: false,                    // §4.5: el aliasing es parte del look
        powerPreference: 'high-performance',
        alpha: false, stencil: false, depth: true,
      });
    } catch (e){
      console.error('WebGL no inicializo:', e);
      return false;
    }
    if (!this.renderer.getContext()) return false;

    this.renderer.setPixelRatio(1);
    this.renderer.setSize(RW, RH, false);
    this.renderer.autoClear = false;
    // info se resetea en cada render(); con dos pasadas por frame el contador
    // solo reportaria el quad de post. Se resetea a mano, una vez por frame.
    this.renderer.info.autoReset = false;
    this.renderer.setClearColor(CONFIG.fogColor, 1);
    // Sin conversion de salida, por lo mismo: el pipeline entero es lineal-de-a
    // -mentira, como la epoca. Ademas ahorra la conversion por pixel.
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

    // §4.5-7: el atlas procedural, 64x64 por elemento, nearest, sin mipmaps
    this.atlas = TextureGen.generar();

    // Materiales compartidos: una sola escritura de LUCES_U por frame alcanza
    // para toda la escena, y por eso el conteo de draw calls queda bajo (§9).
    MATS.psx       = crearPSX({ mapa: this.atlas, alphaTest: true });
    MATS.psxDoble  = crearPSX({ mapa: this.atlas, alphaTest: true, side: THREE.DoubleSide });
    MATS.rieles    = crearPSX({ mapa: this.atlas, wrapTile: { tile: 3 } });   // TX.RIEL
    MATS.durmiente = crearPSX({ mapa: this.atlas, wrapTile: { tile: 2 } });   // TX.DURMIENTE
    MATS.lampara   = crearPSX({ mapa: this.atlas, unlit: true, tinte: CONFIG.luzColor });
    // La gema va SIN luz a proposito: multiplicada por el amarillo de la
    // lampara, el turquesa vira a verde y deja de leerse como premio (§13).
    // Sin iluminar, conserva su color y ademas brilla contra la roca.
    MATS.gema      = crearPSX({ mapa: this.atlas, unlit: true, alphaTest: true });
    // Los murcielagos tambien van sin luz. Vuelan por encima del cono de la
    // lampara, asi que iluminados quedaban literalmente invisibles.
    MATS.bicho     = crearPSX({ mapa: this.atlas, unlit: true, alphaTest: true,
                                side: THREE.DoubleSide });
    // La soga y el garfio son INTERFAZ, no escenografia: van sin luz para que
    // se lean siempre, contra la roca, contra la niebla y contra el fondo.
    MATS.gancho    = crearPSX({ mapa: this.atlas, unlit: true, alphaTest: true });
    MATS.cono      = crearPSX({ mapa: this.atlas, aditivo: true, side: THREE.DoubleSide, alfa: 0.9 });
    MATS.chispa    = crearPSX({ mapa: this.atlas, aditivo: true, side: THREE.DoubleSide });
    MATS.polvo     = crearPSX({ mapa: this.atlas, aditivo: true, side: THREE.DoubleSide, alfa: 0.5 });

    this.escena = new THREE.Scene();
    this.camara = new THREE.PerspectiveCamera(CONFIG.camFov, RW / RH, 0.5, 120);
    this.camara.position.set(...CONFIG.camPos);
    this.camara.lookAt(new THREE.Vector3(...CONFIG.camMira));

    // §4.5-1: todo se renderiza a 320x240 con NearestFilter en mag y min
    this.rt = new THREE.WebGLRenderTarget(RW, RH, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true, stencilBuffer: false,
      format: THREE.RGBAFormat, type: THREE.UnsignedByteType,
    });

    // §4.5-6: posterizado a 32 niveles + dither ordenado de Bayer 4x4
    this.postMat = new THREE.ShaderMaterial({
      uniforms: {
        uEscena:   { value: this.rt.texture },
        uRes:      { value: new THREE.Vector2(RW, RH) },
        uNiveles:  { value: CONFIG.nivelesColor },
        uDither:   { value: CONFIG.ditherFuerza },
        uFlash:    { value: 0 },
        uFlashCol: { value: new THREE.Color(0xFFD166) },
      },
      vertexShader: POST_VERT,
      fragmentShader: POST_FRAG,
      depthTest: false, depthWrite: false,
    });
    this.postEscena = new THREE.Scene();
    this.postEscena.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMat));
    this.postCamara = new THREE.Camera();

    this.ok = true;
    return true;
  },

  // Fogonazo de luz del rescate (§8) y del impacto, hecho en el post: cuesta
  // cero draw calls extra.
  flash(intensidad, color){
    if (!this.ok) return;
    this.postMat.uniforms.uFlash.value = intensidad;
    if (color !== undefined) this.postMat.uniforms.uFlashCol.value.setHex(color);
  },
  decaerFlash(dt){
    const u = this.postMat.uniforms.uFlash;
    if (u.value > 0) u.value = Math.max(0, u.value - dt * 3.2);
  },

  dibujar(){
    if (!this.ok) return;
    this.renderer.info.reset();
    this.renderer.setRenderTarget(this.rt);
    this.renderer.clear();
    this.renderer.render(this.escena, this.camara);
    this.renderer.setRenderTarget(null);
    this.renderer.clear();
    this.renderer.render(this.postEscena, this.postCamara);
  },

  get info(){ return this.renderer ? this.renderer.info : null; },
};

/* --- Letterbox 4:3 (§17.6) ---------------------------------------------
   El canvas es siempre de 320x240; lo que cambia es la caja CSS. En celular va
   centrado y las zonas tactiles ocupan las mitades de TODA la pantalla, no solo
   del canvas, asi que no hace falta rotar el telefono.                      */
export function ajustarLetterbox(){
  const stage = document.getElementById('stage');
  const w = innerWidth, h = innerHeight;
  const escala = Math.min(w / RW, h / RH);
  const cw = Math.floor(RW * escala), ch = Math.floor(RH * escala);
  stage.style.width = cw + 'px';
  stage.style.height = ch + 'px';
  // El HUD se dimensiona en em: una sola linea lo escala entero con la ventana.
  // El 5.5 es el tamaño de la unidad base medido en pixeles INTERNOS, asi que
  // el HUD ocupa siempre la misma fraccion de los 320x240, se vea donde se vea.
  stage.style.fontSize = (ch / RH * 5.5).toFixed(3) + 'px';
}
