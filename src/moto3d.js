// Moto custom 3D do EGon (estilo cruiser), montada com formas simples nas cores da Exclusive Gold.
// A frente da moto aponta para +z; o EGon senta no banco. Ela "materializa" e some com efeito holográfico.
import {
  Group, Mesh, Quaternion, MeshPhysicalMaterial, MeshStandardMaterial, MeshBasicMaterial, CylinderGeometry, TorusGeometry, SphereGeometry,
  BoxGeometry, CapsuleGeometry, CircleGeometry, PlaneGeometry, AdditiveBlending, CanvasTexture, SRGBColorSpace, MathUtils,
} from 'three';

const { clamp } = MathUtils;
const MAT = {
  azul: new MeshPhysicalMaterial({ color: 0x0F5BE8, roughness: 0.22, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 0.8 }),
  branco: new MeshPhysicalMaterial({ color: 0xEEF2F8, roughness: 0.3, clearcoat: 0.8, envMapIntensity: 0.7 }),
  cromo: new MeshStandardMaterial({ color: 0xDDE6F2, roughness: 0.12, metalness: 1, envMapIntensity: 1.3 }),
  preto: new MeshStandardMaterial({ color: 0x16191F, roughness: 0.6, metalness: 0.2 }),
  pneu: new MeshStandardMaterial({ color: 0x0E1014, roughness: 0.9 }),
  ouro: new MeshPhysicalMaterial({ color: 0xFFC531, roughness: 0.25, metalness: 0.6, clearcoat: 1 }),
  farol: new MeshBasicMaterial({ color: 0xFFF3C4, toneMapped: false }),
  lanterna: new MeshBasicMaterial({ color: 0xFF3B4E, toneMapped: false }),
};
const holo = new MeshBasicMaterial({ color: 0x55E6FF, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false });

// Pontos de apoio do piloto, em coordenadas da moto (x = lado). O EGon encaixa mãos e pés aqui.
export const PONTOS_MOTO = { manopla: [0.46, 1.5, 0.28], pedaleira: [0.3, 0.62, 0.0], assento: [0, 0.985, -0.28] };

const m = (geo, mat, x = 0, y = 0, z = 0) => { const o = new Mesh(geo, mat); o.position.set(x, y, z); return o; };
// cilindro entre dois pontos (y,z) no plano da moto
function tubo(r, mat, [y1, z1], [y2, z2], x = 0) {
  const dy = y2 - y1; const dz = z2 - z1; const len = Math.hypot(dy, dz);
  const t = m(new CylinderGeometry(r, r, len, 12), mat, x, (y1 + y2) / 2, (z1 + z2) / 2);
  t.rotation.x = Math.atan2(dz, dy); return t;
}

function roda(raio) {
  const g = new Group();
  const pneu = m(new TorusGeometry(raio, 0.085, 14, 40), MAT.pneu); pneu.rotation.y = Math.PI / 2; g.add(pneu);
  const aro = m(new TorusGeometry(raio - 0.075, 0.022, 8, 40), MAT.cromo); aro.rotation.y = Math.PI / 2; g.add(aro);
  const giro = new Group(); g.add(giro);
  for (let i = 0; i < 10; i++) { const r = m(new BoxGeometry(0.012, raio * 2 - 0.16, 0.018), MAT.cromo); r.rotation.x = (i / 10) * Math.PI; giro.add(r); }
  const cubo = m(new CylinderGeometry(0.07, 0.07, 0.16, 16), MAT.cromo); cubo.rotation.z = Math.PI / 2; giro.add(cubo);
  const disco = m(new CylinderGeometry(raio * 0.45, raio * 0.45, 0.012, 24), MAT.cromo, 0.06, 0, 0); disco.rotation.z = Math.PI / 2; giro.add(disco);
  g.userData.giro = giro; return g;
}

function texturaFumaca() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d');
  const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(210,225,245,.55)'); gr.addColorStop(1, 'rgba(210,225,245,0)');
  c.fillStyle = gr; c.fillRect(0, 0, 64, 64); const t = new CanvasTexture(cv); t.colorSpace = SRGBColorSpace; return t;
}

export function criarMoto(texEmblema) {
  const moto = new Group();      // posição/escala controladas pelo palco
  const corpo = new Group(); moto.add(corpo); // inclina nas curvas e vibra
  const R = 0.42;
  const traseira = roda(R); traseira.position.set(0, R, -1.0); corpo.add(traseira);
  const dianteira = roda(R * 0.95); dianteira.position.set(0, R * 0.95, 1.12); corpo.add(dianteira);

  // garfo (inclinado, estilo chopper) e guidão alto
  [-0.11, 0.11].forEach((x) => corpo.add(tubo(0.035, MAT.cromo, [R * 0.95, 1.12], [1.22, 0.72], x)));
  corpo.add(tubo(0.05, MAT.preto, [1.12, 0.78], [1.3, 0.68]));
  const guidao = new Group(); guidao.position.set(0, 1.3, 0.66); corpo.add(guidao);
  [-1, 1].forEach((s) => {
    guidao.add(tubo(0.024, MAT.cromo, [0, 0], [0.2, -0.36], s * 0.12));
    const barra = m(new CylinderGeometry(0.022, 0.022, 0.32, 10), MAT.cromo, s * 0.26, 0.2, -0.38); barra.rotation.z = Math.PI / 2; guidao.add(barra);
    const manopla = m(new CylinderGeometry(0.038, 0.038, 0.14, 10), MAT.preto, s * 0.46, 0.2, -0.38); manopla.rotation.z = Math.PI / 2; guidao.add(manopla);
    const espelho = m(new CircleGeometry(0.05, 16), MAT.cromo, s * 0.36, 0.42, -0.34); guidao.add(espelho);
    guidao.add(tubo(0.008, MAT.cromo, [0.2, -0.38], [0.4, -0.34], s * 0.35));
  });
  // farol
  const farol = m(new SphereGeometry(0.13, 20, 16), MAT.cromo, 0, 1.08, 0.86); farol.scale.z = 0.8; corpo.add(farol);
  const luz = m(new CircleGeometry(0.1, 24), MAT.farol, 0, 1.08, 0.965); corpo.add(luz);
  const brilhoFarol = m(new PlaneGeometry(0.9, 0.9), new MeshBasicMaterial({ map: texturaFumaca(), color: 0xFFF1B8, transparent: true, opacity: 0.8, blending: AdditiveBlending, depthWrite: false, toneMapped: false }), 0, 1.08, 0.98);
  corpo.add(brilhoFarol);

  // quadro
  corpo.add(tubo(0.045, MAT.preto, [1.12, 0.74], [0.55, -0.9]));
  corpo.add(tubo(0.04, MAT.preto, [0.95, -0.15], [0.55, -0.95]));
  corpo.add(tubo(0.04, MAT.preto, [1.1, 0.72], [0.42, 0.2]));
  // tanque com faixa dourada e escudo da EG
  const tanque = m(new SphereGeometry(0.5, 32, 20), MAT.azul, 0, 1.03, 0.4); tanque.scale.set(0.48, 0.34, 0.78); corpo.add(tanque);
  const faixa = m(new SphereGeometry(0.505, 32, 6, 0, Math.PI * 2, 1.45, 0.22), MAT.ouro, 0, 1.03, 0.4); faixa.scale.set(0.48, 0.34, 0.78); corpo.add(faixa);
  if (texEmblema) {
    [-1, 1].forEach((s) => {
      const e = m(new PlaneGeometry(0.2, 0.2), new MeshBasicMaterial({ map: texEmblema, transparent: true, depthWrite: false, toneMapped: false }), s * 0.242, 1.03, 0.38);
      e.rotation.y = s * Math.PI / 2; corpo.add(e);
    });
  }
  // banco
  const banco = m(new CapsuleGeometry(0.17, 0.5, 6, 14), MAT.preto, 0, 0.9, -0.28); banco.rotation.x = Math.PI / 2; banco.scale.set(1.05, 1, 0.5); corpo.add(banco);
  const encosto = m(new CapsuleGeometry(0.1, 0.12, 6, 12), MAT.preto, 0, 1.0, -0.66); encosto.rotation.x = Math.PI / 2; encosto.scale.set(1.2, 1, 0.6); corpo.add(encosto);
  // motor V2 cromado
  const bloco = m(new BoxGeometry(0.3, 0.26, 0.42), MAT.preto, 0, 0.5, 0.05); corpo.add(bloco);
  [[-0.32, 0.18], [0.32, -0.08]].forEach(([inc, z]) => {
    const cil = m(new CylinderGeometry(0.1, 0.11, 0.34, 16), MAT.cromo, 0, 0.74, z); cil.rotation.x = inc; corpo.add(cil);
    for (let i = 0; i < 4; i++) { const al = m(new CylinderGeometry(0.13, 0.13, 0.018, 16), MAT.cromo, 0, 0.66 + i * 0.05, z + i * Math.sin(inc) * 0.05); al.rotation.x = inc; corpo.add(al); }
  });
  const tampa = m(new CylinderGeometry(0.12, 0.12, 0.06, 20), MAT.cromo, 0.17, 0.48, 0.1); tampa.rotation.z = Math.PI / 2; corpo.add(tampa);
  // escapamentos duplos
  [0.42, 0.56].forEach((y, i) => {
    const esc = m(new CylinderGeometry(0.045, 0.05, 1.25, 14), MAT.cromo, 0.2, y - 0.08, -0.45 - i * 0.05); esc.rotation.x = Math.PI / 2 - 0.08; corpo.add(esc);
    const ponta = m(new CylinderGeometry(0.058, 0.05, 0.12, 14), MAT.cromo, 0.2, y - 0.13, -1.1 - i * 0.05); ponta.rotation.x = Math.PI / 2 - 0.08; corpo.add(ponta);
  });
  // para-lamas
  const plTras = m(new TorusGeometry(R + 0.06, 0.11, 8, 24, Math.PI * 0.75), MAT.azul, 0, R, -1.0); plTras.rotation.set(0, Math.PI / 2, Math.PI * 0.3); plTras.scale.set(1, 1, 0.9); corpo.add(plTras);
  const plFrente = m(new TorusGeometry(R * 0.95 + 0.05, 0.08, 8, 20, Math.PI * 0.55), MAT.azul, 0, R * 0.95, 1.12); plFrente.rotation.set(0, Math.PI / 2, Math.PI * 0.32); corpo.add(plFrente);
  const lant = m(new BoxGeometry(0.14, 0.05, 0.03), MAT.lanterna, 0, 0.98, -1.42); corpo.add(lant);
  // pedaleiras (onde o EGon apoia os pés)
  [-1, 1].forEach((s) => {
    const [px, py, pz] = PONTOS_MOTO.pedaleira;
    const p = m(new CylinderGeometry(0.03, 0.03, 0.2, 10), MAT.cromo, s * px, py - 0.06, pz); p.rotation.z = Math.PI / 2; corpo.add(p);
    corpo.add(tubo(0.018, MAT.cromo, [py - 0.06, pz], [0.5, pz - 0.05], s * (px - 0.1)));
  });
  // descanso lateral
  const descanso = tubo(0.018, MAT.cromo, [0.4, -0.1], [0.04, -0.05], -0.18); corpo.add(descanso);

  // casca holográfica para aparecer/sumir
  const casca = new Group(); corpo.add(casca);
  const malhas = []; corpo.traverse((o) => { if (o.isMesh && !o.material.transparent) malhas.push(o); });
  malhas.forEach((o) => { const h = new Mesh(o.geometry, holo); h.position.copy(o.position); h.rotation.copy(o.rotation); h.scale.copy(o.scale).multiplyScalar(1.03); (o.parent === corpo ? casca : o.parent).add(h); });

  // fumaça do escapamento
  const texF = texturaFumaca(); const fumacas = [];
  for (let i = 0; i < 14; i++) { const f = m(new PlaneGeometry(0.3, 0.3), new MeshBasicMaterial({ map: texF, transparent: true, opacity: 0, depthWrite: false })); f.visible = false; moto.add(f); fumacas.push({ f, vida: 1 }); }
  let proxFumaca = 0;

  let presenca = 0; let alvoPresenca = 0; let distancia = 0;
  moto.userData = { descanso };
  moto.aparecer = (sim) => { alvoPresenca = sim ? 1 : 0; };
  moto.visivel = () => presenca > 0.01;
  moto.atualizar = (dt, t, velLocal, camera) => {
    // aparece crescendo do chão com brilho; some ao contrário
    presenca += (alvoPresenca - presenca) * (1 - Math.exp(-(alvoPresenca ? 4 : 6) * dt));
    if (Math.abs(alvoPresenca - presenca) < 0.002) presenca = alvoPresenca;
    moto.visible = presenca > 0.01;
    if (!moto.visible) return;
    const p = presenca;
    corpo.scale.set(clamp(p * 1.15, 0, 1) || 0.001, Math.max(0.001, p), clamp(p * 1.15, 0, 1) || 0.001);
    const flash = Math.sin(Math.min(1, p) * Math.PI);
    holo.opacity = Math.max(0, flash * 0.75 + (alvoPresenca ? 0 : (1 - p) * 0.4));
    // rodas giram conforme a velocidade; motor vibra; descanso recolhe andando
    const v = velLocal; distancia += v * dt;
    traseira.userData.giro.rotation.x = distancia / R; dianteira.userData.giro.rotation.x = distancia / (R * 0.95);
    corpo.position.y = Math.sin(t * 55) * 0.004 * p;
    corpo.rotation.x = clamp(-v * 0.004, -0.06, 0.06);
    descanso.visible = !!moto.estacionada;
    brilhoFarol.material.opacity = 0.55 + Math.sin(t * 3) * 0.08;
    // fumaça: mais quando acelera
    proxFumaca -= dt * (Math.abs(v) > 0.2 ? 3 : 1);
    if (proxFumaca <= 0 && p > 0.9) {
      proxFumaca = 0.12; const s = fumacas.find((x) => x.vida >= 1);
      if (s) { s.vida = 0; s.f.visible = true; s.f.position.set(0.2, 0.32, -1.2); s.vx = (Math.random() - 0.5) * 0.2; }
    }
    const qCam = new Quaternion(); if (camera) { moto.getWorldQuaternion(qCam); qCam.invert().multiply(camera.quaternion); }
    fumacas.forEach((s) => {
      if (s.vida >= 1) { s.f.visible = false; return; }
      s.vida = Math.min(1, s.vida + dt * 1.1);
      s.f.position.z -= dt * (0.5 + Math.abs(v) * 0.15); s.f.position.y += dt * 0.35; s.f.position.x += s.vx * dt;
      s.f.scale.setScalar(0.6 + s.vida * 2.2); s.f.material.opacity = 0.45 * (1 - s.vida) * p;
      if (camera) s.f.quaternion.copy(qCam);
    });
  };
  return moto;
}
