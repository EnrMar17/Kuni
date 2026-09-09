/**
 * Genera los iconos PWA (public/icons/*) a partir de public/brand/kuni-mark.png.
 *
 * Sin dependencias: el mark es PNG RGBA de 8 bits sin entrelazar, así que
 * decodificarlo son unas pocas líneas de zlib + desfiltrado. Volver a
 * ejecutarlo solo hace falta si cambia la marca.
 *
 *   node scripts/generate-pwa-icons.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync, inflateSync } from "node:zlib";
import { crc32 } from "node:zlib";

const SOURCE = "public/brand/kuni-mark.png";
const OUT_DIR = "public/icons";
// Fondo opaco: los iconos de app no pueden ser transparentes (iOS los pinta
// en negro) y el blanco es el mismo lienzo sobre el que vive el logo en la UI.
const BACKGROUND = [255, 255, 255, 255];

function decodePng(buffer) {
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) {
        throw new Error("Se esperaba PNG RGBA de 8 bits sin entrelazar");
      }
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += length + 12;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(width * height * 4);
  const stride = width * 4;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    for (let x = 0; x < stride; x += 1) {
      const a = x >= 4 ? pixels[y * stride + x - 4] : 0;
      const b = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const c = x >= 4 && y > 0 ? pixels[(y - 1) * stride + x - 4] : 0;
      let value = line[x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) {
        throw new Error(`Filtro PNG desconocido: ${filter}`);
      }
      pixels[y * stride + x] = value & 0xff;
    }
  }
  return { width, height, pixels };
}

function encodePng(width, height, pixels) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const chunk = (type, data) => {
    const out = Buffer.alloc(data.length + 12);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, "ascii");
    data.copy(out, 8);
    out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])) >>> 0, data.length + 8);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Dibuja el mark centrado ocupando `coverage` del lienzo cuadrado, sobre fondo opaco. */
function render(source, size, coverage, background = BACKGROUND) {
  const scale = Math.min((size * coverage) / source.width, (size * coverage) / source.height);
  const drawWidth = Math.round(source.width * scale);
  const drawHeight = Math.round(source.height * scale);
  const offsetX = Math.round((size - drawWidth) / 2);
  const offsetY = Math.round((size - drawHeight) / 2);
  const out = Buffer.alloc(size * size * 4);
  if (background) {
    for (let i = 0; i < size * size; i += 1) out.set(background, i * 4);
  }

  // Promedio de área: reducir 640px a 192 sin esto deja el trazo dentado.
  const boxX = source.width / drawWidth;
  const boxY = source.height / drawHeight;
  for (let y = 0; y < drawHeight; y += 1) {
    for (let x = 0; x < drawWidth; x += 1) {
      let r = 0, g = 0, b = 0, a = 0, samples = 0;
      const x0 = Math.floor(x * boxX);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * boxX));
      const y0 = Math.floor(y * boxY);
      const y1 = Math.max(y0 + 1, Math.floor((y + 1) * boxY));
      for (let sy = y0; sy < Math.min(y1, source.height); sy += 1) {
        for (let sx = x0; sx < Math.min(x1, source.width); sx += 1) {
          const p = (sy * source.width + sx) * 4;
          const alpha = source.pixels[p + 3] / 255;
          r += source.pixels[p] * alpha;
          g += source.pixels[p + 1] * alpha;
          b += source.pixels[p + 2] * alpha;
          a += alpha;
          samples += 1;
        }
      }
      if (!samples) continue;
      const alpha = a / samples;
      const target = ((offsetY + y) * size + offsetX + x) * 4;
      if (background) {
        // El color ya viene premultiplicado por alfa; se mezcla con el fondo.
        out[target] = Math.round(r / samples + background[0] * (1 - alpha));
        out[target + 1] = Math.round(g / samples + background[1] * (1 - alpha));
        out[target + 2] = Math.round(b / samples + background[2] * (1 - alpha));
        out[target + 3] = 255;
      } else if (alpha > 0) {
        // Para el favicon se conserva el canal alfa original de kuni-mark.
        out[target] = Math.round((r / samples) / alpha);
        out[target + 1] = Math.round((g / samples) / alpha);
        out[target + 2] = Math.round((b / samples) / alpha);
        out[target + 3] = Math.round(alpha * 255);
      }
    }
  }
  return encodePng(size, size, out);
}

const source = decodePng(readFileSync(SOURCE));
// `maskable` reserva un 20% de margen porque Android recorta el icono en
// círculo/squircle según el launcher; `any` puede llenar más el lienzo.
const targets = [
  ["icon-192.png", 192, 0.82],
  ["icon-512.png", 512, 0.82],
  ["icon-maskable-192.png", 192, 0.6],
  ["icon-maskable-512.png", 512, 0.6],
  ["apple-touch-icon.png", 180, 0.78],
];
for (const [name, size, coverage] of targets) {
  writeFileSync(`${OUT_DIR}/${name}`, render(source, size, coverage));
  console.log(`${OUT_DIR}/${name} (${size}x${size})`);
}

// En la pestaña se usa el mark sin recuadro para que combine tanto con temas
// claros como oscuros del navegador.
writeFileSync(`${OUT_DIR}/kuni-tab-v2.png`, render(source, 64, 0.84, null));
console.log(`${OUT_DIR}/kuni-tab-v2.png (64x64, transparente)`);
