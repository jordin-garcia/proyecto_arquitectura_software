// Fondo animado: red de particulas que reacciona al puntero (estilo holograma).
export function iniciarFondo(canvas) {
  const ctx = canvas.getContext("2d");
  const reducir = matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Telefonos y tabletas: menos resolucion y particulas para no agotar la memoria grafica
  const tactil = matchMedia("(hover: none) and (pointer: coarse)").matches;
  let w = 0, h = 0, puntos = [], cuadro = 0;
  const raton = { x: -9999, y: -9999 };
  let color = [53, 214, 255];
  let colorMeta = color;

  function medir() {
    const dpr = tactil ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(Math.min(tactil ? 50 : 120, (w * h) / 13000));
    puntos = Array.from({ length: n }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.18,
      vy: (Math.random() - 0.5) * 0.18 - 0.04,
      r: Math.random() * 1.5 + 0.4,
      a: Math.random() * 0.55 + 0.2,
      fase: Math.random() * Math.PI * 2,
    }));
  }

  function dibujar(t) {
    color = color.map((c, i) => c + (colorMeta[i] - c) * 0.04);
    const [r, g, b] = color.map(Math.round);
    ctx.clearRect(0, 0, w, h);
    for (const p of puntos) {
      if (!reducir) {
        p.x += p.vx;
        p.y += p.vy;
        const dx = p.x - raton.x, dy = p.y - raton.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 140 * 140) {   // el puntero empuja suavemente las particulas
          const f = (1 - Math.sqrt(d2) / 140) * 0.6;
          p.x += (dx / 140) * f;
          p.y += (dy / 140) * f;
        }
        if (p.x < -10) p.x = w + 10; else if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10; else if (p.y > h + 10) p.y = -10;
      }
      const brillo = p.a * (0.7 + 0.3 * Math.sin(t / 900 + p.fase));
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r},${g},${b},${brillo})`;
      ctx.fill();
    }
    // Lineas entre particulas cercanas y hacia el puntero
    ctx.lineWidth = 0.6;
    for (let i = 0; i < puntos.length; i++) {
      const a = puntos[i];
      for (let j = i + 1; j < puntos.length; j++) {
        const bb = puntos[j];
        const dx = a.x - bb.x, dy = a.y - bb.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 110 * 110) {
          ctx.strokeStyle = `rgba(${r},${g},${b},${(1 - Math.sqrt(d2) / 110) * 0.16})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(bb.x, bb.y);
          ctx.stroke();
        }
      }
      const dx = a.x - raton.x, dy = a.y - raton.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < 180 * 180) {
        ctx.strokeStyle = `rgba(${r},${g},${b},${(1 - Math.sqrt(d2) / 180) * 0.4})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(raton.x, raton.y);
        ctx.stroke();
      }
    }
    if (!reducir) cuadro = requestAnimationFrame(dibujar);
  }

  medir();
  let anchoMedido = window.innerWidth;
  cuadro = requestAnimationFrame(dibujar);
  window.addEventListener("resize", () => {
    // En el celular la barra de direcciones cambia la altura al deslizar. Rehacer
    // el lienzo en cada cambio lo borraba y la pantalla parpadeaba en negro:
    // solo se vuelve a medir si cambia el ancho (por ejemplo, al girar el telefono).
    if (tactil && window.innerWidth === anchoMedido) return;
    anchoMedido = window.innerWidth;
    medir();
    if (reducir) dibujar(0);
  });
  window.addEventListener("pointermove", (e) => { raton.x = e.clientX; raton.y = e.clientY; }, { passive: true });
  document.addEventListener("pointerleave", () => { raton.x = raton.y = -9999; });
  document.addEventListener("visibilitychange", () => {
    cancelAnimationFrame(cuadro);
    if (!document.hidden && !reducir) cuadro = requestAnimationFrame(dibujar);
  });

  return {
    // "normal" (cian) o "alerta" (rojo)
    tono(nombre) {
      colorMeta = nombre === "alerta" ? [255, 77, 109] : [53, 214, 255];
      if (reducir) { color = colorMeta; dibujar(0); }
    },
  };
}
