// EGon 3D compacto para telas pequenas (login do painel): mesmo boneco do totem, num canvas próprio.
import {
  WebGLRenderer, Scene, PerspectiveCamera, HemisphereLight, DirectionalLight, PMREMGenerator, NeutralToneMapping, Vector3,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Egon } from './egon3d.js';

export function criarEgonMini(canvas) {
  let renderer;
  try { renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true }); } catch { canvas.hidden = true; return null; }
  renderer.setClearColor(0x000000, 0); renderer.toneMapping = NeutralToneMapping;
  const cena = new Scene();
  cena.environment = new PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  cena.add(new HemisphereLight(0xCFE4FF, 0x0A1430, 0.9));
  const luz = new DirectionalLight(0xffffff, 2); luz.position.set(3, 5, 8); cena.add(luz);
  const contra = new DirectionalLight(0x3D8BFF, 2.2); contra.position.set(-5, 3, -4); cena.add(contra);
  const camera = new PerspectiveCamera(24, 1, 0.5, 50); camera.position.set(0, 1.2, 6.1); camera.lookAt(0, 1.12, 0);
  const egon = new Egon(); cena.add(egon.raiz);
  egon.setAcao('acenar'); egon.setExpressao('piscar');
  let base = 'idle'; let temp = null;
  const api = {
    egon,
    acao(nome, ms) { clearTimeout(temp); egon.setAcao(nome); if (ms) temp = setTimeout(() => egon.setAcao(base), ms); else base = nome; },
    expressao(nome) { egon.setExpressao(nome); },
    gesto(nome) { egon.gesto(nome); },
    olharPara(x, y) { // coordenadas da tela
      const r = canvas.getBoundingClientRect();
      const nx = ((x - r.left) / r.width - 0.5) * 6; const ny = 1.5 - ((y - r.top) / r.height - 0.5) * 4;
      egon.olharAlvo.set(nx, ny, 6);
    },
    parar() { rodando = false; },
  };
  setTimeout(() => { egon.setAcao('idle'); egon.setExpressao('normal'); }, 2200);
  addEventListener('pointermove', (e) => api.olharPara(e.clientX, e.clientY), { passive: true });
  let rodando = true; let ult = performance.now();
  const ajustar = () => {
    const w = canvas.clientWidth; const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * Math.min(devicePixelRatio, 2))) {
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    }
  };
  const loop = (t) => {
    if (!rodando) return;
    const dt = Math.max(0, Math.min(0.05, (t - ult) / 1000)); ult = t;
    if (canvas.offsetParent) { ajustar(); if (dt > 0) egon.atualizar(dt, camera); renderer.render(cena, camera); }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  void Vector3;
  return api;
}
