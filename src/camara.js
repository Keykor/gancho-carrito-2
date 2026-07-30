/* ===========================================================================
   CameraRig — §5. Camara 3/4 alta: elevada y picada, atras del carrito. Esta
   mas arriba de lo que pediria un runner comun porque con el gancho apuntado
   hay que leer el frente y clickear con precision: aplanar la escena hacia el
   plano de juego es lo que hace confiable apuntar.
   YAW FIJO EN 0 [CONFIRMADO]: con un gancho apuntado, cualquier offset lateral
   hace que una pared se vea mas grande que la otra y ese lado pasa a ser
   objetivamente mas facil de clickear.
   =========================================================================== */
import * as THREE from 'three';
import { CONFIG, clamp, lerp, easeOut, reducedMotion } from './config.js';

export class CameraRig {
  constructor(camara){
    this.cam = camara;
    this.mira = new THREE.Vector3();
    this.reset();
  }

  reset(){
    this.x = 0;
    this.roll = 0;
    this.rollObj = 0;
    this.shake = 0;
    this.fase = 0;
    this.atras = 0;
  }

  // El tiron se siente violento porque la camara llega tarde (§5)
  sacudir(fuerza){ if (!reducedMotion) this.shake = Math.max(this.shake, fuerza); }

  // Roll de hasta 4° hacia el lado del tiron, de vuelta a 0 con easeOut
  rolar(lado, fuerza = 1){
    if (reducedMotion) return;
    this.rollObj = clamp(-lado * CONFIG.camRollMax * fuerza, -CONFIG.camRollMax, CONFIG.camRollMax);
  }

  paso(dt, xCarrito, t, comps = 0){
    // sigue el carril con lag: factor 0.12 por tick, no por segundo
    const k = 1 - Math.pow(1 - CONFIG.camLag, dt * CONFIG.tickHz);
    this.x = lerp(this.x, xCarrito, k);

    this.rollObj = lerp(this.rollObj, 0, 1 - Math.pow(0.001, dt));
    this.roll = lerp(this.roll, this.rollObj, 1 - Math.pow(0.0001, dt));

    // §6: durante toda la partida cae polvo y el shake sube con t
    const p = clamp(t / CONFIG.duracion, 0, 1);
    const ambiental = reducedMotion ? 0 : CONFIG.shakeBase + CONFIG.shakeConT * p * p;
    this.shake = Math.max(0, this.shake - dt * 1.9);
    const s = ambiental + this.shake;

    this.fase += dt * 41;
    const jx = s * Math.sin(this.fase) * 0.8;
    const jy = s * Math.sin(this.fase * 1.71 + 1.3) * 0.6;

    const [cx, cy, cz] = CONFIG.camPos;
    // La camara se abre un poco por cada companiera: el carrito crece hacia
    // atras (§8) y sin esto el ultimo vagon queda detras de la camara, con lo
    // que el rescate no se ve — y el crecimiento del carrito ES el feedback.
    this.atras = lerp(this.atras, comps * CONFIG.camAtrasPorComp, 1 - Math.pow(0.02, dt));
    this.cam.position.set(this.x * 0.55 + cx + jx, cy + jy + this.atras * 0.35,
                          cz + this.atras);
    this.mira.set(this.x * 0.28 + CONFIG.camMira[0], CONFIG.camMira[1], CONFIG.camMira[2]);
    this.cam.up.set(Math.sin(this.roll), Math.cos(this.roll), 0);
    this.cam.lookAt(this.mira);
    this.cam.rotation.z += 0;                       // yaw 0: nada de ladeo lateral
    this.cam.updateMatrixWorld();
  }
}
