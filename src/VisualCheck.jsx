import { useState, useRef, useEffect } from "react";
import { supabase } from "./lib/supabase";

// ─── Data ─────────────────────────────────────────────────────────────────────
const QUESTIONS = [
  {
    id: "irritation",
    text: "¿Con qué frecuencia sientes ardor o irritación en tus ojos?",
    options: ["Nunca", "Ocasionalmente", "Frecuentemente", "Siempre"],
    weights: [0, 1, 2, 3],
  },
  {
    id: "far",
    text: "¿Ves borroso al mirar objetos lejanos?",
    options: ["No, veo bien", "A veces", "Sí, frecuentemente"],
    weights: [0, 1, 2],
  },
  {
    id: "near",
    text: "¿Tienes dificultad para leer de cerca?",
    options: ["No, veo bien", "A veces", "Sí, frecuentemente"],
    weights: [0, 1, 2],
  },
  {
    id: "screens",
    text: "¿Cuántas horas al día usas pantallas (celular, computador, TV)?",
    options: ["Menos de 2 horas", "2–4 horas", "4–8 horas", "Más de 8 horas"],
    weights: [0, 0, 1, 2],
  },
  {
    id: "exam",
    text: "¿Cuándo fue tu último examen visual con un optómetra?",
    options: ["Hace menos de 1 año", "Hace 1–2 años", "Hace más de 2 años", "Nunca"],
    weights: [0, 1, 2, 3],
  },
];

const MAX_Q = QUESTIONS.reduce((s, q) => s + Math.max(...q.weights), 0);
const L_GUIDE = { cx: 0.35, cy: 0.37, rx: 0.10, ry: 0.06 };

const ACUITY_LEVELS = [
  { size: 72, label: "20/200", meaning: "Muy baja" },
  { size: 48, label: "20/100", meaning: "Baja" },
  { size: 28, label: "20/40",  meaning: "Moderada" },
  { size: 16, label: "20/20",  meaning: "Normal" },
];
const E_DIRS = ["→", "←", "↑", "↓"];
const DIR_LABELS = { "→": "Derecha →", "←": "← Izquierda", "↑": "↑ Arriba", "↓": "Abajo ↓" };
const DIR_ROTATIONS = { "→": "rotate(0deg)", "←": "rotate(180deg)", "↑": "rotate(-90deg)", "↓": "rotate(90deg)" };
const R_GUIDE = { cx: 0.65, cy: 0.37, rx: 0.10, ry: 0.06 };

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getRisk(lR, rR, as, qS) {
  if (lR > 55 || rR > 55 || as > 60 || qS > 65)
    return { label: "Requiere atención", tc: "var(--color-text-danger)",  bc: "var(--color-background-danger)" };
  if (lR > 22 || rR > 22 || as > 28 || qS > 32)
    return { label: "Riesgo moderado",   tc: "var(--color-text-warning)", bc: "var(--color-background-warning)" };
  return   { label: "Bajo riesgo",       tc: "var(--color-text-success)", bc: "var(--color-background-success)" };
}

function sampleRegion(data, W, H, g) {
  let r = 0, gv = 0, b = 0, n = 0;
  const x0 = Math.max(0, Math.floor((g.cx - g.rx) * W));
  const x1 = Math.min(W, Math.ceil((g.cx + g.rx) * W));
  const y0 = Math.max(0, Math.floor((g.cy - g.ry) * H));
  const y1 = Math.min(H, Math.ceil((g.cy + g.ry) * H));
  for (let y = y0; y < y1; y += 2)
    for (let x = x0; x < x1; x += 2) {
      const i = (y * W + x) * 4;
      r += data[i]; gv += data[i + 1]; b += data[i + 2]; n++;
    }
  if (!n) return { r: 128, redness: 0.37 };
  r /= n; gv /= n; b /= n;
  return { r, redness: r / (r + gv + b + 1) };
}

function fallbackText(score) {
  return score > 45
    ? "Se detectaron señales que podrían indicar irritación o tensión ocular. Te recomendamos visitar un optómetra para una evaluación completa.\n\nTus respuestas también sugieren síntomas que ameritan revisión profesional. Un especialista tiene los equipos precisos para darte un diagnóstico certero.\n\n¡Tu salud visual es una prioridad! Actuar a tiempo siempre marca la diferencia."
    : "Tus indicadores están dentro de parámetros normales según esta evaluación preventiva. Aun así, recomendamos un chequeo con un optómetra al menos una vez al año.\n\nMantener controles regulares es la mejor manera de detectar cambios antes de que se vuelvan problemas.\n\n¡Bien por preocuparte por tu salud visual! Un profesional puede confirmarte que todo está en orden.";
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────
function toDb(r) {
  return {
    id: r.id, fecha: r.fecha, nombre: r.nombre, cedula: r.cedula,
    direccion: r.direccion, correo: r.correo, celular: r.celular,
    overall: r.overall, left_red: r.leftRed, right_red: r.rightRed,
    asym: r.asym, q_score: r.qScore, riesgo: r.riesgo, estado: r.estado,
    acuidad: r.acuidad, astigmatismo: r.astigmatismo, vision_cerca: r.visionCerca,
  };
}
function fromDb(row) {
  return {
    id: row.id, fecha: row.fecha, nombre: row.nombre, cedula: row.cedula,
    direccion: row.direccion, correo: row.correo, celular: row.celular,
    overall: row.overall, leftRed: row.left_red, rightRed: row.right_red,
    asym: row.asym, qScore: row.q_score, riesgo: row.riesgo, estado: row.estado,
    acuidad: row.acuidad, astigmatismo: row.astigmatismo, visionCerca: row.vision_cerca,
  };
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const wrap = { maxWidth: 460, margin: "0 auto", padding: "1.25rem 1rem" };
const btnP = {
  width: "100%", padding: "13px", fontSize: 15, fontWeight: 500, cursor: "pointer",
  background: "var(--color-text-primary)", color: "var(--color-background-primary)",
  border: "none", borderRadius: "var(--border-radius-md)",
};
const btnS = {
  width: "100%", padding: "11px", fontSize: 13, cursor: "pointer",
  color: "var(--color-text-secondary)", background: "transparent",
  border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)",
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function VisualCheck() {
  const [screen,    setScreen]    = useState("welcome");
  const [qIndex,    setQIndex]    = useState(0);
  const [answers,   setAnswers]   = useState({});
  const [result,    setResult]    = useState(null);
  const [aiText,    setAiText]    = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [camError,  setCamError]  = useState(false);
  const [userData,  setUserData]  = useState({ nombre: "", cedula: "", direccion: "", correo: "", celular: "" });
  const [adminPin,     setAdminPin]     = useState("");
  const [evaluaciones, setEvaluaciones] = useState([]);
  const [filtroRiesgo, setFiltroRiesgo] = useState("todos");
  const [pdfLoading,   setPdfLoading]   = useState(false);
  // Visual tests states
  const [vtPhase,    setVtPhase]    = useState("intro"); // intro|acuity|astigmatism|near|summary
  const [acuityLevel, setAcuityLevel] = useState(0);
  const [acuityDir,   setAcuityDir]   = useState("→");
  const [vtResults,   setVtResults]   = useState({ acuity: null, astigmatism: null, near: null });
  const [sheetsUrl,    setSheetsUrl]    = useState("");
  const [sheetsSaved,  setSheetsSaved]  = useState(false);
  const [sheetsStatus, setSheetsStatus] = useState("");

  const videoRef   = useRef(null);
  const overlayRef = useRef(null);
  const captureRef = useRef(null);
  const streamRef  = useRef(null);
  const rafRef     = useRef(null);

  useEffect(() => {
    if (screen !== "camera") return;
    setCamError(false);
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
          drawOverlay();
        }
      } catch {
        setCamError(true);
      }
    })();
    return () => {
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [screen]);

  function drawOverlay() {
    const canvas = overlayRef.current;
    const video  = videoRef.current;
    if (!canvas || !video || !video.clientWidth) {
      rafRef.current = requestAnimationFrame(drawOverlay);
      return;
    }
    const W = video.clientWidth, H = video.clientHeight;
    if (canvas.width !== W)  canvas.width  = W;
    if (canvas.height !== H) canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, W, H);
    // Dark overlay with face oval cutout
    ctx.fillStyle = "rgba(0,0,0,0.48)";
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.ellipse(W * 0.5, H * 0.46, W * 0.27, H * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    // Face border
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(W * 0.5, H * 0.46, W * 0.27, H * 0.42, 0, 0, Math.PI * 2);
    ctx.stroke();
    // Eye guides
    [L_GUIDE, R_GUIDE].forEach((g) => {
      ctx.strokeStyle = "#5DCAA5";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.ellipse(W * g.cx, H * g.cy, W * g.rx, H * g.ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    });
    rafRef.current = requestAnimationFrame(drawOverlay);
  }

  function captureAndAnalyze() {
    const video  = videoRef.current;
    const canvas = captureRef.current;
    if (!video || !canvas) return;
    canvas.width  = video.videoWidth  || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const W = canvas.width, H = canvas.height;
    const L = sampleRegion(img.data, W, H, L_GUIDE);
    const R = sampleRegion(img.data, W, H, R_GUIDE);
    const baseline = 0.370, scale = 750;
    const leftRed  = Math.round(Math.max(0, Math.min(100, (L.redness - baseline) * scale)));
    const rightRed = Math.round(Math.max(0, Math.min(100, (R.redness - baseline) * scale)));
    const asym     = Math.round(Math.min(100, Math.abs(L.r - R.r) * 0.85));
    const qTotal   = QUESTIONS.reduce((s, q) => s + (q.weights[answers[q.id] ?? 0] || 0), 0);
    const qScore   = Math.round((qTotal / MAX_Q) * 100);
    const overall  = Math.round(Math.max(leftRed, rightRed) * 0.35 + asym * 0.15 + qScore * 0.50);
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    processResult({ leftRed, rightRed, asym, qScore, overall });
  }

  function runDemo() {
    // Simulated result for demo purposes
    processResult({ leftRed: 28, rightRed: 34, asym: 16, qScore: 58, overall: 42 });
  }

  function processResult(res) {
    setResult(res);
    fetchAI(res);
    saveEval(res);
    setScreen("analyzing");
    setTimeout(() => setScreen("results"), 3000);
  }

  async function fetchAI(r) {
    setAiLoading(true);
    const summary = QUESTIONS.map((q) => `${q.text}: ${q.options[answers[q.id] ?? 0]}`).join("; ");
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: `Eres asistente de salud visual preventiva. Esta herramienta NO emite diagnósticos médicos.

Análisis de señales externas del ojo: enrojecimiento izquierdo ${r.leftRed}/100, enrojecimiento derecho ${r.rightRed}/100, asimetría ${r.asym}/100, síntomas cuestionario ${r.qScore}/100, puntuación general ${r.overall}/100. Pruebas de agudeza visual: acuidad ${vtResults.acuity || "no realizada"}, astigmatismo: ${vtResults.astigmatism || "no evaluado"}, visión de cerca: ${vtResults.near || "no evaluada"}.
Cuestionario respondido: ${summary}

Escribe exactamente 3 párrafos muy breves (máximo 2 oraciones c/u) en español:
1. Qué observó la herramienta (sin diagnóstico médico)
2. Acción concreta recomendada
3. Mensaje motivador sobre prevención visual

Tono empático, profesional, sin alarmar. Siempre recomendar consulta con optómetra.`,
          }],
        }),
      });
      const data = await res.json();
      setAiText(data.content?.[0]?.text || fallbackText(r.overall));
    } catch {
      setAiText(fallbackText(r.overall));
    }
    setAiLoading(false);
  }

  async function generatePDF() {
    setPdfLoading(true);
    try {
      if (!window.jspdf) {
        await new Promise((res, rej) => {
          const s = document.createElement("script");
          s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
          s.onload = res; s.onerror = rej;
          document.head.appendChild(s);
        });
      }
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF("p", "mm", "a4");
      const W = 210, M = 18, CW = W - 2 * M;
      let y = 22;

      const risk = getRisk(result.leftRed, result.rightRed, result.asym, result.qScore);
      const rC = risk.label === "Requiere atención" ? [200,60,58]
               : risk.label === "Riesgo moderado"   ? [170,105,15]
               :                                      [45,100,20];

      // ── Header ──────────────────────────────────────────────────────────
      doc.setFontSize(22); doc.setFont("helvetica","bold");
      doc.setTextColor(15,15,35);
      doc.text("VisualCheck", M, y);
      doc.setFontSize(10); doc.setFont("helvetica","normal");
      doc.setTextColor(110,110,120);
      doc.text("Reporte de Evaluación Visual Preventiva", M, y + 8);
      const hoy = new Date().toLocaleDateString("es-CO",{year:"numeric",month:"long",day:"numeric"});
      doc.text(hoy, W - M, y + 8, { align:"right" });
      y += 16;
      doc.setDrawColor(210,210,218); doc.setLineWidth(0.4);
      doc.line(M, y, W - M, y); y += 10;

      // ── Datos del paciente ───────────────────────────────────────────────
      doc.setFontSize(11); doc.setFont("helvetica","bold");
      doc.setTextColor(15,15,35);
      doc.text("Datos del paciente", M, y); y += 8;

      const fields = [
        ["Nombre",    userData.nombre    || "—"],
        ["Cédula",    userData.cedula    || "—"],
        ["Celular",   userData.celular   || "—"],
        ["Correo",    userData.correo    || "—"],
        ["Dirección", userData.direccion || "—"],
      ];
      const half = Math.ceil(fields.length / 2);
      fields.forEach(([label, val], i) => {
        const col = i < half ? 0 : 1;
        const row = i < half ? i : i - half;
        const x   = M + col * (CW / 2);
        const yy  = y + row * 9;
        doc.setFontSize(8.5); doc.setFont("helvetica","normal");
        doc.setTextColor(130,130,142); doc.text(label, x, yy);
        doc.setTextColor(25,25,38);    doc.text(val,   x + 24, yy);
      });
      y += half * 9 + 6;
      doc.setDrawColor(235,235,242); doc.line(M, y, W - M, y); y += 10;

      // ── Resultados ───────────────────────────────────────────────────────
      doc.setFontSize(11); doc.setFont("helvetica","bold");
      doc.setTextColor(15,15,35);
      doc.text("Resultados del análisis", M, y);
      doc.setFontSize(10); doc.setFont("helvetica","bold");
      doc.setTextColor(...rC);
      doc.text(`● ${risk.label}  ·  Puntuación ${result.overall}/100`, M + 58, y);
      y += 10;

      const scores = [
        ["Enrojecimiento ojo izquierdo", result.leftRed],
        ["Enrojecimiento ojo derecho",   result.rightRed],
        ["Asimetría ocular",             result.asym],
        ["Síntomas reportados",          result.qScore],
      ];
      const BAR_X = M + 58, BAR_W = CW - 58;
      scores.forEach(([label, val]) => {
        doc.setFontSize(9); doc.setFont("helvetica","normal");
        doc.setTextColor(75,75,88);
        doc.text(label, M, y + 3.5);
        doc.setTextColor(140,140,152);
        doc.text(`${val}/100`, BAR_X - 3, y + 3.5, { align:"right" });
        doc.setFillColor(225,225,232);
        doc.roundedRect(BAR_X, y, BAR_W, 5.5, 1, 1, "F");
        const bC = val > 55 ? [210,65,64] : val > 22 ? [186,117,23] : [59,109,17];
        doc.setFillColor(...bC);
        if (val > 0) doc.roundedRect(BAR_X, y, BAR_W * (val/100), 5.5, 1, 1, "F");
        y += 13;
      });
      y += 2;
      doc.setDrawColor(235,235,242); doc.line(M, y, W - M, y); y += 10;

      // ── Recomendación ────────────────────────────────────────────────────
      doc.setFontSize(11); doc.setFont("helvetica","bold");
      doc.setTextColor(15,15,35);
      doc.text("Recomendación", M, y); y += 8;
      doc.setFontSize(9); doc.setFont("helvetica","normal");
      doc.setTextColor(45,45,58);
      const recText = aiText || fallbackText(result.overall);
      const lines = doc.splitTextToSize(recText.replace(/\n\n/g," | "), CW);
      lines.forEach(line => {
        if (y > 268) { doc.addPage(); y = 20; }
        if (line.trim() === "\n") { y += 3; return; }
        doc.text(line, M, y); y += 5.5;
      });

      // ── Footer ───────────────────────────────────────────────────────────
      const fY = 282;
      doc.setDrawColor(210,210,218); doc.setLineWidth(0.4); doc.line(M, fY, W - M, fY);
      doc.setFontSize(7.5); doc.setTextColor(155,155,165);
      doc.text("Esta evaluación es una herramienta de detección preventiva. No constituye diagnóstico médico ni reemplaza la consulta profesional.", M, fY + 5, { maxWidth: CW });
      doc.setFontSize(8); doc.setTextColor(90,90,105);
      doc.text("VisualCheck  ·  +57 314 689 4654  ·  Medellín, Colombia", W/2, fY + 11, { align:"center" });

      const fname = `VisualCheck_${(userData.nombre||"reporte").replace(/\s+/g,"_")}.pdf`;
      doc.save(fname);
    } catch(e) {
      console.error("PDF error:", e);
    }
    setPdfLoading(false);
  }

  async function saveEval(res) {
    const record = {
      id: Date.now(),
      fecha: new Date().toLocaleString("es-CO"),
      nombre:    userData.nombre,
      cedula:    userData.cedula,
      direccion: userData.direccion,
      correo:    userData.correo,
      celular:   userData.celular,
      overall:   res.overall,
      leftRed:   res.leftRed,
      rightRed:  res.rightRed,
      asym:      res.asym,
      qScore:    res.qScore,
      riesgo:    getRisk(res.leftRed, res.rightRed, res.asym, res.qScore).label,
      acuidad:   vtResults.acuity || "no realizada",
      astigmatismo: vtResults.astigmatism || "no evaluado",
      visionCerca: vtResults.near || "no evaluada",
      estado:    "pendiente",
    };
    try {
      await supabase.from("evaluaciones").insert(toDb(record));
    } catch(e) { console.error("supabase:", e); }
    const sheetsUrlLocal = localStorage.getItem("vc_sheets_url");
    if (sheetsUrlLocal) sendToSheets(record, sheetsUrlLocal);
  }

  async function loadEvals() {
    try {
      const { data, error } = await supabase.from("evaluaciones").select("*").order("id", { ascending: false });
      setEvaluaciones(error ? [] : (data || []).map(fromDb));
      const url = localStorage.getItem("vc_sheets_url");
      if (url) setSheetsUrl(url);
    } catch { setEvaluaciones([]); }
  }

  async function sendToSheets(record, url) {
    if (!url) return;
    try {
      await fetch(url, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(record),
      });
    } catch(e) { console.log("Sheets:", e.message); }
  }

  function saveSheetUrl(url) {
    localStorage.setItem("vc_sheets_url", url);
    setSheetsUrl(url);
    setSheetsSaved(true);
    setTimeout(() => setSheetsSaved(false), 3000);
  }

  async function testSheets(url) {
    if (!url) return;
    setSheetsStatus("probando...");
    try {
      await fetch(url, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ test: true, fecha: new Date().toLocaleString("es-CO"), nombre: "TEST VisualCheck", mensaje: "Conexión exitosa" }),
      });
      setSheetsStatus("✓ enviado");
      setTimeout(() => setSheetsStatus(""), 4000);
    } catch(e) {
      setSheetsStatus("error");
      setTimeout(() => setSheetsStatus(""), 4000);
    }
  }

  async function updateEstado(id, estado) {
    try {
      await supabase.from("evaluaciones").update({ estado }).eq("id", id);
      setEvaluaciones(prev => prev.map(e => e.id === id ? { ...e, estado } : e));
    } catch(e) { console.error(e); }
  }

  function exportCSV() {
    const headers = ["Fecha","Nombre","Cédula","Dirección","Correo","Celular","Riesgo","Puntuación","Estado"];
    const rows = evaluaciones.map(e => [
      e.fecha, e.nombre, e.cedula, e.direccion||"", e.correo||"",
      e.celular, e.riesgo, e.overall||0, e.estado
    ]);
    const csv = [headers, ...rows]
      .map(r => r.map(v => `"${String(v||"").replace(/"/g,"'")}"` ).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "visualcheck_pacientes.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  function handleAcuity(chosen) {
    const correct = chosen === acuityDir;
    if (!correct) {
      const best = acuityLevel > 0 ? ACUITY_LEVELS[acuityLevel - 1].label : "< 20/200";
      setVtResults(prev => ({ ...prev, acuity: best }));
      setVtPhase("astigmatism");
    } else if (acuityLevel >= ACUITY_LEVELS.length - 1) {
      setVtResults(prev => ({ ...prev, acuity: "20/20" }));
      setVtPhase("astigmatism");
    } else {
      setAcuityLevel(prev => prev + 1);
      setAcuityDir(E_DIRS[Math.floor(Math.random() * 4)]);
    }
  }

  function handleAstig(result) {
    setVtResults(prev => ({
      ...prev,
      astigmatism: result === "equal" ? "Sin señales detectadas" : "Posibles señales de astigmatismo"
    }));
    setVtPhase("near");
  }

  function handleNear(level) {
    const nearMap = {
      large: "Dificultad significativa de cerca",
      medium: "Dificultad leve de cerca",
      small: "Visión de cerca normal"
    };
    setVtResults(prev => ({ ...prev, near: nearMap[level] }));
    setVtPhase("summary");
  }

  function reset() {
    setScreen("welcome"); setQIndex(0); setAnswers({}); setResult(null); setAiText(""); setUserData({ nombre: "", cedula: "", direccion: "", correo: "", celular: "" }); setAdminPin(""); setFiltroRiesgo("todos"); setVtPhase("intro"); setAcuityLevel(0); setAcuityDir("→"); setVtResults({ acuity: null, astigmatism: null, near: null });
  }

  // ── Welcome ────────────────────────────────────────────────────────────────
  if (screen === "welcome") return (
    <div style={{ position: "relative", overflow: "hidden" }}>
      <div style={{
        position: "absolute",
        top: -40, left: -40, right: -40, bottom: -40,
        background: "radial-gradient(ellipse at 65% 50%, #1A0A03 0%, #3D1A06 18%, #6B3010 30%, #A85820 38%, #C4721A 44%, #B86018 50%, #6A2E10 58%, #1A0803 70%, #04081A 100%)",
      }} />
      <div style={{
        position: "absolute",
        inset: 0,
        background: "rgba(4,8,20,0.52)",
      }} />
      <div style={{ position: "relative", zIndex: 1, maxWidth: 460, margin: "0 auto", padding: "2.5rem 1.5rem", textAlign: "center" }}>
        <div style={{ width: 80, height: 80, borderRadius: "50%", background: "rgba(255,255,255,0.12)", margin: "0 auto 1.5rem", display: "flex", alignItems: "center", justifyContent: "center", border: "0.5px solid rgba(255,255,255,0.25)" }}>
          <i className="ti ti-eye" style={{ fontSize: 36, color: "#fff" }} aria-hidden="true" />
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 500, margin: "0 0 8px", color: "#fff", letterSpacing: "-0.3px" }}>VisualCheck</h1>
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.65)", margin: "0 0 1.75rem" }}>Evaluación preventiva de salud visual desde tu celular</p>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", background: "rgba(255,255,255,0.08)", borderRadius: "var(--border-radius-md)", padding: "10px 12px", marginBottom: "1.5rem", border: "0.5px solid rgba(255,255,255,0.15)", textAlign: "left", lineHeight: 1.6 }}>
          Esta herramienta detecta señales externas visibles del ojo. No emite diagnósticos médicos ni reemplaza la consulta con un profesional.
        </div>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", textAlign: "left", margin: "0 0 2rem", lineHeight: 1.65 }}>
          En pocos minutos evaluaremos señales visuales mediante un cuestionario y tu cámara frontal. Recibirás una recomendación personalizada generada por IA.
        </p>
        <button
          style={{ width: "100%", padding: "14px", fontSize: 15, fontWeight: 500, cursor: "pointer", background: "rgba(255,255,255,0.96)", color: "#111", border: "none", borderRadius: "var(--border-radius-md)" }}
          onClick={() => setScreen("questionnaire")}>
          Iniciar evaluación →
        </button>
        <p
          style={{ fontSize: 10, color: "rgba(255,255,255,0.18)", marginTop: "1.75rem", cursor: "pointer", userSelect: "none", textAlign: "center" }}
          onClick={() => setScreen("admin_pin")}>
          ◆ Admin
        </p>
      </div>
    </div>
  );

  // ── Questionnaire ──────────────────────────────────────────────────────────
  // ── Registro de datos ─────────────────────────────────────────────────────
  if (screen === "registro") {
    const fields = [
      { key: "nombre",    label: "Nombre completo *", type: "text",  placeholder: "Tu nombre y apellido" },
      { key: "cedula",    label: "Cédula",             type: "text",  placeholder: "Número de cédula" },
      { key: "direccion", label: "Dirección",           type: "text",  placeholder: "Tu dirección" },
      { key: "correo",    label: "Correo electrónico",  type: "email", placeholder: "correo@ejemplo.com" },
      { key: "celular",   label: "Celular *",           type: "tel",   placeholder: "3XX XXX XXXX" },
    ];
    const isValid = userData.nombre.trim().length > 1 && userData.celular.trim().length > 6;
    return (
      <div style={wrap}>
        <div style={{ height: 3, background: "var(--color-border-tertiary)", borderRadius: 2, marginBottom: "1.75rem", overflow: "hidden" }}>
          <div style={{ height: 3, width: "0%", background: "var(--color-text-info)", borderRadius: 2 }} />
        </div>
        <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: "0 0 8px" }}>Paso 1 de 3</p>
        <p style={{ fontSize: 16, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 4px" }}>Tus datos</p>
        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 1.5rem" }}>Los campos marcados con * son obligatorios</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: "1.25rem" }}>
          {fields.map(f => (
            <div key={f.key}>
              <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 5, fontWeight: 500 }}>{f.label}</label>
              <input
                type={f.type}
                placeholder={f.placeholder}
                value={userData[f.key]}
                onChange={e => setUserData(prev => ({ ...prev, [f.key]: e.target.value }))}
                style={{ width: "100%", padding: "11px 12px", fontSize: 14, border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box", outline: "none" }}
              />
            </div>
          ))}
        </div>
        <p style={{ fontSize: 10, color: "var(--color-text-tertiary)", margin: "0 0 1.25rem", lineHeight: 1.5 }}>
          Tus datos son confidenciales y se usan únicamente para hacer seguimiento a tu evaluación visual.
        </p>
        <button
          style={{ ...btnP, opacity: isValid ? 1 : 0.45, cursor: isValid ? "pointer" : "not-allowed" }}
          disabled={!isValid}
          onClick={() => setScreen("questionnaire")}>
          Continuar →
        </button>
      </div>
    );
  }

  if (screen === "questionnaire") {
    const q = QUESTIONS[qIndex];
    return (
      <div style={wrap}>
        <div style={{ height: 3, background: "var(--color-border-tertiary)", borderRadius: 2, marginBottom: "1.75rem", overflow: "hidden" }}>
          <div style={{ height: 3, width: `${(qIndex / QUESTIONS.length) * 100}%`, background: "var(--color-text-info)", borderRadius: 2, transition: "width 0.3s" }} />
        </div>
        <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: "0 0 8px" }}>Pregunta {qIndex + 1} de {QUESTIONS.length}</p>
        <p style={{ fontSize: 16, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 1.5rem", lineHeight: 1.45 }}>{q.text}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {q.options.map((opt, i) => (
            <button key={i}
              onClick={() => {
                const a = { ...answers, [q.id]: i };
                setAnswers(a);
                if (qIndex < QUESTIONS.length - 1) setQIndex(qIndex + 1);
                else setScreen("visual_tests");
              }}
              style={{ padding: "13px 16px", textAlign: "left", fontSize: 14, border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", cursor: "pointer" }}>
              {opt}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Visual Tests ──────────────────────────────────────────────────────────────
  if (screen === "visual_tests") {
    // INTRO
    if (vtPhase === "intro") return (
      <div style={wrap}>
        <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: "0 0 8px", fontWeight: 500, letterSpacing: ".06em" }}>PRUEBAS VISUALES</p>
        <h2 style={{ fontSize: 18, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 8px" }}>Evaluemos tu visión</h2>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 1.5rem", lineHeight: 1.6 }}>Haremos 3 pruebas rápidas antes de la foto. Solo toma 2 minutos.</p>
        {[
          ["👁️", "Agudeza visual", "¿Qué tan nítido ves de lejos?"],
          ["🎯", "Astigmatismo", "Detección de irregularidades visuales"],
          ["📖", "Visión de cerca", "¿Cómo ves al leer o usar el celular?"],
        ].map(([icon, title, desc]) => (
          <div key={title} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 0", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
            <span style={{ fontSize: 22 }}>{icon}</span>
            <div>
              <p style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 2px" }}>{title}</p>
              <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0 }}>{desc}</p>
            </div>
          </div>
        ))}
        <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "10px 12px", margin: "1.25rem 0", fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
          📏 Sostén el celular a la distancia de tu brazo (~50cm). Busca buena iluminación.
        </div>
        <button style={btnP} onClick={() => { setAcuityDir(E_DIRS[Math.floor(Math.random()*4)]); setVtPhase("acuity"); }}>
          Comenzar pruebas →
        </button>
      </div>
    );

    // ACUITY TEST
    if (vtPhase === "acuity") return (
      <div style={wrap}>
        <div style={{ height: 3, background: "var(--color-border-tertiary)", borderRadius: 2, marginBottom: "1.5rem", overflow: "hidden" }}>
          <div style={{ height: 3, width: `${(acuityLevel / ACUITY_LEVELS.length) * 100}%`, background: "var(--color-text-info)", borderRadius: 2, transition: "width .3s" }} />
        </div>
        <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: "0 0 4px" }}>Prueba 1 — Agudeza visual · Nivel {acuityLevel + 1} de {ACUITY_LEVELS.length}</p>
        <p style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 1.5rem" }}>¿Hacia dónde apuntan las "patas" de la E?</p>
        <div style={{ textAlign: "center", padding: "1.5rem 0", minHeight: 120, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: ACUITY_LEVELS[acuityLevel].size, fontWeight: 700, color: "var(--color-text-primary)", display: "inline-block", transform: DIR_ROTATIONS[acuityDir], fontFamily: "serif", lineHeight: 1, userSelect: "none" }}>E</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: "1rem" }}>
          {Object.entries(DIR_LABELS).map(([dir, label]) => (
            <button key={dir} onClick={() => handleAcuity(dir)}
              style={{ padding: "14px", fontSize: 16, border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", cursor: "pointer" }}>
              {label}
            </button>
          ))}
        </div>
      </div>
    );

    // ASTIGMATISM TEST
    if (vtPhase === "astigmatism") return (
      <div style={wrap}>
        <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: "0 0 4px" }}>Prueba 2 — Astigmatismo</p>
        <p style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 8px" }}>Mira el centro del diagrama fijamente.</p>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 1.25rem", lineHeight: 1.5 }}>¿Alguna línea se ve más oscura, borrosa o diferente al resto?</p>
        <div style={{ display: "flex", justifyContent: "center", margin: "1rem 0 1.5rem" }}>
          <svg width="200" height="200" viewBox="0 0 200 200">
            {[0,15,30,45,60,75,90,105,120,135,150,165].map(angle => {
              const r = angle * Math.PI / 180;
              return <line key={angle} x1={100 + 88*Math.cos(r)} y1={100 + 88*Math.sin(r)} x2={100 - 88*Math.cos(r)} y2={100 - 88*Math.sin(r)} stroke="currentColor" strokeWidth="1.5" />;
            })}
            <circle cx="100" cy="100" r="4" fill="currentColor" />
            {[0,30,60,90,120,150].map(angle => {
              const r = angle * Math.PI / 180;
              const x = 100 + 96*Math.cos(r - Math.PI/2);
              const y = 100 + 96*Math.sin(r - Math.PI/2);
              return <text key={"t"+angle} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize="10" fill="currentColor" opacity=".5">{angle/30 === 0 ? "12" : angle/30}</text>;
            })}
          </svg>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button onClick={() => handleAstig("equal")} style={{ padding: "13px 16px", textAlign: "left", fontSize: 14, border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", cursor: "pointer" }}>
            ✓ No, todas las líneas se ven igual
          </button>
          <button onClick={() => handleAstig("different")} style={{ padding: "13px 16px", textAlign: "left", fontSize: 14, border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", cursor: "pointer" }}>
            ⚠ Sí, algunas líneas se ven más oscuras o diferentes
          </button>
        </div>
      </div>
    );

    // NEAR VISION TEST
    if (vtPhase === "near") return (
      <div style={wrap}>
        <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: "0 0 4px" }}>Prueba 3 — Visión de cerca</p>
        <p style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 8px" }}>Mantén el celular en tu posición normal de lectura.</p>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 1.25rem" }}>¿Cuál es el texto más pequeño que puedes leer con claridad?</p>
        {[
          { level: "large",  size: 18, label: "Texto grande" },
          { level: "medium", size: 13, label: "Texto mediano" },
          { level: "small",  size: 9,  label: "Texto pequeño" },
        ].map(({ level, size, label }) => (
          <button key={level} onClick={() => handleNear(level)}
            style={{ width: "100%", padding: "14px 16px", textAlign: "left", border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", background: "var(--color-background-primary)", cursor: "pointer", marginBottom: 8 }}>
            <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: "0 0 4px", fontWeight: 500 }}>{label}</p>
            <p style={{ fontSize: size, color: "var(--color-text-primary)", margin: 0, lineHeight: 1.4 }}>
              El cuidado visual es fundamental para tu calidad de vida diaria.
            </p>
          </button>
        ))}
      </div>
    );

    // SUMMARY
    if (vtPhase === "summary") return (
      <div style={wrap}>
        <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: "0 0 8px", fontWeight: 500, letterSpacing: ".06em" }}>RESULTADOS VISUALES</p>
        <h2 style={{ fontSize: 18, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 1.25rem" }}>Tus pruebas visuales</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: "1.5rem" }}>
          {[
            { label: "Agudeza visual (lejos)", value: vtResults.acuity || "—", 
              alert: vtResults.acuity && vtResults.acuity !== "20/20" && vtResults.acuity !== "20/40" },
            { label: "Astigmatismo", value: vtResults.astigmatism || "—",
              alert: vtResults.astigmatism?.includes("Posibles") },
            { label: "Visión de cerca", value: vtResults.near || "—",
              alert: vtResults.near?.includes("Dificultad") },
          ].map(({ label, value, alert }) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-md)", background: "var(--color-background-primary)" }}>
              <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>{label}</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: alert ? "var(--color-text-warning)" : "var(--color-text-success)" }}>{value}</span>
            </div>
          ))}
        </div>
        <button style={btnP} onClick={() => setScreen("camera")}>
          Continuar con la foto de tus ojos →
        </button>
      </div>
    );
  }

  // ── Camera ─────────────────────────────────────────────────────────────────
  if (screen === "camera") return (
    <div style={wrap}>
      <h2 style={{ fontSize: 16, fontWeight: 500, margin: "0 0 4px", color: "var(--color-text-primary)" }}>Foto de tus ojos</h2>
      <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 12px" }}>
        Centra tu rostro en el óvalo y alinea tus ojos con las guías verdes. Asegúrate de tener buena iluminación frontal.
      </p>
      {camError ? (
        <div style={{ padding: "1.5rem", textAlign: "center", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", background: "var(--color-background-secondary)" }}>
          <i className="ti ti-eye-off" style={{ fontSize: 36, color: "var(--color-text-tertiary)" }} aria-hidden="true" />
          <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "12px 0 16px" }}>
            No se pudo acceder a la cámara. Verifica los permisos del navegador.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button style={{ ...btnP, fontSize: 13, padding: "10px" }} onClick={() => setScreen("camera")}>Reintentar con cámara</button>
            <button style={{ ...btnS, fontSize: 13, padding: "10px" }} onClick={runDemo}>Ver demo con datos de muestra →</button>
          </div>
        </div>
      ) : (
        <>
          <div style={{ position: "relative", borderRadius: "var(--border-radius-lg)", overflow: "hidden", background: "#111", marginBottom: 12 }}>
            <video ref={videoRef} style={{ width: "100%", display: "block", minHeight: 220 }} playsInline muted />
            <canvas ref={overlayRef} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none" }} />
          </div>
          <canvas ref={captureRef} style={{ display: "none" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button style={btnP} onClick={captureAndAnalyze}>Capturar y analizar</button>
            <button style={btnS} onClick={runDemo}>Usar datos de demo</button>
          </div>
        </>
      )}
    </div>
  );

  // ── Analyzing ──────────────────────────────────────────────────────────────
  if (screen === "analyzing") return (
    <div style={{ ...wrap, textAlign: "center", paddingTop: "4rem", paddingBottom: "4rem" }}>
      <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--color-background-info)", margin: "0 auto 1.5rem", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <i className="ti ti-eye" style={{ fontSize: 28, color: "var(--color-text-info)" }} aria-hidden="true" />
      </div>
      <p style={{ fontSize: 16, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 8px" }}>Analizando señales visuales...</p>
      <p style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
        Procesando indicadores de enrojecimiento, asimetría y síntomas reportados
      </p>
    </div>
  );

  // ── Results ────────────────────────────────────────────────────────────────
  if (screen === "results" && result) {
    const risk = getRisk(result.leftRed, result.rightRed, result.asym, result.qScore);
    return (
      <div style={wrap}>
        <div style={{ padding: "12px 16px", borderRadius: "var(--border-radius-md)", background: risk.bc, marginBottom: "1.25rem" }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: risk.tc }}>{risk.label} · Puntuación {result.overall}/100</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: "1.25rem" }}>
          {[
            { label: "Enrojec. ojo izq.",   value: result.leftRed },
            { label: "Enrojec. ojo der.",   value: result.rightRed },
            { label: "Asimetría ocular",    value: result.asym },
            { label: "Síntomas reportados", value: result.qScore },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "10px 12px" }}>
              <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: "0 0 4px" }}>{label}</p>
              <p style={{ fontSize: 22, fontWeight: 500, color: "var(--color-text-primary)", margin: 0 }}>
                {value}<span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>/100</span>
              </p>
            </div>
          ))}
        </div>

        {vtResults.acuity && (
          <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "14px", marginBottom: "1.25rem" }}>
            <p style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-tertiary)", margin: "0 0 10px", letterSpacing: ".05em" }}>PRUEBAS VISUALES</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[
                { label: "Agudeza visual", value: vtResults.acuity },
                { label: "Astigmatismo", value: vtResults.astigmatism },
                { label: "Visión de cerca", value: vtResults.near },
              ].filter(x => x.value).map(({ label, value }) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{label}</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: value.includes("normal") || value === "20/20" || value === "Sin señales" ? "var(--color-text-success)" : "var(--color-text-warning)" }}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "16px", marginBottom: "1.25rem" }}>
          <p style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-tertiary)", margin: "0 0 10px", letterSpacing: "0.05em" }}>RECOMENDACIÓN</p>
          {aiLoading
            ? <p style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>Generando recomendación personalizada...</p>
            : (
              <div style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.65 }}>
                {aiText.split("\n\n").map((para, i, arr) => (
                  <p key={i} style={{ margin: i < arr.length - 1 ? "0 0 10px" : 0 }}>{para}</p>
                ))}
              </div>
            )
          }
        </div>

        <button
          style={{ ...btnS, marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          onClick={generatePDF}
          disabled={pdfLoading || aiLoading}>
          <i className="ti ti-file-type-pdf" style={{ fontSize: 16 }} aria-hidden="true" />
          {pdfLoading ? "Generando PDF..." : "Descargar reporte PDF"}
        </button>

        <a
          href={`https://wa.me/573146894654?text=Hola%2C%20acabo%20de%20hacer%20mi%20evaluaci%C3%B3n%20en%20VisualCheck.%20Mi%20nombre%20es%20${encodeURIComponent(userData.nombre)}%2C%20c%C3%A9dula%20${encodeURIComponent(userData.cedula)}%2C%20celular%20${encodeURIComponent(userData.celular)}.%20Me%20gustar%C3%ADa%20agendar%20una%20cita.`}
          target="_blank" rel="noopener noreferrer"
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "13px", fontSize: 15, fontWeight: 500, background: "#25D366", color: "#fff", borderRadius: "var(--border-radius-md)", textDecoration: "none", marginBottom: 8, boxSizing: "border-box" }}>
          <i className="ti ti-brand-whatsapp" aria-hidden="true" />
          Agenda tu cita en nuestra óptica
        </a>

        <button style={btnS} onClick={reset}>Hacer otra evaluación</button>

        <p style={{ fontSize: 10, color: "var(--color-text-tertiary)", textAlign: "center", marginTop: 12, lineHeight: 1.5 }}>
          Esta herramienta no emite diagnósticos médicos. Los resultados son orientativos. Consulta siempre con un profesional de la salud visual.
        </p>
      </div>
    );
  }

  // ── Admin Config (Sheets) ─────────────────────────────────────────────────
  if (screen === "admin_config") return (
    <div style={wrap}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1.5rem" }}>
        <button onClick={() => setScreen("admin")} style={{ ...btnS, width: "auto", padding: "7px 14px", fontSize: 13 }}>← Volver</button>
        <h2 style={{ fontSize: 16, fontWeight: 500, color: "var(--color-text-primary)", margin: 0 }}>Configuración</h2>
      </div>

      <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "20px", marginBottom: "1.25rem" }}>
        <p style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 4px" }}>Google Sheets — Webhook URL</p>
        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 14px", lineHeight: 1.5 }}>
          Cuando alguien complete una evaluación, los datos se guardan automáticamente en tu hoja de cálculo de Google.
        </p>
        <input
          type="url"
          placeholder="https://script.google.com/macros/s/..."
          value={sheetsUrl}
          onChange={e => setSheetsUrl(e.target.value)}
          style={{ width: "100%", padding: "11px 12px", fontSize: 13, border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box", marginBottom: 8 }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <button style={{ ...btnP, flex: 1, fontSize: 13, padding: "10px" }} onClick={() => saveSheetUrl(sheetsUrl)}>
            {sheetsSaved ? "✓ Guardado" : "Guardar URL"}
          </button>
          <button style={{ ...btnS, flex: 1, fontSize: 13, padding: "10px" }} onClick={() => testSheets(sheetsUrl)} disabled={!sheetsUrl}>
            {sheetsStatus || "Probar conexión"}
          </button>
        </div>
      </div>

      <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-lg)", padding: "16px" }}>
        <p style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 10px" }}>
          Cómo configurarlo (5 minutos)
        </p>
        {[
          ["1", "Ve a sheets.google.com y crea una hoja llamada «VisualCheck Pacientes»"],
          ["2", "En el menú, ve a Extensiones → Apps Script"],
          ["3", "Borra todo el código existente y pega el script que descargaste"],
          ["4", "Haz clic en Implementar → Nueva implementación"],
          ["5", "Tipo: Aplicación web · Ejecutar como: Yo · Acceso: Cualquier usuario"],
          ["6", "Copia la URL que aparece y pégala aquí arriba"],
        ].map(([n, text]) => (
          <div key={n} style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "flex-start" }}>
            <span style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(15,158,118,.12)", border: "0.5px solid rgba(15,158,118,.3)", color: "var(--color-text-success)", fontSize: 11, fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{n}</span>
            <span style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.5 }}>{text}</span>
          </div>
        ))}
      </div>
    </div>
  );

  // ── Admin PIN ────────────────────────────────────────────────────────────
  if (screen === "admin_pin") return (
    <div style={{ ...wrap, paddingTop: "3rem", textAlign: "center" }}>
      <i className="ti ti-shield-lock" style={{ fontSize: 36, color: "var(--color-text-tertiary)" }} aria-hidden="true" />
      <p style={{ fontSize: 16, fontWeight: 500, color: "var(--color-text-primary)", margin: "12px 0 4px" }}>Acceso administrativo</p>
      <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 1.5rem" }}>Ingresa tu PIN para continuar</p>
      <input
        type="password"
        placeholder="PIN"
        value={adminPin}
        onChange={e => setAdminPin(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && adminPin === "visual2025") { loadEvals(); setScreen("admin"); setAdminPin(""); } }}
        style={{ width: "100%", padding: "12px", fontSize: 18, textAlign: "center", letterSpacing: 6, border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box", marginBottom: 8 }}
      />
      <button style={{ ...btnP, marginBottom: 8 }}
        onClick={() => { if (adminPin === "visual2025") { loadEvals(); setScreen("admin"); setAdminPin(""); } else { setAdminPin(""); } }}>
        Entrar
      </button>
      <button style={btnS} onClick={() => { setAdminPin(""); setScreen("welcome"); }}>Volver</button>
    </div>
  );

  // ── Admin Dashboard ───────────────────────────────────────────────────────
  if (screen === "admin") {
    const ESTADOS = ["pendiente", "contactado", "cita agendada", "cliente"];
    const ESTADO_COLORS = {
      "pendiente":      { bg: "var(--color-background-secondary)", c: "var(--color-text-tertiary)" },
      "contactado":     { bg: "var(--color-background-info)",      c: "var(--color-text-info)" },
      "cita agendada":  { bg: "var(--color-background-warning)",   c: "var(--color-text-warning)" },
      "cliente":        { bg: "var(--color-background-success)",   c: "var(--color-text-success)" },
    };
    const filtrados = filtroRiesgo === "todos"
      ? evaluaciones
      : evaluaciones.filter(e => e.riesgo === filtroRiesgo);
    const totalAlto  = evaluaciones.filter(e => e.riesgo === "Requiere atención").length;
    const totalMod   = evaluaciones.filter(e => e.riesgo === "Riesgo moderado").length;
    const totalBajo  = evaluaciones.filter(e => e.riesgo === "Bajo riesgo").length;
    const sinContact = evaluaciones.filter(e => e.estado === "pendiente").length;
    return (
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "1rem 1rem 2rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
          <div>
            <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: "0 0 2px", fontWeight: 500, letterSpacing: ".06em" }}>PANEL ADMIN</p>
            <h2 style={{ fontSize: 18, fontWeight: 500, margin: 0, color: "var(--color-text-primary)" }}>VisualCheck</h2>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={exportCSV} style={{ ...btnS, width: "auto", padding: "7px 12px", fontSize: 12 }}>
              <i className="ti ti-download" style={{ marginRight: 4 }} aria-hidden="true" />CSV
            </button>
            <button onClick={() => { loadEvals(); }} style={{ ...btnS, width: "auto", padding: "7px 12px", fontSize: 12 }}>
              <i className="ti ti-refresh" aria-hidden="true" />
            </button>
            <button onClick={() => { loadEvals(); setScreen("admin_config"); }} style={{ ...btnS, width: "auto", padding: "7px 12px", fontSize: 12 }}>
              <i className="ti ti-settings" aria-hidden="true" />
            </button>
            <button onClick={() => setScreen("welcome")} style={{ ...btnS, width: "auto", padding: "7px 12px", fontSize: 12 }}>Salir</button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 8, marginBottom: "1.25rem" }}>
          {[
            { label: "Total",         val: evaluaciones.length, c: "var(--color-text-primary)" },
            { label: "Sin contactar", val: sinContact,          c: "var(--color-text-danger)" },
            { label: "Moderado",      val: totalMod,            c: "var(--color-text-warning)" },
            { label: "Alto riesgo",   val: totalAlto,           c: "var(--color-text-danger)" },
          ].map(({ label, val, c }) => (
            <div key={label} style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "10px 8px", textAlign: "center" }}>
              <p style={{ fontSize: 22, fontWeight: 500, color: c, margin: "0 0 2px" }}>{val}</p>
              <p style={{ fontSize: 10, color: "var(--color-text-tertiary)", margin: 0 }}>{label}</p>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: "1rem", flexWrap: "wrap" }}>
          {[["todos","Todos"], ["Requiere atención","⚠ Alto"], ["Riesgo moderado","Moderado"], ["Bajo riesgo","Bajo"]].map(([val, lbl]) => (
            <button key={val} onClick={() => setFiltroRiesgo(val)}
              style={{ padding: "5px 10px", fontSize: 11, borderRadius: 20, cursor: "pointer", fontWeight: filtroRiesgo === val ? 500 : 400,
                background: filtroRiesgo === val ? "var(--color-text-primary)" : "var(--color-background-secondary)",
                color:      filtroRiesgo === val ? "var(--color-background-primary)" : "var(--color-text-secondary)",
                border: "0.5px solid var(--color-border-secondary)" }}>
              {lbl}
            </button>
          ))}
        </div>

        {filtrados.length === 0 ? (
          <div style={{ padding: "3rem", textAlign: "center", color: "var(--color-text-tertiary)", fontSize: 13 }}>
            {evaluaciones.length === 0 ? "Aún no hay evaluaciones registradas." : "No hay pacientes con este filtro."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtrados.map(ev => {
              const rk = getRisk(ev.leftRed, ev.rightRed, ev.asym, ev.qScore);
              const ec = ESTADO_COLORS[ev.estado] || ESTADO_COLORS["pendiente"];
              return (
                <div key={ev.id} style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "12px 14px", background: "var(--color-background-primary)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 2px" }}>{ev.nombre}</p>
                      <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: 0 }}>{ev.fecha}</p>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 500, padding: "3px 8px", borderRadius: 20, background: rk.bc, color: rk.tc, whiteSpace: "nowrap" }}>
                      {ev.overall}/100
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 6, fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 10, flexWrap: "wrap" }}>
                    {ev.cedula  && <span>CC {ev.cedula}</span>}
                    {ev.celular && <span>· {ev.celular}</span>}
                    {ev.correo  && <span>· {ev.correo}</span>}
                    <span style={{ padding: "1px 6px", borderRadius: 10, background: rk.bc, color: rk.tc }}>{ev.riesgo}</span>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <a href={`https://wa.me/57${ev.celular?.replace(/\D/g,"")}?text=Hola%20${encodeURIComponent(ev.nombre)}%2C%20soy%20de%20VisualCheck.%20Vi%20tu%20evaluación%20y%20quería%20invitarte%20a%20una%20cita%20en%20nuestra%20óptica.`}
                       target="_blank" rel="noopener noreferrer"
                       style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", fontSize: 11, fontWeight: 500, background: "#25D366", color: "#fff", borderRadius: "var(--border-radius-md)", textDecoration: "none" }}>
                      <i className="ti ti-brand-whatsapp" aria-hidden="true" /> Contactar
                    </a>
                    <select value={ev.estado} onChange={e => updateEstado(ev.id, e.target.value)}
                      style={{ flex: 1, padding: "5px 8px", fontSize: 11, borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-secondary)", background: ec.bg, color: ec.c, cursor: "pointer" }}>
                      {ESTADOS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return null;
}
