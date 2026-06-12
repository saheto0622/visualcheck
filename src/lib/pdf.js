import { VT_TESTS, getRisk, fallbackText } from "./format";

// Generates the VisualCheck PDF report for a given record.
// `record` follows the shape produced by fromDb() / saveEval():
// nombre, cedula, direccion, correo, celular, fecha, overall, leftRed,
// rightRed, asym, qScore, vtStatus + VT_TESTS keys, and (when validated)
// estadoValidacion, optometristaNombre, optometristaTarjeta, validadoEn.
export async function generateReportPDF(record, aiText) {
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

  const risk = getRisk(record.leftRed, record.rightRed, record.asym, record.qScore);
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
    ["Nombre",                 record.nombre  || "—"],
    ["Cédula",                 record.cedula  || "—"],
    ["Fecha de evaluación",    record.fecha   || "—"],
    ["Celular",                record.celular || "—"],
    ["Correo",                 record.correo  || "—"],
    ["Dirección",              record.direccion || "—"],
  ];
  const half = Math.ceil(fields.length / 2);
  fields.forEach(([label, val], i) => {
    const col = i < half ? 0 : 1;
    const row = i < half ? i : i - half;
    const x   = M + col * (CW / 2);
    const yy  = y + row * 9;
    doc.setFontSize(8.5); doc.setFont("helvetica","normal");
    doc.setTextColor(130,130,142); doc.text(label, x, yy);
    doc.setTextColor(25,25,38);    doc.text(String(val), x + 30, yy);
  });
  y += half * 9 + 6;
  doc.setDrawColor(235,235,242); doc.line(M, y, W - M, y); y += 10;

  // ── Resultados ───────────────────────────────────────────────────────
  doc.setFontSize(11); doc.setFont("helvetica","bold");
  doc.setTextColor(15,15,35);
  doc.text("Resultados del análisis", M, y);
  doc.setFontSize(10); doc.setFont("helvetica","bold");
  doc.setTextColor(...rC);
  doc.text(`● ${risk.label}  ·  Puntuación ${record.overall}/100`, M + 58, y);
  y += 10;

  const scores = [
    ["Enrojecimiento ojo izquierdo", record.leftRed],
    ["Enrojecimiento ojo derecho",   record.rightRed],
    ["Asimetría ocular",             record.asym],
    ["Síntomas reportados",          record.qScore],
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

  // ── Historia clínica básica ────────────────────────────────────────────
  const hcRows = [
    ["¿Usa gafas o lentes de contacto?", record.hcUsaGafas],
    ["Diabetes / hipertensión",          record.hcDiabetesHipertension],
    ["Antecedentes familiares (glaucoma/DMAE)", record.hcAntecedentesFamiliares],
    ["Cirugía ocular previa",            record.hcCirugiaOcular],
    ["Última fórmula óptica",            record.hcUltimaFormula],
  ].filter(([, v]) => v);
  if (hcRows.length) {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.setFontSize(11); doc.setFont("helvetica","bold");
    doc.setTextColor(15,15,35);
    doc.text("Historia clínica básica", M, y); y += 8;
    hcRows.forEach(([label, val]) => {
      if (y > 278) { doc.addPage(); y = 20; }
      doc.setFontSize(9); doc.setFont("helvetica","normal");
      doc.setTextColor(75,75,88);
      doc.text(label, M, y);
      doc.setTextColor(25,25,38);
      const valText = doc.splitTextToSize(String(val), CW - 80);
      doc.text(valText, W - M, y, { align: "right" });
      y += 6 * Math.max(1, valText.length);
    });
    y += 4;
    doc.setDrawColor(235,235,242); doc.line(M, y, W - M, y); y += 10;
  }

  // ── Distancia pupilar (PD) ──────────────────────────────────────────────
  if (record.pdBinocular) {
    if (y > 255) { doc.addPage(); y = 20; }
    doc.setFontSize(11); doc.setFont("helvetica","bold");
    doc.setTextColor(15,15,35);
    doc.text("Distancia Pupilar", M, y); y += 8;
    doc.setFontSize(9); doc.setFont("helvetica","normal");
    doc.setTextColor(75,75,88);
    doc.text(`PD Total: ${record.pdBinocular} mm`, M, y);
    doc.text(`OD: ${record.pdOd ?? "—"} mm  |  OI: ${record.pdOi ?? "—"} mm`, M + 70, y);
    y += 6;
    doc.text(`Precisión: ${record.pdPrecision || "—"}`, M, y); y += 6;
    doc.setFontSize(8); doc.setFont("helvetica","italic");
    doc.setTextColor(130,130,142);
    doc.text("Esta medida es necesaria para la fabricación de sus lentes.", M, y); y += 6;
    y += 4;
    doc.setDrawColor(235,235,242); doc.line(M, y, W - M, y); y += 10;
  }

  // ── Pruebas visuales (13) ─────────────────────────────────────────────
  const vtRows = VT_TESTS.filter(t => record[t.key]);
  if (vtRows.length) {
    if (y > 230) { doc.addPage(); y = 20; }
    doc.setFontSize(11); doc.setFont("helvetica","bold");
    doc.setTextColor(15,15,35);
    doc.text("Batería de 13 pruebas visuales", M, y); y += 8;

    const SEM_RGB = {
      green:  [42,100,18],
      yellow: [169,104,16],
      red:    [200,59,58],
      gray:   [145,145,168],
    };
    vtRows.forEach(({ key, label }) => {
      if (y > 278) { doc.addPage(); y = 20; }
      const status = record.vtStatus?.[key] || "gray";
      doc.setFillColor(...(SEM_RGB[status] || SEM_RGB.gray));
      doc.circle(M + 1.2, y - 1.2, 1.2, "F");
      doc.setFontSize(9); doc.setFont("helvetica","normal");
      doc.setTextColor(75,75,88);
      doc.text(label, M + 6, y);
      doc.setFontSize(8.5); doc.setFont("helvetica","bold");
      doc.setTextColor(...(SEM_RGB[status] || SEM_RGB.gray));
      const valText = doc.splitTextToSize(String(record[key]), CW - 80);
      doc.text(valText, W - M, y, { align: "right" });
      y += 6 * Math.max(1, valText.length);
    });
    y += 4;
    doc.setDrawColor(235,235,242); doc.line(M, y, W - M, y); y += 10;
  }

  // ── Recomendación ────────────────────────────────────────────────────
  if (y > 260) { doc.addPage(); y = 20; }
  doc.setFontSize(11); doc.setFont("helvetica","bold");
  doc.setTextColor(15,15,35);
  doc.text("Recomendación", M, y); y += 8;
  doc.setFontSize(9); doc.setFont("helvetica","normal");
  doc.setTextColor(45,45,58);
  const recText = aiText || fallbackText(record.overall);
  const lines = doc.splitTextToSize(recText.replace(/\n\n/g," | "), CW);
  lines.forEach(line => {
    if (y > 268) { doc.addPage(); y = 20; }
    if (line.trim() === "\n") { y += 3; return; }
    doc.text(line, M, y); y += 5.5;
  });

  // ── Validado por (firma digital del optómetra) ─────────────────────────
  if (record.estadoValidacion === "validada") {
    if (y > 250) { doc.addPage(); y = 20; }
    y += 4;
    doc.setDrawColor(210,210,218); doc.setLineWidth(0.4); doc.line(M, y, W - M, y); y += 10;
    doc.setFontSize(11); doc.setFont("helvetica","bold");
    doc.setTextColor(15,15,35);
    doc.text("Validado por:", M, y); y += 7;
    doc.setFontSize(9.5); doc.setFont("helvetica","normal");
    doc.setTextColor(45,45,58);
    doc.text(`Optómetra: ${record.optometristaNombre || "—"}`, M, y); y += 6;
    doc.text(`Tarjeta profesional: ${record.optometristaTarjeta || "—"}`, M, y); y += 6;
    if (record.validadoEn) {
      const fechaVal = new Date(record.validadoEn).toLocaleString("es-CO");
      doc.text(`Fecha de validación: ${fechaVal}`, M, y); y += 6;
    }
    y += 2;
    doc.setFontSize(8.5); doc.setFont("helvetica","italic");
    doc.setTextColor(60,90,50);
    const validText = doc.splitTextToSize(
      "Este reporte fue revisado y validado por un profesional de la salud visual certificado en Colombia.",
      CW
    );
    doc.text(validText, M, y); y += 6 * validText.length;
  }

  // ── Footer ───────────────────────────────────────────────────────────
  const fY = 282;
  doc.setDrawColor(210,210,218); doc.setLineWidth(0.4); doc.line(M, fY, W - M, fY);
  doc.setFontSize(7.5); doc.setTextColor(155,155,165);
  doc.text("Esta evaluación es una herramienta de detección preventiva. No constituye diagnóstico médico ni reemplaza la consulta profesional.", M, fY + 5, { maxWidth: CW });
  doc.setFontSize(8); doc.setTextColor(90,90,105);
  doc.text("VisualCheck  ·  +57 314 689 4654  ·  Medellín, Colombia", W/2, fY + 11, { align:"center" });

  const fname = `VisualCheck_${(record.nombre||"reporte").replace(/\s+/g,"_")}.pdf`;
  doc.save(fname);
}
