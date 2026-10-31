// Simulador del ESP32 para probar la pagina sin hardware (abrir con ?demo=1).
// Imita el mismo protocolo JSON y una version simplificada de la automatizacion del firmware.

export function crearSimulador(alEstado, alConfig) {
  const u = { tmax: 28, smin: 35, ln: 25, ta: 5 };
  let reglas = [];
  let modo = "A";
  const s = { li: 0, le: 0, f: 0, b: 0, al: 0 };
  let t = 26.5, h = 55, suelo = 42, luz = 70;
  let personaHasta = 0, presenciaDesde = 0;
  let alarma = false, silenciada = false, numAlarmas = 0;
  let paso = 0;

  const publicarConfig = () => alConfig(JSON.stringify({ u, r: reglas }));
  const hayPersona = () => Date.now() < personaHasta;

  function leerSensor(k) {
    const hm = new Date().getHours() * 100 + new Date().getMinutes();
    return { t, h, s: suelo, l: luz, p: hayPersona() ? 1 : 0, hm }[k];
  }

  // Igual que automatizar() del firmware
  function automatizar() {
    if (luz < u.ln) s.le = 1; else if (luz > u.ln + 10) s.le = 0;
    if (t >= u.tmax) s.f = 1; else if (t < u.tmax - 0.5) s.f = 0;
    if (suelo < u.smin) s.b = 1; else if (suelo >= u.smin + 10) s.b = 0;
    if (!hayPersona()) { alarma = false; silenciada = false; }
    else if (!alarma && !silenciada && Date.now() - presenciaDesde >= u.ta * 1000) { alarma = true; numAlarmas++; }
    s.al = alarma ? 1 : 0;
    for (const r of reglas) {
      const v = leerSensor(r.s);
      const cumple = (r.o === "<" && v < r.x) || (r.o === ">" && v > r.x) || (r.o === "=" && Math.abs(v - r.x) < 0.5);
      if (cumple) s[r.d] = r.v;
    }
  }

  function silenciar() {
    alarma = false;
    silenciada = hayPersona();
    s.al = 0;
  }

  function tic() {
    paso++;
    // Sensores que cambian lentamente, con efecto de los actuadores
    luz = Math.max(0, Math.min(100, Math.round(50 + 45 * Math.sin(paso / 90))));
    t += (Math.random() - 0.5) * 0.15 + (s.f ? -0.05 : 0) + (luz > 60 ? 0.02 : -0.02);
    t = Math.max(12, Math.min(36, t));
    h = Math.max(30, Math.min(85, h + (Math.random() - 0.5)));
    suelo = Math.max(0, Math.min(100, suelo + (s.b ? 1.5 : -0.08)));
    if (!hayPersona()) presenciaDesde = 0;
    if (modo === "A") automatizar();
    const hm = new Date().getHours() * 100 + new Date().getMinutes();
    alEstado(JSON.stringify({
      t: Math.round(t * 10) / 10, h: Math.round(h), s: Math.round(suelo), l: luz,
      p: leerSensor("p"), hm, m: modo, ...s, as: silenciada ? 1 : 0, na: numAlarmas,
    }));
  }

  setInterval(tic, 1000);
  publicarConfig();
  tic();

  return {
    enviar(c) {
      // Pequeña demora para imitar la red
      setTimeout(() => {
        if (c.c === "modo" && (c.v === "A" || c.v === "M")) modo = c.v;
        else if (c.c === "set" && c.d === "al" && !c.v) silenciar();   // apagar la alarma, en cualquier modo
        else if (c.c === "set" && c.d in s && (modo === "M" || c.d === "li")) s[c.d] = c.v ? 1 : 0;
        else if (c.c === "alarma") silenciar();
        else if (c.c === "cfg" && c.k in u) { u[c.k] = c.v; publicarConfig(); }
        else if (c.c === "regla+" && reglas.length < 6) { reglas = reglas.filter((r) => r.i !== c.r.i).concat(c.r); publicarConfig(); }
        else if (c.c === "regla-") { reglas = reglas.filter((r) => r.i !== c.i); publicarConfig(); }
        else if (c.c === "demo-persona") {   // solo existe en el simulador: una persona durante 12 s
          if (!hayPersona()) presenciaDesde = Date.now();
          personaHasta = Date.now() + 12000;
        }
        tic();
      }, 150);
    },
  };
}
