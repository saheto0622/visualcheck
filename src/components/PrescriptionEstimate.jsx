import { useState, useEffect, useRef } from "react";
import { wrap, btnP } from "../lib/styles";
import { CONFIANZA_INFO } from "../lib/format";
import { snellenToDiopters, calculateAddition, edadRangoToAge } from "../lib/prescriptionAlgorithm";

function buildLocalEstimate(vtResults, edadRango) {
  const { esferaOD, esferaOI } = snellenToDiopters(
    vtResults.agudezaLejosOd, vtResults.agudezaLejosOi, vtResults.duocromo
  );
  const astig = vtResults.astigmatismoData || { cilindro: 0, eje: 0 };
  const age = edadRangoToAge(edadRango);
  const adicion = calculateAddition(age, vtResults.acomodacion);

  return {
    od_esfera: esferaOD,
    od_cilindro: astig.cilindro,
    od_eje: astig.eje,
    oi_esfera: esferaOI,
    oi_cilindro: astig.cilindro,
    oi_eje: astig.eje,
    adicion,
  };
}

function buildPrompt(vtResults, edadRango, local) {
  return `Eres un asistente clínico especializado en optometría. Con base en los siguientes resultados de una batería de pruebas visuales realizadas con una app móvil, genera una ESTIMACIÓN PRELIMINAR de prescripción óptica. Esta estimación será revisada y validada por un optómetra certificado antes de fabricar cualquier lente.

Datos del paciente:
- Edad (rango): ${edadRango || "no especificado"}
- Agudeza visual lejana OD: ${vtResults.agudezaLejosOd || "no disponible"}
- Agudeza visual lejana OI: ${vtResults.agudezaLejosOi || "no disponible"}
- Agudeza visual cercana OD: ${vtResults.agudezaCercaOd || "no disponible"}
- Agudeza visual cercana OI: ${vtResults.agudezaCercaOi || "no disponible"}
- Sensibilidad al contraste: ${vtResults.sensibilidadContraste || "no disponible"}
- Test duocromo (rojo/verde): ${vtResults.duocromo || "no disponible"}
- Acomodación: ${vtResults.acomodacion || "no disponible"}
- Astigmatismo (cilindro/eje detectado): ${vtResults.astigmatismo || "no detectado"}
- Confirmación del eje (lente cruzada): ${vtResults.lenteCruzada || "no realizada"}
- Distancia pupilar: no disponible (pendiente de medición)

Cálculo de referencia local (algoritmo basado en tablas clínicas estándar):
${JSON.stringify(local)}

Con base en TODOS estos datos, responde ÚNICAMENTE con un JSON (sin texto adicional, sin markdown, sin explicaciones) con esta estructura exacta:
{"od_esfera": number, "od_cilindro": number, "od_eje": number, "oi_esfera": number, "oi_cilindro": number, "oi_eje": number, "adicion": number, "confianza": "alta|media|baja", "notas": "string breve"}

Los valores de esfera y cilindro deben estar en dioptrías con incrementos de 0.25, y los ejes en grados (0-180). Usa el cálculo de referencia local como base, ajustándolo solo si detectas inconsistencias clínicas claras entre las pruebas. Solo responde con el JSON, sin texto adicional.`;
}

async function fetchAIEstimate(vtResults, edadRango, local) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      messages: [{ role: "user", content: buildPrompt(vtResults, edadRango, local) }],
    }),
  });
  const data = await res.json();
  const text = data.content?.[0]?.text || "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  const parsed = JSON.parse(match[0]);
  if (typeof parsed.od_esfera !== "number" || typeof parsed.oi_esfera !== "number") return null;
  return parsed;
}

const fmtD = n => (n > 0 ? `+${n.toFixed(2)}` : n.toFixed(2));

export default function PrescriptionEstimate({ vtResults, edadRango, onContinue }) {
  const [phase, setPhase] = useState("loading"); // loading | result
  const [rx, setRx] = useState(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;
    const startedAt = Date.now();
    (async () => {
      const local = buildLocalEstimate(vtResults, edadRango);
      let ai = null;
      try {
        ai = await fetchAIEstimate(vtResults, edadRango, local);
      } catch {
        ai = null;
      }
      const final = ai || {
        ...local,
        confianza: "media",
        notas: "Estimación generada por algoritmo local (IA no disponible en este momento).",
      };
      const remaining = Math.max(0, 3000 - (Date.now() - startedAt));
      setTimeout(() => {
        if (!cancelled) { setRx(final); setPhase("result"); }
      }, remaining);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === "loading") {
    return (
      <div style={{ ...wrap, textAlign: "center", paddingTop: "4rem", paddingBottom: "4rem" }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--color-background-info)", margin: "0 auto 1.5rem", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <i className="ti ti-prescription" style={{ fontSize: 28, color: "var(--color-text-info)" }} aria-hidden="true" />
        </div>
        <p style={{ fontSize: 16, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 8px" }}>Calculando tu prescripción...</p>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
          Analizando los resultados de tu batería de pruebas visuales para generar una estimación clínica.
        </p>
      </div>
    );
  }

  const conf = CONFIANZA_INFO[rx.confianza] || CONFIANZA_INFO.media;

  return (
    <div style={wrap}>
      <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: "0 0 8px", fontWeight: 500, letterSpacing: ".06em" }}>RESULTADO PRELIMINAR</p>
      <h2 style={{ fontSize: 18, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 1.25rem" }}>Tu prescripción estimada</h2>

      <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "16px", marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", margin: 0, letterSpacing: ".04em" }}>PRESCRIPCIÓN ESTIMADA</p>
          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)" }}>{conf.emoji} Confianza {conf.label}</span>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 12 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "4px 6px", fontSize: 11, color: "var(--color-text-tertiary)", fontWeight: 500 }}></th>
              <th style={{ textAlign: "right", padding: "4px 6px", fontSize: 11, color: "var(--color-text-tertiary)", fontWeight: 500 }}>ESFERA</th>
              <th style={{ textAlign: "right", padding: "4px 6px", fontSize: 11, color: "var(--color-text-tertiary)", fontWeight: 500 }}>CILINDRO</th>
              <th style={{ textAlign: "right", padding: "4px 6px", fontSize: 11, color: "var(--color-text-tertiary)", fontWeight: 500 }}>EJE</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderTop: "0.5px solid var(--color-border-tertiary)" }}>
              <td style={{ padding: "8px 6px", fontWeight: 500, color: "var(--color-text-primary)" }}>OD</td>
              <td style={{ padding: "8px 6px", textAlign: "right", color: "var(--color-text-primary)" }}>{fmtD(rx.od_esfera)}</td>
              <td style={{ padding: "8px 6px", textAlign: "right", color: "var(--color-text-primary)" }}>{fmtD(rx.od_cilindro)}</td>
              <td style={{ padding: "8px 6px", textAlign: "right", color: "var(--color-text-primary)" }}>{rx.od_eje}°</td>
            </tr>
            <tr style={{ borderTop: "0.5px solid var(--color-border-tertiary)" }}>
              <td style={{ padding: "8px 6px", fontWeight: 500, color: "var(--color-text-primary)" }}>OI</td>
              <td style={{ padding: "8px 6px", textAlign: "right", color: "var(--color-text-primary)" }}>{fmtD(rx.oi_esfera)}</td>
              <td style={{ padding: "8px 6px", textAlign: "right", color: "var(--color-text-primary)" }}>{fmtD(rx.oi_cilindro)}</td>
              <td style={{ padding: "8px 6px", textAlign: "right", color: "var(--color-text-primary)" }}>{rx.oi_eje}°</td>
            </tr>
          </tbody>
        </table>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--color-text-secondary)", paddingTop: 10, borderTop: "0.5px solid var(--color-border-tertiary)" }}>
          <span>ADICIÓN</span>
          <span style={{ fontWeight: 500, color: "var(--color-text-primary)" }}>{rx.adicion > 0 ? fmtD(rx.adicion) : "—"}</span>
        </div>

        {rx.notas && (
          <p style={{ fontSize: 11.5, color: "var(--color-text-secondary)", margin: "10px 0 0", lineHeight: 1.5, fontStyle: "italic" }}>{rx.notas}</p>
        )}

        <div style={{ marginTop: 14, padding: "8px 10px", borderRadius: "var(--border-radius-md)", background: "var(--color-background-warning)", textAlign: "center" }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-warning)" }}>⏳ Pendiente validación optómetra</span>
        </div>
      </div>

      <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "10px 12px", marginBottom: "1.25rem", fontSize: 11.5, color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
        Esta prescripción es una estimación generada por IA. Debe ser revisada y validada por un optómetra certificado antes de fabricar sus lentes.
      </div>

      <button style={btnP} onClick={() => onContinue(rx)}>Continuar con la foto de mis ojos →</button>
    </div>
  );
}
