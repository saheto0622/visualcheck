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
  };
}
function fromDb(row) {
  return {
    id: row.id, fecha: row.fecha, nombre: row.nombre, cedula: row.cedula,
    direccion: row.direccion, correo: row.correo, celular: row.celular,
    overall: row.overall, leftRed: row.left_red, rightRed: row.right_red,
    asym: row.asym, qScore: row.q_score, riesgo: row.riesgo, estado: row.estado,
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

Análisis de señales externas del ojo: enrojecimiento izquierdo ${r.leftRed}/100, enrojecimiento derecho ${r.rightRed}/100, asimetría ${r.asym}/100, síntomas cuestionario ${r.qScore}/100, puntuación general ${r.overall}/100.
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
      const lines = doc.splitTextToSize(recText.replace(/\n\n/g," \n\n "), CW);
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

  function reset() {
    setScreen("welcome"); setQIndex(0); setAnswers({}); setResult(null); setAiText(""); setUserData({ nombre: "", cedula: "", direccion: "", correo: "", celular: "" }); setAdminPin(""); setFiltroRiesgo("todos");
  }

  // ── Welcome ────────────────────────────────────────────────────────────────
  if (screen === "welcome") return (
    <div style={{ position: "relative", overflow: "hidden" }}>
      <div style={{
        position: "absolute",
        top: -40, left: -40, right: -40, bottom: -40,
        backgroundImage: `url(data:image/jpeg;base64,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)`,
        backgroundSize: "cover",
        backgroundPosition: "center 25%",
        filter: "blur(5px)",
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
                else setScreen("camera");
              }}
              style={{ padding: "13px 16px", textAlign: "left", fontSize: 14, border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", cursor: "pointer" }}>
              {opt}
            </button>
          ))}
        </div>
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
