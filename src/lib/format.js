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
    vt_status: r.vtStatus ?? null,
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
    vtStatus: row.vt_status || {},
  };
  VT_TESTS.forEach(({ key, db }) => { out[key] = row[db]; });
  return out;
}
