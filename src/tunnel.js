/* ===========================================================================
   TunnelPool — §5. 16 segmentos en un pool circular: el que sale por atras se
   recicla al frente. Con la niebla a 45 u nunca se ve el final del pool.
   Los segmentos con z > -6 van SIN TECHO: el techo ya se derrumbo atras tuyo,
   asi la camara alta no se come el techo. No hace falta fade ni clipping, es
   geometria que directamente no existe.
   =========================================================================== */
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { GeoFactory } from './geo.js';
import { MATS } from './shaders.js';
import { TX, TextureGen } from './texturas.js';

const VARIANTES = 4;

export class TunnelPool {
  constructor(escena){
    const N = CONFIG.segmentosVivos;
    this.escena = escena;
    this.mallasTecho = [];
    this.mallasAbierto = [];

    for (let v = 0; v < VARIANTES; v++){
      const conT = new THREE.InstancedMesh(
        GeoFactory.tunelSegmento(0xA100 + v * 977, true), MATS.psx, N);
      const sinT = new THREE.InstancedMesh(
        GeoFactory.tunelSegmento(0xA100 + v * 977, false), MATS.psx, N);
      for (const m of [conT, sinT]){
        m.frustumCulled = false;
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.count = 0;
        escena.add(m);
      }
      this.mallasTecho.push(conT);
      this.mallasAbierto.push(sinT);
    }

    // Rieles y durmientes: una tira por carril con las UVs desplazandose. Mas
    // barato y se ve mejor que modelar durmientes (§5).
    const largo = CONFIG.zReciclado - CONFIG.zSpawn + 8;
    this.rieles = new THREE.Mesh(GeoFactory.rieles(largo), MATS.rieles);
    this.durmientes = new THREE.Mesh(GeoFactory.durmientes(largo), MATS.durmiente);
    this.rieles.frustumCulled = this.durmientes.frustumCulled = false;
    escena.add(this.durmientes, this.rieles);

    // La luz del fondo del tunel: en el tramo 5 se ve la salida acercandose
    const r = TextureGen.uv(TX.CHISPA);
    const g = new THREE.PlaneGeometry(6, 4);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++)
      uv.setXY(i, r.u0 + uv.getX(i) * (r.u1 - r.u0), r.v0 + uv.getY(i) * (r.v1 - r.v0));
    this.salida = new THREE.Mesh(g, MATS.chispa.clone());
    this.salida.material.uniforms.uAlfa = { value: 0 };
    this.salida.position.set(0, 1.8, -44);
    this.salida.visible = false;
    escena.add(this.salida);

    this.segmentos = [];
    this.reset();
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._v = new THREE.Vector3(1, 1, 1);
    this._p = new THREE.Vector3();
  }

  reset(){
    this.segmentos.length = 0;
    const L = CONFIG.largoSegmento;
    for (let i = 0; i < CONFIG.segmentosVivos; i++){
      this.segmentos.push({ z: CONFIG.zReciclado - i * L, variante: i % VARIANTES });
    }
    this.uvScroll = 0;
    this.salida.visible = false;
    this.salida.material.uniforms.uAlfa.value = 0;
  }

  paso(dt, vel, tramo, t){
    const L = CONFIG.largoSegmento;
    const zMin = CONFIG.zReciclado - CONFIG.segmentosVivos * L;
    for (const s of this.segmentos){
      s.z += vel * dt;
      if (s.z - L > CONFIG.zReciclado){
        // se recicla al frente y se le re-randomiza la silueta (§5)
        s.z -= CONFIG.segmentosVivos * L;
        s.variante = (s.variante + 1 + ((Math.random() * (VARIANTES - 1)) | 0)) % VARIANTES;
      }
    }
    // el desplazamiento de UV a alta velocidad es el efecto de los rieles
    this.uvScroll = (this.uvScroll + vel * dt * 0.5) % 1;
    MATS.rieles.uniforms.uUvScroll.value.set(0, -this.uvScroll);
    MATS.durmiente.uniforms.uUvScroll.value.set(0, -this.uvScroll * 0.454);

    // Tramo 5: la salida se acerca y se agranda. Es la recompensa (§6).
    if (tramo >= 5){
      this.salida.visible = true;
      const tr = CONFIG.tramos[4];
      const p = Math.min(1, (t - tr.t0) / (tr.t1 - tr.t0));
      this.salida.position.z = -44 + p * 38;
      this.salida.scale.setScalar(1 + p * 3.2);
      this.salida.material.uniforms.uAlfa.value = 0.35 + p * 0.65;
    }
    this.sincronizar();
  }

  sincronizar(){
    for (let v = 0; v < VARIANTES; v++){
      this.mallasTecho[v].count = 0;
      this.mallasAbierto[v].count = 0;
    }
    for (const s of this.segmentos){
      const abierto = s.z > CONFIG.zSinTecho;
      const malla = abierto ? this.mallasAbierto[s.variante] : this.mallasTecho[s.variante];
      this._p.set(0, 0, s.z);
      this._m.compose(this._p, this._q, this._v);
      malla.setMatrixAt(malla.count++, this._m);
    }
    for (let v = 0; v < VARIANTES; v++){
      this.mallasTecho[v].instanceMatrix.needsUpdate = true;
      this.mallasAbierto[v].instanceMatrix.needsUpdate = true;
    }
  }
}
