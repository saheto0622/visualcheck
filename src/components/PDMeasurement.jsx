import { useState, useRef, useEffect } from "react";
import { wrap, btnP, btnS } from "../lib/styles";

// ─── Constants ──────────────────────────────────────────────────────────────
const FACE_WIDTH_MM = 138;     // ancho facial promedio adulto
const CARD_WIDTH_MM = 85.6;    // ancho de una tarjeta de crédito estándar
const SAMPLE_SIZE = 40;        // mediciones consecutivas a promediar
const STABLE_THRESHOLD_MM = 1.2; // desviación estándar máxima para considerar estable
const FACE_MESH_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4";

const LM = { IRIS_L: 468, IRIS_R: 473, CHEEK_L: 234, CHEEK_R: 454, NOSE: 1 };

const STATUS_INFO = {
  positioning: { label: "Posicionando...",      bg: "var(--color-background-secondary)", c: "var(--color-text-tertiary)" },
  measuring:   { label: "Midiendo...",          bg: "var(--color-background-warning)",   c: "var(--color-text-warning)" },
  stable:      { label: "✓ Medición estable",   bg: "var(--color-background-success)",   c: "var(--color-text-success)" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function pxDist(a, b, w, h) {
  const dx = (a.x - b.x) * w, dy = (a.y - b.y) * h;
  return Math.sqrt(dx * dx + dy * dy);
}
function mean(arr) { return arr.reduce((s, v) => s + v, 0) / arr.length; }
function stdDev(arr) {
  const m = mean(arr);
  return Math.sqrt(mean(arr.map(v => (v - m) ** 2)));
}
async function loadFaceMesh() {
  if (window.FaceMesh) return window.FaceMesh;
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${FACE_MESH_CDN}/face_mesh.js`;
    script.crossOrigin = "anonymous";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("No se pudo cargar MediaPipe Face Mesh"));
    document.head.appendChild(script);
  });
  return window.FaceMesh;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function PDMeasurement({ onConfirm, onCancel }) {
  const [screen,   setScreen]   = useState("instructions"); // instructions | measuring | result
  const [camError,  setCamError]  = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [status,   setStatus]   = useState("positioning");  // positioning | measuring | stable
  const [progress, setProgress] = useState(0);
  const [livePD,   setLivePD]   = useState(null);
  const [finalPD,  setFinalPD]  = useState(null);
  const [precision, setPrecision] = useState("estandar");   // estandar | alta
  const [calibrating, setCalibrating] = useState(false);
  const [calibPoints, setCalibPoints] = useState([{ x: 0.32 }, { x: 0.68 }]);
  const [calibMmPerPixel, setCalibMmPerPixel] = useState(null);

  const videoRef    = useRef(null);
  const canvasRef   = useRef(null);
  const containerRef = useRef(null);
  const streamRef   = useRef(null);
  const rafRef      = useRef(null);
  const faceMeshRef = useRef(null);
  const samplesRef  = useRef([]);
  const calibRef    = useRef(null);
  const dragRef     = useRef(null);

  useEffect(() => { calibRef.current = calibMmPerPixel; }, [calibMmPerPixel]);

  // ── Camera + FaceMesh lifecycle ──────────────────────────────────────────────
  useEffect(() => {
    if (screen !== "measuring") return;
    setCamError(false);
    setLoadError(false);
    let cancelled = false;

    function drawOverlay(m) {
      const canvas = canvasRef.current;
      const video  = videoRef.current;
      if (!canvas || !video || !video.clientWidth) return;
      const W = video.clientWidth, H = video.clientHeight;
      if (canvas.width !== W)  canvas.width  = W;
      if (canvas.height !== H) canvas.height = H;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, W, H);
      if (!m) return;
      const iL = { x: m.irisL.x * W, y: m.irisL.y * H };
      const iR = { x: m.irisR.x * W, y: m.irisR.y * H };
      ctx.strokeStyle = "#5DCAA5";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(iL.x, iL.y);
      ctx.lineTo(iR.x, iR.y);
      ctx.stroke();
      [iL, iR].forEach((p) => {
        ctx.fillStyle = "#3ddc97";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
      });
      const midX = (iL.x + iR.x) / 2, midY = (iL.y + iR.y) / 2 - 14;
      const text = `${m.pdBinocular.toFixed(1)} mm`;
      ctx.font = "600 13px sans-serif";
      ctx.textAlign = "center";
      const tw = ctx.measureText(text).width;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(midX - tw / 2 - 6, midY - 14, tw + 12, 20);
      ctx.fillStyle = "#fff";
      ctx.fillText(text, midX, midY);
    }

    function computeMetrics(landmarks, W, H) {
      const irisL  = landmarks[LM.IRIS_L];
      const irisR  = landmarks[LM.IRIS_R];
      const cheekL = landmarks[LM.CHEEK_L];
      const cheekR = landmarks[LM.CHEEK_R];
      const nose   = landmarks[LM.NOSE];
      const faceWidthPx = pxDist(cheekL, cheekR, W, H);
      const mmPerPixel = calibRef.current || (FACE_WIDTH_MM / faceWidthPx);
      return {
        pdBinocular: pxDist(irisL, irisR, W, H) * mmPerPixel,
        pdOd: pxDist(irisR, nose, W, H) * mmPerPixel,
        pdOi: pxDist(nose, irisL, W, H) * mmPerPixel,
        irisL, irisR,
      };
    }

    function handleResults(results) {
      const video = videoRef.current;
      if (!video || !video.videoWidth) return;
      const landmarks = results.multiFaceLandmarks?.[0];
      if (!landmarks) {
        samplesRef.current = [];
        setStatus("positioning");
        setProgress(0);
        setLivePD(null);
        drawOverlay(null);
        return;
      }
      const m = computeMetrics(landmarks, video.videoWidth, video.videoHeight);
      drawOverlay(m);
      setLivePD({ pdBinocular: m.pdBinocular, pdOd: m.pdOd, pdOi: m.pdOi });

      samplesRef.current.push(m);
      if (samplesRef.current.length > SAMPLE_SIZE) samplesRef.current.shift();
      setProgress(samplesRef.current.length / SAMPLE_SIZE);

      if (samplesRef.current.length < SAMPLE_SIZE) {
        setStatus("measuring");
        return;
      }
      const sd = stdDev(samplesRef.current.map((s) => s.pdBinocular));
      setStatus(sd <= STABLE_THRESHOLD_MM ? "stable" : "measuring");
    }

    (async () => {
      try {
        const FaceMeshCtor = await loadFaceMesh();
        if (cancelled) return;
        const faceMesh = new FaceMeshCtor({ locateFile: (f) => `${FACE_MESH_CDN}/${f}` });
        faceMesh.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,
          minDetectionConfidence: 0.85,
          minTrackingConfidence: 0.85,
        });
        faceMesh.onResults(handleResults);
        faceMeshRef.current = faceMesh;

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        const loop = async () => {
          const video = videoRef.current;
          if (video && video.readyState >= 2 && faceMeshRef.current) {
            try { await faceMeshRef.current.send({ image: video }); } catch { /* skip frame */ }
          }
          rafRef.current = requestAnimationFrame(loop);
        };
        loop();
      } catch (err) {
        if (err?.name === "NotAllowedError" || err?.name === "NotFoundError" || err?.name === "NotReadableError") {
          setCamError(true);
        } else {
          setLoadError(true);
        }
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      faceMeshRef.current?.close?.();
      faceMeshRef.current = null;
      samplesRef.current = [];
    };
  }, [screen]);

  // ── Calibration drag handlers ────────────────────────────────────────────────
  function handlePointerDown(i, e) {
    e.target.setPointerCapture?.(e.pointerId);
    dragRef.current = i;
  }
  function handlePointerMove(e) {
    if (dragRef.current === null || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const i = dragRef.current;
    setCalibPoints((prev) => prev.map((p, idx) => (idx === i ? { x } : p)));
  }
  function handlePointerUp() { dragRef.current = null; }

  function confirmCalibration() {
    const videoW = videoRef.current?.videoWidth || 0;
    const pxDistance = Math.abs(calibPoints[1].x - calibPoints[0].x) * videoW;
    if (pxDistance > 5) {
      setCalibMmPerPixel(CARD_WIDTH_MM / pxDistance);
      setPrecision("alta");
    }
    setCalibrating(false);
  }

  // ── Capture / reset ───────────────────────────────────────────────────────────
  function handleCapture() {
    const samples = samplesRef.current;
    if (samples.length === 0) return;
    setFinalPD({
      pdBinocular: mean(samples.map((s) => s.pdBinocular)),
      pdOd: mean(samples.map((s) => s.pdOd)),
      pdOi: mean(samples.map((s) => s.pdOi)),
    });
    setScreen("result");
  }

  function remeasure() {
    samplesRef.current = [];
    setProgress(0);
    setStatus("positioning");
    setLivePD(null);
    setFinalPD(null);
    setScreen("measuring");
  }

  function handleConfirmResult() {
    if (!finalPD) return;
    onConfirm({
      pdBinocular: Math.round(finalPD.pdBinocular * 10) / 10,
      pdOd: Math.round(finalPD.pdOd * 10) / 10,
      pdOi: Math.round(finalPD.pdOi * 10) / 10,
      pdPrecision: precision === "alta" ? "Alta" : "Estándar",
    });
  }

  // ── Instrucciones ───────────────────────────────────────────────────────────
  if (screen === "instructions") return (
    <div style={wrap}>
      <h2 style={{ fontSize: 16, fontWeight: 500, margin: "0 0 4px", color: "var(--color-text-primary)" }}>Medición de distancia pupilar</h2>
      <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 1.25rem", lineHeight: 1.6 }}>
        La distancia pupilar (PD) es la medida entre el centro de tus pupilas. Es esencial para fabricar tus gafas correctamente.
      </p>
      <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "14px", marginBottom: "1.5rem" }}>
        <p style={{ fontSize: 12.5, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 10px" }}>Antes de comenzar:</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            ["ti-sun-2", "Busca buena iluminación frontal (no contraluz)"],
            ["ti-device-mobile", "Coloca tu celular a 30–40 cm de tu cara"],
            ["ti-eye", "Mira directamente a la cámara"],
            ["ti-pointer", "No muevas la cabeza durante la medición"],
          ].map(([icon, text]) => (
            <div key={text} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <i className={`ti ${icon}`} style={{ fontSize: 18, color: "var(--color-text-info)", flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
              <span style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.5 }}>{text}</span>
            </div>
          ))}
        </div>
      </div>
      <button style={{ ...btnP, marginBottom: 8 }} onClick={() => setScreen("measuring")}>Comenzar medición</button>
      <button style={btnS} onClick={onCancel}>Volver</button>
    </div>
  );

  // ── Medición ──────────────────────────────────────────────────────────────────
  if (screen === "measuring") {
    const si = STATUS_INFO[status];
    return (
      <div style={wrap}>
        <h2 style={{ fontSize: 16, fontWeight: 500, margin: "0 0 4px", color: "var(--color-text-primary)" }}>Midiendo distancia pupilar</h2>
        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 12px" }}>
          Mantén tu rostro centrado y quieto frente a la cámara.
        </p>

        {camError ? (
          <div style={{ padding: "1.5rem", textAlign: "center", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", background: "var(--color-background-secondary)" }}>
            <i className="ti ti-camera-off" style={{ fontSize: 36, color: "var(--color-text-tertiary)" }} aria-hidden="true" />
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "12px 0 16px" }}>
              No se pudo acceder a la cámara. Verifica los permisos del navegador.
            </p>
            <button style={btnS} onClick={onCancel}>Volver</button>
          </div>
        ) : loadError ? (
          <div style={{ padding: "1.5rem", textAlign: "center", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", background: "var(--color-background-secondary)" }}>
            <i className="ti ti-alert-triangle" style={{ fontSize: 36, color: "var(--color-text-tertiary)" }} aria-hidden="true" />
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "12px 0 16px" }}>
              No se pudo cargar el motor de medición facial. Verifica tu conexión a internet e intenta de nuevo.
            </p>
            <button style={btnS} onClick={onCancel}>Volver</button>
          </div>
        ) : (
          <>
            <div ref={containerRef} style={{ position: "relative", borderRadius: "var(--border-radius-lg)", overflow: "hidden", background: "#111", marginBottom: 12 }}
              onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}>
              <video ref={videoRef} style={{ width: "100%", display: "block", minHeight: 220 }} playsInline muted />
              <canvas ref={canvasRef} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none" }} />

              {calibrating && (
                <>
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, padding: "8px 10px", background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 11.5, lineHeight: 1.5, textAlign: "center" }}>
                    Sostén tu tarjeta de crédito horizontalmente bajo tus ojos y arrastra los puntos hasta sus bordes.
                  </div>
                  <div style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 1, background: "rgba(255,255,255,0.4)" }} />
                  {calibPoints.map((p, i) => (
                    <div key={i}
                      onPointerDown={(e) => handlePointerDown(i, e)}
                      style={{
                        position: "absolute", left: `${p.x * 100}%`, top: "50%",
                        width: 28, height: 28, marginLeft: -14, marginTop: -14,
                        borderRadius: "50%", background: "rgba(93,202,165,0.85)", border: "2px solid #fff",
                        touchAction: "none", cursor: "grab",
                      }} />
                  ))}
                  <div style={{
                    position: "absolute", top: "50%", height: 2, background: "#5DCAA5",
                    left: `${Math.min(calibPoints[0].x, calibPoints[1].x) * 100}%`,
                    width: `${Math.abs(calibPoints[1].x - calibPoints[0].x) * 100}%`,
                  }} />
                </>
              )}
            </div>

            {calibrating ? (
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <button style={{ ...btnS, flex: 1 }} onClick={() => setCalibrating(false)}>Cancelar</button>
                <button style={{ ...btnP, flex: 1 }} onClick={confirmCalibration}>Confirmar calibración</button>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, padding: "4px 10px", borderRadius: 20, background: si.bg, color: si.c }}>{si.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 500, padding: "4px 10px", borderRadius: 20, background: precision === "alta" ? "var(--color-background-success)" : "var(--color-background-secondary)", color: precision === "alta" ? "var(--color-text-success)" : "var(--color-text-tertiary)" }}>
                    {precision === "alta" ? "Alta precisión ±1mm" : "Estimación ±3mm"}
                  </span>
                </div>

                <div style={{ height: 6, background: "var(--color-border-tertiary)", borderRadius: 3, marginBottom: 12, overflow: "hidden" }}>
                  <div style={{ height: 6, width: `${Math.round(progress * 100)}%`, background: "var(--color-text-info)", borderRadius: 3, transition: "width 0.2s" }} />
                </div>

                {livePD && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
                    {[
                      ["PD Binocular", livePD.pdBinocular],
                      ["OD", livePD.pdOd],
                      ["OI", livePD.pdOi],
                    ].map(([label, val]) => (
                      <div key={label} style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "8px", textAlign: "center" }}>
                        <p style={{ fontSize: 10, color: "var(--color-text-tertiary)", margin: "0 0 2px" }}>{label}</p>
                        <p style={{ fontSize: 15, fontWeight: 500, color: "var(--color-text-primary)", margin: 0 }}>{val.toFixed(1)}<span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}> mm</span></p>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <button
                    style={{ ...btnP, opacity: status === "stable" ? 1 : 0.45, cursor: status === "stable" ? "pointer" : "not-allowed" }}
                    disabled={status !== "stable"}
                    onClick={handleCapture}>
                    Capturar
                  </button>
                  <button style={btnS} onClick={() => setCalibrating(true)}>Calibrar con tarjeta de crédito</button>
                  <button style={btnS} onClick={onCancel}>Cancelar</button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    );
  }

  // ── Resultado ────────────────────────────────────────────────────────────────
  if (screen === "result" && finalPD) {
    return (
      <div style={wrap}>
        <h2 style={{ fontSize: 16, fontWeight: 500, margin: "0 0 4px", color: "var(--color-text-primary)" }}>Distancia pupilar medida</h2>
        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 1.25rem" }}>
          Esta medida es necesaria para la fabricación de tus lentes.
        </p>

        <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "20px", textAlign: "center", marginBottom: "1rem" }}>
          <p style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-tertiary)", margin: "0 0 6px", letterSpacing: ".05em" }}>PD BINOCULAR</p>
          <p style={{ fontSize: 42, fontWeight: 600, color: "var(--color-text-primary)", margin: 0 }}>
            {finalPD.pdBinocular.toFixed(1)} <span style={{ fontSize: 16, color: "var(--color-text-tertiary)" }}>mm</span>
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: "1rem" }}>
          {[
            ["OD (ojo derecho)", finalPD.pdOd],
            ["OI (ojo izquierdo)", finalPD.pdOi],
          ].map(([label, val]) => (
            <div key={label} style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "12px", textAlign: "center" }}>
              <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: "0 0 4px" }}>{label}</p>
              <p style={{ fontSize: 20, fontWeight: 500, color: "var(--color-text-primary)", margin: 0 }}>{val.toFixed(1)} <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>mm</span></p>
            </div>
          ))}
        </div>

        <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
          <span style={{ fontSize: 12, fontWeight: 500, padding: "4px 12px", borderRadius: 20, background: precision === "alta" ? "var(--color-background-success)" : "var(--color-background-secondary)", color: precision === "alta" ? "var(--color-text-success)" : "var(--color-text-tertiary)" }}>
            Nivel de precisión: {precision === "alta" ? "Alta" : "Estándar"}
          </span>
        </div>

        <button style={{ ...btnP, marginBottom: 8 }} onClick={handleConfirmResult}>Confirmar y guardar</button>
        <button style={btnS} onClick={remeasure}>Medir de nuevo</button>
      </div>
    );
  }

  return null;
}
