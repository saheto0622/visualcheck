import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { wrap, btnP, btnS } from "../lib/styles";
import { VT_TESTS } from "../lib/format";
import { clockDialToAxis, estimateCylinder } from "../lib/prescriptionAlgorithm";

// ─── Shared constants ──────────────────────────────────────────────────────
const TOTAL_TESTS = 15;
const TEST_TIMEOUT_MS = 60000;

const DIRS = ["→", "←", "↑", "↓"];
const DIR_ROTATIONS = { "→": "rotate(0deg)", "←": "rotate(180deg)", "↑": "rotate(-90deg)", "↓": "rotate(90deg)" };

function randomDir() { return DIRS[Math.floor(Math.random() * DIRS.length)]; }

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const STEP_LABELS = Object.fromEntries(VT_TESTS.map(t => [t.key, t.label]));

const SEMAFORO_DOT = {
  green:  { dot: "#2a6412", text: "var(--color-text-success)" },
  yellow: { dot: "#a96810", text: "var(--color-text-warning)" },
  red:    { dot: "#c83b3a", text: "var(--color-text-danger)" },
  gray:   { dot: "#9191a8", text: "var(--color-text-tertiary)" },
};

const STEPS = [
  { key: "agudezaLejosOd",        num: 1,  comp: "agudezaLejos", eye: "OD" },
  { key: "agudezaLejosOi",        num: 1,  comp: "agudezaLejos", eye: "OI" },
  { key: "agudezaCercaOd",        num: 2,  comp: "agudezaCerca", eye: "OD" },
  { key: "agudezaCercaOi",        num: 2,  comp: "agudezaCerca", eye: "OI" },
  { key: "sensibilidadContraste", num: 3,  comp: "contraste" },
  { key: "visionColores",         num: 4,  comp: "colores" },
  { key: "amslerOd",              num: 5,  comp: "amsler", eye: "OD" },
  { key: "amslerOi",              num: 5,  comp: "amsler", eye: "OI" },
  { key: "acomodacion",           num: 6,  comp: "acomodacion" },
  { key: "duocromo",              num: 7,  comp: "duocromo" },
  { key: "aniseiconia",           num: 8,  comp: "aniseiconia" },
  { key: "campoVisualOd",         num: 9,  comp: "campoVisual", eye: "OD" },
  { key: "campoVisualOi",         num: 9,  comp: "campoVisual", eye: "OI" },
  { key: "laberinto",             num: 10, comp: "laberinto" },
  { key: "fusionBinocular",       num: 11, comp: "fusion" },
  { key: "estereopsis",           num: 12, comp: "estereopsis" },
  { key: "coordinacionBinocular", num: 13, comp: "coordinacion" },
  { key: "astigmatismo",          num: 14, comp: "astigmatismo" },
  { key: "lenteCruzada",          num: 15, comp: "lenteCruzada" },
];

// ─── Shared UI ───────────────────────────────────────────────────────────────
const CHEER = ["","¡Buen comienzo! 👋","","¡Vas muy bien! 🙌","","¡Más de la mitad! 💪","","¡Vas excelente! ⭐","","¡Casi terminas! 🔥","","¡Increíble! 🎯","","¡Última prueba! 🏁",""];

function TestShell({ num, title, instructions, onSkip, children }) {
  const cheer = CHEER[num - 1];
  return (
    <div style={wrap}>
      <div style={{ height: 5, background: "var(--color-border-tertiary)", borderRadius: 3, marginBottom: "0.75rem", overflow: "hidden" }}>
        <div style={{ height: 5, width: `${(num / TOTAL_TESTS) * 100}%`, background: "var(--color-text-info)", borderRadius: 3, transition: "width .4s" }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
        <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: 0, fontWeight: 500, letterSpacing: ".04em" }}>PRUEBA {num} DE {TOTAL_TESTS}</p>
        {cheer && <span style={{ fontSize: 11, color: "var(--color-text-success)", fontWeight: 500 }}>{cheer}</span>}
      </div>
      <h3 style={{ fontSize: 16, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 8px" }}>{title}</h3>
      {instructions && <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 1.25rem", lineHeight: 1.55 }}>{instructions}</p>}
      {children}
      <button style={{ ...btnS, marginTop: 16 }} onClick={onSkip}>Omitir esta prueba</button>
    </div>
  );
}

const dirBtnStyle = { width: 64, height: 64, fontSize: 22, border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", cursor: "pointer" };

function DirectionPad({ onSelect }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "64px 64px 64px", gridTemplateRows: "64px 64px 64px", gap: 8, justifyContent: "center", margin: "0 auto 1.25rem" }}>
      <div /><button style={dirBtnStyle} onClick={() => onSelect("↑")}>↑</button><div />
      <button style={dirBtnStyle} onClick={() => onSelect("←")}>←</button><div /><button style={dirBtnStyle} onClick={() => onSelect("→")}>→</button>
      <div /><button style={dirBtnStyle} onClick={() => onSelect("↓")}>↓</button><div />
    </div>
  );
}

const choiceBtn = { padding: "14px", fontSize: 16, fontWeight: 500, border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", cursor: "pointer" };

// ─── 1. Agudeza visual lejana ─────────────────────────────────────────────────
const FAR_LEVELS = [
  { label: "20/200", size: 96 },
  { label: "20/100", size: 64 },
  { label: "20/60",  size: 42 },
  { label: "20/40",  size: 28 },
  { label: "20/20",  size: 16 },
];
const FAR_STATUS = { "20/20": "green", "20/40": "green", "20/60": "yellow", "20/100": "yellow", "20/200": "red" };

function AgudezaLejosTest({ eye, onDone, onSkip }) {
  const [level, setLevel] = useState(0);
  const [dir, setDir] = useState(() => randomDir());
  const coverEye = eye === "OD" ? "izquierdo" : "derecho";
  const titleEye = eye === "OD" ? "derecho" : "izquierdo";

  function handle(chosen) {
    const correct = chosen === dir;
    if (correct) {
      if (level >= FAR_LEVELS.length - 1) { onDone("20/20", "green"); return; }
      setLevel(l => l + 1);
      setDir(randomDir());
    } else {
      if (level === 0) { onDone("Menor a 20/200", "red"); return; }
      const label = FAR_LEVELS[level - 1].label;
      onDone(label, FAR_STATUS[label]);
    }
  }

  return (
    <TestShell num={1} title={`Agudeza visual lejana — Ojo ${titleEye}`}
      instructions={`Cubre tu ojo ${coverEye} con la palma de la mano, sin presionar. Sostén el celular a la distancia de tu brazo. Indica hacia dónde apuntan las "patas" de la letra E.`}
      onSkip={onSkip}>
      <div style={{ textAlign: "center", padding: "1.25rem 0", minHeight: 120, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: FAR_LEVELS[level].size, fontWeight: 700, color: "var(--color-text-primary)", display: "inline-block", transform: DIR_ROTATIONS[dir], fontFamily: "serif", lineHeight: 1, userSelect: "none" }}>E</span>
      </div>
      <DirectionPad onSelect={handle} />
    </TestShell>
  );
}

// ─── 2. Agudeza visual cercana ────────────────────────────────────────────────
const NEAR_LEVELS = [
  { label: "N24", size: 26 },
  { label: "N18", size: 20 },
  { label: "N12", size: 15 },
  { label: "N8",  size: 11 },
  { label: "N5",  size: 8  },
];
const NEAR_STATUS = { N5: "green", N8: "green", N12: "yellow", N18: "yellow", N24: "red" };
const NEAR_TEXT = "El cuidado de tu visión es esencial para tu calidad de vida diaria.";

function AgudezaCercaTest({ eye, onDone, onSkip }) {
  const [level, setLevel] = useState(0);
  const coverEye = eye === "OD" ? "izquierdo" : "derecho";
  const titleEye = eye === "OD" ? "derecho" : "izquierdo";

  function handle(canRead) {
    if (canRead) {
      if (level >= NEAR_LEVELS.length - 1) { onDone("N5", "green"); return; }
      setLevel(l => l + 1);
    } else {
      if (level === 0) { onDone("Mayor a N24", "red"); return; }
      const label = NEAR_LEVELS[level - 1].label;
      onDone(label, NEAR_STATUS[label]);
    }
  }

  return (
    <TestShell num={2} title={`Agudeza visual cercana — Ojo ${titleEye}`}
      instructions={`Cubre tu ojo ${coverEye} con la palma de la mano. Sostén el celular a unos 40cm de tu cara. ¿Puedes leer el siguiente texto con claridad?`}
      onSkip={onSkip}>
      <div style={{ textAlign: "center", padding: "1.5rem 1rem", minHeight: 90, display: "flex", alignItems: "center", justifyContent: "center", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-md)", marginBottom: "1.25rem" }}>
        <span style={{ fontSize: NEAR_LEVELS[level].size, color: "var(--color-text-primary)", lineHeight: 1.4 }}>{NEAR_TEXT}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <button style={btnP} onClick={() => handle(true)}>Sí, lo leo con claridad</button>
        <button style={btnS} onClick={() => handle(false)}>No, se ve borroso</button>
      </div>
    </TestShell>
  );
}

// ─── 3. Sensibilidad al contraste ─────────────────────────────────────────────
const CONTRAST_LEVELS = [
  { label: "100%", value: 1 },
  { label: "50%",  value: 0.5 },
  { label: "25%",  value: 0.25 },
  { label: "10%",  value: 0.10 },
  { label: "5%",   value: 0.05 },
];
const CONTRAST_STATUS = { "5%": "green", "10%": "green", "25%": "yellow", "50%": "red", "100%": "red" };

function ContrasteTest({ onDone, onSkip }) {
  const [level, setLevel] = useState(0);
  const [dir, setDir] = useState(() => randomDir());

  function handle(chosen) {
    const correct = chosen === dir;
    if (correct) {
      if (level >= CONTRAST_LEVELS.length - 1) { onDone("5%", "green"); return; }
      setLevel(l => l + 1);
      setDir(randomDir());
    } else {
      if (level === 0) { onDone("No detecta 100%", "red"); return; }
      const label = CONTRAST_LEVELS[level - 1].label;
      onDone(label, CONTRAST_STATUS[label]);
    }
  }

  const opacity = CONTRAST_LEVELS[level].value;
  return (
    <TestShell num={3} title="Sensibilidad al contraste"
      instructions='Sobre el fondo gris, observa la letra "C" e indica hacia qué lado está abierta.'
      onSkip={onSkip}>
      <div style={{ textAlign: "center", padding: "1.25rem 0", minHeight: 120, display: "flex", alignItems: "center", justifyContent: "center", background: "#E7E7EA", borderRadius: "var(--border-radius-md)", marginBottom: "1.25rem" }}>
        <span style={{ fontSize: 88, fontWeight: 700, color: `rgba(20,20,30,${opacity})`, display: "inline-block", transform: DIR_ROTATIONS[dir], fontFamily: "sans-serif", lineHeight: 1, userSelect: "none" }}>C</span>
      </div>
      <DirectionPad onSelect={handle} />
    </TestShell>
  );
}

// ─── 4. Visión de colores ──────────────────────────────────────────────────────
const COLOR_PLATES = [
  { number: "7", type: "rg", figureColors: ["#E0563D", "#D6432A", "#C8381F", "#EC7256"], bgColors: ["#7BAE5E", "#67A04A", "#588F3D", "#8FC07A"] },
  { number: "4", type: "by", figureColors: ["#3E72B5", "#3361A3", "#4D80C4", "#2A5694"], bgColors: ["#E3C247", "#D8B533", "#EFD568", "#CBA722"] },
  { number: "9", type: "rg", figureColors: ["#E0563D", "#D6432A", "#C8381F", "#EC7256"], bgColors: ["#7BAE5E", "#67A04A", "#588F3D", "#8FC07A"] },
  { number: "2", type: "by", figureColors: ["#3E72B5", "#3361A3", "#4D80C4", "#2A5694"], bgColors: ["#E3C247", "#D8B533", "#EFD568", "#CBA722"] },
  { number: "6", type: "rg", figureColors: ["#E0563D", "#D6432A", "#C8381F", "#EC7256"], bgColors: ["#7BAE5E", "#67A04A", "#588F3D", "#8FC07A"] },
  { number: "3", type: "by", figureColors: ["#3E72B5", "#3361A3", "#4D80C4", "#2A5694"], bgColors: ["#E3C247", "#D8B533", "#EFD568", "#CBA722"] },
];

function generatePlateDots(number, size = 220, plate) {
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.font = `bold ${Math.floor(size * 0.72)}px Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(number), size / 2, size / 2 + size * 0.02);
  const img = ctx.getImageData(0, 0, size, size).data;

  function isFigure(x, y) {
    const xi = Math.min(size - 1, Math.max(0, Math.round(x)));
    const yi = Math.min(size - 1, Math.max(0, Math.round(y)));
    return img[(yi * size + xi) * 4 + 3] > 100;
  }

  const dots = [];
  const cell = 9;
  for (let y = cell / 2; y < size; y += cell) {
    for (let x = cell / 2; x < size; x += cell) {
      const dx = x - size / 2, dy = y - size / 2;
      if (dx * dx + dy * dy > (size / 2 - 4) * (size / 2 - 4)) continue;
      if (Math.random() > 0.92) continue;
      const jx = x + (Math.random() - 0.5) * cell * 0.8;
      const jy = y + (Math.random() - 0.5) * cell * 0.8;
      const r = 2.5 + Math.random() * 2.5;
      const figure = isFigure(jx, jy);
      const palette = figure ? plate.figureColors : plate.bgColors;
      const color = palette[Math.floor(Math.random() * palette.length)];
      dots.push({ x: jx, y: jy, r, figure, color });
    }
  }
  return dots;
}

function ColorPlate({ plate, size = 220 }) {
  const colored = useMemo(() => generatePlateDots(plate.number, size, plate), [plate, size]);

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: 240, display: "block", margin: "0 auto" }}>
      <circle cx={size / 2} cy={size / 2} r={size / 2 - 1} fill="#fdfdf6" />
      {colored.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={d.r} fill={d.color} />)}
    </svg>
  );
}

function ColoresTest({ onDone, onSkip }) {
  const [plateIdx, setPlateIdx] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [rgWrong, setRgWrong] = useState(0);
  const [byWrong, setByWrong] = useState(0);

  function handleAnswer(answer) {
    const plate = COLOR_PLATES[plateIdx];
    const correct = answer === plate.number;
    let cc = correctCount, rgW = rgWrong, byW = byWrong;
    if (correct) cc++;
    else if (plate.type === "rg") rgW++; else byW++;

    if (plateIdx >= COLOR_PLATES.length - 1) {
      let value, status;
      if (cc >= 5) { value = "Visión de colores normal"; status = "green"; }
      else if (cc >= 3) { value = "Posible deficiencia leve en percepción de colores"; status = "yellow"; }
      else {
        if (rgW > byW) value = "Posible deficiencia rojo-verde";
        else if (byW > rgW) value = "Posible deficiencia azul-amarillo";
        else value = "Posible deficiencia cromática";
        status = "red";
      }
      onDone(`${value} (${cc}/${COLOR_PLATES.length} aciertos)`, status);
      return;
    }
    setCorrectCount(cc); setRgWrong(rgW); setByWrong(byW);
    setPlateIdx(i => i + 1);
  }

  const plate = COLOR_PLATES[plateIdx];
  return (
    <TestShell num={4} title="Visión de colores"
      instructions={`Observa el círculo de puntos de colores. ¿Qué número ves dentro? (Lámina ${plateIdx + 1} de ${COLOR_PLATES.length})`}
      onSkip={onSkip}>
      <div style={{ marginBottom: "1.25rem" }}>
        <ColorPlate key={plateIdx} plate={plate} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 8 }}>
        {Array.from({ length: 9 }, (_, i) => i + 1).map(n => (
          <button key={n} onClick={() => handleAnswer(String(n))} style={choiceBtn}>{n}</button>
        ))}
      </div>
      <button style={{ ...btnS, marginBottom: 16 }} onClick={() => handleAnswer("ninguno")}>No veo ningún número</button>
    </TestShell>
  );
}

// ─── 5. Rejilla de Amsler ──────────────────────────────────────────────────────
const AMSLER_SIZE = 240;

function AmslerTest({ eye, onDone, onSkip }) {
  const [marking, setMarking] = useState(false);
  const [marks, setMarks] = useState([]);
  const svgRef = useRef(null);
  const coverEye = eye === "OD" ? "izquierdo" : "derecho";
  const titleEye = eye === "OD" ? "derecho" : "izquierdo";

  function handleClick(e) {
    if (!marking) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * AMSLER_SIZE;
    const y = ((e.clientY - rect.top) / rect.height) * AMSLER_SIZE;
    setMarks(m => [...m, { x, y }]);
  }

  function finish() {
    const n = marks.length;
    if (n === 0) { onDone("Normal", "green"); return; }
    if (n <= 2) { onDone(`Áreas marcadas: ${n} zona(s)`, "yellow"); return; }
    onDone(`Áreas marcadas: ${n} zona(s)`, "red");
  }

  const lines = [];
  for (let i = 0; i <= 10; i++) {
    const p = (i / 10) * AMSLER_SIZE;
    lines.push(<line key={`h${i}`} x1={0} y1={p} x2={AMSLER_SIZE} y2={p} stroke="#999" strokeWidth={i === 5 ? 1.5 : 0.75} />);
    lines.push(<line key={`v${i}`} x1={p} y1={0} x2={p} y2={AMSLER_SIZE} stroke="#999" strokeWidth={i === 5 ? 1.5 : 0.75} />);
  }

  return (
    <TestShell num={5} title={`Rejilla de Amsler — Ojo ${titleEye}`}
      instructions={`Cubre tu ojo ${coverEye}. Mira fijamente el punto rojo central, sin mover los ojos. ¿Ves líneas onduladas, borrosas o áreas faltantes?`}
      onSkip={onSkip}>
      <svg ref={svgRef} viewBox={`0 0 ${AMSLER_SIZE} ${AMSLER_SIZE}`} width="100%"
        style={{ maxWidth: 260, display: "block", margin: "0 auto 1rem", background: "#fff", border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", touchAction: "none", cursor: marking ? "crosshair" : "default" }}
        onClick={handleClick}>
        {lines}
        <circle cx={AMSLER_SIZE / 2} cy={AMSLER_SIZE / 2} r={4} fill="#c83b3a" />
        {marks.map((m, i) => <circle key={i} cx={m.x} cy={m.y} r={6} fill="rgba(200,59,58,0.4)" stroke="#c83b3a" strokeWidth={1.5} />)}
      </svg>
      {!marking ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button style={btnP} onClick={() => onDone("Normal", "green")}>Todo se ve normal</button>
          <button style={btnS} onClick={() => setMarking(true)}>Veo algo distinto, quiero marcarlo</button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 4px" }}>Toca sobre la rejilla las zonas donde notes ondulaciones o falten líneas.</p>
          <button style={btnP} onClick={finish}>Listo</button>
        </div>
      )}
    </TestShell>
  );
}

// ─── 6. Acomodación ─────────────────────────────────────────────────────────────
function AcomodacionTest({ onDone, onSkip }) {
  return (
    <TestShell num={6} title="Acomodación"
      instructions="Sostén el celular a una distancia normal de lectura (~40cm) y lee el texto. Luego acércalo lentamente hacia tu cara, sin dejar de mirarlo, hasta que el texto comience a verse borroso. Cuando eso pase, detente y elige la opción que mejor describa lo que ocurrió."
      onSkip={onSkip}>
      <div style={{ textAlign: "center", padding: "1.5rem 1rem", minHeight: 70, display: "flex", alignItems: "center", justifyContent: "center", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-md)", marginBottom: "1.25rem" }}>
        <span style={{ fontSize: 14, color: "var(--color-text-primary)", lineHeight: 1.4 }}>Acerca poco a poco el celular hasta el punto donde el texto se vuelve borroso.</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <button style={btnP} onClick={() => onDone("Acomodación normal", "green")}>Leo fácil, incluso muy cerca</button>
        <button style={btnS} onClick={() => onDone("Acomodación ligeramente reducida", "yellow")}>Un poco difícil al acercarlo mucho</button>
        <button style={btnS} onClick={() => onDone("Acomodación reducida", "red")}>Muy difícil, se borra rápido</button>
      </div>
    </TestShell>
  );
}

// ─── 7. Duocromo ─────────────────────────────────────────────────────────────────
function DuocromoTest({ onDone, onSkip }) {
  return (
    <TestShell num={7} title="Test duocromo (rojo/verde)"
      instructions="Observa las letras sobre cada fondo de color. ¿En qué lado se ven más nítidas y oscuras?"
      onSkip={onSkip}>
      <div style={{ display: "flex", borderRadius: "var(--border-radius-md)", overflow: "hidden", marginBottom: "1.25rem", minHeight: 110 }}>
        <div style={{ flex: 1, background: "#D9534F", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 30, fontWeight: 700, color: "#1a1a1a", letterSpacing: 4 }}>FPT</span>
        </div>
        <div style={{ flex: 1, background: "#5CB85C", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 30, fontWeight: 700, color: "#1a1a1a", letterSpacing: 4 }}>FPT</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <button style={btnS} onClick={() => onDone("Posible subcorrección (rojo más nítido)", "yellow")}>Lado rojo más nítido</button>
        <button style={btnP} onClick={() => onDone("Endpoint correcto (igual nitidez)", "green")}>Se ven igual en ambos lados</button>
        <button style={btnS} onClick={() => onDone("Posible sobrecorrección (verde más nítido)", "yellow")}>Lado verde más nítido</button>
      </div>
    </TestShell>
  );
}

// ─── 8. Aniseiconía ──────────────────────────────────────────────────────────────
function AniseiconiaTest({ onDone, onSkip }) {
  return (
    <TestShell num={8} title="Aniseiconía"
      instructions="Mira los dos corchetes, uno a cada lado de la pantalla. ¿Se ven del mismo tamaño?"
      onSkip={onSkip}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2rem 1.5rem", marginBottom: "1.25rem", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-md)" }}>
        <span style={{ fontSize: 80, fontWeight: 300, color: "var(--color-text-primary)", lineHeight: 1 }}>[</span>
        <span style={{ fontSize: 80, fontWeight: 300, color: "var(--color-text-primary)", lineHeight: 1 }}>]</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <button style={btnP} onClick={() => onDone("Normal", "green")}>Se ven del mismo tamaño</button>
        <button style={btnS} onClick={() => onDone("Posible aniseiconía (derecho más grande)", "yellow")}>El derecho se ve más grande</button>
        <button style={btnS} onClick={() => onDone("Posible aniseiconía (izquierdo más grande)", "yellow")}>El izquierdo se ve más grande</button>
      </div>
    </TestShell>
  );
}

// ─── 9. Campo visual básico ────────────────────────────────────────────────────
const VF_POINTS = [
  { x: 50, y: 8,  q: "superior" },
  { x: 88, y: 18, q: "superior derecho" },
  { x: 92, y: 50, q: "derecho" },
  { x: 88, y: 82, q: "inferior derecho" },
  { x: 50, y: 92, q: "inferior" },
  { x: 12, y: 82, q: "inferior izquierdo" },
  { x: 8,  y: 50, q: "izquierdo" },
  { x: 12, y: 18, q: "superior izquierdo" },
];

function CampoVisualTest({ eye, onDone, onSkip }) {
  const [order] = useState(() => shuffle(VF_POINTS.map((_, i) => i)));
  const [idx, setIdx] = useState(0);
  const [showing, setShowing] = useState(false);
  const [flash, setFlash] = useState(false);
  const missesRef = useRef([]);
  const seenRef = useRef(false);
  const doneRef = useRef(false);
  // Ref mirrors 'showing' so event handlers always read fresh value without stale closure
  const showingRef = useRef(false);
  const coverEye = eye === "OD" ? "izquierdo" : "derecho";
  const titleEye = eye === "OD" ? "derecho" : "izquierdo";

  useEffect(() => { showingRef.current = showing; }, [showing]);

  useEffect(() => {
    if (idx >= order.length) {
      if (doneRef.current) return;
      doneRef.current = true;
      const misses = missesRef.current;
      const n = misses.length;
      if (n === 0) { onDone("Campo visual normal", "green"); return; }
      const quadrants = [...new Set(misses)].join(", ");
      if (n <= 2) onDone(`Posible reducción leve (${quadrants})`, "yellow");
      else onDone(`Posibles escotomas (${quadrants})`, "red");
      return;
    }
    seenRef.current = false;
    // Randomize appearance delay 600-1200ms; total window until hide is 2600ms
    const showT = setTimeout(() => setShowing(true), 600 + Math.random() * 600);
    const hideT = setTimeout(() => {
      setShowing(false);
      if (!seenRef.current) {
        const pIdx = order[idx];
        missesRef.current = [...missesRef.current, VF_POINTS[pIdx].q];
      }
      setIdx(i => i + 1);
    }, 2600);
    return () => { clearTimeout(showT); clearTimeout(hideT); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  function handleTap(e) {
    e.preventDefault();
    if (showingRef.current) {
      seenRef.current = true;
      setFlash(true);
      setTimeout(() => setFlash(false), 180);
    }
  }

  if (idx >= order.length) return null;
  const point = VF_POINTS[order[idx]];

  return (
    <TestShell num={9} title={`Campo visual — Ojo ${titleEye}`}
      instructions={`Cubre tu ojo ${coverEye}. Mantén la mirada fija en el punto blanco central. Toca en cualquier parte de la pantalla oscura cuando veas aparecer un punto verde.`}
      onSkip={onSkip}>
      <div
        onPointerDown={handleTap}
        style={{
          position: "relative", width: "100%", paddingBottom: "100%",
          background: flash ? "#2a3a2a" : "#1a1a1a",
          borderRadius: "var(--border-radius-md)", marginBottom: "1.25rem",
          touchAction: "none", cursor: "pointer",
          transition: "background 0.12s",
          border: flash ? "2px solid #5DCAA5" : "2px solid transparent",
        }}>
        {/* Fixed center fixation point */}
        <div style={{ position: "absolute", left: "50%", top: "50%", width: 12, height: 12, marginLeft: -6, marginTop: -6, borderRadius: "50%", background: "#fff", boxShadow: "0 0 4px rgba(255,255,255,0.5)" }} />
        {/* Peripheral stimulus — larger for reliable touch detection */}
        {showing && (
          <div style={{ position: "absolute", left: `${point.x}%`, top: `${point.y}%`, width: 22, height: 22, marginLeft: -11, marginTop: -11, borderRadius: "50%", background: "#5DCAA5", boxShadow: "0 0 6px #5DCAA5" }} />
        )}
      </div>
      <p style={{ fontSize: 12, color: flash ? "#5DCAA5" : "var(--color-text-tertiary)", textAlign: "center", transition: "color 0.12s" }}>
        {flash ? "¡Detectado!" : `Punto ${idx + 1} de ${order.length} — toca cuando veas el punto verde`}
      </p>
    </TestShell>
  );
}

// ─── 10. Laberinto ────────────────────────────────────────────────────────────
const MAZE_POINTS = [
  { x: 30, y: 30 }, { x: 30, y: 110 }, { x: 130, y: 110 }, { x: 130, y: 50 },
  { x: 230, y: 50 }, { x: 230, y: 150 }, { x: 90, y: 150 }, { x: 90, y: 230 }, { x: 250, y: 230 },
];
const MAZE_WIDTH = 280, MAZE_HEIGHT = 260, CORRIDOR = 36;

function distToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * dx, cy = a.y + t * dy;
  return Math.hypot(p.x - cx, p.y - cy);
}
function distToPath(p, points) {
  let min = Infinity;
  for (let i = 0; i < points.length - 1; i++) min = Math.min(min, distToSegment(p, points[i], points[i + 1]));
  return min;
}

function LaberintoTest({ onDone, onSkip }) {
  const [phase, setPhase] = useState("od"); // od | switch | oi
  const [tracing, setTracing] = useState(false);
  const [trail, setTrail] = useState([]);
  const svgRef = useRef(null);
  const startTimeRef = useRef(null);
  const odResultRef = useRef(null);
  // Refs for values needed inside pointer event handlers (avoids stale closure issues)
  const tracingRef = useRef(false);
  const errorsRef = useRef(0);

  useEffect(() => { tracingRef.current = tracing; }, [tracing]);

  function getPoint(e) {
    const rect = svgRef.current.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * MAZE_WIDTH,
      y: ((e.clientY - rect.top) / rect.height) * MAZE_HEIGHT,
    };
  }

  function handleStart(e) {
    e.preventDefault();
    const p = getPoint(e);
    const startPt = MAZE_POINTS[0];
    if (Math.hypot(p.x - startPt.x, p.y - startPt.y) < CORRIDOR * 1.4) {
      // setPointerCapture ensures all subsequent pointermove/up events reach this element
      // even if the finger moves outside the SVG boundaries — critical for mobile drag
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
      tracingRef.current = true;
      errorsRef.current = 0;
      setTracing(true);
      setTrail([p]);
      startTimeRef.current = performance.now();
    }
  }

  function handleMove(e) {
    if (!tracingRef.current) return;
    e.preventDefault();
    const p = getPoint(e);
    setTrail(prev => [...prev, p]);
    const d = distToPath(p, MAZE_POINTS);
    if (d > CORRIDOR / 2) errorsRef.current++;
    const end = MAZE_POINTS[MAZE_POINTS.length - 1];
    if (Math.hypot(p.x - end.x, p.y - end.y) < CORRIDOR) finishPass();
  }

  function finishPass() {
    if (!tracingRef.current) return;
    tracingRef.current = false;
    setTracing(false);
    setTrail([]);
    const time = (performance.now() - startTimeRef.current) / 1000;
    if (phase === "od") {
      odResultRef.current = { time, errors: errorsRef.current };
      setPhase("switch");
    } else {
      evaluate(odResultRef.current, { time, errors: errorsRef.current });
    }
  }

  function evaluate(od, oi) {
    const timeRatio = Math.max(od.time, oi.time) / Math.max(0.5, Math.min(od.time, oi.time));
    const errDiff = Math.abs(od.errors - oi.errors);
    if (timeRatio < 1.4 && errDiff <= 3) onDone("Sin diferencias significativas entre ojos", "green");
    else if (timeRatio < 2 && errDiff <= 8) onDone("Diferencia leve entre ojos", "yellow");
    else onDone("Diferencia significativa entre ojos (revisar ambliopía)", "red");
  }

  if (phase === "switch") {
    return (
      <TestShell num={10} title="Laberinto — ojo ambliope"
        instructions="¡Listo con el ojo derecho! Ahora cubre tu ojo derecho y descubre el izquierdo. Cuando estés list@, continúa."
        onSkip={onSkip}>
        <button style={btnP} onClick={() => { setPhase("oi"); errorsRef.current = 0; setTrail([]); }}>Continuar con el ojo izquierdo</button>
      </TestShell>
    );
  }

  const eyeLabel = phase === "od" ? "derecho" : "izquierdo";
  const coverLabel = phase === "od" ? "izquierdo" : "derecho";
  const last = MAZE_POINTS[MAZE_POINTS.length - 1];

  return (
    <TestShell num={10} title="Laberinto — ojo ambliope"
      instructions={`Cubre tu ojo ${coverLabel}. Pon el dedo en el punto verde y arrastra sin levantar hasta llegar al punto rojo.`}
      onSkip={onSkip}>
      <svg ref={svgRef} viewBox={`0 0 ${MAZE_WIDTH} ${MAZE_HEIGHT}`} width="100%"
        style={{ maxWidth: 300, display: "block", margin: "0 auto 1rem", background: "#f4f4f8", borderRadius: "var(--border-radius-md)", touchAction: "none", cursor: tracing ? "crosshair" : "grab" }}
        onPointerDown={handleStart}
        onPointerMove={handleMove}
        onPointerUp={finishPass}
        onPointerCancel={finishPass}>
        {/* Path corridor — slightly wider for easier tracing */}
        <polyline points={MAZE_POINTS.map(p => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#d8d8e8" strokeWidth={CORRIDOR * 2} strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={MAZE_POINTS.map(p => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#b0b0c8" strokeWidth={1.5} strokeDasharray="4,4" />
        {/* User's finger trail */}
        {trail.length > 1 && (
          <polyline
            points={trail.map(p => `${p.x},${p.y}`).join(" ")}
            fill="none" stroke="rgba(93,202,165,0.7)" strokeWidth={10}
            strokeLinecap="round" strokeLinejoin="round"
          />
        )}
        {/* Start (green) and end (red) markers — larger for easier touch */}
        <circle cx={MAZE_POINTS[0].x} cy={MAZE_POINTS[0].y} r={16} fill="#5DCAA5" />
        <circle cx={last.x} cy={last.y} r={16} fill="#c83b3a" />
        <text x={MAZE_POINTS[0].x} y={MAZE_POINTS[0].y + 1} textAnchor="middle" dominantBaseline="middle" fontSize="14" fill="white" fontWeight="bold">▶</text>
        <text x={last.x} y={last.y + 1} textAnchor="middle" dominantBaseline="middle" fontSize="14" fill="white" fontWeight="bold">★</text>
      </svg>
      <p style={{ fontSize: 12, color: tracing ? "#5DCAA5" : "var(--color-text-tertiary)", textAlign: "center", transition: "color 0.2s" }}>
        {tracing ? "¡Sigue sin levantar el dedo!" : "Toca el punto verde ▶ y arrastra hasta la estrella ★"}
      </p>
    </TestShell>
  );
}

// ─── 11. Fusión binocular ───────────────────────────────────────────────────────
function FusionTest({ onDone, onSkip }) {
  const options = [
    { n: 2, value: "Posible supresión de un ojo", status: "red" },
    { n: 3, value: "Posible supresión parcial", status: "yellow" },
    { n: 4, value: "Fusión binocular normal", status: "green" },
    { n: 5, value: "Posible diplopía (visión doble)", status: "yellow" },
  ];
  return (
    <TestShell num={11} title="Fusión binocular"
      instructions="Observa los círculos de colores. ¿Cuántos círculos ves en total?"
      onSkip={onSkip}>
      <div style={{ position: "relative", width: "100%", paddingBottom: "75%", background: "#787878", borderRadius: "var(--border-radius-md)", marginBottom: "1.25rem" }}>
        <div style={{ position: "absolute", left: "50%", top: "12%", width: "16%", paddingBottom: "16%", marginLeft: "-8%", borderRadius: "50%", background: "#D9534F" }} />
        <div style={{ position: "absolute", left: "10%", top: "42%", width: "16%", paddingBottom: "16%", borderRadius: "50%", background: "#5CB85C" }} />
        <div style={{ position: "absolute", right: "10%", top: "42%", width: "16%", paddingBottom: "16%", borderRadius: "50%", background: "#5CB85C" }} />
        <div style={{ position: "absolute", left: "50%", bottom: "12%", width: "16%", paddingBottom: "16%", marginLeft: "-8%", borderRadius: "50%", background: "#fff", border: "1px solid #bbb" }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        {options.map(o => (
          <button key={o.n} onClick={() => onDone(o.value, o.status)} style={choiceBtn}>{o.n}</button>
        ))}
      </div>
    </TestShell>
  );
}

// ─── 12. Estereopsis básica ─────────────────────────────────────────────────────
function EstereopsisTest({ onDone, onSkip }) {
  const shapes = [
    { id: "A", offset: 4,  scale: 1,    opacity: 0.15 },
    { id: "B", offset: 14, scale: 1.08, opacity: 0.35 },
    { id: "C", offset: 6,  scale: 1,    opacity: 0.18 },
  ];
  return (
    <TestShell num={12} title="Estereopsis básica"
      instructions="Observa las tres figuras. ¿Cuál de ellas parece estar más cerca de ti / sobresalir más de la pantalla?"
      onSkip={onSkip}>
      <div style={{ display: "flex", justifyContent: "space-around", alignItems: "center", padding: "2rem 0.5rem", marginBottom: "1.25rem", background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)" }}>
        {shapes.map(s => (
          <div key={s.id} style={{ position: "relative", width: 70, height: 70, transform: `scale(${s.scale})` }}>
            <div style={{ position: "absolute", inset: 0, background: "var(--color-text-primary)", borderRadius: "var(--border-radius-md)", transform: `translate(${s.offset}px, ${s.offset}px)`, opacity: s.opacity }} />
            <div style={{ position: "absolute", inset: 0, background: "var(--color-background-primary)", border: "1.5px solid var(--color-border-primary)", borderRadius: "var(--border-radius-md)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 500, color: "var(--color-text-primary)" }}>
              {s.id}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        {shapes.map(s => (
          <button key={s.id} onClick={() => {
            if (s.id === "B") onDone("Percepción de profundidad normal", "green");
            else onDone("Percepción de profundidad reducida", "yellow");
          }} style={choiceBtn}>{s.id}</button>
        ))}
      </div>
    </TestShell>
  );
}

// ─── 13. Coordinación binocular ─────────────────────────────────────────────────
function CoordinacionTest({ onDone, onSkip }) {
  return (
    <TestShell num={13} title="Coordinación binocular"
      instructions="Mira fijamente el punto central. Cubre tu ojo derecho con la palma y descúbrelo; luego cubre el izquierdo y descúbrelo. ¿El punto pareció moverse durante el cambio?"
      onSkip={onSkip}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "2.5rem 0", marginBottom: "1.25rem", background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)" }}>
        <div style={{ width: 14, height: 14, borderRadius: "50%", background: "var(--color-text-primary)" }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <button style={btnP} onClick={() => onDone("Normal, sin desviación aparente", "green")}>No se mueve</button>
        <button style={btnS} onClick={() => onDone("Posible foria leve", "yellow")}>Se mueve un poco</button>
        <button style={btnS} onClick={() => onDone("Posible desviación ocular (tropia)", "red")}>Se mueve bastante</button>
      </div>
    </TestShell>
  );
}

// ─── 14. Astigmatismo (detección, eje y cilindro) ──────────────────────────────
const CLOCK_NUMBERS = Array.from({ length: 12 }, (_, i) => i + 1);

function ClockDial({ size = 200, highlightPos, showNumbers }) {
  const center = size / 2;
  const r = size / 2 - 22;
  const lines = [];
  for (let i = 1; i <= 12; i++) {
    const opposite = i > 6 ? i - 6 : i + 6;
    const isHighlight = highlightPos === i || highlightPos === opposite;
    const angle = (i / 12) * 2 * Math.PI - Math.PI / 2;
    const x2 = center + r * Math.cos(angle);
    const y2 = center + r * Math.sin(angle);
    const x1 = center - r * Math.cos(angle);
    const y1 = center - r * Math.sin(angle);
    if (i <= 6) {
      lines.push(
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={isHighlight ? "#c83b3a" : "#999"} strokeWidth={isHighlight ? 3 : 1} />
      );
    }
  }
  const numbers = [];
  if (showNumbers) {
    for (let i = 1; i <= 12; i++) {
      const angle = (i / 12) * 2 * Math.PI - Math.PI / 2;
      const x = center + (r + 14) * Math.cos(angle);
      const y = center + (r + 14) * Math.sin(angle);
      numbers.push(
        <text key={i} x={x} y={y} fontSize="11" textAnchor="middle" dominantBaseline="middle" fill="#777">{i}</text>
      );
    }
  }
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: 220, display: "block", margin: "0 auto 1.25rem", background: "#fff", border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)" }}>
      <circle cx={center} cy={center} r={r + 4} fill="none" stroke="#ddd" strokeWidth={0.5} />
      {lines}
      {numbers}
    </svg>
  );
}

const CYLINDER_OPTIONS = [
  ["Apenas diferente", "green"],
  ["Notablemente diferente", "yellow"],
  ["Muy diferente", "yellow"],
  ["Extremadamente diferente", "red"],
];

function AstigmatismoTest({ onDone, onSkip }) {
  const [step, setStep] = useState("A"); // A | B | C
  const [clockPos, setClockPos] = useState(null);
  const [axis, setAxis] = useState(null);

  if (step === "A") {
    return (
      <TestShell num={14} title="Astigmatismo — Detección"
        instructions='Observa el reloj con líneas radiales. Mira fijamente el centro. ¿Alguna línea se ve más oscura, más nítida o diferente a las demás?'
        onSkip={onSkip}>
        <ClockDial />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button style={btnP} onClick={() => onDone("Sin astigmatismo detectado (Cilindro: 0.00D, Eje: 0°)", "green", { cilindro: 0, eje: 0 })}>
            No, todas las líneas se ven igual
          </button>
          <button style={btnS} onClick={() => setStep("B")}>Sí, una línea se ve diferente</button>
        </div>
      </TestShell>
    );
  }

  if (step === "B") {
    return (
      <TestShell num={14} title="Astigmatismo — Identificación del eje"
        instructions="¿Cuál número del reloj corresponde a la línea que se ve más oscura o diferente?"
        onSkip={onSkip}>
        <ClockDial showNumbers />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {CLOCK_NUMBERS.map(n => (
            <button key={n} style={choiceBtn} onClick={() => { setClockPos(n); setAxis(clockDialToAxis(n)); setStep("C"); }}>{n}</button>
          ))}
        </div>
      </TestShell>
    );
  }

  // step C — cuantificación del cilindro
  return (
    <TestShell num={14} title="Astigmatismo — Cuantificación"
      instructions={`Compara la línea que señalaste (posición ${clockPos}) con las demás líneas del reloj. ¿Qué tan diferente se ve esa línea comparada con las otras?`}
      onSkip={onSkip}>
      <ClockDial highlightPos={clockPos} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {CYLINDER_OPTIONS.map(([labelText, status]) => (
          <button key={labelText} style={btnS} onClick={() => {
            const cilindro = estimateCylinder(labelText);
            onDone(`Cilindro: ${cilindro.toFixed(2)}D, Eje: ${axis}°`, status, { cilindro, eje: axis });
          }}>{labelText}</button>
        ))}
      </div>
    </TestShell>
  );
}

// ─── 15. Lente cruzada (confirmación del eje) ──────────────────────────────────
function CrossCylinderOvals({ axis1, axis2 }) {
  return (
    <svg viewBox="0 0 200 160" width="100%" style={{ maxWidth: 240, display: "block", margin: "0 auto 1.25rem", background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)" }}>
      <ellipse cx={100} cy={80} rx={62} ry={34} transform={`rotate(${axis1} 100 80)`} fill="none" stroke="#3E72B5" strokeWidth={3} />
      <ellipse cx={100} cy={80} rx={62} ry={34} transform={`rotate(${axis2} 100 80)`} fill="none" stroke="#D9534F" strokeWidth={3} />
    </svg>
  );
}

function LenteCruzadaTest({ astigData, onDone, onSkip, onRefineAxis }) {
  const [axis, setAxis] = useState(() => astigData?.eje ?? 0);
  const [iteration, setIteration] = useState(0);
  const skipRef = useRef(false);

  useEffect(() => {
    if ((!astigData || astigData.cilindro === 0) && !skipRef.current) {
      skipRef.current = true;
      onDone("No aplica (sin astigmatismo detectado)", "gray");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!astigData || astigData.cilindro === 0) return null;

  function handleChoice(choice) {
    if (choice === "igual") {
      onRefineAxis(axis);
      onDone(`Eje confirmado: ${axis}°`, "green");
      return;
    }
    if (iteration >= 2) {
      onRefineAxis(axis);
      onDone(`Eje ajustado: ${axis}°`, "yellow");
      return;
    }
    const delta = choice === "arriba" ? -10 : 10;
    const newAxis = ((axis + delta) % 180 + 180) % 180;
    setAxis(newAxis);
    setIteration(i => i + 1);
  }

  const axis2 = (axis + 45) % 180;

  return (
    <TestShell num={15} title="Confirmación del eje (lente cruzada)"
      instructions="Observa los dos óvalos superpuestos. ¿Cuál de los dos se ve más redondo o más circular?"
      onSkip={onSkip}>
      <CrossCylinderOvals axis1={axis} axis2={axis2} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <button style={btnS} onClick={() => handleChoice("arriba")}>El de arriba-izquierda</button>
        <button style={btnP} onClick={() => handleChoice("igual")}>Se ven igual</button>
        <button style={btnS} onClick={() => handleChoice("abajo")}>El de abajo-derecha</button>
      </div>
    </TestShell>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────────
export default function VisualTests({ onFinish }) {
  const [phase, setPhase] = useState("intro"); // intro | test | summary
  const [stepIdx, setStepIdx] = useState(0);
  const [results, setResults] = useState({});
  const [vtStatus, setVtStatus] = useState({});
  const [astigData, setAstigData] = useState(null);

  const step = STEPS[stepIdx];

  const finishStep = useCallback((key, value, status, rawData) => {
    setResults(prev => ({ ...prev, [key]: value }));
    setVtStatus(prev => ({ ...prev, [key]: status }));
    if (key === "astigmatismo" && rawData) setAstigData(rawData);
    const nextIdx = stepIdx + 1;
    if (nextIdx >= STEPS.length) setPhase("summary");
    setStepIdx(nextIdx);
  }, [stepIdx]);

  useEffect(() => {
    if (phase !== "test") return;
    const t = setTimeout(() => {
      finishStep(STEPS[stepIdx].key, "No completada (tiempo agotado)", "gray");
    }, TEST_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [phase, stepIdx, finishStep]);

  function handleDone(value, status, rawData) { finishStep(step.key, value, status, rawData); }
  function handleSkip() { finishStep(step.key, "Omitida por el paciente", "gray"); }
  function handleRefineAxis(eje) { setAstigData(prev => prev ? { ...prev, eje } : prev); }

  if (phase === "intro") {
    return (
      <div style={wrap}>
        <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: "0 0 8px", fontWeight: 500, letterSpacing: ".06em" }}>PRUEBAS VISUALES</p>
        <h2 style={{ fontSize: 18, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 8px" }}>Batería de 15 pruebas visuales</h2>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 1.25rem", lineHeight: 1.6 }}>
          Haremos 15 pruebas rápidas antes de la foto: agudeza visual, contraste, colores, rejilla de Amsler, acomodación, duocromo, aniseiconía, campo visual, laberinto, fusión binocular, estereopsis, coordinación binocular y astigmatismo. Cada una toma menos de un minuto y puedes omitirla si lo necesitas.
        </p>
        <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "10px 12px", margin: "0 0 1.25rem", fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
          📏 Sostén el celular a la distancia de tu brazo. Busca buena iluminación y un lugar tranquilo.
        </div>
        <button style={btnP} onClick={() => setPhase("test")}>Comenzar pruebas →</button>
      </div>
    );
  }

  if (phase === "test") {
    const props = { onDone: handleDone, onSkip: handleSkip, eye: step.eye };
    switch (step.comp) {
      case "agudezaLejos": return <AgudezaLejosTest key={step.key} {...props} />;
      case "agudezaCerca": return <AgudezaCercaTest key={step.key} {...props} />;
      case "contraste":    return <ContrasteTest key={step.key} {...props} />;
      case "colores":      return <ColoresTest key={step.key} {...props} />;
      case "amsler":       return <AmslerTest key={step.key} {...props} />;
      case "acomodacion":  return <AcomodacionTest key={step.key} {...props} />;
      case "duocromo":     return <DuocromoTest key={step.key} {...props} />;
      case "aniseiconia":  return <AniseiconiaTest key={step.key} {...props} />;
      case "campoVisual":  return <CampoVisualTest key={step.key} {...props} />;
      case "laberinto":    return <LaberintoTest key={step.key} {...props} />;
      case "fusion":       return <FusionTest key={step.key} {...props} />;
      case "estereopsis":  return <EstereopsisTest key={step.key} {...props} />;
      case "coordinacion": return <CoordinacionTest key={step.key} {...props} />;
      case "astigmatismo": return <AstigmatismoTest key={step.key} {...props} />;
      case "lenteCruzada": return <LenteCruzadaTest key={step.key} {...props} astigData={astigData} onRefineAxis={handleRefineAxis} />;
      default: return null;
    }
  }

  // ── Summary ──
  return (
    <div style={wrap}>
      <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: "0 0 8px", fontWeight: 500, letterSpacing: ".06em" }}>RESULTADOS VISUALES</p>
      <h2 style={{ fontSize: 18, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 1.25rem" }}>Tus 15 pruebas visuales</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: "1.5rem" }}>
        {STEPS.map(s => {
          const status = vtStatus[s.key] || "gray";
          const colors = SEMAFORO_DOT[status];
          return (
            <div key={s.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "11px 14px", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-md)", background: "var(--color-background-primary)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: colors.dot, flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>{STEP_LABELS[s.key]}</span>
              </div>
              <span style={{ fontSize: 12, fontWeight: 500, color: colors.text, textAlign: "right", maxWidth: "55%" }}>{results[s.key] || "—"}</span>
            </div>
          );
        })}
      </div>
      <button style={btnP} onClick={() => onFinish({ ...results, vtStatus, astigmatismoData: astigData })}>Continuar →</button>
    </div>
  );
}
