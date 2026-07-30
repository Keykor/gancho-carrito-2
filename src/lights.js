/* ===========================================================================
   Lights — §13, §4.5-4. Hasta 5 spots calculadas EN EL VERTEX SHADER, mas un
   cono aditivo por lampara. Cada companiera rescatada enciende la suya: el
   mundo literalmente se ve mejor cuanta mas gente rescatas. Por eso el limite
   de 5 es un limite de diseño y no una restriccion tecnica a sortear.
   =========================================================================== */
import * as THREE from 'three';
import { CONFIG, clamp, lerp, reducedMotion } from './config.js';
import { GeoFactory } from './geo.js';
import { MATS, LUCES_U, MAX_LUCES } from './shaders.js';

export class Lights {
  constructor(escena){
    // Un solo InstancedMesh para los 5 conos: un draw call, el truco exacto que
    // usaban los juegos de la epoca.
    this.conos = new THREE.InstancedMesh(GeoFactory.conoLuz(), MATS.cono, MAX_LUCES);
    this.conos.frustumCulled = false;
    this.conos.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.conos.count = 0;
    escena.add(this.conos);

    this._m = new THREE.Matrix4();
    this._p = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this.fase = 0;
    this.reset();
  }

  reset(){
    this.n = 1;                       // solo Rufa al arrancar
    this.fase = 0;
    LUCES_U.uNumLuces.value = 1;
    for (let i = 0; i < MAX_LUCES; i++) LUCES_U.uLuzInt.value[i] = i === 0 ? CONFIG.luzRufa : 0;
  }

  // Cada rescate suma una lampara: mas luz, mas tunel visible (§13)
  encender(n){ this.n = clamp(n, 1, MAX_LUCES); }

  /* xCarrito: x del carrito; comps: cuantas companieras van arriba.
     Las lamparas van escalonadas hacia atras, una por vagon. */
  paso(dt, xCarrito, comps, vel){
    this.fase += dt * 7;
    const total = clamp(1 + comps, 1, MAX_LUCES);
    this.n = total;
    LUCES_U.uNumLuces.value = total;
    this.conos.count = total;

    const bob = reducedMotion ? 0 : Math.sin(this.fase) * 0.035;

    for (let i = 0; i < MAX_LUCES; i++){
      if (i >= total){ LUCES_U.uLuzInt.value[i] = 0; continue; }
      const z = i * 1.45 + 0.1;                       // un vagon mas por companiera
      const y = 1.16 + (i === 0 ? bob : bob * 0.6);
      const x = xCarrito + (i === 0 ? 0 : (i % 2 ? 0.16 : -0.16));

      LUCES_U.uLuzPos.value[i].set(x, y, z);
      // apunta hacia adelante y un poco hacia abajo: revela los obstaculos
      // recien cuando entran en el cono, mas alla la niebla
      LUCES_U.uLuzDir.value[i].set(0, -0.24, -1).normalize();
      LUCES_U.uLuzInt.value[i] = i === 0 ? CONFIG.luzRufa : CONFIG.luzCompaniera;

      // el cono visible: geometria con blending aditivo y textura de degrade
      this._p.set(x, y, z);
      this._q.setFromEuler(new THREE.Euler(-0.235, 0, 0));
      const largo = 26 + i * 1.5;
      this._s.set(4.6, 4.6, largo);
      this._m.compose(this._p, this._q, this._s);
      this.conos.setMatrixAt(i, this._m);
    }
    this.conos.instanceMatrix.needsUpdate = true;
  }
}
