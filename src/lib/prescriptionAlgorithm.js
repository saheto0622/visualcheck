// ─── Algoritmo de conversión: resultados de pruebas visuales → prescripción óptica estimada ───
// Estas funciones implementan tablas clínicas de referencia estándar para producir una
// PRIMERA ESTIMACIÓN que siempre debe ser validada por un optómetra certificado.

const SNELLEN_TO_SPHERE = {
  "20/20":  0.00,
  "20/30": -0.50,
  "20/40": -1.25,
  "20/60": -1.75,
  "20/100": -2.75,
  "20/200": -4.00,
};

function roundQuarter(n) {
  return Math.round(n * 4) / 4;
}

// snellenOD / snellenOI: etiquetas tipo "20/40". duocromo: resultado textual del test duocromo.
export function snellenToDiopters(snellenOD, snellenOI, duocromo) {
  const baseOD = SNELLEN_TO_SPHERE[snellenOD] ?? (snellenOD === "Menor a 20/200" ? -5.00 : 0);
  const baseOI = SNELLEN_TO_SPHERE[snellenOI] ?? (snellenOI === "Menor a 20/200" ? -5.00 : 0);

  let adjustment = 0;
  if (duocromo) {
    const d = duocromo.toLowerCase();
    if (d.includes("rojo")) adjustment = -0.25;       // "Rojo más claro/nítido" → subcorrección
    else if (d.includes("verde")) adjustment = 0.25;  // "Verde más claro/nítido" → sobrecorrección
  }

  return {
    esferaOD: roundQuarter(baseOD + adjustment),
    esferaOI: roundQuarter(baseOI + adjustment),
  };
}

// clockPosition: número de 1 a 12 señalado en el reloj de astigmatismo.
export function clockDialToAxis(clockPosition) {
  const pos = ((Math.round(clockPosition) - 1) % 6 + 6) % 6;
  return (pos + 1) * 30;
}

const CLARITY_TO_CYLINDER = {
  "Apenas diferente": -0.50,
  "Notablemente diferente": -1.00,
  "Muy diferente": -1.75,
  "Extremadamente diferente": -2.50,
};

export function estimateCylinder(clarityDifference) {
  return CLARITY_TO_CYLINDER[clarityDifference] ?? 0;
}

// age: edad numérica. nearVisionResult: resultado textual de la prueba de acomodación.
export function calculateAddition(age, nearVisionResult) {
  let addition = 0;
  if (age >= 40 && age <= 44) addition = 1.00;
  else if (age >= 45 && age <= 49) addition = 1.50;
  else if (age >= 50 && age <= 54) addition = 2.00;
  else if (age >= 55 && age <= 59) addition = 2.25;
  else if (age >= 60) addition = 2.50;

  if (addition > 0 && nearVisionResult && /muy dif[ií]cil|reducida/i.test(nearVisionResult)) {
    addition += 0.25;
  }

  return Math.round(addition * 100) / 100;
}

// Convierte el rango de edad capturado en la historia clínica a una edad numérica representativa.
const EDAD_RANGO_TO_AGE = {
  "Menor de 30": 25,
  "30-39": 35,
  "40-49": 45,
  "50-59": 55,
  "60 o más": 65,
};

export function edadRangoToAge(edadRango) {
  return EDAD_RANGO_TO_AGE[edadRango] ?? 35;
}
