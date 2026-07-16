import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./lib/supabase";
import { getRisk, fromDb, toDb, VALIDACION_INFO, VT_TESTS, SEMAFORO_INFO, HC_QUESTIONS, fallbackText } from "./lib/format";
import { generateReportPDF } from "./lib/pdf";
import { wrap, btnP, btnS, input } from "./lib/styles";
import OptometristPanel from "./components/OptometristPanel";
import AdminOptometrists from "./components/AdminOptometrists";
import VisualTests from "./components/VisualTests";
import PDMeasurement from "./components/PDMeasurement";
import PrescriptionEstimate from "./components/PrescriptionEstimate";
import EyeCapture from "./components/EyeCapture";
import Catalog from "./components/Catalog";
import ProductDetail from "./components/ProductDetail";
import Cart from "./components/Cart";
import Checkout from "./components/Checkout";
import OrderConfirmation from "./components/OrderConfirmation";
import AdminPedidos from "./components/AdminPedidos";

// ─── Constants ────────────────────────────────────────────────────────────────
const QUESTIONS = [
  { id: "irritation", text: "¿Con qué frecuencia sientes ardor o irritación en tus ojos?", options: ["Nunca", "Ocasionalmente", "Frecuentemente", "Siempre"], weights: [0, 1, 2, 3] },
  { id: "far",        text: "¿Ves borroso al mirar objetos lejanos?",                       options: ["No, veo bien", "A veces", "Sí, frecuentemente"],         weights: [0, 1, 2] },
  { id: "near",       text: "¿Tienes dificultad para leer de cerca?",                        options: ["No, veo bien", "A veces", "Sí, frecuentemente"],         weights: [0, 1, 2] },
  { id: "screens",    text: "¿Cuántas horas al día usas pantallas?",                         options: ["Menos de 2 h", "2–4 h", "4–8 h", "Más de 8 h"],         weights: [0, 0, 1, 2] },
  { id: "exam",       text: "¿Cuándo fue tu último examen visual con un optómetra?",         options: ["Hace menos de 1 año", "Hace 1–2 años", "Hace más de 2 años", "Nunca"], weights: [0, 1, 2, 3] },
];
const MAX_Q = QUESTIONS.reduce((s, q) => s + Math.max(...q.weights), 0);

const SCLERA_REGIONS = [
  { cx: 0.28, cy: 0.50, rx: 0.13, ry: 0.12 },
  { cx: 0.72, cy: 0.50, rx: 0.13, ry: 0.12 },
];
const REDNESS_BASELINE = 0.370;
const REDNESS_SCALE    = 750;

// Quick test (Pantalla 1 — gancho inmediato)
const QT_LEVELS = [
  { size: 96 },
  { size: 52 },
  { size: 20 },
];
const QT_DIRS = ["→", "←", "↑", "↓"];
const QT_ROT  = { "→": "rotate(0deg)", "←": "rotate(180deg)", "↑": "rotate(-90deg)", "↓": "rotate(90deg)" };

// Funnel — ordered list of flow screens to track
const FUNNEL_ORDER = [
  { key: "quick_test",           label: "Prueba rápida" },
  { key: "quick_result",         label: "Resultado parcial" },
  { key: "mini_registro",        label: "Registro mínimo" },
  { key: "questionnaire",        label: "Cuestionario síntomas" },
  { key: "visual_tests",         label: "Batería visual (15)" },
  { key: "prescription_estimate",label: "Prescripción estimada" },
  { key: "historia_clinica",     label: "Historia clínica" },
  { key: "consent",              label: "Consentimiento" },
  { key: "camera",               label: "Fotos de ojos" },
  { key: "results",              label: "Resultado completo" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function qtRandomDir() { return QT_DIRS[Math.floor(Math.random() * QT_DIRS.length)]; }

function sampleRegion(data, W, H, g) {
  let r = 0, gv = 0, b = 0, n = 0;
  const x0 = Math.max(0, Math.floor((g.cx - g.rx) * W));
  const x1 = Math.min(W,  Math.ceil((g.cx + g.rx) * W));
  const y0 = Math.max(0, Math.floor((g.cy - g.ry) * H));
  const y1 = Math.min(H,  Math.ceil((g.cy + g.ry) * H));
  for (let y = y0; y < y1; y += 2)
    for (let x = x0; x < x1; x += 2) {
      const i = (y * W + x) * 4;
      r += data[i]; gv += data[i + 1]; b += data[i + 2]; n++;
    }
  if (!n) return { r: 128, redness: 0.37 };
  r /= n; gv /= n; b /= n;
  return { r, redness: r / (r + gv + b + 1) };
}

function analyzeEyePhoto(dataUrl) {
  return new Promise((resolve) => {
    if (!dataUrl) { resolve({ r: 128, redness: REDNESS_BASELINE }); return; }
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const samples = SCLERA_REGIONS.map(g => sampleRegion(data, canvas.width, canvas.height, g));
      const r       = samples.reduce((s, x) => s + x.r, 0) / samples.length;
      const redness = samples.reduce((s, x) => s + x.redness, 0) / samples.length;
      resolve({ r, redness });
    };
    img.onerror = () => resolve({ r: 128, redness: REDNESS_BASELINE });
    img.src = dataUrl;
  });
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function VisualCheck() {
  // ── Core flow state ──────────────────────────────────────────────────────────
  const [screen,    setScreen]    = useState("welcome");
  const [qIndex,    setQIndex]    = useState(0);
  const [answers,   setAnswers]   = useState({});
  const [result,    setResult]    = useState(null);
  const [aiText,    setAiText]    = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  // Partial after mini_registro; completed optionally in registro_completo
  const [userData, setUserData] = useState({ nombre: "", celular: "", cedula: "", direccion: "", correo: "" });

  // ── Quick test state (Pantalla 1) ─────────────────────────────────────────
  const [qtLevel,      setQtLevel]      = useState(0);
  const [qtDir,        setQtDir]        = useState("→");
  const [quickResult,  setQuickResult]  = useState(null); // "bien" | "revision" | "atencion"

  // ── Admin ─────────────────────────────────────────────────────────────────
  const [adminPin,        setAdminPin]        = useState("");
  const [evaluaciones,    setEvaluaciones]    = useState([]);
  const [filtroRiesgo,    setFiltroRiesgo]    = useState("todos");
  const [filtroValidacion,setFiltroValidacion]= useState("todos");
  const [optometristas,   setOptometristas]   = useState([]);
  const [pdfLoading,      setPdfLoading]      = useState(false);
  const [adminTab,        setAdminTab]        = useState("pacientes"); // "pacientes" | "funnel"
  const [funnelData,      setFunnelData]      = useState(null);

  // ── Visual tests ──────────────────────────────────────────────────────────
  const [vtResults,    setVtResults]    = useState({});
  const [sheetsUrl,    setSheetsUrl]    = useState("");
  const [sheetsSaved,  setSheetsSaved]  = useState(false);
  const [sheetsStatus, setSheetsStatus] = useState("");

  // ── Consent + Historia (moved later in new flow) ─────────────────────────
  const [consentAccepted,  setConsentAccepted]  = useState(false);
  const [consentTimestamp, setConsentTimestamp] = useState(null);
  const [historia, setHistoria] = useState({
    hcUsaGafas: "", hcDiabetesHipertension: "", hcAntecedentesFamiliares: "",
    hcCirugiaOcular: "", hcUltimaFormula: "", edadRango: "",
  });

  // ── Landing ───────────────────────────────────────────────────────────────
  const [evalCount, setEvalCount] = useState(null);
  const [faqOpen,   setFaqOpen]   = useState(null);

  // ── Patient panel ─────────────────────────────────────────────────────────
  const [misCedula,     setMisCedula]     = useState("");
  const [misResultados, setMisResultados] = useState(null);
  const [misLoading,    setMisLoading]    = useState(false);
  const [misError,      setMisError]      = useState("");

  // ── PD + Prescription ────────────────────────────────────────────────────
  const [pd,          setPd]          = useState(null);
  const [prescripcion,setPrescripcion]= useState(null);

  // ── E-commerce ───────────────────────────────────────────────────────────
  const [cart,                  setCart]                  = useState([]);
  const [selectedFrame,         setSelectedFrame]         = useState(null);
  const [orderConfirmationData, setOrderConfirmationData] = useState(null);

  // ── Analytics + Resume ────────────────────────────────────────────────────
  const [sessionId]   = useState(() => {
    const stored = localStorage.getItem("vc_session_id");
    if (stored) return stored;
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    localStorage.setItem("vc_session_id", id);
    return id;
  });
  const [resumeOffer, setResumeOffer] = useState(null); // { nombre, celular } or null

  // ── Refs ──────────────────────────────────────────────────────────────────
  const screenRef = useRef(screen); // for use inside async callbacks
  useEffect(() => { screenRef.current = screen; }, [screen]);

  // ── Effects ───────────────────────────────────────────────────────────────

  // Fetch total evaluation count for landing
  useEffect(() => {
    (async () => {
      try {
        const { count } = await supabase.from("evaluaciones").select("*", { count: "exact", head: true });
        setEvalCount(count ?? 0);
      } catch { setEvalCount(null); }
    })();
  }, []);

  // Check for incomplete session to offer resume
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from("progreso_evaluaciones")
          .select("nombre, celular, pantalla_actual")
          .eq("session_id", sessionId)
          .eq("completado", false)
          .gte("timestamp", new Date(Date.now() - 24 * 3600 * 1000).toISOString())
          .order("timestamp", { ascending: false })
          .limit(1);
        if (data && data.length > 0 && data[0].celular) setResumeOffer(data[0]);
      } catch { /* silent */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Analytics tracking — fires on every screen change
  useEffect(() => {
    if (screen === "welcome") return; // don't track initial load to avoid noise
    (async () => {
      try {
        await supabase.from("analytics_eventos").insert({
          pantalla: screen,
          celular: userData.celular || null,
          session_id: sessionId,
          dispositivo: navigator.userAgent.slice(0, 120),
        });
      } catch { /* silent */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  // Detect MercadoPago return via URL params
  useEffect(() => {
    const params       = new URLSearchParams(window.location.search);
    const paymentStatus = params.get("payment_status");
    const orderId       = params.get("order_id");
    const collectionId  = params.get("collection_id");
    if (paymentStatus || collectionId) {
      setOrderConfirmationData({ paymentStatus, orderId, collectionId });
      setScreen("pedido_confirmado");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Initialize quick-test direction when entering that screen
  useEffect(() => {
    if (screen === "quick_test") {
      setQtLevel(0);
      setQtDir(qtRandomDir());
    }
  }, [screen]);

  // ── Save progress to Supabase (fire-and-forget) ──────────────────────────
  const saveProgress = useCallback(async (currentScreen) => {
    if (!userData.celular) return;
    try {
      await supabase.from("progreso_evaluaciones").upsert({
        celular: userData.celular,
        session_id: sessionId,
        nombre: userData.nombre,
        pantalla_actual: currentScreen,
        completado: false,
      }, { onConflict: "session_id" });
    } catch { /* silent */ }
  }, [userData.celular, userData.nombre, sessionId]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  // Quick test — direction selected by user
  function handleQtDir(chosen) {
    if (chosen === qtDir) {
      if (qtLevel >= QT_LEVELS.length - 1) {
        setQuickResult("bien");
        setScreen("quick_result");
      } else {
        setQtLevel(l => l + 1);
        setQtDir(qtRandomDir());
      }
    } else {
      setQuickResult(qtLevel >= 2 ? "bien" : qtLevel === 1 ? "revision" : "atencion");
      setScreen("quick_result");
    }
  }

  // Mini-registro submit
  function handleMiniRegistro() {
    setScreen("questionnaire");
    saveProgress("questionnaire");
  }

  // Resume session
  function handleResume() {
    if (!resumeOffer) return;
    setUserData(prev => ({ ...prev, nombre: resumeOffer.nombre, celular: resumeOffer.celular }));
    setScreen("mini_registro");
    setResumeOffer(null);
  }

  async function handleEyesCaptured({ photoOD, photoOI }) {
    const [od, oi] = await Promise.all([analyzeEyePhoto(photoOD), analyzeEyePhoto(photoOI)]);
    const rightRed = Math.round(Math.max(0, Math.min(100, (od.redness - REDNESS_BASELINE) * REDNESS_SCALE)));
    const leftRed  = Math.round(Math.max(0, Math.min(100, (oi.redness - REDNESS_BASELINE) * REDNESS_SCALE)));
    const asym     = Math.round(Math.min(100, Math.abs(od.r - oi.r) * 0.85));
    const qTotal   = QUESTIONS.reduce((s, q) => s + (q.weights[answers[q.id] ?? 0] || 0), 0);
    const qScore   = Math.round((qTotal / MAX_Q) * 100);
    const overall  = Math.round(Math.max(leftRed, rightRed) * 0.35 + asym * 0.15 + qScore * 0.50);
    processResult({ leftRed, rightRed, asym, qScore, overall, eyePhotoOD: photoOD, eyePhotoOI: photoOI });
  }

  function runDemo() {
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
    const summary = QUESTIONS.map(q => `${q.text}: ${q.options[answers[q.id] ?? 0]}`).join("; ");
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{ role: "user", content: `Eres asistente de salud visual preventiva. Esta herramienta NO emite diagnósticos médicos.\n\nAnálisis: enrojecimiento izquierdo ${r.leftRed}/100, enrojecimiento derecho ${r.rightRed}/100, asimetría ${r.asym}/100, síntomas cuestionario ${r.qScore}/100, puntuación general ${r.overall}/100.\nBatería de 13 pruebas visuales: ${VT_TESTS.map(t => `${t.label}: ${vtResults[t.key] || "no realizada"}`).join("; ")}.\nCuestionario: ${summary}\n\nEscribe exactamente 3 párrafos muy breves (máximo 2 oraciones c/u) en español:\n1. Qué observó la herramienta (sin diagnóstico médico)\n2. Acción concreta recomendada\n3. Mensaje motivador sobre prevención visual\n\nTono empático, profesional, sin alarmar. Siempre recomendar consulta con optómetra.` }],
        }),
      });
      const data = await res.json();
      setAiText(data.content?.[0]?.text || fallbackText(r.overall));
    } catch {
      setAiText(fallbackText(r.overall));
    }
    setAiLoading(false);
  }

  async function generatePDF(overrideData) {
    setPdfLoading(true);
    try {
      const record = {
        nombre: userData.nombre, cedula: userData.cedula, direccion: userData.direccion,
        correo: userData.correo, celular: userData.celular, fecha: result.fecha,
        overall: result.overall, leftRed: result.leftRed, rightRed: result.rightRed,
        asym: result.asym, qScore: result.qScore,
        eyePhotoOD: result.eyePhotoOD, eyePhotoOI: result.eyePhotoOI,
        ...historia,
        ...vtResults,
        ...(pd || {}),
        ...prescripcionFields(),
        estadoValidacion: "pendiente",
        ...(overrideData || {}),
      };
      await generateReportPDF(record, aiText || fallbackText(result.overall));
    } catch (e) { console.error("PDF error:", e); }
    setPdfLoading(false);
  }

  async function uploadEyePhoto(dataUrl, path) {
    if (!dataUrl) return null;
    try {
      const res  = await fetch(dataUrl);
      const blob = await res.blob();
      const { error } = await supabase.storage.from("eye-photos").upload(path, blob, { contentType: "image/jpeg", upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("eye-photos").getPublicUrl(path);
      return data?.publicUrl || null;
    } catch (e) { console.error("eye photo upload:", e); return null; }
  }

  async function saveEval(res) {
    const [eyePhotoOdUrl, eyePhotoOiUrl] = await Promise.all([
      uploadEyePhoto(res.eyePhotoOD, `${res.id}_od.jpg`),
      uploadEyePhoto(res.eyePhotoOI, `${res.id}_oi.jpg`),
    ]);
    const record = {
      id: res.id, fecha: res.fecha,
      nombre: userData.nombre, cedula: userData.cedula, direccion: userData.direccion,
      correo: userData.correo, celular: userData.celular,
      overall: res.overall, leftRed: res.leftRed, rightRed: res.rightRed,
      asym: res.asym, qScore: res.qScore,
      riesgo: getRisk(res.leftRed, res.rightRed, res.asym, res.qScore).label,
      estado: "pendiente", estadoValidacion: "pendiente",
      consentimientoAceptado: consentAccepted, consentimientoFecha: consentTimestamp,
      eyePhotoOdUrl, eyePhotoOiUrl,
      ...historia, ...vtResults, ...prescripcionFields(),
    };
    try { await supabase.from("evaluaciones").insert(toDb(record)); } catch (e) { console.error("supabase:", e); }
    // Mark progress as completed
    if (userData.celular) {
      try {
        await supabase.from("progreso_evaluaciones")
          .update({ completado: true, pantalla_actual: "results" })
          .eq("session_id", sessionId);
      } catch { /* silent */ }
    }
    const sheetsUrlLocal = localStorage.getItem("vc_sheets_url");
    if (sheetsUrlLocal) sendToSheets(record, sheetsUrlLocal);
  }

  async function buscarMisResultados() {
    const cedula = misCedula.trim();
    if (!cedula) return;
    setMisLoading(true); setMisError(""); setMisResultados(null);
    try {
      const { data, error } = await supabase.from("evaluaciones").select("*").eq("cedula", cedula).order("id", { ascending: false });
      if (error) throw error;
      setMisResultados((data || []).map(fromDb));
      if (!data || data.length === 0) setMisError("No encontramos evaluaciones con esa cédula.");
    } catch { setMisError("No se pudo buscar tu historial. Intenta de nuevo."); }
    setMisLoading(false);
  }

  async function handlePdConfirm(pdData) {
    setPd(pdData);
    setScreen("results");
    try {
      await supabase.from("evaluaciones").update({
        pd_binocular: pdData.pdBinocular, pd_od: pdData.pdOd,
        pd_oi: pdData.pdOi, pd_precision: pdData.pdPrecision,
      }).eq("id", result.id);
    } catch (e) { console.error("PD update:", e); }
  }

  async function descargarPDFResultado(ev) {
    setPdfLoading(true);
    try { await generateReportPDF(ev, null); } catch (e) { console.error("PDF error:", e); }
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

  async function loadFunnel() {
    try {
      const { data } = await supabase.from("analytics_eventos").select("pantalla");
      const counts = {};
      (data || []).forEach(e => { counts[e.pantalla] = (counts[e.pantalla] || 0) + 1; });
      setFunnelData(counts);
    } catch { setFunnelData({}); }
  }

  async function asignarOptometrista(id, optometristaId) {
    const opt = optometristas.find(o => String(o.id) === String(optometristaId));
    const updates = opt
      ? { optometrista_id: opt.id, optometrista_nombre: opt.nombre, estado_validacion: "en revision" }
      : { optometrista_id: null, optometrista_nombre: null, estado_validacion: "pendiente" };
    try {
      await supabase.from("evaluaciones").update(updates).eq("id", id);
      setEvaluaciones(prev => prev.map(e => e.id === id ? { ...e, optometristaId: updates.optometrista_id, optometristaNombre: updates.optometrista_nombre, estadoValidacion: updates.estado_validacion } : e));
    } catch (e) { console.error(e); }
  }

  async function sendToSheets(record, url) {
    if (!url) return;
    try { await fetch(url, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(record) }); }
    catch (e) { console.log("Sheets:", e.message); }
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
      await fetch(url, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ test: true, fecha: new Date().toLocaleString("es-CO"), nombre: "TEST VisualCheck", mensaje: "Conexión exitosa" }) });
      setSheetsStatus("✓ enviado"); setTimeout(() => setSheetsStatus(""), 4000);
    } catch { setSheetsStatus("error"); setTimeout(() => setSheetsStatus(""), 4000); }
  }

  async function updateEstado(id, estado) {
    try {
      await supabase.from("evaluaciones").update({ estado }).eq("id", id);
      setEvaluaciones(prev => prev.map(e => e.id === id ? { ...e, estado } : e));
    } catch (e) { console.error(e); }
  }

  function exportCSV() {
    const headers = ["Fecha","Nombre","Cédula","Dirección","Correo","Celular","Riesgo","Puntuación","Estado"];
    const rows    = evaluaciones.map(e => [e.fecha, e.nombre, e.cedula, e.direccion||"", e.correo||"", e.celular, e.riesgo, e.overall||0, e.estado]);
    const csv     = [headers, ...rows].map(r => r.map(v => `"${String(v||"").replace(/"/g,"'")}"` ).join(",")).join("\n");
    const blob    = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url     = URL.createObjectURL(blob);
    const a       = document.createElement("a");
    a.href = url; a.download = "visualcheck_pacientes.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  function handleVtFinish(vtRes) { setVtResults(vtRes); setScreen("prescription_estimate"); }

  function handlePrescriptionContinue(rx) { setPrescripcion(rx); setScreen("historia_clinica"); }

  function prescripcionFields() {
    if (!prescripcion) return {};
    return {
      odEsfera: prescripcion.od_esfera ?? null, odCilindro: prescripcion.od_cilindro ?? null, odEje: prescripcion.od_eje ?? null,
      oiEsfera: prescripcion.oi_esfera ?? null, oiCilindro: prescripcion.oi_cilindro ?? null, oiEje: prescripcion.oi_eje ?? null,
      adicion: prescripcion.adicion ?? null,
      prescripcionConfianza: prescripcion.confianza ?? null, prescripcionNotas: prescripcion.notas ?? null,
      prescripcionValidada: false, prescripcionAjustada: false,
    };
  }

  function reset() {
    setScreen("welcome"); setQIndex(0); setAnswers({}); setResult(null); setAiText(""); setAiLoading(false);
    setUserData({ nombre: "", celular: "", cedula: "", direccion: "", correo: "" });
    setAdminPin(""); setFiltroRiesgo("todos"); setFiltroValidacion("todos"); setVtResults({});
    setConsentAccepted(false); setConsentTimestamp(null);
    setHistoria({ hcUsaGafas: "", hcDiabetesHipertension: "", hcAntecedentesFamiliares: "", hcCirugiaOcular: "", hcUltimaFormula: "", edadRango: "" });
    setMisCedula(""); setMisResultados(null); setMisError("");
    setPd(null); setPrescripcion(null);
    setQtLevel(0); setQtDir("→"); setQuickResult(null);
    setAdminTab("pacientes"); setFunnelData(null);
  }

  // ── Direction pad (shared between quick test and nothing else) ─────────────
  const dirBtnStyle = { width: 68, height: 68, fontSize: 24, border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", cursor: "pointer", touchAction: "manipulation" };

  function DirectionPad({ onSelect }) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "68px 68px 68px", gridTemplateRows: "68px 68px 68px", gap: 10, justifyContent: "center", margin: "0 auto 1.25rem" }}>
        <div /><button style={dirBtnStyle} onClick={() => onSelect("↑")}>↑</button><div />
        <button style={dirBtnStyle} onClick={() => onSelect("←")}>←</button><div /><button style={dirBtnStyle} onClick={() => onSelect("→")}>→</button>
        <div /><button style={dirBtnStyle} onClick={() => onSelect("↓")}>↓</button><div />
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SCREENS
  // ─────────────────────────────────────────────────────────────────────────────

  // ── WELCOME ──────────────────────────────────────────────────────────────────
  if (screen === "welcome") return (
    <div style={{ position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: -40, left: -40, right: -40, bottom: -40, background: "radial-gradient(ellipse at 65% 50%, #1A0A03 0%, #3D1A06 18%, #6B3010 30%, #A85820 38%, #C4721A 44%, #B86018 50%, #6A2E10 58%, #1A0803 70%, #04081A 100%)" }} />
      <div style={{ position: "absolute", inset: 0, background: "rgba(4,8,20,0.52)" }} />
      <div style={{ position: "relative", zIndex: 1, maxWidth: 460, margin: "0 auto", padding: "2.5rem 1.5rem", textAlign: "center" }}>

        {/* Resume banner */}
        {resumeOffer && (
          <div style={{ background: "rgba(93,202,165,0.15)", border: "0.5px solid rgba(93,202,165,0.4)", borderRadius: "var(--border-radius-lg)", padding: "12px 16px", marginBottom: "1.25rem", textAlign: "left" }}>
            <p style={{ fontSize: 13, fontWeight: 500, color: "#5DCAA5", margin: "0 0 4px" }}>Tienes una evaluación pendiente</p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", margin: "0 0 10px" }}>
              Hola {resumeOffer.nombre}. Completa tu análisis donde lo dejaste.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleResume} style={{ flex: 1, padding: "9px", fontSize: 13, fontWeight: 500, background: "#5DCAA5", color: "#111", border: "none", borderRadius: "var(--border-radius-md)", cursor: "pointer" }}>
                Continuar →
              </button>
              <button onClick={() => setResumeOffer(null)} style={{ padding: "9px 12px", fontSize: 12, background: "transparent", color: "rgba(255,255,255,0.5)", border: "0.5px solid rgba(255,255,255,0.2)", borderRadius: "var(--border-radius-md)", cursor: "pointer" }}>
                Empezar de nuevo
              </button>
            </div>
          </div>
        )}

        <div style={{ width: 80, height: 80, borderRadius: "50%", background: "rgba(255,255,255,0.12)", margin: "0 auto 1.5rem", display: "flex", alignItems: "center", justifyContent: "center", border: "0.5px solid rgba(255,255,255,0.25)" }}>
          <i className="ti ti-eye" style={{ fontSize: 36, color: "#fff" }} aria-hidden="true" />
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 500, margin: "0 0 8px", color: "#fff", letterSpacing: "-0.3px" }}>VisualCheck</h1>
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.65)", margin: "0 0 0.5rem" }}>¿Cómo está tu visión hoy?</p>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", margin: "0 0 1.75rem" }}>Descúbrelo en 30 segundos — sin registro</p>

        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", background: "rgba(255,255,255,0.08)", borderRadius: "var(--border-radius-md)", padding: "10px 12px", marginBottom: "1.5rem", border: "0.5px solid rgba(255,255,255,0.15)", textAlign: "left", lineHeight: 1.6 }}>
          Esta herramienta detecta señales externas visibles del ojo. No emite diagnósticos médicos ni reemplaza la consulta con un profesional.
        </div>

        {evalCount !== null && evalCount > 0 && (
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: "1.5rem" }}>
            <span style={{ fontWeight: 600, color: "#fff" }}>{evalCount.toLocaleString("es-CO")}</span> evaluaciones realizadas hasta ahora
          </div>
        )}

        <button
          style={{ width: "100%", padding: "15px", fontSize: 16, fontWeight: 600, cursor: "pointer", background: "rgba(255,255,255,0.96)", color: "#111", border: "none", borderRadius: "var(--border-radius-md)", letterSpacing: "-0.2px" }}
          onClick={() => setScreen("quick_test")}>
          Iniciar chequeo visual →
        </button>

        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: "1rem", cursor: "pointer", userSelect: "none", textAlign: "center" }} onClick={() => setScreen("mis_resultados")}>
          ◆ Mis resultados
        </p>
        <button
          style={{ width: "100%", padding: "12px", fontSize: 14, fontWeight: 500, cursor: "pointer", background: "rgba(255,255,255,0.12)", color: "#fff", border: "0.5px solid rgba(255,255,255,0.25)", borderRadius: "var(--border-radius-md)", marginTop: "0.75rem" }}
          onClick={() => setScreen("catalogo")}>
          🛍️ Tienda de monturas
        </button>

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
              <button onClick={() => setFaqOpen(faqOpen === i ? null : i)} style={{ width: "100%", textAlign: "left", padding: "10px 0", background: "transparent", border: "none", color: "#fff", fontSize: 12.5, fontWeight: 500, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                {q}<span style={{ color: "rgba(255,255,255,0.4)" }}>{faqOpen === i ? "−" : "+"}</span>
              </button>
              {faqOpen === i && <p style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", margin: "0 0 10px", lineHeight: 1.6 }}>{a}</p>}
            </div>
          ))}
        </div>

        <div style={{ marginTop: "2rem", display: "flex", justifyContent: "center", gap: 14 }}>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", cursor: "pointer", userSelect: "none" }} onClick={() => setScreen("privacy")}>Política de privacidad</span>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", cursor: "pointer", userSelect: "none" }} onClick={() => setScreen("terms")}>Términos y condiciones</span>
        </div>
        <p style={{ fontSize: 10, color: "rgba(255,255,255,0.18)", marginTop: "1.25rem", cursor: "pointer", userSelect: "none", textAlign: "center" }} onClick={() => setScreen("admin_pin")}>◆ Admin</p>
        <p style={{ fontSize: 10, color: "rgba(255,255,255,0.18)", marginTop: "0.5rem", cursor: "pointer", userSelect: "none", textAlign: "center" }} onClick={() => setScreen("opt_login")}>◆ Optómetra</p>
      </div>
    </div>
  );

  // ── PANTALLA 1 — PRUEBA RÁPIDA (gancho, sin registro) ────────────────────────
  if (screen === "quick_test") return (
    <div style={wrap}>
      <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
        <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: "0 0 4px", fontWeight: 500, letterSpacing: ".06em" }}>CHEQUEO RÁPIDO — SIN REGISTRO</p>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--color-text-primary)", margin: "0 0 4px" }}>¿Cómo está tu visión?</h2>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: 0 }}>
          Sostén el celular a la distancia de tu brazo y dinos hacia dónde apuntan las "patas" de la letra E.
        </p>
      </div>

      {/* Progress indicator */}
      <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: "1.25rem" }}>
        {QT_LEVELS.map((_, i) => (
          <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: i <= qtLevel ? "var(--color-text-info)" : "var(--color-border-secondary)" }} />
        ))}
      </div>

      <div style={{ textAlign: "center", padding: "2rem 0 1.5rem", minHeight: 130, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: QT_LEVELS[qtLevel].size, fontWeight: 700, color: "var(--color-text-primary)", display: "inline-block", transform: QT_ROT[qtDir], fontFamily: "serif", lineHeight: 1, userSelect: "none" }}>E</span>
      </div>

      <DirectionPad onSelect={handleQtDir} />

      <button style={{ ...btnS, marginTop: 8 }} onClick={() => setScreen("welcome")}>← Volver</button>
    </div>
  );

  // ── PANTALLA 2 — RESULTADO PARCIAL (gancho emocional) ────────────────────────
  if (screen === "quick_result") {
    const isOk = quickResult === "bien";
    const badgeColor = isOk ? { bg: "var(--color-background-success)", c: "var(--color-text-success)" }
                             : { bg: "var(--color-background-warning)", c: "var(--color-text-warning)" };
    const badgeText  = isOk ? "Tu visión parece estar bien" : "Detectamos algo que vale revisar";
    const subText    = isOk
      ? "Tu agudeza visual inicial es buena. Haz el análisis completo para confirmar y descartar otras condiciones."
      : "Tu agudeza visual inicial sugiere que podrías beneficiarte de una evaluación más completa con un optómetra.";

    return (
      <div style={wrap}>
        <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: "0 0 12px", fontWeight: 500, letterSpacing: ".06em" }}>TU RESULTADO INICIAL</p>

        <div style={{ textAlign: "center", padding: "2rem 1rem", background: badgeColor.bg, borderRadius: "var(--border-radius-lg)", marginBottom: "1.25rem" }}>
          <div style={{ fontSize: 48, marginBottom: "0.75rem" }}>{isOk ? "✅" : "👁️"}</div>
          <p style={{ fontSize: 18, fontWeight: 600, color: badgeColor.c, margin: "0 0 8px" }}>{badgeText}</p>
          <p style={{ fontSize: 13, color: badgeColor.c, margin: 0, lineHeight: 1.55, opacity: 0.85 }}>{subText}</p>
        </div>

        <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "12px 14px", marginBottom: "1.5rem", fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
          <strong style={{ color: "var(--color-text-primary)" }}>El análisis completo incluye:</strong> 15 pruebas visuales, estimación de prescripción óptica por IA, análisis de enrojecimiento ocular y recomendación personalizada.
        </div>

        <button style={{ ...btnP, fontSize: 16, padding: "15px" }} onClick={() => setScreen("mini_registro")}>
          Ver mi análisis completo →
        </button>
        <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", textAlign: "center", margin: "10px 0 0", lineHeight: 1.5 }}>
          Gratis · Sin tarjeta · Solo necesitamos tu nombre y celular
        </p>
        <button style={{ ...btnS, marginTop: 12 }} onClick={() => setScreen("welcome")}>← Volver al inicio</button>
      </div>
    );
  }

  // ── PANTALLA 3 — REGISTRO MÍNIMO (nombre + celular) ──────────────────────────
  if (screen === "mini_registro") {
    const isValid = userData.nombre.trim().length > 1 && userData.celular.trim().length > 6;
    return (
      <div style={wrap}>
        <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: "0 0 4px", fontWeight: 500, letterSpacing: ".06em" }}>PASO 1 DE 4</p>
        <h2 style={{ fontSize: 18, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 4px" }}>¿Cómo te llamas?</h2>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 1.5rem", lineHeight: 1.5 }}>
          Solo necesitamos tu nombre y celular para enviarte tu reporte por WhatsApp.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: "1.5rem" }}>
          <div>
            <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 5, fontWeight: 500 }}>Nombre completo *</label>
            <input type="text" placeholder="Tu nombre y apellido" value={userData.nombre}
              onChange={e => setUserData(prev => ({ ...prev, nombre: e.target.value }))}
              style={input} autoFocus />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 5, fontWeight: 500 }}>Celular *</label>
            <input type="tel" placeholder="3XX XXX XXXX" value={userData.celular}
              onChange={e => setUserData(prev => ({ ...prev, celular: e.target.value }))}
              onKeyDown={e => { if (e.key === "Enter" && isValid) handleMiniRegistro(); }}
              style={input} />
          </div>
        </div>
        <p style={{ fontSize: 10, color: "var(--color-text-tertiary)", margin: "0 0 1.25rem", lineHeight: 1.5 }}>
          Tus datos son confidenciales — solo para hacer seguimiento a tu evaluación visual.
        </p>
        <button style={{ ...btnP, opacity: isValid ? 1 : 0.45, cursor: isValid ? "pointer" : "not-allowed" }}
          disabled={!isValid} onClick={handleMiniRegistro}>
          Continuar →
        </button>
        <button style={{ ...btnS, marginTop: 8 }} onClick={() => setScreen("quick_result")}>← Volver</button>
      </div>
    );
  }

  // ── PANTALLA 4a — CUESTIONARIO DE SÍNTOMAS ───────────────────────────────────
  if (screen === "questionnaire") {
    const q = QUESTIONS[qIndex];
    const progress = qIndex / (QUESTIONS.length + 15); // visual progress includes VT tests
    return (
      <div style={wrap}>
        <div style={{ height: 4, background: "var(--color-border-tertiary)", borderRadius: 2, marginBottom: "0.75rem", overflow: "hidden" }}>
          <div style={{ height: 4, width: `${progress * 100}%`, background: "var(--color-text-info)", borderRadius: 2, transition: "width 0.3s" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1.25rem" }}>
          <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: 0, fontWeight: 500 }}>SÍNTOMAS — {qIndex + 1} de {QUESTIONS.length}</p>
          <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: 0 }}>Hola, {userData.nombre.split(" ")[0]} 👋</p>
        </div>
        <p style={{ fontSize: 16, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 1.5rem", lineHeight: 1.45 }}>{q.text}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {q.options.map((opt, i) => (
            <button key={i}
              onClick={() => {
                const a = { ...answers, [q.id]: i };
                setAnswers(a);
                if (qIndex < QUESTIONS.length - 1) { setQIndex(qIndex + 1); }
                else {
                  setScreen("visual_tests");
                  saveProgress("visual_tests");
                }
              }}
              style={{ padding: "13px 16px", textAlign: "left", fontSize: 14, border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", cursor: "pointer", touchAction: "manipulation" }}>
              {opt}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── PANTALLA 4b — BATERÍA DE 15 PRUEBAS VISUALES ─────────────────────────────
  if (screen === "visual_tests") return <VisualTests onFinish={handleVtFinish} />;

  // ── PANTALLA 4c — PRESCRIPCIÓN ESTIMADA ──────────────────────────────────────
  if (screen === "prescription_estimate") return (
    <PrescriptionEstimate vtResults={vtResults} edadRango={historia.edadRango} onContinue={handlePrescriptionContinue} />
  );

  // ── PANTALLA 5 — HISTORIA CLÍNICA (después de pruebas) ───────────────────────
  if (screen === "historia_clinica") {
    const isValid = HC_QUESTIONS.every(q => historia[q.key]);
    return (
      <div style={wrap}>
        <div style={{ height: 4, background: "var(--color-border-tertiary)", borderRadius: 2, marginBottom: "1.5rem", overflow: "hidden" }}>
          <div style={{ height: 4, width: "80%", background: "var(--color-text-info)", borderRadius: 2 }} />
        </div>
        <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: "0 0 4px", fontWeight: 500, letterSpacing: ".04em" }}>PASO 2 DE 4 — HISTORIA CLÍNICA</p>
        <p style={{ fontSize: 16, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 4px" }}>Un par de preguntas más</p>
        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 1.5rem" }}>
          Ayudan al optómetra a interpretar mejor tus resultados.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: "1.25rem" }}>
          {HC_QUESTIONS.map(q => (
            <div key={q.key}>
              <p style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 8px", lineHeight: 1.45 }}>{q.text}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {q.options.map(opt => (
                  <button key={opt} onClick={() => setHistoria(prev => ({ ...prev, [q.key]: opt }))}
                    style={{ padding: "10px 14px", textAlign: "left", fontSize: 13, borderRadius: "var(--border-radius-md)", cursor: "pointer", touchAction: "manipulation",
                      border: historia[q.key] === opt ? "1px solid var(--color-text-info)" : "0.5px solid var(--color-border-secondary)",
                      background: historia[q.key] === opt ? "var(--color-background-info)" : "var(--color-background-primary)",
                      color: historia[q.key] === opt ? "var(--color-text-info)" : "var(--color-text-primary)",
                      fontWeight: historia[q.key] === opt ? 500 : 400 }}>
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
            <input type="text" placeholder="Ej: OD -1.00, OI -1.25" value={historia.hcUltimaFormula}
              onChange={e => setHistoria(prev => ({ ...prev, hcUltimaFormula: e.target.value }))}
              style={input} />
          </div>
        </div>
        <button style={{ ...btnP, opacity: isValid ? 1 : 0.45, cursor: isValid ? "pointer" : "not-allowed" }}
          disabled={!isValid} onClick={() => setScreen("consent")}>
          Continuar →
        </button>
      </div>
    );
  }

  // ── PANTALLA 6a — CONSENTIMIENTO (antes de fotos biométricas) ────────────────
  if (screen === "consent") return (
    <div style={wrap}>
      <div style={{ height: 4, background: "var(--color-border-tertiary)", borderRadius: 2, marginBottom: "1.5rem", overflow: "hidden" }}>
        <div style={{ height: 4, width: "88%", background: "var(--color-text-info)", borderRadius: 2 }} />
      </div>
      <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: "0 0 4px", fontWeight: 500, letterSpacing: ".04em" }}>PASO 3 DE 4 — CONSENTIMIENTO</p>
      <p style={{ fontSize: 16, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 4px" }}>Último paso antes de las fotos</p>
      <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 1.25rem", lineHeight: 1.6 }}>
        Para tomar la foto de tus ojos y generar tu reporte completo, necesitamos tu autorización:
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: "1.5rem" }}>
        {[
          ["¿Qué capturamos ahora?", "Una foto de tus ojos (ojo derecho e izquierdo por separado) para analizar señales externas visibles como enrojecimiento y asimetría."],
          ["¿Para qué se usa?", "Para completar tu evaluación preventiva de salud visual y, si lo solicitas, para que un optómetra valide los resultados."],
          ["¿Quién tiene acceso?", "Únicamente el equipo de VisualCheck y los optómetras autorizados que validen tu evaluación."],
        ].map(([titulo, texto]) => (
          <div key={titulo} style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "12px 14px" }}>
            <p style={{ fontSize: 12.5, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 4px" }}>{titulo}</p>
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0, lineHeight: 1.55 }}>{texto}</p>
          </div>
        ))}
        <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "12px 14px", background: "var(--color-background-warning)" }}>
          <p style={{ fontSize: 12, color: "var(--color-text-warning)", margin: 0, lineHeight: 1.6 }}>
            <strong>Importante:</strong> VisualCheck NO es un diagnóstico médico. Es una herramienta de detección preventiva. Tus derechos como titular de datos están protegidos por la Ley 1581 de 2012 — escríbenos a visualcheck@gmail.com para ejercerlos.
          </p>
        </div>
      </div>
      <div style={{ marginBottom: "1rem", display: "flex", justifyContent: "center", gap: 14 }}>
        <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", cursor: "pointer", textDecoration: "underline" }} onClick={() => setScreen("privacy")}>Política de privacidad</span>
        <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", cursor: "pointer", textDecoration: "underline" }} onClick={() => setScreen("terms")}>Términos y condiciones</span>
      </div>
      <button style={{ ...btnP, marginBottom: 8 }}
        onClick={() => { setConsentAccepted(true); setConsentTimestamp(new Date().toISOString()); setScreen("camera"); }}>
        Acepto y tomo las fotos →
      </button>
      <button style={btnS} onClick={() => setScreen("historia_clinica")}>← Volver</button>
    </div>
  );

  // ── PANTALLA 6b — MEDICIÓN DE PD (acceso desde resultados) ───────────────────
  if (screen === "pd_measurement") return (
    <PDMeasurement onConfirm={handlePdConfirm} onCancel={() => setScreen("results")} />
  );

  // ── PANTALLA 6c — CÁMARA ─────────────────────────────────────────────────────
  if (screen === "camera") return <EyeCapture onComplete={handleEyesCaptured} onDemo={runDemo} />;

  // ── ANALIZANDO ────────────────────────────────────────────────────────────────
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

  // ── PANTALLA 7 — RESULTADO COMPLETO ──────────────────────────────────────────
  if (screen === "results" && result) {
    const risk = getRisk(result.leftRed, result.rightRed, result.asym, result.qScore);
    const hasFullData = userData.cedula.trim().length > 0;
    return (
      <div style={wrap}>
        <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "14px", marginBottom: "1.25rem" }}>
          <p style={{ fontSize: 16, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 4px" }}>{userData.nombre || "—"}</p>
          <div style={{ display: "flex", gap: 6, fontSize: 12, color: "var(--color-text-secondary)", flexWrap: "wrap" }}>
            {userData.cedula && <span>CC {userData.cedula}</span>}
            {userData.celular && <span>· {userData.celular}</span>}
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
            <p style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-tertiary)", margin: "0 0 10px", letterSpacing: ".05em" }}>PRUEBAS VISUALES (15)</p>
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

        {prescripcion && (
          <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "14px", marginBottom: "1.25rem" }}>
            <p style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-tertiary)", margin: "0 0 10px", letterSpacing: ".05em" }}>PRESCRIPCIÓN ÓPTICA (ESTIMADA)</p>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 8 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "2px 4px", fontSize: 10, color: "var(--color-text-tertiary)", fontWeight: 500 }}></th>
                  <th style={{ textAlign: "right", padding: "2px 4px", fontSize: 10, color: "var(--color-text-tertiary)", fontWeight: 500 }}>ESFERA</th>
                  <th style={{ textAlign: "right", padding: "2px 4px", fontSize: 10, color: "var(--color-text-tertiary)", fontWeight: 500 }}>CILINDRO</th>
                  <th style={{ textAlign: "right", padding: "2px 4px", fontSize: 10, color: "var(--color-text-tertiary)", fontWeight: 500 }}>EJE</th>
                </tr>
              </thead>
              <tbody>
                {[["OD", prescripcion.od_esfera, prescripcion.od_cilindro, prescripcion.od_eje], ["OI", prescripcion.oi_esfera, prescripcion.oi_cilindro, prescripcion.oi_eje]].map(([eye, esf, cil, eje]) => (
                  <tr key={eye} style={{ borderTop: "0.5px solid var(--color-border-tertiary)" }}>
                    <td style={{ padding: "6px 4px", fontWeight: 500, color: "var(--color-text-primary)" }}>{eye}</td>
                    <td style={{ padding: "6px 4px", textAlign: "right", color: "var(--color-text-primary)" }}>{esf}</td>
                    <td style={{ padding: "6px 4px", textAlign: "right", color: "var(--color-text-primary)" }}>{cil}</td>
                    <td style={{ padding: "6px 4px", textAlign: "right", color: "var(--color-text-primary)" }}>{eje}°</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 8 }}>
              <span>Adición</span>
              <span style={{ fontWeight: 500, color: "var(--color-text-primary)" }}>{prescripcion.adicion > 0 ? `+${prescripcion.adicion.toFixed(2)}` : "—"}</span>
            </div>
            <div style={{ padding: "8px 10px", borderRadius: "var(--border-radius-md)", background: "var(--color-background-warning)", textAlign: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-warning)" }}>⏳ Pendiente validación optómetra</span>
            </div>
          </div>
        )}

        {pd && (
          <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "14px", marginBottom: "1.25rem" }}>
            <p style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-tertiary)", margin: "0 0 10px", letterSpacing: ".05em" }}>DISTANCIA PUPILAR (PD)</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {[["Binocular", pd.pdBinocular], ["OD", pd.pdOd], ["OI", pd.pdOi]].map(([label, val]) => (
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

        {/* Optional: complete profile for PDF */}
        {!hasFullData && (
          <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "14px", marginBottom: "1.25rem", background: "var(--color-background-secondary)" }}>
            <p style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 4px" }}>¿Quieres el reporte completo?</p>
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 10px", lineHeight: 1.5 }}>
              Agrega tu cédula y correo para generar el PDF con tu fórmula y agendar cita.
            </p>
            <button style={{ ...btnS, fontSize: 13, padding: "10px" }} onClick={() => setScreen("registro_completo")}>
              Completar mi perfil →
            </button>
          </div>
        )}

        <button style={{ ...btnS, marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }} onClick={() => setScreen("pd_measurement")}>
          📏 {pd ? "Medir de nuevo mi PD" : "Medir mi distancia pupilar"}
        </button>

        <button style={{ ...btnS, marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }} onClick={() => generatePDF()} disabled={pdfLoading || aiLoading}>
          <i className="ti ti-file-type-pdf" style={{ fontSize: 16 }} aria-hidden="true" />
          {pdfLoading ? "Generando PDF..." : "Descargar reporte PDF"}
        </button>

        <a href={`https://wa.me/573146894654?text=Hola%2C%20acabo%20de%20hacer%20mi%20evaluaci%C3%B3n%20en%20VisualCheck.%20Mi%20nombre%20es%20${encodeURIComponent(userData.nombre)}%2C%20celular%20${encodeURIComponent(userData.celular)}.%20Me%20gustar%C3%ADa%20agendar%20una%20cita.`}
          target="_blank" rel="noopener noreferrer"
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "13px", fontSize: 15, fontWeight: 500, background: "#25D366", color: "#fff", borderRadius: "var(--border-radius-md)", textDecoration: "none", marginBottom: 8, boxSizing: "border-box" }}>
          <i className="ti ti-brand-whatsapp" aria-hidden="true" /> Agenda tu cita en nuestra óptica
        </a>

        <button style={btnS} onClick={reset}>Hacer otra evaluación</button>
        <p style={{ fontSize: 10, color: "var(--color-text-tertiary)", textAlign: "center", marginTop: 12, lineHeight: 1.5 }}>
          Esta herramienta no emite diagnósticos médicos. Los resultados son orientativos.
        </p>
      </div>
    );
  }

  // ── REGISTRO COMPLETO (opcional, desde resultados) ────────────────────────────
  if (screen === "registro_completo") {
    const fields = [
      { key: "cedula",    label: "Cédula",            type: "text",  placeholder: "Número de cédula" },
      { key: "direccion", label: "Dirección",          type: "text",  placeholder: "Tu dirección" },
      { key: "correo",    label: "Correo electrónico", type: "email", placeholder: "correo@ejemplo.com" },
    ];
    return (
      <div style={wrap}>
        <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: "0 0 4px", fontWeight: 500, letterSpacing: ".04em" }}>PASO 4 DE 4 — OPCIONAL</p>
        <p style={{ fontSize: 16, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 4px" }}>Completa tu perfil</p>
        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 1.5rem", lineHeight: 1.5 }}>
          Para incluir en tu reporte PDF y facilitar el seguimiento por parte del optómetra.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: "1.5rem" }}>
          {fields.map(f => (
            <div key={f.key}>
              <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 5, fontWeight: 500 }}>{f.label}</label>
              <input type={f.type} placeholder={f.placeholder} value={userData[f.key]}
                onChange={e => setUserData(prev => ({ ...prev, [f.key]: e.target.value }))}
                style={input} />
            </div>
          ))}
        </div>
        <button style={btnP} onClick={() => {
          generatePDF();
          setScreen("results");
        }}>
          <i className="ti ti-file-type-pdf" style={{ marginRight: 6 }} aria-hidden="true" />
          Guardar y descargar PDF
        </button>
        <button style={{ ...btnS, marginTop: 8 }} onClick={() => setScreen("results")}>← Volver a resultados</button>
      </div>
    );
  }

  // ── MIS RESULTADOS ────────────────────────────────────────────────────────────
  if (screen === "mis_resultados") return (
    <div style={wrap}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1.5rem" }}>
        <button onClick={() => setScreen("welcome")} style={{ ...btnS, width: "auto", padding: "7px 14px", fontSize: 13 }}>← Volver</button>
        <h2 style={{ fontSize: 16, fontWeight: 500, color: "var(--color-text-primary)", margin: 0 }}>Mis resultados</h2>
      </div>
      <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 1.25rem", lineHeight: 1.6 }}>
        Ingresa tu número de cédula para ver el historial de tus evaluaciones.
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: "1.25rem" }}>
        <input type="text" placeholder="Número de cédula" value={misCedula}
          onChange={e => setMisCedula(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") buscarMisResultados(); }}
          style={{ ...input, flex: 1 }} />
        <button style={{ ...btnP, width: "auto", padding: "11px 18px" }} onClick={buscarMisResultados} disabled={misLoading}>
          {misLoading ? "..." : "Buscar"}
        </button>
      </div>
      {misError && <p style={{ fontSize: 12, color: "var(--color-text-danger)", textAlign: "center", margin: "0 0 1rem" }}>{misError}</p>}
      {misResultados && misResultados.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {misResultados.map(ev => {
            const rk = getRisk(ev.leftRed, ev.rightRed, ev.asym, ev.qScore);
            return (
              <div key={ev.id} style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "12px 14px" }}>
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

  // ── POLÍTICA DE PRIVACIDAD ────────────────────────────────────────────────────
  if (screen === "privacy") return (
    <div style={wrap}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1.5rem" }}>
        <button onClick={() => window.history.back()} style={{ ...btnS, width: "auto", padding: "7px 14px", fontSize: 13 }}>← Volver</button>
        <h2 style={{ fontSize: 16, fontWeight: 500, color: "var(--color-text-primary)", margin: 0 }}>Política de Privacidad</h2>
      </div>
      <div style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.7, display: "flex", flexDirection: "column", gap: 14 }}>
        <p>En cumplimiento de la Ley 1581 de 2012 sobre protección de datos personales en Colombia, VisualCheck informa lo siguiente:</p>
        {[
          ["Responsable del tratamiento", "VisualCheck, herramienta de evaluación preventiva de salud visual con sede en Medellín, Colombia."],
          ["Datos que recopilamos", "Nombre, número de cédula, dirección, correo electrónico, celular, respuestas del cuestionario de síntomas, historia clínica básica, resultados de la batería de pruebas visuales y una imagen capturada de tus ojos."],
          ["Finalidad del tratamiento", "Realizar una evaluación preventiva de salud visual, generar un reporte para el paciente, permitir su seguimiento y, cuando corresponda, su validación por un optómetra autorizado."],
          ["Derechos del titular", "Como titular de los datos, tienes derecho a conocer, actualizar, rectificar y suprimir tu información personal, así como a revocar la autorización otorgada para su tratamiento, en cualquier momento."],
          ["Contacto", "Para ejercer tus derechos o realizar consultas sobre el tratamiento de tus datos, escríbenos a visualcheck@gmail.com."],
        ].map(([titulo, texto]) => (
          <div key={titulo}>
            <p style={{ fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 4px" }}>{titulo}</p>
            <p style={{ margin: 0 }}>{texto}</p>
          </div>
        ))}
      </div>
    </div>
  );

  // ── TÉRMINOS Y CONDICIONES ────────────────────────────────────────────────────
  if (screen === "terms") return (
    <div style={wrap}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1.5rem" }}>
        <button onClick={() => window.history.back()} style={{ ...btnS, width: "auto", padding: "7px 14px", fontSize: 13 }}>← Volver</button>
        <h2 style={{ fontSize: 16, fontWeight: 500, color: "var(--color-text-primary)", margin: 0 }}>Términos y Condiciones</h2>
      </div>
      <div style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.7, display: "flex", flexDirection: "column", gap: 14 }}>
        {[
          ["Descripción del servicio", "VisualCheck es una herramienta digital de evaluación preventiva de salud visual que combina un cuestionario de síntomas, una historia clínica básica, una batería de pruebas visuales y un análisis de imágenes capturadas con la cámara del dispositivo del usuario."],
          ["No es un dispositivo médico", "VisualCheck no es un dispositivo médico ni una herramienta de diagnóstico clínico. Los resultados generados son orientativos y tienen fines exclusivamente preventivos e informativos."],
          ["Validación profesional requerida", "Cualquier fórmula óptica o recomendación generada por VisualCheck debe ser revisada y validada por un optómetra certificado antes de tomar decisiones sobre el tratamiento o uso de corrección visual."],
          ["Limitación de responsabilidad", "VisualCheck y su equipo no se hacen responsables por decisiones médicas tomadas con base únicamente en los resultados de esta herramienta, sin la validación de un profesional de la salud visual."],
          ["Ley aplicable", "Estos términos se rigen por las leyes de la República de Colombia, incluyendo la Ley 1581 de 2012 sobre protección de datos personales."],
        ].map(([titulo, texto]) => (
          <div key={titulo}>
            <p style={{ fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 4px" }}>{titulo}</p>
            <p style={{ margin: 0 }}>{texto}</p>
          </div>
        ))}
      </div>
    </div>
  );

  // ── ADMIN CONFIG ──────────────────────────────────────────────────────────────
  if (screen === "admin_config") return (
    <div style={wrap}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1.5rem" }}>
        <button onClick={() => setScreen("admin")} style={{ ...btnS, width: "auto", padding: "7px 14px", fontSize: 13 }}>← Volver</button>
        <h2 style={{ fontSize: 16, fontWeight: 500, color: "var(--color-text-primary)", margin: 0 }}>Configuración</h2>
      </div>
      <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "20px", marginBottom: "1.25rem" }}>
        <p style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 4px" }}>Google Sheets — Webhook URL</p>
        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 14px", lineHeight: 1.5 }}>Cuando alguien complete una evaluación, los datos se guardan automáticamente en tu hoja de cálculo.</p>
        <input type="url" placeholder="https://script.google.com/macros/s/..." value={sheetsUrl}
          onChange={e => setSheetsUrl(e.target.value)}
          style={{ width: "100%", padding: "11px 12px", fontSize: 13, border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box", marginBottom: 8 }} />
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
        <p style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 10px" }}>Cómo configurarlo (5 minutos)</p>
        {[
          ["1","Ve a sheets.google.com y crea una hoja llamada «VisualCheck Pacientes»"],
          ["2","En el menú, ve a Extensiones → Apps Script"],
          ["3","Borra todo el código existente y pega el script que descargaste"],
          ["4","Haz clic en Implementar → Nueva implementación"],
          ["5","Tipo: Aplicación web · Ejecutar como: Yo · Acceso: Cualquier usuario"],
          ["6","Copia la URL que aparece y pégala aquí arriba"],
        ].map(([n, text]) => (
          <div key={n} style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "flex-start" }}>
            <span style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(15,158,118,.12)", border: "0.5px solid rgba(15,158,118,.3)", color: "var(--color-text-success)", fontSize: 11, fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{n}</span>
            <span style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.5 }}>{text}</span>
          </div>
        ))}
      </div>
    </div>
  );

  // ── ADMIN PIN ─────────────────────────────────────────────────────────────────
  if (screen === "admin_pin") return (
    <div style={{ ...wrap, paddingTop: "3rem", textAlign: "center" }}>
      <i className="ti ti-shield-lock" style={{ fontSize: 36, color: "var(--color-text-tertiary)" }} aria-hidden="true" />
      <p style={{ fontSize: 16, fontWeight: 500, color: "var(--color-text-primary)", margin: "12px 0 4px" }}>Acceso administrativo</p>
      <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 1.5rem" }}>Ingresa tu PIN para continuar</p>
      <input type="password" placeholder="PIN" value={adminPin}
        onChange={e => setAdminPin(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && adminPin === "visual2025") { loadEvals(); loadOptometristas(); setScreen("admin"); setAdminPin(""); } }}
        style={{ width: "100%", padding: "12px", fontSize: 18, textAlign: "center", letterSpacing: 6, border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box", marginBottom: 8 }} />
      <button style={{ ...btnP, marginBottom: 8 }}
        onClick={() => { if (adminPin === "visual2025") { loadEvals(); loadOptometristas(); setScreen("admin"); setAdminPin(""); } else { setAdminPin(""); } }}>
        Entrar
      </button>
      <button style={btnS} onClick={() => { setAdminPin(""); setScreen("welcome"); }}>Volver</button>
    </div>
  );

  // ── OPTOMETRISTA ──────────────────────────────────────────────────────────────
  if (screen === "opt_login")           return <OptometristPanel onExit={() => setScreen("welcome")} />;
  if (screen === "admin_optometristas") return <AdminOptometrists onBack={() => { loadOptometristas(); setScreen("admin"); }} />;
  if (screen === "admin_pedidos")       return <AdminPedidos onBack={() => setScreen("admin")} />;

  // ── TIENDA ────────────────────────────────────────────────────────────────────
  if (screen === "catalogo") return (
    <div style={{ position: "relative" }}>
      <Catalog onSelect={frame => { setSelectedFrame(frame); setScreen("producto"); }} onBack={() => setScreen("welcome")} />
      {cart.length > 0 && (
        <button onClick={() => setScreen("carrito")} style={{ position: "fixed", bottom: 24, right: 20, padding: "12px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer", background: "var(--color-text-primary)", color: "var(--color-background-primary)", border: "none", borderRadius: 30, boxShadow: "0 4px 16px rgba(0,0,0,0.2)", zIndex: 100 }}>
          🛒 {cart.length} — Ver carrito
        </button>
      )}
    </div>
  );

  if (screen === "producto" && selectedFrame) return (
    <div style={{ position: "relative" }}>
      <ProductDetail frame={selectedFrame} cart={cart} setCart={setCart} onBack={() => setScreen("catalogo")} />
      {cart.length > 0 && (
        <button onClick={() => setScreen("carrito")} style={{ position: "fixed", bottom: 24, right: 20, padding: "12px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer", background: "var(--color-text-primary)", color: "var(--color-background-primary)", border: "none", borderRadius: 30, boxShadow: "0 4px 16px rgba(0,0,0,0.2)", zIndex: 100 }}>
          🛒 {cart.length} — Ver carrito
        </button>
      )}
    </div>
  );

  if (screen === "carrito") return (
    <Cart cart={cart} setCart={setCart} onCheckout={() => setScreen("checkout")} onContinueShopping={() => setScreen("catalogo")} />
  );

  if (screen === "checkout") return (
    <Checkout cart={cart} userData={userData} onBack={() => setScreen("carrito")} onGoToEval={() => setScreen("quick_test")} />
  );

  if (screen === "pedido_confirmado") return (
    <OrderConfirmation paymentData={orderConfirmationData} onGoHome={() => { setCart([]); setOrderConfirmationData(null); setScreen("welcome"); }} />
  );

  // ── ADMIN DASHBOARD ───────────────────────────────────────────────────────────
  if (screen === "admin") {
    const ESTADOS = ["pendiente", "contactado", "cita agendada", "cliente"];
    const ESTADO_COLORS = {
      "pendiente":     { bg: "var(--color-background-secondary)", c: "var(--color-text-tertiary)" },
      "contactado":    { bg: "var(--color-background-info)",      c: "var(--color-text-info)" },
      "cita agendada": { bg: "var(--color-background-warning)",   c: "var(--color-text-warning)" },
      "cliente":       { bg: "var(--color-background-success)",   c: "var(--color-text-success)" },
    };

    const filtrados  = evaluaciones.filter(e => filtroRiesgo === "todos" || e.riesgo === filtroRiesgo).filter(e => filtroValidacion === "todos" || (e.estadoValidacion || "pendiente") === filtroValidacion);
    const totalAlto  = evaluaciones.filter(e => e.riesgo === "Requiere atención").length;
    const totalMod   = evaluaciones.filter(e => e.riesgo === "Riesgo moderado").length;
    const sinContact = evaluaciones.filter(e => e.estado === "pendiente").length;

    return (
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "1rem 1rem 2rem" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
          <div>
            <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: "0 0 2px", fontWeight: 500, letterSpacing: ".06em" }}>PANEL ADMIN</p>
            <h2 style={{ fontSize: 18, fontWeight: 500, margin: 0, color: "var(--color-text-primary)" }}>VisualCheck</h2>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={exportCSV} style={{ ...btnS, width: "auto", padding: "7px 10px", fontSize: 11 }}><i className="ti ti-download" aria-hidden="true" /> CSV</button>
            <button onClick={() => { loadEvals(); }} style={{ ...btnS, width: "auto", padding: "7px 10px", fontSize: 11 }}><i className="ti ti-refresh" aria-hidden="true" /></button>
            <button onClick={() => setScreen("admin_pedidos")} style={{ ...btnS, width: "auto", padding: "7px 10px", fontSize: 11 }}>🛍️</button>
            <button onClick={() => setScreen("admin_optometristas")} style={{ ...btnS, width: "auto", padding: "7px 10px", fontSize: 11 }}><i className="ti ti-stethoscope" aria-hidden="true" /></button>
            <button onClick={() => { loadEvals(); setScreen("admin_config"); }} style={{ ...btnS, width: "auto", padding: "7px 10px", fontSize: 11 }}><i className="ti ti-settings" aria-hidden="true" /></button>
            <button onClick={() => setScreen("welcome")} style={{ ...btnS, width: "auto", padding: "7px 10px", fontSize: 11 }}>Salir</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: "1rem", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
          {[["pacientes","👥 Pacientes"], ["funnel","📊 Funnel"]].map(([tab, label]) => (
            <button key={tab} onClick={() => { setAdminTab(tab); if (tab === "funnel" && !funnelData) loadFunnel(); }}
              style={{ padding: "8px 14px", fontSize: 13, fontWeight: adminTab === tab ? 500 : 400, cursor: "pointer", background: "transparent", border: "none", borderBottom: adminTab === tab ? "2px solid var(--color-text-primary)" : "2px solid transparent", color: adminTab === tab ? "var(--color-text-primary)" : "var(--color-text-secondary)", marginBottom: -1 }}>
              {label}
            </button>
          ))}
        </div>

        {/* ── TAB: PACIENTES ── */}
        {adminTab === "pacientes" && (
          <>
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
              {[["todos","Todos"],["Requiere atención","⚠ Alto"],["Riesgo moderado","Moderado"],["Bajo riesgo","Bajo"]].map(([val,lbl]) => (
                <button key={val} onClick={() => setFiltroRiesgo(val)}
                  style={{ padding: "5px 10px", fontSize: 11, borderRadius: 20, cursor: "pointer", fontWeight: filtroRiesgo === val ? 500 : 400, background: filtroRiesgo === val ? "var(--color-text-primary)" : "var(--color-background-secondary)", color: filtroRiesgo === val ? "var(--color-background-primary)" : "var(--color-text-secondary)", border: "0.5px solid var(--color-border-secondary)" }}>
                  {lbl}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: "1rem", flexWrap: "wrap" }}>
              {[["todos","Validación: todos"],["pendiente","Sin asignar"],["en revision","En revisión"],["validada","Validada"]].map(([val,lbl]) => (
                <button key={val} onClick={() => setFiltroValidacion(val)}
                  style={{ padding: "5px 10px", fontSize: 11, borderRadius: 20, cursor: "pointer", fontWeight: filtroValidacion === val ? 500 : 400, background: filtroValidacion === val ? "var(--color-text-primary)" : "var(--color-background-secondary)", color: filtroValidacion === val ? "var(--color-background-primary)" : "var(--color-text-secondary)", border: "0.5px solid var(--color-border-secondary)" }}>
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
                        <span style={{ fontSize: 11, fontWeight: 500, padding: "3px 8px", borderRadius: 20, background: rk.bc, color: rk.tc, whiteSpace: "nowrap" }}>{ev.overall}/100</span>
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
                          <p style={{ margin: "0 0 4px", fontWeight: 500, color: "var(--color-text-primary)" }}>Fórmula validada{ev.optometristaNombre ? ` por ${ev.optometristaNombre}` : ""}</p>
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
          </>
        )}

        {/* ── TAB: FUNNEL ── */}
        {adminTab === "funnel" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <p style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)", margin: 0 }}>Embudo de conversión</p>
              <button onClick={loadFunnel} style={{ ...btnS, width: "auto", padding: "5px 12px", fontSize: 11 }}>
                <i className="ti ti-refresh" aria-hidden="true" /> Actualizar
              </button>
            </div>
            {!funnelData ? (
              <p style={{ fontSize: 13, color: "var(--color-text-secondary)", textAlign: "center", padding: "2rem" }}>Cargando datos...</p>
            ) : (
              <>
                {(() => {
                  const maxVal = Math.max(1, ...FUNNEL_ORDER.map(s => funnelData[s.key] || 0));
                  const firstVal = funnelData[FUNNEL_ORDER[0].key] || 1;
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {FUNNEL_ORDER.map(({ key, label }) => {
                        const count = funnelData[key] || 0;
                        const pct   = Math.round((count / firstVal) * 100);
                        const width = Math.round((count / maxVal) * 100);
                        return (
                          <div key={key} style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "10px 12px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                              <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{label}</span>
                              <span style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-primary)" }}>
                                {count} {count > 0 && firstVal > 0 && key !== FUNNEL_ORDER[0].key ? <span style={{ fontSize: 10, color: "var(--color-text-tertiary)", fontWeight: 400 }}>({pct}%)</span> : ""}
                              </span>
                            </div>
                            <div style={{ height: 6, background: "var(--color-border-tertiary)", borderRadius: 3, overflow: "hidden" }}>
                              <div style={{ height: 6, width: `${width}%`, background: pct > 50 ? "var(--color-text-success)" : pct > 25 ? "var(--color-text-warning)" : "var(--color-text-danger)", borderRadius: 3, transition: "width 0.4s" }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
                <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", textAlign: "center", margin: "1rem 0 0", lineHeight: 1.5 }}>
                  % calculado sobre el total de la primera pantalla (Prueba rápida).
                </p>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  return null;
}
