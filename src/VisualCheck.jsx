import { useState, useRef, useEffect } from "react";
import { supabase } from "./lib/supabase";
import { getRisk, fromDb, toDb, VALIDACION_INFO, VT_TESTS, SEMAFORO_INFO, HC_QUESTIONS, fallbackText } from "./lib/format";
import { generateReportPDF } from "./lib/pdf";
import { wrap, btnP, btnS, input } from "./lib/styles";
import OptometristPanel from "./components/OptometristPanel";
import AdminOptometrists from "./components/AdminOptometrists";
import VisualTests from "./components/VisualTests";
import PDMeasurement from "./components/PDMeasurement";

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
  const [filtroValidacion, setFiltroValidacion] = useState("todos");
  const [optometristas, setOptometristas] = useState([]);
  const [pdfLoading,   setPdfLoading]   = useState(false);
  // Visual tests states
  const [vtResults,   setVtResults]   = useState({});
  const [sheetsUrl,    setSheetsUrl]    = useState("");
  const [sheetsSaved,  setSheetsSaved]  = useState(false);
  const [sheetsStatus, setSheetsStatus] = useState("");
  // Consentimiento informado
  const [consentAccepted,  setConsentAccepted]  = useState(false);
  const [consentTimestamp, setConsentTimestamp] = useState(null);
  // Historia clínica básica
  const [historia, setHistoria] = useState({
    hcUsaGafas: "", hcDiabetesHipertension: "", hcAntecedentesFamiliares: "",
    hcCirugiaOcular: "", hcUltimaFormula: "",
  });
  // Landing page
  const [evalCount, setEvalCount] = useState(null);
  const [faqOpen,   setFaqOpen]   = useState(null);
  // Patient panel "Mis resultados"
  const [misCedula,     setMisCedula]     = useState("");
  const [misResultados, setMisResultados] = useState(null);
  const [misLoading,    setMisLoading]    = useState(false);
  const [misError,      setMisError]      = useState("");
  // Distancia pupilar (PD)
  const [pd, setPd] = useState(null);

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

  useEffect(() => {
    (async () => {
      try {
        const { count } = await supabase.from("evaluaciones").select("*", { count: "exact", head: true });
        setEvalCount(count ?? 0);
      } catch {
        setEvalCount(null);
      }
    })();
  }, []);

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
    const fullRes = { ...res, id: Date.now(), fecha: new Date().toLocaleString("es-CO") };
    setResult(fullRes);
    fetchAI(fullRes);
    saveEval(fullRes);
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
Batería de 13 pruebas visuales: ${VT_TESTS.map(t => `${t.label}: ${vtResults[t.key] || "no realizada"}`).join("; ")}.
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
      const record = {
        nombre: userData.nombre, cedula: userData.cedula, direccion: userData.direccion,
        correo: userData.correo, celular: userData.celular, fecha: result.fecha,
        overall: result.overall, leftRed: result.leftRed, rightRed: result.rightRed,
        asym: result.asym, qScore: result.qScore,
        ...historia,
        ...vtResults,
        ...(pd || {}),
        estadoValidacion: "pendiente",
      };
      await generateReportPDF(record, aiText || fallbackText(result.overall));
    } catch(e) {
      console.error("PDF error:", e);
    }
    setPdfLoading(false);
  }

  async function saveEval(res) {
    const record = {
      id: res.id,
      fecha: res.fecha,
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
      estadoValidacion: "pendiente",
      consentimientoAceptado: consentAccepted,
      consentimientoFecha: consentTimestamp,
      ...historia,
      ...vtResults,
    };
    try {
      await supabase.from("evaluaciones").insert(toDb(record));
    } catch(e) { console.error("supabase:", e); }
    const sheetsUrlLocal = localStorage.getItem("vc_sheets_url");
    if (sheetsUrlLocal) sendToSheets(record, sheetsUrlLocal);
  }

  async function buscarMisResultados() {
    const cedula = misCedula.trim();
    if (!cedula) return;
    setMisLoading(true);
    setMisError("");
    setMisResultados(null);
    try {
      const { data, error } = await supabase
        .from("evaluaciones")
        .select("*")
        .eq("cedula", cedula)
        .order("id", { ascending: false });
      if (error) throw error;
      setMisResultados((data || []).map(fromDb));
      if (!data || data.length === 0) setMisError("No encontramos evaluaciones con esa cédula.");
    } catch {
      setMisError("No se pudo buscar tu historial. Intenta de nuevo.");
    }
    setMisLoading(false);
  }

  async function handlePdConfirm(pdData) {
    setPd(pdData);
    setScreen("results");
    try {
      await supabase.from("evaluaciones").update({
        pd_binocular: pdData.pdBinocular,
        pd_od: pdData.pdOd,
        pd_oi: pdData.pdOi,
        pd_precision: pdData.pdPrecision,
      }).eq("id", result.id);
    } catch (e) { console.error("PD update:", e); }
  }

  async function descargarPDFResultado(ev) {
    setPdfLoading(true);
    try {
      await generateReportPDF(ev, null);
    } catch(e) {
      console.error("PDF error:", e);
    }
    setPdfLoading(false);
  }

  async function loadEvals() {
    try {
      const { data, error } = await supabase.from("evaluaciones").select("*").order("id", { ascending: false });
      setEvaluaciones(error ? [] : (data || []).map(fromDb));
      const url = localStorage.getItem("vc_sheets_url");
      if (url) setSheetsUrl(url);
    } catch { setEvaluaciones([]); }
  }

  async function loadOptometristas() {
    try {
      const { data, error } = await supabase.from("optometristas").select("*").eq("activo", true).order("nombre");
      setOptometristas(error ? [] : (data || []));
    } catch { setOptometristas([]); }
  }

  async function asignarOptometrista(id, optometristaId) {
    const opt = optometristas.find(o => String(o.id) === String(optometristaId));
    const updates = opt
      ? { optometrista_id: opt.id, optometrista_nombre: opt.nombre, estado_validacion: "en revision" }
      : { optometrista_id: null, optometrista_nombre: null, estado_validacion: "pendiente" };
    try {
      await supabase.from("evaluaciones").update(updates).eq("id", id);
      setEvaluaciones(prev => prev.map(e => e.id === id ? {
        ...e,
        optometristaId: updates.optometrista_id,
        optometristaNombre: updates.optometrista_nombre,
        estadoValidacion: updates.estado_validacion,
      } : e));
    } catch(e) { console.error(e); }
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

  function handleVtFinish(vtRes) {
    setVtResults(vtRes);
    setScreen("camera");
  }

  function reset() {
    setScreen("welcome"); setQIndex(0); setAnswers({}); setResult(null); setAiText(""); setUserData({ nombre: "", cedula: "", direccion: "", correo: "", celular: "" }); setAdminPin(""); setFiltroRiesgo("todos"); setFiltroValidacion("todos"); setVtResults({});
    setConsentAccepted(false); setConsentTimestamp(null);
    setHistoria({ hcUsaGafas: "", hcDiabetesHipertension: "", hcAntecedentesFamiliares: "", hcCirugiaOcular: "", hcUltimaFormula: "" });
    setMisCedula(""); setMisResultados(null); setMisError("");
    setPd(null);
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
        {evalCount !== null && evalCount > 0 && (
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: "1.5rem" }}>
            <span style={{ fontWeight: 600, color: "#fff" }}>{evalCount.toLocaleString("es-CO")}</span> evaluaciones realizadas hasta ahora
          </div>
        )}
        <button
          style={{ width: "100%", padding: "14px", fontSize: 15, fontWeight: 500, cursor: "pointer", background: "rgba(255,255,255,0.96)", color: "#111", border: "none", borderRadius: "var(--border-radius-md)" }}
          onClick={() => setScreen("consent")}>
          Iniciar evaluación →
        </button>
        <p
          style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: "1rem", cursor: "pointer", userSelect: "none", textAlign: "center" }}
          onClick={() => setScreen("mis_resultados")}>
          ◆ Mis resultados
        </p>

        {/* FAQ */}
        <div style={{ marginTop: "2.5rem", textAlign: "left" }}>
          <p style={{ fontSize: 13, fontWeight: 500, color: "#fff", margin: "0 0 0.75rem" }}>Preguntas frecuentes</p>
          {[
            ["¿Es gratuito?", "Sí, VisualCheck es completamente gratuito para los pacientes."],
            ["¿Reemplaza al optómetra?", "No. Es una herramienta de detección preventiva y no sustituye una consulta con un optómetra certificado."],
            ["¿Qué precisión tienen las pruebas?", "Las pruebas son orientativas y dependen de la iluminación y tu dispositivo; no tienen la precisión de un examen clínico profesional."],
            ["¿Cómo se protegen mis datos?", "Tus datos se almacenan de forma segura y solo son accesibles por el equipo de VisualCheck y los optómetras autorizados, conforme a la Ley 1581 de 2012."],
            ["¿Cuánto tarda mi resultado?", "El análisis se genera en pocos segundos al finalizar la evaluación."],
            ["¿Funciona en cualquier celular?", "Funciona en cualquier celular con cámara frontal y un navegador moderno (Chrome, Safari, etc.)."],
          ].map(([q, a], i) => (
            <div key={i} style={{ borderBottom: "0.5px solid rgba(255,255,255,0.12)" }}>
              <button
                onClick={() => setFaqOpen(faqOpen === i ? null : i)}
                style={{ width: "100%", textAlign: "left", padding: "10px 0", background: "transparent", border: "none", color: "#fff", fontSize: 12.5, fontWeight: 500, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                {q}
                <span style={{ color: "rgba(255,255,255,0.4)" }}>{faqOpen === i ? "−" : "+"}</span>
              </button>
              {faqOpen === i && (
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", margin: "0 0 10px", lineHeight: 1.6 }}>{a}</p>
              )}
            </div>
          ))}
        </div>

        <div style={{ marginTop: "2rem", display: "flex", justifyContent: "center", gap: 14 }}>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", cursor: "pointer", userSelect: "none" }} onClick={() => setScreen("privacy")}>
            Política de privacidad
          </span>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", cursor: "pointer", userSelect: "none" }} onClick={() => setScreen("terms")}>
            Términos y condiciones
          </span>
        </div>
        <p
          style={{ fontSize: 10, color: "rgba(255,255,255,0.18)", marginTop: "1.25rem", cursor: "pointer", userSelect: "none", textAlign: "center" }}
          onClick={() => setScreen("admin_pin")}>
          ◆ Admin
        </p>
        <p
          style={{ fontSize: 10, color: "rgba(255,255,255,0.18)", marginTop: "0.5rem", cursor: "pointer", userSelect: "none", textAlign: "center" }}
          onClick={() => setScreen("opt_login")}>
          ◆ Optómetra
        </p>
      </div>
    </div>
  );

  // ── Consentimiento informado ───────────────────────────────────────────────
  if (screen === "consent") {
    return (
      <div style={wrap}>
        <div style={{ height: 3, background: "var(--color-border-tertiary)", borderRadius: 2, marginBottom: "1.75rem", overflow: "hidden" }}>
          <div style={{ height: 3, width: "25%", background: "var(--color-text-info)", borderRadius: 2 }} />
        </div>
        <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: "0 0 8px" }}>Paso 1 de 4</p>
        <p style={{ fontSize: 16, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 4px" }}>Consentimiento informado</p>
        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 1.25rem", lineHeight: 1.6 }}>
          Antes de continuar, por favor lee y acepta lo siguiente:
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: "1.5rem" }}>
          <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "14px" }}>
            <p style={{ fontSize: 12.5, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 6px" }}>¿Qué datos recopilamos?</p>
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0, lineHeight: 1.6 }}>
              Tu nombre, cédula, dirección, correo y celular; tus respuestas al cuestionario y a la batería de pruebas visuales; y una foto de tus ojos tomada con tu cámara.
            </p>
          </div>
          <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "14px" }}>
            <p style={{ fontSize: 12.5, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 6px" }}>¿Para qué se usan?</p>
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0, lineHeight: 1.6 }}>
              Para realizar una evaluación preventiva de tu salud visual y, si lo solicitas o un optómetra lo determina, para que un profesional valide los resultados.
            </p>
          </div>
          <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "14px" }}>
            <p style={{ fontSize: 12.5, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 6px" }}>¿Quién tiene acceso?</p>
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0, lineHeight: 1.6 }}>
              Únicamente el equipo de VisualCheck y los optómetras autorizados que validen tu evaluación.
            </p>
          </div>
          <div style={{ border: "0.5px solid var(--color-border-warning, var(--color-border-tertiary))", borderRadius: "var(--border-radius-lg)", padding: "14px", background: "var(--color-background-warning)" }}>
            <p style={{ fontSize: 12.5, fontWeight: 500, color: "var(--color-text-warning)", margin: "0 0 6px" }}>Importante</p>
            <p style={{ fontSize: 12, color: "var(--color-text-warning)", margin: 0, lineHeight: 1.6 }}>
              VisualCheck NO es un diagnóstico médico. Es únicamente una herramienta de detección preventiva y no reemplaza la consulta con un profesional de la salud visual.
            </p>
          </div>
          <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "14px" }}>
            <p style={{ fontSize: 12.5, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 6px" }}>Tus derechos (Ley 1581 de 2012)</p>
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0, lineHeight: 1.6 }}>
              Como titular de tus datos, tienes derecho a conocer, actualizar, rectificar y suprimir tu información en cualquier momento, escribiendo a <strong>visualcheck@gmail.com</strong>.
            </p>
          </div>
        </div>

        <div style={{ marginTop: "2rem", display: "flex", justifyContent: "center", gap: 14, marginBottom: "1rem" }}>
          <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", cursor: "pointer", userSelect: "none", textDecoration: "underline" }} onClick={() => setScreen("privacy")}>
            Política de privacidad
          </span>
          <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", cursor: "pointer", userSelect: "none", textDecoration: "underline" }} onClick={() => setScreen("terms")}>
            Términos y condiciones
          </span>
        </div>

        <button
          style={{ ...btnP, marginBottom: 8 }}
          onClick={() => {
            setConsentAccepted(true);
            setConsentTimestamp(new Date().toISOString());
            setScreen("registro");
          }}>
          Acepto y continúo
        </button>
        <button style={btnS} onClick={() => setScreen("welcome")}>No acepto</button>
      </div>
    );
  }

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
          <div style={{ height: 3, width: "50%", background: "var(--color-text-info)", borderRadius: 2 }} />
        </div>
        <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: "0 0 8px" }}>Paso 2 de 4</p>
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
          onClick={() => setScreen("historia_clinica")}>
          Continuar →
        </button>
      </div>
    );
  }

  // ── Historia clínica básica ────────────────────────────────────────────────
  if (screen === "historia_clinica") {
    const isValid = HC_QUESTIONS.every(q => historia[q.key]);
    return (
      <div style={wrap}>
        <div style={{ height: 3, background: "var(--color-border-tertiary)", borderRadius: 2, marginBottom: "1.75rem", overflow: "hidden" }}>
          <div style={{ height: 3, width: "75%", background: "var(--color-text-info)", borderRadius: 2 }} />
        </div>
        <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: "0 0 8px" }}>Paso 3 de 4</p>
        <p style={{ fontSize: 16, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 4px" }}>Historia clínica básica</p>
        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 1.5rem" }}>
          Esta información ayuda al optómetra a interpretar mejor tus resultados.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: "1.25rem" }}>
          {HC_QUESTIONS.map(q => (
            <div key={q.key}>
              <p style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 8px", lineHeight: 1.45 }}>{q.text}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {q.options.map(opt => (
                  <button key={opt}
                    onClick={() => setHistoria(prev => ({ ...prev, [q.key]: opt }))}
                    style={{
                      padding: "10px 14px", textAlign: "left", fontSize: 13, borderRadius: "var(--border-radius-md)", cursor: "pointer",
                      border: historia[q.key] === opt ? "1px solid var(--color-text-info)" : "0.5px solid var(--color-border-secondary)",
                      background: historia[q.key] === opt ? "var(--color-background-info)" : "var(--color-background-primary)",
                      color: historia[q.key] === opt ? "var(--color-text-info)" : "var(--color-text-primary)",
                      fontWeight: historia[q.key] === opt ? 500 : 400,
                    }}>
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div>
            <label style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)", display: "block", marginBottom: 8 }}>
              ¿Cuál fue tu última fórmula óptica? <span style={{ fontWeight: 400, color: "var(--color-text-tertiary)" }}>(opcional)</span>
            </label>
            <input
              type="text"
              placeholder="Ej: OD -1.00, OI -1.25"
              value={historia.hcUltimaFormula}
              onChange={e => setHistoria(prev => ({ ...prev, hcUltimaFormula: e.target.value }))}
              style={input}
            />
          </div>
        </div>
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
    return <VisualTests onFinish={handleVtFinish} />;
  }

  // ── Medición de distancia pupilar (PD) ───────────────────────────────────────
  if (screen === "pd_measurement") {
    return <PDMeasurement onConfirm={handlePdConfirm} onCancel={() => setScreen("results")} />;
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
        <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "14px", marginBottom: "1.25rem" }}>
          <p style={{ fontSize: 16, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 4px" }}>{userData.nombre || "—"}</p>
          <div style={{ display: "flex", gap: 6, fontSize: 12, color: "var(--color-text-secondary)", flexWrap: "wrap" }}>
            {userData.cedula && <span>CC {userData.cedula}</span>}
            <span>· {result.fecha}</span>
          </div>
        </div>

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

        {vtResults.vtStatus && (
          <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "14px", marginBottom: "1.25rem" }}>
            <p style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-tertiary)", margin: "0 0 10px", letterSpacing: ".05em" }}>PRUEBAS VISUALES (13)</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {VT_TESTS.filter(t => vtResults[t.key]).map(({ key, label }) => {
                const status = vtResults.vtStatus?.[key] || "gray";
                const sc = SEMAFORO_INFO[status];
                return (
                  <div key={key} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{label}</span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: sc.c, textAlign: "right", maxWidth: "55%" }}>{vtResults[key]}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {pd && (
          <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "14px", marginBottom: "1.25rem" }}>
            <p style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-tertiary)", margin: "0 0 10px", letterSpacing: ".05em" }}>DISTANCIA PUPILAR (PD)</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {[
                ["Binocular", pd.pdBinocular],
                ["OD", pd.pdOd],
                ["OI", pd.pdOi],
              ].map(([label, val]) => (
                <div key={label} style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "8px", textAlign: "center" }}>
                  <p style={{ fontSize: 10, color: "var(--color-text-tertiary)", margin: "0 0 2px" }}>{label}</p>
                  <p style={{ fontSize: 15, fontWeight: 500, color: "var(--color-text-primary)", margin: 0 }}>{val} <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>mm</span></p>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 10, color: "var(--color-text-tertiary)", margin: "8px 0 0" }}>Precisión: {pd.pdPrecision}</p>
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
          onClick={() => setScreen("pd_measurement")}>
          📏 {pd ? "Medir de nuevo mi distancia pupilar →" : "Medir mi distancia pupilar →"}
        </button>

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

  // ── Mis resultados (panel del paciente) ──────────────────────────────────
  if (screen === "mis_resultados") {
    return (
      <div style={wrap}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1.5rem" }}>
          <button onClick={() => setScreen("welcome")} style={{ ...btnS, width: "auto", padding: "7px 14px", fontSize: 13 }}>← Volver</button>
          <h2 style={{ fontSize: 16, fontWeight: 500, color: "var(--color-text-primary)", margin: 0 }}>Mis resultados</h2>
        </div>
        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 1.25rem", lineHeight: 1.6 }}>
          Ingresa tu número de cédula para ver el historial de tus evaluaciones y descargar tus reportes.
        </p>
        <div style={{ display: "flex", gap: 8, marginBottom: "1.25rem" }}>
          <input
            type="text"
            placeholder="Número de cédula"
            value={misCedula}
            onChange={e => setMisCedula(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") buscarMisResultados(); }}
            style={{ ...input, flex: 1 }}
          />
          <button style={{ ...btnP, width: "auto", padding: "11px 18px" }} onClick={buscarMisResultados} disabled={misLoading}>
            {misLoading ? "..." : "Buscar"}
          </button>
        </div>

        {misError && (
          <p style={{ fontSize: 12, color: "var(--color-text-danger)", textAlign: "center", margin: "0 0 1rem" }}>{misError}</p>
        )}

        {misResultados && misResultados.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {misResultados.map(ev => {
              const rk = getRisk(ev.leftRed, ev.rightRed, ev.asym, ev.qScore);
              return (
                <div key={ev.id} style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "12px 14px", background: "var(--color-background-primary)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 2px" }}>{ev.fecha}</p>
                      <span style={{ fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 20, background: rk.bc, color: rk.tc }}>{ev.riesgo} · {ev.overall}/100</span>
                    </div>
                    {ev.estadoValidacion === "validada" && (
                      <span style={{ fontSize: 11, fontWeight: 500, padding: "3px 8px", borderRadius: 20, background: "var(--color-background-success)", color: "var(--color-text-success)", whiteSpace: "nowrap" }}>
                        Fórmula validada ✓
                      </span>
                    )}
                  </div>
                  <button style={{ ...btnS, fontSize: 13, padding: "10px" }} onClick={() => descargarPDFResultado(ev)} disabled={pdfLoading}>
                    <i className="ti ti-file-type-pdf" style={{ marginRight: 6 }} aria-hidden="true" />
                    {pdfLoading ? "Generando PDF..." : "Descargar reporte PDF"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Política de Privacidad ────────────────────────────────────────────────
  if (screen === "privacy") {
    return (
      <div style={wrap}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1.5rem" }}>
          <button onClick={() => setScreen("welcome")} style={{ ...btnS, width: "auto", padding: "7px 14px", fontSize: 13 }}>← Volver</button>
          <h2 style={{ fontSize: 16, fontWeight: 500, color: "var(--color-text-primary)", margin: 0 }}>Política de Privacidad</h2>
        </div>
        <div style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.7, display: "flex", flexDirection: "column", gap: 14 }}>
          <p>
            En cumplimiento de la Ley 1581 de 2012 sobre protección de datos personales en Colombia, VisualCheck informa lo siguiente:
          </p>
          <div>
            <p style={{ fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 4px" }}>Responsable del tratamiento</p>
            <p style={{ margin: 0 }}>VisualCheck, herramienta de evaluación preventiva de salud visual con sede en Medellín, Colombia.</p>
          </div>
          <div>
            <p style={{ fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 4px" }}>Datos que recopilamos</p>
            <p style={{ margin: 0 }}>Nombre, número de cédula, dirección, correo electrónico, celular, respuestas del cuestionario de síntomas, historia clínica básica, resultados de la batería de pruebas visuales y una imagen capturada de tus ojos.</p>
          </div>
          <div>
            <p style={{ fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 4px" }}>Finalidad del tratamiento</p>
            <p style={{ margin: 0 }}>Realizar una evaluación preventiva de salud visual, generar un reporte para el paciente, permitir su seguimiento y, cuando corresponda, su validación por un optómetra autorizado.</p>
          </div>
          <div>
            <p style={{ fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 4px" }}>Derechos del titular</p>
            <p style={{ margin: 0 }}>Como titular de los datos, tienes derecho a conocer, actualizar, rectificar y suprimir tu información personal, así como a revocar la autorización otorgada para su tratamiento, en cualquier momento.</p>
          </div>
          <div>
            <p style={{ fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 4px" }}>Contacto</p>
            <p style={{ margin: 0 }}>Para ejercer tus derechos o realizar consultas sobre el tratamiento de tus datos, escríbenos a <strong>visualcheck@gmail.com</strong>.</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Términos y Condiciones ────────────────────────────────────────────────
  if (screen === "terms") {
    return (
      <div style={wrap}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1.5rem" }}>
          <button onClick={() => setScreen("welcome")} style={{ ...btnS, width: "auto", padding: "7px 14px", fontSize: 13 }}>← Volver</button>
          <h2 style={{ fontSize: 16, fontWeight: 500, color: "var(--color-text-primary)", margin: 0 }}>Términos y Condiciones</h2>
        </div>
        <div style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.7, display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <p style={{ fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 4px" }}>Descripción del servicio</p>
            <p style={{ margin: 0 }}>VisualCheck es una herramienta digital de evaluación preventiva de salud visual que combina un cuestionario de síntomas, una historia clínica básica, una batería de pruebas visuales y un análisis de imágenes capturadas con la cámara del dispositivo del usuario.</p>
          </div>
          <div>
            <p style={{ fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 4px" }}>No es un dispositivo médico</p>
            <p style={{ margin: 0 }}>VisualCheck no es un dispositivo médico ni una herramienta de diagnóstico clínico. Los resultados generados son orientativos y tienen fines exclusivamente preventivos e informativos.</p>
          </div>
          <div>
            <p style={{ fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 4px" }}>Validación profesional requerida</p>
            <p style={{ margin: 0 }}>Cualquier fórmula óptica o recomendación generada por VisualCheck debe ser revisada y validada por un optómetra certificado antes de tomar decisiones sobre el tratamiento o uso de corrección visual.</p>
          </div>
          <div>
            <p style={{ fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 4px" }}>Limitación de responsabilidad</p>
            <p style={{ margin: 0 }}>VisualCheck y su equipo no se hacen responsables por decisiones médicas tomadas con base únicamente en los resultados de esta herramienta, sin la validación de un profesional de la salud visual.</p>
          </div>
          <div>
            <p style={{ fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 4px" }}>Ley aplicable</p>
            <p style={{ margin: 0 }}>Estos términos se rigen por las leyes de la República de Colombia, incluyendo la Ley 1581 de 2012 sobre protección de datos personales.</p>
          </div>
        </div>
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
        onKeyDown={e => { if (e.key === "Enter" && adminPin === "visual2025") { loadEvals(); loadOptometristas(); setScreen("admin"); setAdminPin(""); } }}
        style={{ width: "100%", padding: "12px", fontSize: 18, textAlign: "center", letterSpacing: 6, border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box", marginBottom: 8 }}
      />
      <button style={{ ...btnP, marginBottom: 8 }}
        onClick={() => { if (adminPin === "visual2025") { loadEvals(); loadOptometristas(); setScreen("admin"); setAdminPin(""); } else { setAdminPin(""); } }}>
        Entrar
      </button>
      <button style={btnS} onClick={() => { setAdminPin(""); setScreen("welcome"); }}>Volver</button>
    </div>
  );

  // ── Optometrist Panel ─────────────────────────────────────────────────────
  if (screen === "opt_login") return <OptometristPanel onExit={() => setScreen("welcome")} />;

  // ── Admin: Optometrists management ────────────────────────────────────────
  if (screen === "admin_optometristas") return <AdminOptometrists onBack={() => { loadOptometristas(); setScreen("admin"); }} />;

  // ── Admin Dashboard ───────────────────────────────────────────────────────
  if (screen === "admin") {
    const ESTADOS = ["pendiente", "contactado", "cita agendada", "cliente"];
    const ESTADO_COLORS = {
      "pendiente":      { bg: "var(--color-background-secondary)", c: "var(--color-text-tertiary)" },
      "contactado":     { bg: "var(--color-background-info)",      c: "var(--color-text-info)" },
      "cita agendada":  { bg: "var(--color-background-warning)",   c: "var(--color-text-warning)" },
      "cliente":        { bg: "var(--color-background-success)",   c: "var(--color-text-success)" },
    };
    const filtrados = evaluaciones
      .filter(e => filtroRiesgo === "todos" || e.riesgo === filtroRiesgo)
      .filter(e => filtroValidacion === "todos" || (e.estadoValidacion || "pendiente") === filtroValidacion);
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
            <button onClick={() => setScreen("admin_optometristas")} style={{ ...btnS, width: "auto", padding: "7px 12px", fontSize: 12 }}>
              <i className="ti ti-stethoscope" aria-hidden="true" />
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

        <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
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

        <div style={{ display: "flex", gap: 6, marginBottom: "1rem", flexWrap: "wrap" }}>
          {[["todos","Validación: todos"], ["pendiente","Sin asignar"], ["en revision","En revisión"], ["validada","Validada"]].map(([val, lbl]) => (
            <button key={val} onClick={() => setFiltroValidacion(val)}
              style={{ padding: "5px 10px", fontSize: 11, borderRadius: 20, cursor: "pointer", fontWeight: filtroValidacion === val ? 500 : 400,
                background: filtroValidacion === val ? "var(--color-text-primary)" : "var(--color-background-secondary)",
                color:      filtroValidacion === val ? "var(--color-background-primary)" : "var(--color-text-secondary)",
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
              const vc = VALIDACION_INFO[ev.estadoValidacion || "pendiente"] || VALIDACION_INFO["pendiente"];
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
                    <span style={{ padding: "1px 6px", borderRadius: 10, background: vc.bg, color: vc.c }}>{vc.label}</span>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
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
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <i className="ti ti-stethoscope" style={{ fontSize: 14, color: "var(--color-text-tertiary)" }} aria-hidden="true" />
                    <select value={ev.optometristaId ?? ""} onChange={e => asignarOptometrista(ev.id, e.target.value)}
                      style={{ flex: 1, padding: "5px 8px", fontSize: 11, borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-secondary)", color: "var(--color-text-secondary)", cursor: "pointer" }}>
                      <option value="">Sin asignar</option>
                      {optometristas.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                    </select>
                  </div>
                  {ev.estadoValidacion === "validada" && (
                    <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: "var(--border-radius-md)", background: "var(--color-background-secondary)", fontSize: 11, color: "var(--color-text-secondary)" }}>
                      <p style={{ margin: "0 0 4px", fontWeight: 500, color: "var(--color-text-primary)" }}>
                        Fórmula validada{ev.optometristaNombre ? ` por ${ev.optometristaNombre}` : ""}
                      </p>
                      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                        <span>OD: {ev.esferaOd ?? "—"} / {ev.cilindroOd ?? "—"} / {ev.ejeOd ?? "—"}° / Add {ev.adicionOd ?? "—"}</span>
                        <span>OI: {ev.esferaOi ?? "—"} / {ev.cilindroOi ?? "—"} / {ev.ejeOi ?? "—"}° / Add {ev.adicionOi ?? "—"}</span>
                      </div>
                    </div>
                  )}
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
