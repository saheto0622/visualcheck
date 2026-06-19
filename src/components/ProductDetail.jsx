import { useState, useRef, useEffect, useCallback } from "react";
import { LENS_TYPES, BLUE_FILTER_EXTRA, calcTotal } from "../data/lensTypes";

const FACE_MESH_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4";
const LM = { IRIS_L: 468, IRIS_R: 473, CHEEK_L: 234, CHEEK_R: 454 };

function fmt(n) {
  return n.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
}

async function loadFaceMesh() {
  if (window.FaceMesh) return window.FaceMesh;
  await new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = `${FACE_MESH_CDN}/face_mesh.js`;
    s.crossOrigin = "anonymous";
    s.onload = res;
    s.onerror = () => rej(new Error("No se pudo cargar MediaPipe"));
    document.head.appendChild(s);
  });
  return window.FaceMesh;
}

export default function ProductDetail({ frame, cart, setCart, onBack }) {
  const [lensId,        setLensId]        = useState("sv");
  const [filtroAzul,    setFiltroAzul]    = useState(false);
  const [arActive,      setArActive]      = useState(false);
  const [camError,      setCamError]      = useState(false);
  const [arLoading,     setArLoading]     = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [added,         setAdded]         = useState(false);

  const videoRef   = useRef(null);
  const canvasRef  = useRef(null);
  const streamRef  = useRef(null);
  const meshRef    = useRef(null);
  const rafRef     = useRef(null);
  const glassImgRef = useRef(null);

  const lens = LENS_TYPES.find((l) => l.id === lensId);
  const total = calcTotal(frame.precio, lensId, filtroAzul);

  // Pre-carga la imagen SVG de la montura para el overlay AR
  useEffect(() => {
    const img = new Image();
    img.src = frame.imagen_url;
    glassImgRef.current = img;
  }, [frame.imagen_url]);

  // ── AR try-on lifecycle ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!arActive) return;
    let cancelled = false;
    setArLoading(true);
    setCamError(false);

    async function start() {
      try {
        const FaceMesh = await loadFaceMesh();
        if (cancelled) return;

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;

        const video = videoRef.current;
        video.srcObject = stream;
        await video.play();

        const fm = new FaceMesh({
          locateFile: (f) => `${FACE_MESH_CDN}/${f}`,
        });
        fm.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
        fm.onResults(handleResults);
        meshRef.current = fm;

        async function loop() {
          if (cancelled || !videoRef.current) return;
          await fm.send({ image: videoRef.current });
          rafRef.current = requestAnimationFrame(loop);
        }
        rafRef.current = requestAnimationFrame(loop);
        setArLoading(false);
      } catch {
        if (!cancelled) setCamError(true);
        setArLoading(false);
      }
    }

    start();
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      meshRef.current?.close();
    };
  }, [arActive]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleResults = useCallback((results) => {
    const canvas = canvasRef.current;
    const video  = videoRef.current;
    if (!canvas || !video || !video.videoWidth) return;

    const W = canvas.width  = video.clientWidth  || video.videoWidth;
    const H = canvas.height = video.clientHeight || video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, W, H);

    const lms = results.multiFaceLandmarks?.[0];
    if (!lms) return;

    const iL = lms[LM.IRIS_L];
    const iR = lms[LM.IRIS_R];
    const cL = lms[LM.CHEEK_L];
    const cR = lms[LM.CHEEK_R];
    if (!iL || !iR || !cL || !cR) return;

    // Posición y escala de las gafas
    const midX = ((iL.x + iR.x) / 2) * W;
    const midY = ((iL.y + iR.y) / 2) * H;
    const faceW = Math.abs(cL.x - cR.x) * W;
    const gW = faceW * 1.08;
    const gH = gW * (120 / 300);

    const img = glassImgRef.current;
    if (img?.complete) {
      ctx.drawImage(img, midX - gW / 2, midY - gH * 0.52, gW, gH);
    }
  }, []);

  function capturarFoto() {
    const canvas  = canvasRef.current;
    const video   = videoRef.current;
    if (!canvas || !video) return;

    const out = document.createElement("canvas");
    out.width  = video.videoWidth;
    out.height = video.videoHeight;
    const ctx = out.getContext("2d");
    // Espejo de la imagen para que coincida con la vista del usuario
    ctx.translate(out.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Superponer gafas en la foto a resolución real
    const lW = video.videoWidth;
    const lH = video.videoHeight;
    const iL = glassImgRef.current;
    if (iL?.complete) {
      // Re-usar las últimas coordenadas del canvas de baja resolución
      const scaleX = lW / (canvas.width || 1);
      const scaleY = lH / (canvas.height || 1);
      const overlayData = canvas.toDataURL();
      const overlayImg = new Image();
      overlayImg.onload = () => {
        ctx.translate(lW, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(overlayImg, 0, 0, lW, lH);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        setCapturedPhoto(out.toDataURL("image/jpeg", 0.92));
      };
      overlayImg.src = overlayData;
      return;
    }
    setCapturedPhoto(out.toDataURL("image/jpeg", 0.92));
  }

  function agregarAlCarrito() {
    const item = {
      uid: Date.now(),
      montura: frame.nombre,
      montura_id: frame.id,
      genero: frame.genero,
      imagen_url: frame.imagen_url,
      tipo_lente_id: lensId,
      tipo_lente: lens?.label ?? "",
      filtro_azul: filtroAzul,
      precio_montura: frame.precio,
      precio_lente: lens?.precio ?? 0,
      precio_filtro: filtroAzul ? BLUE_FILTER_EXTRA.precio : 0,
      precio_total: total,
    };
    setCart((prev) => [...prev, item]);
    setAdded(true);
    setTimeout(() => setAdded(false), 2500);
  }

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "1rem 1rem 4rem" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1.25rem" }}>
        <button
          onClick={onBack}
          style={{ padding: "7px 14px", fontSize: 13, cursor: "pointer", color: "var(--color-text-secondary)", background: "transparent", border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)" }}>
          ← Volver
        </button>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 500, margin: 0, color: "var(--color-text-primary)" }}>{frame.nombre}</h2>
          <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: 0, textTransform: "capitalize" }}>{frame.genero}</p>
        </div>
      </div>

      {/* Imagen del producto o AR try-on */}
      {!arActive ? (
        <>
          <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-lg)", padding: "2rem", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "1rem" }}>
            <img src={frame.imagen_url} alt={frame.nombre} style={{ width: "100%", maxWidth: 260, height: 100, objectFit: "contain" }} />
          </div>
          {capturedPhoto && (
            <div style={{ marginBottom: "1rem" }}>
              <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 6 }}>Tu foto con estas gafas:</p>
              <img src={capturedPhoto} alt="Foto con gafas" style={{ width: "100%", borderRadius: "var(--border-radius-lg)", border: "0.5px solid var(--color-border-tertiary)" }} />
            </div>
          )}
          <button
            onClick={() => { setCapturedPhoto(null); setArActive(true); }}
            style={{ width: "100%", padding: "12px", fontSize: 14, fontWeight: 500, cursor: "pointer", background: "var(--color-background-info)", color: "var(--color-text-info)", border: "1px solid var(--color-text-info)", borderRadius: "var(--border-radius-md)", marginBottom: "1.25rem" }}>
            Probarme estas gafas con mi cámara
          </button>
        </>
      ) : (
        <div style={{ position: "relative", borderRadius: "var(--border-radius-lg)", overflow: "hidden", marginBottom: "1rem", background: "#000" }}>
          {arLoading && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", zIndex: 10 }}>
              <p style={{ color: "#fff", fontSize: 13 }}>Cargando cámara...</p>
            </div>
          )}
          {camError && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)", zIndex: 10, flexDirection: "column", gap: 8 }}>
              <p style={{ color: "#fff", fontSize: 13, textAlign: "center", padding: "0 1.5rem" }}>No se pudo acceder a la cámara.</p>
              <button onClick={() => setArActive(false)} style={{ padding: "8px 20px", fontSize: 13, cursor: "pointer", borderRadius: "var(--border-radius-md)", border: "none", background: "#fff", color: "#111" }}>Cerrar</button>
            </div>
          )}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{ width: "100%", display: "block", transform: "scaleX(-1)" }}
          />
          <canvas
            ref={canvasRef}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", transform: "scaleX(-1)", pointerEvents: "none" }}
          />
          {/* Controles AR */}
          <div style={{ position: "absolute", bottom: 12, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 10, zIndex: 5 }}>
            <button
              onClick={capturarFoto}
              style={{ padding: "10px 20px", fontSize: 13, fontWeight: 500, cursor: "pointer", background: "#fff", color: "#111", border: "none", borderRadius: "var(--border-radius-md)" }}>
              Capturar foto
            </button>
            <button
              onClick={() => setArActive(false)}
              style={{ padding: "10px 16px", fontSize: 13, cursor: "pointer", background: "rgba(0,0,0,0.6)", color: "#fff", border: "0.5px solid rgba(255,255,255,0.3)", borderRadius: "var(--border-radius-md)" }}>
              Cerrar cámara
            </button>
          </div>
        </div>
      )}

      {/* Forma de rostro recomendada */}
      <div style={{ marginBottom: "1.25rem" }}>
        <p style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-tertiary)", margin: "0 0 6px", letterSpacing: ".05em" }}>RECOMENDADO PARA ROSTRO</p>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {frame.forma_rostro_recomendada.map((r) => (
            <span key={r} style={{ padding: "4px 10px", fontSize: 11, borderRadius: 20, background: "var(--color-background-secondary)", color: "var(--color-text-secondary)", border: "0.5px solid var(--color-border-secondary)", textTransform: "capitalize" }}>
              {r}
            </span>
          ))}
        </div>
      </div>

      {/* Tipo de lente */}
      <div style={{ marginBottom: "1.25rem" }}>
        <p style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-tertiary)", margin: "0 0 8px", letterSpacing: ".05em" }}>TIPO DE LENTE</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {LENS_TYPES.map((l) => (
            <button
              key={l.id}
              onClick={() => setLensId(l.id)}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "11px 14px", fontSize: 13, cursor: "pointer",
                border: lensId === l.id ? "1.5px solid var(--color-text-info)" : "0.5px solid var(--color-border-secondary)",
                borderRadius: "var(--border-radius-md)",
                background: lensId === l.id ? "var(--color-background-info)" : "var(--color-background-primary)",
                color: lensId === l.id ? "var(--color-text-info)" : "var(--color-text-primary)",
                fontWeight: lensId === l.id ? 500 : 400,
              }}>
              <span>{l.label}</span>
              <span style={{ fontWeight: 600 }}>{fmt(l.precio)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Filtro luz azul */}
      <div style={{ marginBottom: "1.5rem" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "11px 14px", border: filtroAzul ? "1.5px solid var(--color-text-info)" : "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", background: filtroAzul ? "var(--color-background-info)" : "var(--color-background-primary)" }}>
          <input
            type="checkbox"
            checked={filtroAzul}
            onChange={(e) => setFiltroAzul(e.target.checked)}
            style={{ width: 16, height: 16, cursor: "pointer", accentColor: "var(--color-text-info)" }}
          />
          <span style={{ flex: 1, fontSize: 13, color: filtroAzul ? "var(--color-text-info)" : "var(--color-text-primary)", fontWeight: filtroAzul ? 500 : 400 }}>
            {BLUE_FILTER_EXTRA.label}
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: filtroAzul ? "var(--color-text-info)" : "var(--color-text-secondary)" }}>
            +{fmt(BLUE_FILTER_EXTRA.precio)}
          </span>
        </label>
      </div>

      {/* Precio total */}
      <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "16px", marginBottom: "1rem", background: "var(--color-background-secondary)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 4 }}>
          <span>Montura</span><span>{fmt(frame.precio)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--color-text-secondary)", marginBottom: filtroAzul ? 4 : 10 }}>
          <span>{lens?.label}</span><span>{fmt(lens?.precio ?? 0)}</span>
        </div>
        {filtroAzul && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 10 }}>
            <span>Filtro luz azul</span><span>+{fmt(BLUE_FILTER_EXTRA.precio)}</span>
          </div>
        )}
        <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)" }}>Total</span>
          <span style={{ fontSize: 22, fontWeight: 700, color: "var(--color-text-primary)" }}>{fmt(total)}</span>
        </div>
      </div>

      {/* Agregar al carrito */}
      <button
        onClick={agregarAlCarrito}
        style={{ width: "100%", padding: "14px", fontSize: 15, fontWeight: 500, cursor: "pointer", background: added ? "var(--color-text-success)" : "var(--color-text-primary)", color: "var(--color-background-primary)", border: "none", borderRadius: "var(--border-radius-md)", transition: "background 0.2s" }}>
        {added ? "✓ Agregado al carrito" : "Agregar al carrito"}
      </button>
    </div>
  );
}
