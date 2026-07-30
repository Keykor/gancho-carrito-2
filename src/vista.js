/* ===========================================================================
   Vista — la capa 3D. LEE el estado logico y lo dibuja; nunca lo decide (§15).
   Ademas resuelve la punteria (§7.1), que es lo unico que necesita saber
   proyectar el mundo a la pantalla, y por eso el Player la recibe inyectada.
   =========================================================================== */
import * as THREE from 'three';
import { CONFIG, NCARRILES, clamp, lerp, reducedMotion } from './config.js';
import { GeoFactory } from './geo.js';
import { MATS } from './shaders.js';
import { TIPO, HOOKEABLE } from './entities.js';

const [RW, RH] = CONFIG.resInterna;
const PRIORIDAD = { [TIPO.COMPANIERA]: 3, [TIPO.MURCIELAGO]: 2, [TIPO.GEMA]: 1 };

// Altura a la que "vive" cada tipo, PARA DIBUJARLO Y PARA APUNTARLE. Tienen
// que ser la misma: la companiera se proyectaba a y=0 (los pies) pero se dibuja
// a 0.35, asi que uno le clickeaba el cuerpo y el punto de asistencia quedaba
// abajo, fuera de los 28 px. Por eso "no la agarraba el gancho".
const ALTURA = [0.62, 0.42, 0.46, 1.05, 0.06, 0, 0.80];
const easeOutVista = t => 1 - (1 - t) * (1 - t);

/* scroll = todo lo que viene hacia Rufa (se le aplica el offset de
   interpolacion entre ticks). fijo = el carrito y lo que va montado en el,
   que no scrollea porque Rufa esta quieta en el origen (§5).               */
export class Vista {
  constructor(scroll, fijo, camara){
    this.scroll = scroll;
    this.fijo = fijo;
    this.camara = camara;

    // Una InstancedMesh por tipo de entidad, dimensionada al maximo
    // simultaneo. Nunca se crea ni se destruye un mesh en runtime (§9).
    const nuevo = (geo, n, mat) => {
      const m = new THREE.InstancedMesh(geo, mat || MATS.psx, n);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3);
      m.instanceColor.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      scroll.add(m);
      return m;
    };

    this.gemas   = nuevo(GeoFactory.gema(), CONFIG.pool.gema, MATS.gema);
    this.trampas = [0,1,2].map(v => nuevo(GeoFactory.trampaFija(v), CONFIG.pool.trampa));
    this.moviles = nuevo(GeoFactory.trampaMovil(), CONFIG.pool.movil);
    this.murcis  = nuevo(GeoFactory.murcielago(), CONFIG.pool.murcielago, MATS.bicho);
    this.desvios = nuevo(GeoFactory.desvio(1), CONFIG.pool.desvio, MATS.psxDoble);
    this.vigas   = nuevo(GeoFactory.viga(), CONFIG.pool.viga);
    // la sombra va sin luz: es una señal, no escenografia, y tiene que leerse
    // igual de nitida caiga donde caiga
    this.marcas  = nuevo(GeoFactory.marcaViga(), CONFIG.pool.viga, MATS.gancho);

    // Particulas de polvo y piedritas (§6). Un solo draw call.
    this.polvo = nuevo(GeoFactory.particula(), CONFIG.pool.particula, MATS.polvo);
    this.particulas = Array.from({ length: CONFIG.pool.particula }, () => ({
      vivo:false, x:0, y:0, z:0, vy:0, vida:0, escala:1 }));

    // Chispas del gancho: sprite aditivo de 2 frames (§7.6)
    this.chispas = nuevo(GeoFactory.chispa(), CONFIG.pool.chispa, MATS.chispa);
    this.chispasEst = Array.from({ length: CONFIG.pool.chispa }, () => ({
      vivo:false, x:0, y:0, z:0, vida:0 }));

    // --- Carrito: una malla por cantidad de vagones, se intercambian (§8) --
    this.carritos = [0,1,2,3,4].map(v => {
      const m = new THREE.Mesh(GeoFactory.carrito(v), MATS.psx);
      m.visible = false; m.frustumCulled = false;
      fijo.add(m);
      return m;
    });
    this.carritoActual = 0;
    this.carritos[0].visible = true;

    // --- Rufa y las companieras arriba del carrito ------------------------
    this.rufa = GeoFactory.minera(0, true);
    fijo.add(this.rufa);
    this.compsArriba = [1,2,3,4].map(i => {
      const o = GeoFactory.minera(i, true);
      o.visible = false;
      fijo.add(o);
      return o;
    });

    // --- Companieras del mundo (las que todavia estan en el saliente) -----
    this.compsMundo = Array.from({ length: CONFIG.pool.companiera }, () => {
      const o = GeoFactory.minera(1, false);
      o.visible = false;
      scroll.add(o);
      return o;
    });

    // --- Gancho: cadena de 6 cajitas, un solo objeto reusado (§7.6) -------
    this.gancho = new THREE.Mesh(GeoFactory.ganchoCadena(), MATS.gancho);
    this.gancho.visible = false;
    this.gancho.frustumCulled = false;
    fijo.add(this.gancho);
    // La punta va sin luz: es la unica parte que el jugador sigue con la vista.
    this.ganchoPunta = new THREE.Mesh(GeoFactory.ganchoPunta(), MATS.gancho);
    this.ganchoPunta.visible = false;
    this.ganchoPunta.frustumCulled = false;
    fijo.add(this.ganchoPunta);

    this._m = new THREE.Matrix4();
    this._p = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3(1,1,1);
    this._v = new THREE.Vector3();
    this._e = new THREE.Euler();
    this._col = new THREE.Color();
    this._raycaster = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
    this.faseGema = 0;
    this.faseAnim = 0;
    this.frameAnim = 0;
    this.tPolvo = 0;
  }

  reset(){
    for (const p of this.particulas) p.vivo = false;
    for (const c of this.chispasEst) c.vivo = false;
    for (const o of this.compsArriba) o.visible = false;
    for (const o of this.compsMundo) o.visible = false;
    this.gancho.visible = false;
    this.ganchoPunta.visible = false;
    this.setVagones(0);
    this.faseGema = this.faseAnim = 0;
  }

  setVagones(n){
    n = clamp(n, 0, 4);
    if (n === this.carritoActual) return;
    this.carritos[this.carritoActual].visible = false;
    this.carritoActual = n;
    this.carritos[n].visible = true;
  }

  /* --- posicion de mundo de una entidad ------------------------------- */
  puntoDe(e){
    // carrilVis, no carril: se dibuja donde se esta yendo, no donde ya salto
    const cx = CONFIG.carrilesX;
    const c = clamp(e.carrilVis, 0, cx.length - 1);
    const i = Math.floor(c), f = c - i;
    const xCarril = i >= cx.length - 1 ? cx[cx.length - 1] : lerp(cx[i], cx[i + 1], f);
    const x = e.tipo === TIPO.COMPANIERA
      ? e.lado * (CONFIG.paredX - 0.4)
      : xCarril + (e.ancho > 1 ? (e.ancho - 1) * 0.7 : 0);
    let y = e.tipo === TIPO.VIGA ? e.y : ALTURA[e.tipo];
    // el murcielago aletea de arriba abajo: si el bamboleo esta en el dibujo
    // pero no aca, se le apunta a un punto que no es donde se lo ve
    if (e.tipo === TIPO.MURCIELAGO) y += Math.sin(this.faseAnim * 7 + e.fase) * 0.18;
    return { x, y, z: e.z };
  }

  proyectar(x, y, z, out){
    this._v.set(x, y, z).project(this.camara);
    out.x = (this._v.x * 0.5 + 0.5) * RW;
    out.y = (1 - (this._v.y * 0.5 + 0.5)) * RH;
    out.detras = this._v.z > 1;
    return out;
  }

  /* --- §7.1 Apuntado ---------------------------------------------------
     Alcance maximo 14 u: lo que esta mas lejos NO es hookeable todavia,
     aunque se vea. Eso es lo que crea la ventana de timing.
     Asistencia obligatoria de 28 px, prioridad companiera > murcielago > gema.
     La pared es el fallback: es enorme y siempre esta.                     */
  objetivoBajo(px, py, mundo, xCarrito){
    let mejor = null, mejorPri = -1, mejorDist = Infinity;
    const tmp = { x:0, y:0, detras:false };
    for (const e of mundo.ents){
      if (!e.vivo || !HOOKEABLE[e.tipo]) continue;
      if (e.z > 1.5) continue;
      const p = this.puntoDe(e);
      const d3 = Math.hypot(p.x - xCarrito, p.z);
      // la companiera esta en el saliente, mas alla de la pared: se le perdona
      // el alcance mientras corra a la par, si no nunca entra en rango
      if (d3 > CONFIG.hookAlcance && !(e.tipo === TIPO.COMPANIERA && e.estado === 1)) continue;
      this.proyectar(p.x, p.y, p.z, tmp);
      if (tmp.detras) continue;
      const d = Math.hypot(tmp.x - px, tmp.y - py);
      // Fallarle el click a la companiera o al bicho no es un error
      // interesante: en un caso te perdes la mecanica entera, en el otro
      // convertis una oferta (§7.4) en un obstaculo. Los dos van con radio
      // ampliado; la gema no, porque de esas hay muchas y estan quietas.
      const radio = CONFIG.hookAsistenciaPx *
        (e.tipo === TIPO.COMPANIERA ? CONFIG.asistCompaniera :
         e.tipo === TIPO.MURCIELAGO ? CONFIG.asistMurcielago : 1);
      if (d > radio) continue;
      const pri = PRIORIDAD[e.tipo] || 0;
      if (pri > mejorPri || (pri === mejorPri && d < mejorDist)){
        mejor = e; mejorPri = pri; mejorDist = d;
      }
    }
    return mejor;
  }

  masCercano(mundo, xCarrito){
    let mejor = null, mejorD = Infinity;
    for (const e of mundo.ents){
      if (!e.vivo || !HOOKEABLE[e.tipo]) continue;
      if (e.z > 1.5) continue;
      const p = this.puntoDe(e);
      const d = Math.hypot(p.x - xCarrito, p.z);
      if (d > CONFIG.hookAlcance) continue;
      const pri = (PRIORIDAD[e.tipo] || 0) * 0.001;
      if (d - pri < mejorD){ mejor = e; mejorD = d - pri; }
    }
    return mejor;
  }

  /* Punto de pared + que clase de tiron sale de ese angulo (§7.2).
     El corte esta en los 35° respecto del eje del tunel: pegar al lado tuyo
     es tiron lateral maximo, pegar bien adelante es sobre todo hacia adelante. */
  paredDesde(xCarrito, lado, zObjetivo){
    const z = clamp(zObjetivo, -CONFIG.hookAlcance, 1.5);
    const punto = { x: lado * CONFIG.paredX, y: 0.95, z };
    const dx = Math.abs(punto.x - xCarrito);
    const ang = Math.atan2(dx, Math.abs(z));
    const perp = ang > CONFIG.hookAnguloCorte;
    const cfg = perp ? CONFIG.hookTironPerp : CONFIG.hookTironRas;
    return { clase:'pared', punto,
             tiron: { lado, perp, carriles: cfg.carriles, dur: cfg.dur } };
  }

  /* La pared bajo el cursor, o null si el click no le pega a ninguna. El §7.2
     decia "clickear cerca del borde de la pantalla siempre es un movimiento de
     carril valido", y de ahi salio resolver CUALQUIER click sin objetivo como
     pared del lado que corresponda. Se saco a pedido: eso hacia que clickear un
     carril te moviera, y el juego es tocar la PARED para moverte. Ahora si el
     click no le pega ni a un objetivo ni a una pared, es gancho al vacio
     (clank y perdes el cooldown), que es lo que dice el §7.0.                */
  paredBajoCursor(px, py){
    this._ndc.set(px / RW * 2 - 1, -(py / RH * 2 - 1));
    this._raycaster.setFromCamera(this._ndc, this.camara);
    const r = this._raycaster.ray;
    let mejor = null;
    for (const lado of [-1, 1]){
      const planoX = lado * CONFIG.paredX;
      if (Math.abs(r.direction.x) < 1e-5) continue;
      const t = (planoX - r.origin.x) / r.direction.x;
      if (t <= 0) continue;
      const y = r.origin.y + r.direction.y * t;
      const z = r.origin.z + r.direction.z * t;
      if (y < -0.3 || y > CONFIG.altoTunel + 0.6) continue;
      if (z > 2 || z < -CONFIG.hookAlcance) continue;
      if (!mejor || t < mejor.t) mejor = { lado, z, t };
    }
    if (mejor) return mejor;

    /* Clickear AFUERA del tunel (el letterbox, arriba del techo, mas alla de
       las paredes) cuenta como clickear la pared de ese lado. Si no, apuntar
       lejos del centro no hace nada y se siente roto — y en celular la zona
       tactil es toda la pantalla (§17.6), asi que la mitad de los taps caen
       fuera del tunel a proposito. */
    /* "Afuera" se decide por el COSTADO de la pantalla, no por si el rayo le
       pega al piso. Antes bastaba con clickear arriba del horizonte para que
       contara como afuera, y tirar el gancho hacia adelante salia para un lado:
       adelante y arriba son la misma zona de pantalla. */
    const suelo = this.planoBajoCursor(px, py);
    const borde = RW * CONFIG.hookBordePantalla;
    if (px < borde)      return { lado: -1, z: clamp(suelo.z, -CONFIG.hookAlcance, 1), t: 0 };
    if (px > RW - borde) return { lado:  1, z: clamp(suelo.z, -CONFIG.hookAlcance, 1), t: 0 };
    if (suelo.dentro && Math.abs(suelo.x) >= CONFIG.paredX - 0.15)
      return { lado: suelo.x < 0 ? -1 : 1, z: clamp(suelo.z, -CONFIG.hookAlcance, 1), t: 0 };
    return null;                     // apuntaste al frente: no hay pared ahi
  }

  // Punto del plano de juego bajo el cursor. Sirve para el gancho al vacio.
  planoBajoCursor(px, py){
    this._ndc.set(px / RW * 2 - 1, -(py / RH * 2 - 1));
    this._raycaster.setFromCamera(this._ndc, this.camara);
    const r = this._raycaster.ray;
    // dentro=false cuando el rayo se va por arriba del horizonte y no toca
    // nunca el piso: ahi no hay punto de mundo que valga, es "afuera".
    if (Math.abs(r.direction.y) < 1e-5) return { x:0, z:-CONFIG.hookAlcance, dentro:false };
    const t = (0.55 - r.origin.y) / r.direction.y;
    if (t <= 0) return { x:0, z:-CONFIG.hookAlcance, dentro:false };
    return { x: r.origin.x + r.direction.x * t,
             z: clamp(r.origin.z + r.direction.z * t, -CONFIG.hookAlcance, 2),
             dentro: true };
  }

  // El resolver que recibe el Player: traduce un evento de input a objetivo.
  hacerResolver(mundo, player){
    const self = this;
    const fn = ev => {
      const x = player.x;
      if (ev.tipo === 'pared'){
        // teclado: siempre perpendicular, 2 carriles (§7.7). Camino completo
        // pero inferior a proposito: no elegis ni el angulo ni el objetivo.
        const p = { x: ev.lado * CONFIG.paredX, y: 0.95, z: -0.2 };
        return { clase:'pared', punto:p,
                 tiron:{ lado: ev.lado, perp: true,
                         carriles: CONFIG.hookTironPerp.carriles,
                         dur: CONFIG.hookTironPerp.dur } };
      }
      if (ev.tipo === 'cercano'){
        const e = self.masCercano(mundo, x);
        if (e) return { clase:'entidad', ent:e, punto: self.puntoDe(e) };
        return self.paredDesde(x, x <= 0 ? -1 : 1, -3);
      }
      // apuntado
      const e = self.objetivoBajo(ev.x, ev.y, mundo, x);
      if (e) return { clase:'entidad', ent:e, punto: self.puntoDe(e) };
      const pared = self.paredBajoCursor(ev.x, ev.y);
      if (pared) return self.paredDesde(x, pared.lado, pared.z);
      const plano = self.planoBajoCursor(ev.x, ev.y);
      return { clase:'vacio', punto: { x: plano.x, y: 0.5, z: plano.z } };
    };
    fn.puntoDe = e => self.puntoDe(e);
    return fn;
  }

  /* --- particulas ------------------------------------------------------ */
  emitirPolvo(x, y, z, n, disp){
    if (reducedMotion) return;                 // §16: sin particulas ambientales
    for (let k = 0; k < n; k++){
      const p = this.particulas.find(q => !q.vivo);
      if (!p) return;
      p.vivo = true;
      p.x = x + (Math.random() - 0.5) * disp;
      p.y = y + (Math.random() - 0.5) * disp * 0.5;
      p.z = z + (Math.random() - 0.5) * disp;
      p.vy = -1.2 - Math.random() * 2.2;
      p.vida = 0.7 + Math.random() * 1.1;
      p.escala = 0.6 + Math.random() * 1.5;
    }
  }

  emitirChispa(x, y, z){
    const c = this.chispasEst.find(q => !q.vivo);
    if (!c) return;
    c.vivo = true; c.x = x; c.y = y; c.z = z; c.vida = 0.12;
  }

  /* --- sincronizacion por frame --------------------------------------- */
  paso(dt, mundo, player, t, vel, tramo){
    this.faseGema += dt * 2.6;
    this.faseAnim += dt;
    // §13: animacion a 10 fps con la interpolacion apagada
    this.frameAnim = Math.floor(this.faseAnim * 10);

    this.sincronizarEntidades(dt, mundo, player, vel);
    this.sincronizarCarrito(dt, player, vel);
    this.sincronizarGancho(player);
    this.pasoParticulas(dt, vel, t);
  }

  sincronizarEntidades(dt, mundo, player, vel){
    // §9: las gemas rotan con UNA sola matriz compartida por frame — todas
    // giran igual y nadie lo nota.
    this._e.set(0, this.faseGema, 0.22);
    const qGema = new THREE.Quaternion().setFromEuler(this._e);

    for (const g of [this.gemas, this.moviles, this.murcis, this.desvios, this.vigas,
                     this.marcas, ...this.trampas]) g.count = 0;

    const empujar = (malla, p, q, s, tinte) => {
      if (malla.count >= malla.instanceMatrix.count) return;
      this._m.compose(p, q, s);
      const i = malla.count++;
      malla.setMatrixAt(i, this._m);
      malla.instanceColor.setXYZ(i, tinte.r, tinte.g, tinte.b);
    };

    const blanco = this._col.setRGB(1, 1, 1);
    const resalte = new THREE.Color(2.1, 1.9, 1.3);    // Nene: contorno luminoso
    // Todo lo que te lastima va un escalon mas claro que la roca: si un
    // obstaculo se confunde con la pared, no es dificil, es injusto.
    const peligro = new THREE.Color(1.45, 1.25, 1.15);

    for (const e of mundo.ents){
      const muriendo = e.muriendo > 0;
      if (!e.vivo && !muriendo) continue;
      const pos = this.puntoDe(e);
      this._p.set(pos.x, pos.y, pos.z);
      const escalaMuerte = muriendo ? clamp(e.muriendo / 0.22, 0, 1) : 1;

      // Nene (§8): los obstaculos se marcan 1 s antes de entrar en pantalla
      const segundos = vel > 0 ? (0 - e.z) / vel : 99;
      const marcada = player.hab.nene && segundos > 0 && segundos < CONFIG.neneAviso
                      && (e.tipo === TIPO.TRAMPA || e.tipo === TIPO.MOVIL || e.tipo === TIPO.VIGA);
      const tinte = marcada ? resalte : (e.tipo === TIPO.GEMA ? blanco : peligro);

      switch (e.tipo){
        case TIPO.GEMA:
          this._s.setScalar(escalaMuerte * 1.0);
          empujar(this.gemas, this._p, qGema, this._s, blanco);
          break;
        case TIPO.TRAMPA: {
          const v = (e.variante | 0) % 3;
          this._q.setFromAxisAngle({x:0,y:1,z:0}, (e.semilla % 100) / 100 * 0.5 - 0.25);
          this._s.setScalar(escalaMuerte);
          empujar(this.trampas[v], this._p, this._q, this._s, tinte);
          break;
        }
        case TIPO.MOVIL: {
          // se inclina hacia donde se esta corriendo: la vagoneta "toma" el
          // desvio en vez de deslizarse de costado como un mueble
          const deriva = clamp((e.carril - e.carrilVis) * 1.6, -0.5, 0.5);
          this._e.set(0, deriva * 0.30, -deriva * 0.22);
          this._q.setFromEuler(this._e);
          this._s.setScalar(escalaMuerte);
        }
          empujar(this.moviles, this._p, this._q, this._s, tinte);
          break;
        case TIPO.MURCIELAGO: {
          // aleteo a 10 fps: el stepping es tan de la epoca como el temblor
          const ala = (this.frameAnim + (e.semilla & 3)) % 2 ? 1 : 0.45;
          this._q.setFromAxisAngle({x:0,y:0,z:1}, 0);
          this._s.set(escalaMuerte, escalaMuerte * ala, escalaMuerte);
          empujar(this.murcis, this._p, this._q, this._s, tinte);
          break;
        }
        case TIPO.DESVIO:
          this._q.setFromAxisAngle({x:0,y:1,z:0}, e.lado < 0 ? Math.PI : 0);
          this._s.setScalar(1);
          empujar(this.desvios, this._p, this._q, this._s, tinte);
          break;
        case TIPO.VIGA:
          this._q.setFromAxisAngle({x:0,y:0,z:1}, 0.05);
          this._s.set(e.ancho / 2.4, 1, 1);
          empujar(this.vigas, this._p, this._q, this._s, tinte);
          // sombra en el piso: se emite polvo justo debajo mientras cae
          if (e.cayendo && Math.random() < 0.5)
            this.emitirPolvo(pos.x, 0.1, pos.z, 1, e.ancho * 1.2);
          break;
      }
    }

    for (const g of [this.gemas, this.moviles, this.murcis, this.desvios, this.vigas,
                     this.marcas, ...this.trampas]){
      g.instanceMatrix.needsUpdate = true;
      g.instanceColor.needsUpdate = true;
      g.visible = g.count > 0;
    }

    // --- companieras que siguen en el saliente --------------------------
    let iC = 0;
    for (const e of mundo.vivos(TIPO.COMPANIERA)){
      const rescatandose = !e.vivo && e.muriendo > 0;
      if ((!e.vivo && !rescatandose) || iC >= this.compsMundo.length) continue;
      const o = this.compsMundo[iC++];
      o.visible = true;
      const p = this.puntoDe(e);
      if (rescatandose){
        // la cadena la trae: vuela del saliente al carrito en vez de esfumarse
        const k = 1 - clamp(e.muriendo / 0.34, 0, 1);
        const kk = easeOutVista(k);
        o.position.set(lerp(p.x, player.x, kk),
                       lerp(0.35, 0.85, kk) + Math.sin(kk * Math.PI) * 0.55,
                       lerp(p.z, 0.3, kk));
        o.rotation.y = (e.lado < 0 ? 0.5 : -0.5) + kk * 6.0;
        o.userData.brazo.rotation.x = -2.2;
        if (Math.random() < 0.6) this.emitirChispa(o.position.x, o.position.y, o.position.z);
        continue;
      }
      o.position.set(p.x, 0.30 + (e.estado === 1 ? Math.abs(Math.sin(this.faseAnim * 12)) * 0.12 : 0), p.z);
      o.rotation.y = e.lado < 0 ? 0.5 : -0.5;
      // corre desesperada al costado; si no la enganchas, se frena
      o.userData.brazo.rotation.x = e.estado === 1
        ? Math.sin(this.faseAnim * 14) * 1.5 - 1.9 : -0.3;
      if (e.estado === 1 && Math.random() < 0.25)
        this.emitirPolvo(p.x, 0.15, p.z, 1, 0.4);
    }
    for (; iC < this.compsMundo.length; iC++) this.compsMundo[iC].visible = false;
  }

  sincronizarCarrito(dt, player, vel){
    const x = player.x;
    const comps = player.companieras.length;
    this.setVagones(comps);
    const carrito = this.carritos[this.carritoActual];

    // el carrito rebota un poco con la velocidad: es todo el "peso" que hace falta
    const bote = reducedMotion ? 0 : Math.sin(this.faseAnim * 26) * 0.012 * (vel / 30);
    carrito.position.set(x, bote, 0);
    carrito.rotation.z = player.enTransicion
      ? (CONFIG.carrilesX[player.carrilDestino] - CONFIG.carrilesX[player.carrilOrigen]) * -0.06 : 0;

    // Rufa parpadea durante la invulnerabilidad (§10). A 10 fps completos era
    // un estrobo; a la mitad se lee como "me pegaron" y no como un bug.
    const parpadeo = player.invul > 0 && (Math.floor(player.invul * 8) % 2 === 0);
    this.rufa.visible = !parpadeo;
    this.rufa.position.set(x, 0.62 + bote, 0.05);
    this.rufa.rotation.z = carrito.rotation.z;
    // el brazo tira el gancho: 10 fps, sin interpolar
    const g = player.gancho;
    this.rufa.userData.brazo.rotation.x = g.fase === 1 ? -2.4 : g.fase === 2 ? -1.5 : -0.25;

    for (let i = 0; i < 4; i++){
      const o = this.compsArriba[i];
      const idx = player.companieras[i];
      if (idx === undefined){ o.visible = false; continue; }
      o.visible = !parpadeo || true;
      o.position.set(x, 0.62 + bote, 0.05 + (i + 1) * CONFIG.vagonSepar);
      o.rotation.z = carrito.rotation.z;
      // idle simple: reaccionan a los sustos
      const susto = player.invul > 0 ? 0.5 : 0;
      o.userData.brazo.rotation.x = -0.25 + Math.sin(this.faseAnim * 5 + i) * 0.2 - susto;
      o.position.y += Math.sin(this.faseAnim * 5 + i * 1.7) * 0.015;
    }
  }

  /* §7.6: la cadena se estira desde el carrito hasta el punto de impacto.
     Es un solo objeto reusado, nunca se instancia uno nuevo.               */
  sincronizarGancho(player){
    const g = player.gancho;
    if (g.fase === 0){ this.gancho.visible = this.ganchoPunta.visible = false; return; }
    const desde = new THREE.Vector3(player.x + 0.22, 0.95, 0.05);
    const hasta = new THREE.Vector3(g.destino.x, g.destino.y, g.destino.z);
    let p = 1;
    if (g.fase === 1) p = clamp(g.t / g.dur, 0, 1);
    else p = 1 - clamp(g.t / CONFIG.hookRetraccion, 0, 1);
    const punta = desde.clone().lerp(hasta, p);
    const largo = desde.distanceTo(punta);
    if (largo < 0.05){ this.gancho.visible = this.ganchoPunta.visible = false; return; }
    this.gancho.visible = true;
    this.gancho.position.copy(desde);
    this.gancho.lookAt(punta);
    this.gancho.scale.set(1, 1, largo / 1.0);
    // la punta viaja en la punta y NO se escala: mide lo mismo cerca que lejos
    this.ganchoPunta.visible = true;
    this.ganchoPunta.position.copy(punta);
    this.ganchoPunta.quaternion.copy(this.gancho.quaternion);
    this.ganchoPunta.rotation.z += this.faseAnim * 9;   // gira: se nota al vuelo
    // chispita en la punta mientras vuela: dice a donde va antes de llegar
    if (g.fase === 1 && this.frameAnim % 2 === 0)
      this.emitirChispa(punta.x, punta.y, punta.z);
  }

  pasoParticulas(dt, vel, t){
    // §6: durante toda la partida caen piedritas y polvo del techo
    if (!reducedMotion){
      this.tPolvo -= dt;
      if (this.tPolvo <= 0){
        this.tPolvo = 0.06;
        const z = -8 - Math.random() * 30;
        this.emitirPolvo((Math.random() - 0.5) * 6, CONFIG.altoTunel - 0.3, z, 2, 1.5);
      }
    }

    this.polvo.count = 0;
    this._q.identity();
    for (const p of this.particulas){
      if (!p.vivo) continue;
      p.vida -= dt;
      if (p.vida <= 0){ p.vivo = false; continue; }
      p.vy -= 6 * dt;
      p.y += p.vy * dt;
      p.z += vel * dt;
      if (p.y < 0.02 || p.z > CONFIG.zReciclado){ p.vivo = false; continue; }
      if (this.polvo.count >= CONFIG.pool.particula) break;
      this._p.set(p.x, p.y, p.z);
      this._s.setScalar(p.escala * clamp(p.vida, 0, 1));
      this._m.compose(this._p, this._q, this._s);
      this.polvo.setMatrixAt(this.polvo.count++, this._m);
    }
    this.polvo.instanceMatrix.needsUpdate = true;
    this.polvo.visible = this.polvo.count > 0;

    this.chispas.count = 0;
    for (const c of this.chispasEst){
      if (!c.vivo) continue;
      c.vida -= dt;
      if (c.vida <= 0){ c.vivo = false; continue; }
      // sprite de 2 frames: chico y grande, nada mas
      const f = c.vida > 0.06 ? 1.0 : 0.55;
      this._p.set(c.x, c.y, c.z);
      this._s.setScalar(f);
      this._m.compose(this._p, this._q, this._s);
      this.chispas.setMatrixAt(this.chispas.count++, this._m);
    }
    this.chispas.instanceMatrix.needsUpdate = true;
    this.chispas.visible = this.chispas.count > 0;
  }
}
