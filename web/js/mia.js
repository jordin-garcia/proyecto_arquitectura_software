// MIA: avatar animado de la asistente. Una esfera holografica con cara, anillos y ondas.
// Cada estado cambia colores, movimiento y expresion. Las expresiones se interpolan
// cuadro a cuadro para que los ojos y la boca cambien de forma suavemente.

const reducir = matchMedia("(prefers-reduced-motion: reduce)").matches;

// Ojos: w ancho, a curva superior, b curva inferior (iguales = arco), y altura, r giro
const OJOS = {
  feliz: { w: 19, a: -12, b: -12, y: 2, r: 0 },
  abierto: { w: 14, a: -10, b: 10, y: 0, r: 0 },
  atento: { w: 15, a: -12, b: 12, y: -1, r: 0 },
  concentrado: { w: 17, a: -6, b: 4, y: 0, r: 0 },
  cerrado: { w: 17, a: 5, b: 5, y: 4, r: 0 },
  triste: { w: 16, a: -6, b: 6, y: 3, r: 14 },
  alerta: { w: 14, a: -14, b: 14, y: -2, r: -8 },
};
// Boca: w ancho, c curva superior, o apertura (curva inferior = c + o), v visibilidad
const BOCAS = {
  nada: { w: 4, c: 0, o: 0, v: 0 },
  sonrisa: { w: 12, c: 5, o: 0, v: 1 },
  grande: { w: 16, c: 3, o: 8, v: 1 },
  hablar: { w: 10, c: 2, o: 4, v: 1 },
  o: { w: 7, c: -4, o: 9, v: 1 },
  triste: { w: 11, c: -4, o: 0, v: 1 },
};

const EXPRESIONES = {
  reposo: { ojos: "feliz", boca: "nada", mejillas: 0.45 },
  escuchando: { ojos: "atento", boca: "nada", mejillas: 0.2 },
  pensando: { ojos: "concentrado", boca: "nada", mejillas: 0, pensativa: true },
  hablando: { ojos: "feliz", boca: "hablar", mejillas: 0.45 },
  ejecutando: { ojos: "concentrado", boca: "sonrisa", mejillas: 0.15 },
  exito: { ojos: "feliz", boca: "grande", mejillas: 1 },
  error: { ojos: "triste", boca: "triste", mejillas: 0 },
  alerta: { ojos: "alerta", boca: "o", mejillas: 0 },
  dormida: { ojos: "cerrado", boca: "nada", mejillas: 0.3 },
  curiosa: { ojos: "abierto", boca: "sonrisa", mejillas: 0.3 },
  guino: { ojos: "abierto", ojoDer: "feliz", boca: "sonrisa", mejillas: 0.8 },
  cosquillas: { ojos: "feliz", boca: "grande", mejillas: 1 },
};

const instancias = new Set();
let cuadro = 0;
let ultimo = 0;

function bucle(t) {
  const dt = Math.min(64, t - (ultimo || t));
  ultimo = t;
  for (const m of instancias) m._cuadro(t, dt);
  cuadro = instancias.size ? requestAnimationFrame(bucle) : 0;
}
function arrancarBucle() {
  if (!cuadro) cuadro = requestAnimationFrame(bucle);
}

const caminoOjo = (cx, cy, o, cierre) => {
  const w = o.w / 2, a = o.a * cierre, b = o.b * cierre, y = cy + o.y;
  return `M${cx - w} ${y}C${cx - w / 2} ${y + a} ${cx + w / 2} ${y + a} ${cx + w} ${y}C${cx + w / 2} ${y + b} ${cx - w / 2} ${y + b} ${cx - w} ${y}Z`;
};
const caminoBoca = (cx, cy, b) => {
  const w = b.w / 2;
  return `M${cx - w} ${cy}C${cx - w / 2} ${cy + b.c} ${cx + w / 2} ${cy + b.c} ${cx + w} ${cy}C${cx + w / 2} ${cy + b.c + b.o} ${cx - w / 2} ${cy + b.c + b.o} ${cx - w} ${cy}Z`;
};
const copiar = (o) => ({ ...o });
const acercar = (actual, meta, k) => {
  for (const clave in meta) actual[clave] += (meta[clave] - actual[clave]) * k;
};

const PLANTILLA = `
  <div class="mia-halo"></div>
  <div class="mia-haz"></div>
  <svg class="mia-hud" viewBox="0 0 200 200" aria-hidden="true">
    <circle class="hud-marcas" cx="100" cy="100" r="97"/>
    <circle class="hud-arco a" cx="100" cy="100" r="91"/>
    <circle class="hud-arco b" cx="100" cy="100" r="86"/>
    <circle class="hud-accion" cx="100" cy="100" r="78"/>
    <circle class="hud-pulso p1" cx="100" cy="100" r="62"/>
    <circle class="hud-pulso p2" cx="100" cy="100" r="62"/>
  </svg>
  <svg class="mia-orbita atras" viewBox="0 0 200 60" aria-hidden="true">
    <ellipse cx="100" cy="30" rx="96" ry="22"/>
    <circle class="luna" r="3.2"><animateMotion dur="3.2s" repeatCount="indefinite" path="M4 30a96 22 0 1 0 192 0a96 22 0 1 0-192 0"/></circle>
  </svg>
  <div class="mia-cuerpo">
    <div class="mia-esfera">
      <div class="mia-energia"></div>
      <svg class="mia-cara" viewBox="0 0 100 100" aria-hidden="true">
        <g class="mia-rostro">
          <ellipse class="mejilla" cx="24" cy="62" rx="7" ry="3.6"/>
          <ellipse class="mejilla" cx="76" cy="62" rx="7" ry="3.6"/>
          <path class="ojo izq"/>
          <path class="ojo der"/>
          <path class="boca"/>
        </g>
      </svg>
      <div class="mia-reflejo"></div>
    </div>
  </div>
  <svg class="mia-orbita frente" viewBox="0 0 200 60" aria-hidden="true">
    <ellipse cx="100" cy="30" rx="96" ry="22"/>
    <circle class="luna" r="3.2"><animateMotion dur="3.2s" repeatCount="indefinite" path="M4 30a96 22 0 1 0 192 0a96 22 0 1 0-192 0"/></circle>
  </svg>
  <svg class="mia-escucha izq" viewBox="0 0 40 80" aria-hidden="true"><path d="M30 18a28 28 0 0 0 0 44"/><path d="M20 10a40 40 0 0 0 0 60"/><path d="M10 2a52 52 0 0 0 0 76"/></svg>
  <svg class="mia-escucha der" viewBox="0 0 40 80" aria-hidden="true"><path d="M10 18a28 28 0 0 1 0 44"/><path d="M20 10a40 40 0 0 1 0 60"/><path d="M30 2a52 52 0 0 1 0 76"/></svg>
  <div class="mia-barras izq">${"<i></i>".repeat(7)}</div>
  <div class="mia-barras der">${"<i></i>".repeat(7)}</div>
  <div class="mia-base"><i></i><i></i><i></i><b></b></div>
  <div class="mia-chispas">${"<i></i>".repeat(10)}</div>
  <div class="mia-zzz"><span>z</span><span>z</span><span>Z</span></div>
`;

/**
 * Crea a MIA dentro de un contenedor.
 * opciones: { mini: bool (sin HUD ni seguimiento), alNivel(n): recibe el nivel de voz cada cuadro }
 */
export function crearMia(contenedor, opciones = {}) {
  const el = document.createElement("div");
  el.className = `mia${opciones.mini ? " mia--mini" : ""}`;
  el.dataset.estado = "reposo";
  el.innerHTML = PLANTILLA;
  contenedor.append(el);

  const ojoIzq = el.querySelector(".ojo.izq");
  const ojoDer = el.querySelector(".ojo.der");
  const boca = el.querySelector(".boca");
  const mejillas = el.querySelectorAll(".mejilla");
  const rostro = el.querySelector(".mia-rostro");
  el.querySelectorAll(".mia-chispas i").forEach((c, i) => c.style.setProperty("--ang", `${i * 36}deg`));

  let base = "reposo";        // estado que pide la aplicacion
  let temporal = null;        // reaccion corta que se sobrepone (exito, error, guiño...)
  let finTemporal = 0;
  let nivelExterno = 0;       // volumen real del microfono
  let pulso = 0;              // golpes de voz al hablar
  let mirada = null;          // {x, y} de -1 a 1, o null para mirar al frente
  let visible = true;
  let proximoParpadeo = performance.now() + 2000 + Math.random() * 3000;

  const exprInicial = EXPRESIONES.reposo;
  const actual = {
    izq: copiar(OJOS[exprInicial.ojos]), der: copiar(OJOS[exprInicial.ojos]),
    boca: copiar(BOCAS[exprInicial.boca]), mej: exprInicial.mejillas, mx: 0, my: 0, nivel: 0,
  };

  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(el);

  const estadoVisible = () => (temporal && performance.now() < finTemporal ? temporal : base);

  function aplicarClase() {
    const ahora = estadoVisible();
    if (el.dataset.estado !== ahora) el.dataset.estado = ahora;
  }

  const instancia = {
    el,
    get estado() { return estadoVisible(); },
    ponerEstado(estado) {
      if (!EXPRESIONES[estado]) return;
      base = estado;
      // Una alerta o un cambio importante cancelan la reaccion corta
      if (["alerta", "escuchando", "hablando", "pensando"].includes(estado)) temporal = null;
      aplicarClase();
    },
    // Reaccion corta (exito, error, guino, cosquillas, curiosa) que vuelve sola al estado base
    reaccionar(estado, ms = 1600) {
      if (!EXPRESIONES[estado]) return;
      if (base === "alerta" && estado !== "alerta") return;
      temporal = estado;
      finTemporal = performance.now() + ms;
      el.classList.remove("rebote");
      void el.offsetWidth;   // reinicia la animacion de rebote
      el.classList.add("rebote");
      aplicarClase();
    },
    ponerNivel(n) { nivelExterno = n; },
    pulsoVoz() { pulso = Math.min(1, pulso + 0.75); },
    mirar(x, y) { mirada = x == null ? null : { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) }; },
    get nivel() { return actual.nivel; },
    destruir() { instancias.delete(instancia); el.remove(); },

    _cuadro(t, dt) {
      if (temporal && t >= finTemporal) { temporal = null; aplicarClase(); }
      if (!visible) return;
      const estado = estadoVisible();
      const expr = EXPRESIONES[estado];
      const k = 1 - Math.pow(1 - 0.16, dt / 16.7);

      // Nivel de voz: microfono real, golpes por palabra o una onda sintetica
      pulso *= Math.pow(0.9, dt / 16.7);
      let nivelMeta = 0;
      if (estado === "escuchando") nivelMeta = Math.max(nivelExterno, 0.12 + 0.1 * Math.sin(t / 260));
      else if (estado === "hablando") nivelMeta = Math.min(1, 0.25 + 0.45 * Math.abs(Math.sin(t / 95) * Math.sin(t / 157)) + pulso * 0.5);
      else if (estado === "ejecutando") nivelMeta = 0.3 + 0.15 * Math.sin(t / 180);
      else if (estado === "alerta") nivelMeta = 0.5 + 0.5 * Math.abs(Math.sin(t / 160));
      actual.nivel += (nivelMeta - actual.nivel) * Math.min(1, k * 2.2);
      el.style.setProperty("--nivel", actual.nivel.toFixed(3));
      opciones.alNivel?.(actual.nivel, estado);

      // Forma objetivo de ojos y boca
      const metaIzq = OJOS[expr.ojos];
      const metaDer = OJOS[expr.ojoDer || expr.ojos];
      const metaBoca = { ...BOCAS[expr.boca] };
      if (estado === "hablando") metaBoca.o = 2 + actual.nivel * 9;
      acercar(actual.izq, metaIzq, k);
      acercar(actual.der, metaDer, k);
      acercar(actual.boca, metaBoca, k);
      actual.mej += (expr.mejillas - actual.mej) * k;

      // Mirada: sigue al puntero; al pensar mira hacia arriba de un lado a otro
      let mx = 0, my = 0;
      if (expr.pensativa) { mx = Math.sin(t / 900) * 0.7; my = -0.65; }
      else if (estado === "dormida") { mx = 0; my = 0.3; }
      else if (mirada && !opciones.mini) { mx = mirada.x; my = mirada.y; }
      actual.mx += (mx - actual.mx) * k * 0.6;
      actual.my += (my - actual.my) * k * 0.6;

      // Parpadeo natural cada pocos segundos
      let cierre = 1;
      if (!reducir && estado !== "dormida") {
        if (t > proximoParpadeo + 160) proximoParpadeo = t + 2200 + Math.random() * 3800;
        if (t > proximoParpadeo) cierre = Math.max(0.08, Math.abs(1 - ((t - proximoParpadeo) / 80)));
      }

      ojoIzq.setAttribute("d", caminoOjo(35, 47, { ...actual.izq, r: 0 }, cierre));
      ojoDer.setAttribute("d", caminoOjo(65, 47, { ...actual.der, r: 0 }, cierre));
      ojoIzq.setAttribute("transform", `rotate(${actual.izq.r} 35 47)`);
      ojoDer.setAttribute("transform", `rotate(${-actual.der.r} 65 47)`);
      boca.setAttribute("d", caminoBoca(50, 64, actual.boca));
      boca.style.opacity = actual.boca.v.toFixed(2);
      mejillas.forEach((m) => (m.style.opacity = (actual.mej * 0.55).toFixed(2)));
      rostro.setAttribute("transform", `translate(${(actual.mx * 7).toFixed(2)} ${(actual.my * 5).toFixed(2)})`);
      el.style.setProperty("--mx", actual.mx.toFixed(3));
      el.style.setProperty("--my", actual.my.toFixed(3));
    },
  };

  instancias.add(instancia);
  arrancarBucle();
  return instancia;
}
