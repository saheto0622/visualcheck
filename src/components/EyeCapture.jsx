import { useState, useRef, useEffect } from "react";
import { wrap, btnP, btnS } from "../lib/styles";

const FACE_MESH_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4";
const CIRCLE = { cx: 0.5, cy: 0.46, r: 0.35 }; // relative to video size
const COUNTDOWN_SECONDS = 3;
const STABLE_FRAMES_REQUIRED = 6;
const LM = { IRIS_L: 468, IRIS_L_A: 469, IRIS_L_B: 471, IRIS_R: 473 };

const EYE_CONFIG = {
  od: {
    title: "Ojo derecho", step: "Paso 1 de 2",
    instruction: "Cierra el ojo izquierdo con la palma.\nCentra tu ojo derecho en el círculo.",
  },
  oi: {
    title: "Ojo izquierdo", step: "Paso 2 de 2",
    instruction: "Ahora cierra el ojo derecho.\nCentra tu ojo izquierdo en el círculo.",
  },
};

const STATUS_TEXT = {
  searching: "Buscando tu ojo...",
  centered: "¡Perfecto! Mantén la posición...",
  "too-close": "Aléjate un poco",
  "too-far": "Acércate un poco más",
};

function dist(a, b, w, h) {
  const dx = (a.x - b.x) * w, dy = (a.y - b.y) * h;
  return Math.sqrt(dx * dx + dy * dy);
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

function playBeep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.15);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch { /* audio not available */ }
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function EyeCapture({ onComplete, onDemo }) {
  const [screen, setScreen]       = useState("prep"); // prep | capture | confirm
  const [eye, setEye]             = useState("od");   // od | oi
  const [photos, setPhotos]       = useState({ od: null, oi: null });
  const [captureState, setCaptureState] = useState("live"); // live | preview
  const [status, setStatus]       = useState("searching");
  const [countdown, setCountdown] = useState(null);
  const [camError, setCamError]   = useState(false);
  const [loadError, setLoadError] = useState(false);

  const videoRef          = useRef(null);
  const captureCanvasRef  = useRef(null);
  const streamRef         = useRef(null);
  const rafRef            = useRef(null);
  const faceMeshRef       = useRef(null);
  const stableFramesRef   = useRef(0);
  const countdownTimerRef = useRef(null);
  const eyeRef            = useRef(eye);
  const captureStateRef   = useRef(captureState);
  const captureFnRef      = useRef(null);

  useEffect(() => { eyeRef.current = eye; }, [eye]);
  useEffect(() => { captureStateRef.current = captureState; }, [captureState]);

  // ── Camera + FaceMesh lifecycle (active while screen === "capture") ─────────
  useEffect(() => {
    if (screen !== "capture") return;
    setCamError(false);
    setLoadError(false);
    let cancelled = false;

    function clearCountdownTimer() {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
    }

    function doCapture() {
      const video  = videoRef.current;
      const canvas = captureCanvasRef.current;
      if (!video || !canvas || !video.videoWidth) return;
      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d").drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      stableFramesRef.current = 0;
      clearCountdownTimer();
      setCountdown(null);
      playBeep();
      if (navigator.vibrate) navigator.vibrate(80);
      setPhotos((prev) => ({ ...prev, [eyeRef.current]: dataUrl }));
      setCaptureState("preview");
    }
    captureFnRef.current = doCapture;

    function startCountdown() {
      let remaining = COUNTDOWN_SECONDS;
      setCountdown(remaining);
      countdownTimerRef.current = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          clearCountdownTimer();
          setCountdown(null);
          doCapture();
        } else {
          setCountdown(remaining);
        }
      }, 1000);
    }

    function handleResults(results) {
      if (captureStateRef.current !== "live") return;
      const video = videoRef.current;
      if (!video || !video.videoWidth || !video.clientWidth) return;
      const W = video.clientWidth, H = video.clientHeight;
      const landmarks = results.multiFaceLandmarks?.[0];
      if (!landmarks) {
        stableFramesRef.current = 0;
        clearCountdownTimer();
        setCountdown(null);
        setStatus("searching");
        return;
      }
      const irisL = landmarks[LM.IRIS_L];
      const irisR = landmarks[LM.IRIS_R];
      const center = { x: (irisL.x + irisR.x) / 2, y: (irisL.y + irisR.y) / 2 };
      const dx = (center.x - CIRCLE.cx) * W, dy = (center.y - CIRCLE.cy) * H;
      const distToCenter = Math.sqrt(dx * dx + dy * dy);
      const circleRPx = CIRCLE.r * W;
      const irisDiamPx = dist(landmarks[LM.IRIS_L_A], landmarks[LM.IRIS_L_B], W, H);

      let newStatus;
      if (distToCenter > circleRPx * 0.55) {
        newStatus = "searching";
      } else if (irisDiamPx < circleRPx * 0.22) {
        newStatus = "too-far";
      } else if (irisDiamPx > circleRPx * 0.65) {
        newStatus = "too-close";
      } else {
        newStatus = "centered";
      }

      if (newStatus === "centered") {
        stableFramesRef.current += 1;
      } else {
        stableFramesRef.current = 0;
        clearCountdownTimer();
        setCountdown(null);
      }
      setStatus(newStatus);

      if (newStatus === "centered" && stableFramesRef.current >= STABLE_FRAMES_REQUIRED && !countdownTimerRef.current) {
        startCountdown();
      }
    }

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch {
        if (!cancelled) setCamError(true);
        return;
      }

      try {
        const FaceMeshCtor = await loadFaceMesh();
        if (cancelled) return;
        const faceMesh = new FaceMeshCtor({ locateFile: (f) => `${FACE_MESH_CDN}/${f}` });
        faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.7, minTrackingConfidence: 0.7 });
        faceMesh.onResults(handleResults);
        faceMeshRef.current = faceMesh;
      } catch {
        if (!cancelled) setLoadError(true);
      }

      const loop = async () => {
        const video = videoRef.current;
        if (video && video.readyState >= 2 && faceMeshRef.current) {
          try { await faceMeshRef.current.send({ image: video }); } catch { /* skip frame */ }
        }
        rafRef.current = requestAnimationFrame(loop);
      };
      loop();
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      clearCountdownTimer();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      faceMeshRef.current?.close?.();
      faceMeshRef.current = null;
      stableFramesRef.current = 0;
      captureFnRef.current = null;
    };
  }, [screen]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  function resetDetection() {
    stableFramesRef.current = 0;
    setStatus("searching");
    setCountdown(null);
  }

  function startCapture(forEye) {
    setEye(forEye);
    setCaptureState("live");
    resetDetection();
    setScreen("capture");
  }

  function useThisPhoto() {
    if (eye === "od") {
      setEye("oi");
      setCaptureState("live");
      resetDetection();
    } else {
      setScreen("confirm");
    }
  }

  function retakePhoto() {
    setPhotos((prev) => ({ ...prev, [eye]: null }));
    setCaptureState("live");
    resetDetection();
  }

  function handleManualCapture() {
    captureFnRef.current?.();
  }

  // ── Prep screen ─────────────────────────────────────────────────────────────
  if (screen === "prep") {
    const items = [
      { icon: "💡", text: "Siéntate frente a una ventana o lámpara — necesitas luz frontal directa" },
      { icon: "📱", text: "Sostén el celular a 15-20cm de tu cara" },
      { icon: "👁️", text: "Vamos a fotografiar cada ojo por separado" },
      { icon: "⚠️", text: "Retira lentes de contacto si usas" },
    ];
    return (
      <div style={wrap}>
        <h2 style={{ fontSize: 16, fontWeight: 500, margin: "0 0 12px", color: "var(--color-text-primary)" }}>Foto de tus ojos</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: "1.5rem" }}>
          {items.map(({ icon, text }) => (
            <div key={text} style={{ display: "flex", gap: 12, alignItems: "flex-start", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "12px 14px" }}>
              <span style={{ fontSize: 22, lineHeight: 1 }}>{icon}</span>
              <span style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.5 }}>{text}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button style={btnP} onClick={() => startCapture("od")}>Comenzar con ojo derecho →</button>
          <button style={btnS} onClick={onDemo}>Usar datos de demo</button>
        </div>
      </div>
    );
  }

  // ── Capture screen (OD / OI) ──────────────────────────────────────────────
  if (screen === "capture") {
    const cfg = EYE_CONFIG[eye];
    const previewSrc = photos[eye];
    return (
      <div style={wrap}>
        <style>{`@keyframes vc-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }`}</style>
        <h2 style={{ fontSize: 16, fontWeight: 500, margin: "0 0 4px", color: "var(--color-text-primary)" }}>{cfg.title} • {cfg.step}</h2>
        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 12px", lineHeight: 1.5, whiteSpace: "pre-line" }}>
          {cfg.instruction}
        </p>

        {camError ? (
          <div style={{ padding: "1.5rem", textAlign: "center", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", background: "var(--color-background-secondary)" }}>
            <i className="ti ti-camera-off" style={{ fontSize: 36, color: "var(--color-text-tertiary)" }} aria-hidden="true" />
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "12px 0 16px" }}>
              No se pudo acceder a la cámara. Verifica los permisos del navegador.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button style={{ ...btnP, fontSize: 13, padding: "10px" }} onClick={() => setCamError(false)}>Reintentar con cámara</button>
              <button style={{ ...btnS, fontSize: 13, padding: "10px" }} onClick={onDemo}>Usar datos de demo →</button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ position: "relative", borderRadius: "var(--border-radius-lg)", overflow: "hidden", background: "#111", marginBottom: 12 }}>
              <video ref={videoRef} style={{ width: "100%", display: "block", minHeight: 280 }} playsInline muted />
              {captureState === "live" && (
                <div style={{
                  position: "absolute",
                  left: `${CIRCLE.cx * 100}%`, top: `${CIRCLE.cy * 100}%`,
                  width: `${CIRCLE.r * 2 * 100}%`, aspectRatio: "1 / 1",
                  transform: "translate(-50%, -50%)",
                  borderRadius: "50%",
                  border: `4px solid ${status === "centered" ? "#3ddc97" : "#fff"}`,
                  boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
                  animation: (status === "searching" && !loadError) ? "vc-blink 1.4s ease-in-out infinite" : "none",
                  pointerEvents: "none",
                }} />
              )}
              {captureState === "preview" && previewSrc && (
                <img src={previewSrc} alt="" style={{
                  position: "absolute",
                  left: `${CIRCLE.cx * 100}%`, top: `${CIRCLE.cy * 100}%`,
                  width: `${CIRCLE.r * 2 * 100}%`, aspectRatio: "1 / 1",
                  transform: "translate(-50%, -50%)",
                  borderRadius: "50%", objectFit: "cover",
                  border: "4px solid #3ddc97",
                }} />
              )}
              {captureState === "live" && countdown !== null && (
                <div style={{
                  position: "absolute", left: "50%", top: `${CIRCLE.cy * 100}%`,
                  transform: "translate(-50%, -50%)",
                  fontSize: 48, fontWeight: 700, color: "#fff",
                  textShadow: "0 2px 8px rgba(0,0,0,0.6)",
                  pointerEvents: "none",
                }}>{countdown}</div>
              )}
            </div>
            <canvas ref={captureCanvasRef} style={{ display: "none" }} />

            {captureState === "live" ? (
              <>
                <div style={{ textAlign: "center", marginBottom: 12 }}>
                  <span style={{
                    fontSize: 13, fontWeight: 500, padding: "6px 14px", borderRadius: 20,
                    background: status === "centered" ? "var(--color-background-success)" : "var(--color-background-secondary)",
                    color: status === "centered" ? "var(--color-text-success)" : "var(--color-text-secondary)",
                  }}>
                    {loadError ? "Centra tu ojo en el círculo y captura manualmente" : STATUS_TEXT[status]}
                  </span>
                </div>
                <button style={btnP} onClick={handleManualCapture}>Capturar ahora</button>
              </>
            ) : (
              <div style={{ display: "flex", gap: 8 }}>
                <button style={{ ...btnS, flex: 1 }} onClick={retakePhoto}>↺ Repetir</button>
                <button style={{ ...btnP, flex: 1 }} onClick={useThisPhoto}>✓ Usar esta foto</button>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // ── Confirmation screen ────────────────────────────────────────────────────
  if (screen === "confirm") {
    return (
      <div style={wrap}>
        <h2 style={{ fontSize: 16, fontWeight: 500, margin: "0 0 4px", color: "var(--color-text-primary)" }}>Confirma tus fotos</h2>
        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 1.25rem" }}>
          Revisa que cada ojo se vea nítido y bien iluminado.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: "1.5rem" }}>
          {[
            { key: "od", label: "Ojo derecho" },
            { key: "oi", label: "Ojo izquierdo" },
          ].map(({ key, label }) => (
            <div key={key}>
              <div style={{ borderRadius: "var(--border-radius-lg)", overflow: "hidden", background: "#111", marginBottom: 6, aspectRatio: "1 / 1" }}>
                {photos[key] && <img src={photos[key]} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
              </div>
              <p style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-primary)", textAlign: "center", margin: "0 0 8px" }}>{label}</p>
              <button style={{ ...btnS, fontSize: 12, padding: "8px" }} onClick={() => startCapture(key)}>Repetir este ojo</button>
            </div>
          ))}
        </div>
        <button style={btnP} onClick={() => onComplete({ photoOD: photos.od, photoOI: photos.oi })}>Analizar mis ojos →</button>
      </div>
    );
  }

  return null;
}
