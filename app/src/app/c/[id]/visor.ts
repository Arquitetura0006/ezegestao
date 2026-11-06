// Visualizador IFC (That Open Engine, MIT). Só roda no navegador: importe com import().
// Os IFCs são convertidos uma vez para Fragments (.frag) no envio; a tela abre o .frag.
import * as THREE from "three";
import * as OBC from "@thatopen/components";
import type { FragmentsModel } from "@thatopen/fragments";
import type { Camera, Elemento } from "@/lib/coord";

export type Pick = Elemento & { ponto: [number, number, number] };

const FUNDO = "#f4f5f7";
const DESTAQUE = { color: new THREE.Color("#16181d"), opacity: 1, transparent: false, renderedFaces: 1 };

function valor(d: unknown): string | null {
  if (d && typeof d === "object" && "value" in (d as Record<string, unknown>)) {
    const v = (d as { value: unknown }).value;
    return v == null ? null : String(v);
  }
  return null;
}

export class Visor {
  private components: OBC.Components;
  private world: OBC.SimpleWorld<OBC.SimpleScene, OBC.SimpleCamera, OBC.SimpleRenderer>;
  private fragments: OBC.FragmentsManager;
  private clipper: OBC.Clipper;
  private destacado: { modelo: string; localId: number } | null = null;
  private transparente = false;
  private ocultos = new Set<string>();
  private ifcPronto = false;

  private constructor(el: HTMLElement) {
    this.components = new OBC.Components();
    const worlds = this.components.get(OBC.Worlds);
    this.world = worlds.create<OBC.SimpleScene, OBC.SimpleCamera, OBC.SimpleRenderer>();
    this.world.scene = new OBC.SimpleScene(this.components);
    this.world.scene.setup();
    this.world.scene.three.background = new THREE.Color(FUNDO);
    this.world.renderer = new OBC.SimpleRenderer(this.components, el, { antialias: true, preserveDrawingBuffer: true });
    this.world.camera = new OBC.SimpleCamera(this.components);
    this.components.init();
    const logo = this.world.renderer.logo;
    if (logo) {
      logo.style.left = "auto";
      logo.style.right = "10px";
      logo.style.bottom = "10px";
      logo.style.opacity = ".55";
    }
    this.components.get(OBC.Grids).create(this.world);

    this.fragments = this.components.get(OBC.FragmentsManager);
    this.fragments.init("/bim/worker.mjs");
    const controls = this.world.camera.controls;
    controls.addEventListener("update", () => this.fragments.core.update());
    controls.addEventListener("rest", () => this.fragments.core.update(true));
    this.fragments.list.onItemSet.add(({ value: model }) => {
      model.useCamera(this.world.camera.three);
      this.world.scene.three.add(model.object);
      this.fragments.core.update(true);
    });

    this.clipper = this.components.get(OBC.Clipper);
    this.clipper.enabled = false;
    controls.setLookAt(30, 22, 30, 0, 0, 0, false);
  }

  static async criar(el: HTMLElement) {
    return new Visor(el);
  }

  get canvas(): HTMLCanvasElement {
    return this.world.renderer!.three.domElement;
  }

  get modelos(): string[] {
    return [...this.fragments.list.keys()];
  }

  // ---------- Modelos ----------
  async carregar(id: string, dados: ArrayBuffer) {
    if (this.fragments.list.has(id)) await this.remover(id);
    await this.fragments.core.load(dados, { modelId: id, camera: this.world.camera.three });
    if (this.transparente) await this.fragments.list.get(id)?.setOpacity(undefined, 0.25);
    if (this.ocultos.has(id)) this.fragments.list.get(id)!.object.visible = false;
    await this.fragments.core.update(true);
  }

  async remover(id: string) {
    if (!this.fragments.list.has(id)) return;
    await this.fragments.core.disposeModel(id);
  }

  setVisivel(id: string, visivel: boolean) {
    if (visivel) this.ocultos.delete(id);
    else this.ocultos.add(id);
    const m = this.fragments.list.get(id);
    if (m) m.object.visible = visivel;
    this.fragments.core.update(true);
  }

  async setTransparente(on: boolean) {
    this.transparente = on;
    for (const m of this.fragments.list.values()) {
      if (on) await m.setOpacity(undefined, 0.25);
      else await m.resetOpacity(undefined);
    }
    await this.fragments.core.update(true);
  }

  async enquadrar() {
    const caixa = new THREE.Box3();
    for (const [id, m] of this.fragments.list) {
      if (this.ocultos.has(id)) continue;
      caixa.union(m.box);
    }
    if (caixa.isEmpty()) return;
    const esfera = caixa.getBoundingSphere(new THREE.Sphere());
    await this.world.camera.controls.fitToSphere(esfera, true);
  }

  // ---------- Câmera e imagem ----------
  camera(): Camera {
    const p = this.world.camera.controls.getPosition(new THREE.Vector3());
    const t = this.world.camera.controls.getTarget(new THREE.Vector3());
    const r = (v: number) => Math.round(v * 1000) / 1000;
    return { p: [r(p.x), r(p.y), r(p.z)], t: [r(t.x), r(t.y), r(t.z)] };
  }

  async irPara(c: Camera, animar = true) {
    await this.world.camera.controls.setLookAt(c.p[0], c.p[1], c.p[2], c.t[0], c.t[1], c.t[2], animar);
    await this.fragments.core.update(true);
  }

  print(largura = 1600): string {
    const r = this.world.renderer!.three;
    r.render(this.world.scene.three, this.world.camera.three);
    const src = r.domElement;
    const escala = Math.min(1, largura / src.width);
    const c = document.createElement("canvas");
    c.width = Math.round(src.width * escala);
    c.height = Math.round(src.height * escala);
    c.getContext("2d")!.drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.86);
  }

  // Posição na tela de um ponto 3D (para os marcadores dos apontamentos)
  projetar(p: [number, number, number]): { x: number; y: number; frente: boolean } {
    const v = new THREE.Vector3(p[0], p[1], p[2]).project(this.world.camera.three);
    const el = this.canvas;
    return { x: ((v.x + 1) / 2) * el.clientWidth, y: ((1 - v.y) / 2) * el.clientHeight, frente: v.z < 1 && v.z > -1 };
  }

  // ---------- Seleção ----------
  async escolher(clientX: number, clientY: number): Promise<Pick | null> {
    const res = await this.fragments.raycast({
      camera: this.world.camera.three,
      mouse: new THREE.Vector2(clientX, clientY),
      dom: this.canvas,
    });
    if (!res) return null;
    const model = res.fragments as FragmentsModel;
    const modelo = model.modelId;
    if (this.ocultos.has(modelo)) return null;
    let nome: string | null = null;
    let categoria: string | null = null;
    let guid: string | null = null;
    try {
      const [d] = await model.getItemsData([res.localId], { attributesDefault: true });
      const dd = d as Record<string, unknown>;
      nome = valor(dd.Name) ?? valor(dd.ObjectType);
      categoria = valor(dd._category);
      guid = valor(dd._guid) ?? valor(dd.GlobalId);
    } catch {}
    const r = (v: number) => Math.round(v * 1000) / 1000;
    return { modelo, localId: res.localId, nome, categoria, guid, ponto: [r(res.point.x), r(res.point.y), r(res.point.z)] };
  }

  async destacar(e: { modelo: string; localId: number } | null) {
    if (this.destacado) {
      const m = this.fragments.list.get(this.destacado.modelo);
      try {
        await m?.resetHighlight([this.destacado.localId]);
      } catch {}
      this.destacado = null;
    }
    if (e) {
      const m = this.fragments.list.get(e.modelo);
      if (m) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await m.highlight([e.localId], DESTAQUE as any);
        this.destacado = e;
      }
    }
    await this.fragments.core.update(true);
  }

  // ---------- Corte ----------
  set corte(on: boolean) {
    this.clipper.enabled = on;
  }
  get corte() {
    return this.clipper.enabled;
  }
  async criarCorte() {
    if (!this.clipper.enabled) return;
    await this.clipper.create(this.world);
  }
  limparCortes() {
    this.clipper.deleteAll();
    this.fragments.core.update(true);
  }

  // ---------- Conversão IFC → Fragments (no envio) ----------
  async converter(ifc: Uint8Array, nome: string, progresso?: (p: number) => void): Promise<Uint8Array> {
    const loader = this.components.get(OBC.IfcLoader);
    if (!this.ifcPronto) {
      await loader.setup({ autoSetWasm: false, wasm: { path: "/bim/", absolute: true } });
      this.ifcPronto = true;
    }
    const tmp = `conv-${Date.now()}`;
    const model = await loader.load(ifc, false, tmp, {
      processData: { progressCallback: (p: number) => progresso?.(p) },
    } as never);
    const buf = await model.getBuffer(false);
    await this.fragments.core.disposeModel(model.modelId ?? tmp);
    return new Uint8Array(buf);
  }

  dispose() {
    try {
      this.components.dispose();
    } catch {}
  }
}
