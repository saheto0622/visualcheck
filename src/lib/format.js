// ─── Visual tests battery (13 tests / 17 steps) ────────────────────────────────
export const VT_TESTS = [
  { key: "agudezaLejosOd",      db: "agudeza_lejos_od",      label: "Agudeza visual lejana — OD" },
  { key: "agudezaLejosOi",      db: "agudeza_lejos_oi",      label: "Agudeza visual lejana — OI" },
  { key: "agudezaCercaOd",      db: "agudeza_cerca_od",      label: "Agudeza visual cercana — OD" },
  { key: "agudezaCercaOi",      db: "agudeza_cerca_oi",      label: "Agudeza visual cercana — OI" },
  { key: "sensibilidadContraste", db: "sensibilidad_contraste", label: "Sensibilidad al contraste" },
  { key: "visionColores",       db: "vision_colores",        label: "Visión de colores" },
  { key: "amslerOd",            db: "amsler_od",             label: "Rejilla de Amsler — OD" },
  { key: "amslerOi",            db: "amsler_oi",             label: "Rejilla de Amsler — OI" },
  { key: "acomodacion",         db: "acomodacion",           label: "Acomodación" },
  { key: "duocromo",            db: "duocromo",              label: "Test duocromo" },
  { key: "aniseiconia",         db: "aniseiconia",           label: "Aniseiconía" },
  { key: "campoVisualOd",       db: "campo_visual_od",       label: "Campo visual — OD" },
  { key: "campoVisualOi",       db: "campo_visual_oi",       label: "Campo visual — OI" },
  { key: "laberinto",           db: "laberinto",             label: "Laberinto (ojo ambliope)" },
  { key: "fusionBinocular",     db: "fusion_binocular",      label: "Fusión binocular" },
  { key: "estereopsis",         db: "estereopsis",           label: "Estereopsis básica" },
  { key: "coordinacionBinocular", db: "coordinacion_binocular", label: "Coordinación binocular" },
  { key: "astigmatismo",        db: "astigmatismo",          label: "Astigmatismo (eje y cilindro)" },
  { key: "lenteCruzada",        db: "lente_cruzada",         label: "Confirmación del eje (lente cruzada)" },
];

export const SEMAFORO_INFO = {
  green:  { bg: "var(--color-background-success)", c: "var(--color-text-success)", label: "Normal" },
  yellow: { bg: "var(--color-background-warning)", c: "var(--color-text-warning)", label: "Atención" },
  red:    { bg: "var(--color-background-danger)",  c: "var(--color-text-danger)",  label: "Alerta" },
  gray:   { bg: "var(--color-background-secondary)", c: "var(--color-text-tertiary)", label: "Omitida" },
};

// ─── Validation status (optometrist formula workflow) ─────────────────────────
export const VALIDACION_INFO = {
  "pendiente":   { bg: "var(--color-background-secondary)", c: "var(--color-text-tertiary)", label: "Pendiente" },
  "en revision": { bg: "var(--color-background-info)",      c: "var(--color-text-info)",      label: "En revisión" },
  "validada":    { bg: "var(--color-background-success)",   c: "var(--color-text-success)",   label: "Validada" },
};

// ─── Historia clínica básica (5 preguntas) ─────────────────────────────────────
export const HC_QUESTIONS = [
  {
    key: "hcUsaGafas", db: "hc_usa_gafas",
    text: "¿Usas gafas o lentes de contacto actualmente?",
    options: ["Sí - Gafas", "Sí - Lentes de contacto", "No"],
  },
  {
    key: "hcDiabetesHipertension", db: "hc_diabetes_hipertension",
    text: "¿Tienes diabetes o hipertensión diagnosticada?",
    options: ["Sí - Diabetes", "Sí - Hipertensión", "Ambas", "No"],
  },
  {
    key: "hcAntecedentesFamiliares", db: "hc_antecedentes_familiares",
    text: "¿Tienes antecedentes familiares de glaucoma o degeneración macular?",
    options: ["Sí", "No", "No sé"],
  },
  {
    key: "hcCirugiaOcular", db: "hc_cirugia_ocular",
    text: "¿Has tenido alguna cirugía ocular?",
    options: ["Sí", "No"],
  },
  {
    key: "edadRango", db: "edad_rango",
    text: "¿En qué rango de edad estás?",
    options: ["Menor de 30", "30-39", "40-49", "50-59", "60 o más"],
  },
];

// ─── Confianza de la prescripción estimada por IA ──────────────────────────────
export const CONFIANZA_INFO = {
  alta:  { emoji: "🟢", label: "Alta" },
  media: { emoji: "🟡", label: "Media" },
  baja:  { emoji: "🔴", label: "Baja" },
};

// ─── Fallback AI text ───────────────────────────────────────────────────────────
export function fallbackText(score) {
  return score > 45
    ? "Se detectaron señales que podrían indicar irritación o tensión ocular. Te recomendamos visitar un optómetra para una evaluación completa.\n\nTus respuestas también sugieren síntomas que ameritan revisión profesional. Un especialista tiene los equipos precisos para darte un diagnóstico certero.\n\n¡Tu salud visual es una prioridad! Actuar a tiempo siempre marca la diferencia."
    : "Tus indicadores están dentro de parámetros normales según esta evaluación preventiva. Aun así, recomendamos un chequeo con un optómetra al menos una vez al año.\n\nMantener controles regulares es la mejor manera de detectar cambios antes de que se vuelvan problemas.\n\n¡Bien por preocuparte por tu salud visual! Un profesional puede confirmarte que todo está en orden.";
}

// ─── Risk helper ──────────────────────────────────────────────────────────────
export function getRisk(lR, rR, as, qS) {
  if (lR > 55 || rR > 55 || as > 60 || qS > 65)
    return { label: "Requiere atención", tc: "var(--color-text-danger)",  bc: "var(--color-background-danger)" };
  if (lR > 22 || rR > 22 || as > 28 || qS > 32)
    return { label: "Riesgo moderado",   tc: "var(--color-text-warning)", bc: "var(--color-background-warning)" };
  return   { label: "Bajo riesgo",       tc: "var(--color-text-success)", bc: "var(--color-background-success)" };
}

// ─── Supabase row <-> app object mapping ──────────────────────────────────────
export function toDb(r) {
  const row = {
    id: r.id, fecha: r.fecha, nombre: r.nombre, cedula: r.cedula,
    direccion: r.direccion, correo: r.correo, celular: r.celular,
    overall: r.overall, left_red: r.leftRed, right_red: r.rightRed,
    asym: r.asym, q_score: r.qScore, riesgo: r.riesgo, estado: r.estado,
    optometrista_id: r.optometristaId, optometrista_nombre: r.optometristaNombre,
    estado_validacion: r.estadoValidacion,
    esfera_od: r.esferaOd, cilindro_od: r.cilindroOd, eje_od: r.ejeOd, adicion_od: r.adicionOd,
    esfera_oi: r.esferaOi, cilindro_oi: r.cilindroOi, eje_oi: r.ejeOi, adicion_oi: r.adicionOi,
    observaciones_optometra: r.observacionesOptometra, validado_en: r.validadoEn,
    optometrista_tarjeta: r.optometristaTarjeta,
    consentimiento_aceptado: r.consentimientoAceptado ?? null,
    consentimiento_fecha: r.consentimientoFecha ?? null,
    hc_usa_gafas: r.hcUsaGafas ?? null,
    hc_diabetes_hipertension: r.hcDiabetesHipertension ?? null,
    hc_antecedentes_familiares: r.hcAntecedentesFamiliares ?? null,
    hc_cirugia_ocular: r.hcCirugiaOcular ?? null,
    hc_ultima_formula: r.hcUltimaFormula ?? null,
    edad_rango: r.edadRango ?? null,
    pd_binocular: r.pdBinocular ?? null,
    pd_od: r.pdOd ?? null,
    pd_oi: r.pdOi ?? null,
    pd_precision: r.pdPrecision ?? null,
    vt_status: r.vtStatus ?? null,
    od_esfera: r.odEsfera ?? null,
    od_cilindro: r.odCilindro ?? null,
    od_eje: r.odEje ?? null,
    oi_esfera: r.oiEsfera ?? null,
    oi_cilindro: r.oiCilindro ?? null,
    oi_eje: r.oiEje ?? null,
    adicion: r.adicion ?? null,
    prescripcion_confianza: r.prescripcionConfianza ?? null,
    prescripcion_notas: r.prescripcionNotas ?? null,
    prescripcion_validada: r.prescripcionValidada ?? null,
    prescripcion_ajustada: r.prescripcionAjustada ?? null,
  };
  VT_TESTS.forEach(({ key, db }) => { row[db] = r[key] ?? null; });
  return row;
}

export function fromDb(row) {
  const out = {
    id: row.id, fecha: row.fecha, nombre: row.nombre, cedula: row.cedula,
    direccion: row.direccion, correo: row.correo, celular: row.celular,
    overall: row.overall, leftRed: row.left_red, rightRed: row.right_red,
    asym: row.asym, qScore: row.q_score, riesgo: row.riesgo, estado: row.estado,
    optometristaId: row.optometrista_id, optometristaNombre: row.optometrista_nombre,
    estadoValidacion: row.estado_validacion,
    esferaOd: row.esfera_od, cilindroOd: row.cilindro_od, ejeOd: row.eje_od, adicionOd: row.adicion_od,
    esferaOi: row.esfera_oi, cilindroOi: row.cilindro_oi, ejeOi: row.eje_oi, adicionOi: row.adicion_oi,
    observacionesOptometra: row.observaciones_optometra, validadoEn: row.validado_en,
    optometristaTarjeta: row.optometrista_tarjeta,
    consentimientoAceptado: row.consentimiento_aceptado,
    consentimientoFecha: row.consentimiento_fecha,
    hcUsaGafas: row.hc_usa_gafas,
    hcDiabetesHipertension: row.hc_diabetes_hipertension,
    hcAntecedentesFamiliares: row.hc_antecedentes_familiares,
    hcCirugiaOcular: row.hc_cirugia_ocular,
    hcUltimaFormula: row.hc_ultima_formula,
    edadRango: row.edad_rango,
    pdBinocular: row.pd_binocular,
    pdOd: row.pd_od,
    pdOi: row.pd_oi,
    pdPrecision: row.pd_precision,
    vtStatus: row.vt_status || {},
    odEsfera: row.od_esfera,
    odCilindro: row.od_cilindro,
    odEje: row.od_eje,
    oiEsfera: row.oi_esfera,
    oiCilindro: row.oi_cilindro,
    oiEje: row.oi_eje,
    adicion: row.adicion,
    prescripcionConfianza: row.prescripcion_confianza,
    prescripcionNotas: row.prescripcion_notas,
    prescripcionValidada: row.prescripcion_validada,
    prescripcionAjustada: row.prescripcion_ajustada,
  };
  VT_TESTS.forEach(({ key, db }) => { out[key] = row[db]; });
  return out;
}
