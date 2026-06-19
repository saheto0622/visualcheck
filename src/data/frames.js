// ─── Frames catalog ────────────────────────────────────────────────────────────
// imagen_url usa SVG generado en código como marcador de posición.
// TODO: cuando tengas las fotos reales, reemplaza imagen_url con la URL de Supabase Storage
// o CDN, por ejemplo:
//   imagen_url: "https://[proyecto].supabase.co/storage/v1/object/public/frames/clasica-ejecutiva.jpg"

function svg(tipo, color) {
  const s =
    tipo === "m"
      ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 120" fill="none">` +
        `<rect x="10" y="20" width="115" height="80" rx="12" stroke="${color}" stroke-width="6" fill="${color}" fill-opacity="0.09"/>` +
        `<rect x="175" y="20" width="115" height="80" rx="12" stroke="${color}" stroke-width="6" fill="${color}" fill-opacity="0.09"/>` +
        `<path d="M125 55 C138 44 162 44 175 55" stroke="${color}" stroke-width="5" fill="none" stroke-linecap="round"/>` +
        `<line x1="10" y1="48" x2="-18" y2="44" stroke="${color}" stroke-width="5" stroke-linecap="round"/>` +
        `<line x1="290" y1="48" x2="318" y2="44" stroke="${color}" stroke-width="5" stroke-linecap="round"/>` +
        `</svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 120" fill="none">` +
        `<path d="M10 58 Q12 16 62 14 Q120 12 122 55 Q123 92 67 94 Q14 96 10 58Z" stroke="${color}" stroke-width="5" fill="${color}" fill-opacity="0.09"/>` +
        `<path d="M290 58 Q288 16 238 14 Q180 12 178 55 Q177 92 233 94 Q286 96 290 58Z" stroke="${color}" stroke-width="5" fill="${color}" fill-opacity="0.09"/>` +
        `<path d="M122 50 C135 40 165 40 178 50" stroke="${color}" stroke-width="5" fill="none" stroke-linecap="round"/>` +
        `<line x1="10" y1="48" x2="-18" y2="44" stroke="${color}" stroke-width="5" stroke-linecap="round"/>` +
        `<line x1="290" y1="48" x2="318" y2="44" stroke="${color}" stroke-width="5" stroke-linecap="round"/>` +
        `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(s)}`;
}

export const FRAMES = [
  // ── Hombre (10) ───────────────────────────────────────────────────────────────
  {
    id: 1,
    nombre: "Clásica Ejecutiva",
    genero: "hombre",
    forma_rostro_recomendada: ["ovalado", "cuadrado"],
    precio: 149900,
    imagen_url: svg("m", "#2C4B8C"),
  },
  {
    id: 2,
    nombre: "Navigator Azul",
    genero: "hombre",
    forma_rostro_recomendada: ["redondo", "ovalado"],
    precio: 149900,
    imagen_url: svg("m", "#1E3A5F"),
  },
  {
    id: 3,
    nombre: "Metropolitan Dark",
    genero: "hombre",
    forma_rostro_recomendada: ["redondo", "alargado"],
    precio: 149900,
    imagen_url: svg("m", "#2C3E50"),
  },
  {
    id: 4,
    nombre: "Prestige Burgos",
    genero: "hombre",
    forma_rostro_recomendada: ["ovalado", "alargado"],
    precio: 149900,
    imagen_url: svg("m", "#4A235A"),
  },
  {
    id: 5,
    nombre: "Forrest Green",
    genero: "hombre",
    forma_rostro_recomendada: ["cuadrado", "ovalado"],
    precio: 149900,
    imagen_url: svg("m", "#1A4731"),
  },
  {
    id: 6,
    nombre: "Bordo Clásico",
    genero: "hombre",
    forma_rostro_recomendada: ["redondo", "cuadrado"],
    precio: 149900,
    imagen_url: svg("m", "#6B2D2D"),
  },
  {
    id: 7,
    nombre: "Havana Tabaco",
    genero: "hombre",
    forma_rostro_recomendada: ["alargado", "ovalado"],
    precio: 149900,
    imagen_url: svg("m", "#3D2B1F"),
  },
  {
    id: 8,
    nombre: "Aqua Carbon",
    genero: "hombre",
    forma_rostro_recomendada: ["cuadrado", "alargado"],
    precio: 149900,
    imagen_url: svg("m", "#1A3A4A"),
  },
  {
    id: 9,
    nombre: "Midnight Slim",
    genero: "hombre",
    forma_rostro_recomendada: ["redondo", "ovalado"],
    precio: 149900,
    imagen_url: svg("m", "#2A2A3E"),
  },
  {
    id: 10,
    nombre: "Urban Steel",
    genero: "hombre",
    forma_rostro_recomendada: ["cuadrado", "redondo"],
    precio: 149900,
    imagen_url: svg("m", "#3D3D3D"),
  },
  // ── Mujer (10) ────────────────────────────────────────────────────────────────
  {
    id: 11,
    nombre: "Rosa Parisina",
    genero: "mujer",
    forma_rostro_recomendada: ["redondo", "cuadrado"],
    precio: 149900,
    imagen_url: svg("f", "#C0657A"),
  },
  {
    id: 12,
    nombre: "Malva Elegance",
    genero: "mujer",
    forma_rostro_recomendada: ["ovalado", "alargado"],
    precio: 149900,
    imagen_url: svg("f", "#A0507F"),
  },
  {
    id: 13,
    nombre: "Coral Chic",
    genero: "mujer",
    forma_rostro_recomendada: ["cuadrado", "ovalado"],
    precio: 149900,
    imagen_url: svg("f", "#C8756A"),
  },
  {
    id: 14,
    nombre: "Berry Modern",
    genero: "mujer",
    forma_rostro_recomendada: ["redondo", "alargado"],
    precio: 149900,
    imagen_url: svg("f", "#9C4B6E"),
  },
  {
    id: 15,
    nombre: "Dusty Rose",
    genero: "mujer",
    forma_rostro_recomendada: ["ovalado", "cuadrado"],
    precio: 149900,
    imagen_url: svg("f", "#B87090"),
  },
  {
    id: 16,
    nombre: "Salmón Couture",
    genero: "mujer",
    forma_rostro_recomendada: ["redondo", "ovalado"],
    precio: 149900,
    imagen_url: svg("f", "#D4857A"),
  },
  {
    id: 17,
    nombre: "Raspberry Cat",
    genero: "mujer",
    forma_rostro_recomendada: ["alargado", "cuadrado"],
    precio: 149900,
    imagen_url: svg("f", "#9E5060"),
  },
  {
    id: 18,
    nombre: "Fuchsia Statement",
    genero: "mujer",
    forma_rostro_recomendada: ["ovalado", "redondo"],
    precio: 149900,
    imagen_url: svg("f", "#C06580"),
  },
  {
    id: 19,
    nombre: "Old Rose Vintage",
    genero: "mujer",
    forma_rostro_recomendada: ["cuadrado", "alargado"],
    precio: 149900,
    imagen_url: svg("f", "#A87070"),
  },
  {
    id: 20,
    nombre: "Orquídea Glam",
    genero: "mujer",
    forma_rostro_recomendada: ["redondo", "cuadrado"],
    precio: 149900,
    imagen_url: svg("f", "#B0608A"),
  },
];
