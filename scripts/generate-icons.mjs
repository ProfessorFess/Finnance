// Renders the app icons from the brand mark. Run: node scripts/generate-icons.mjs
import sharp from "sharp";

const mark = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${32 + 2 * pad} ${32 + 2 * pad}">
  <rect x="${-pad}" y="${-pad}" width="${32 + 2 * pad}" height="${32 + 2 * pad}" fill="#1f3a5f"/>
  <path d="M10 8h3v16h-3z" fill="#f6f4ef"/><path d="M14 8h9v3h-9zM14 14.5h6v3h-6z" fill="#f6f4ef" opacity=".85"/></svg>`;

const out = [
  ["public/icons/icon-192.png", 192, 2],
  ["public/icons/icon-512.png", 512, 2],
  ["public/icons/icon-maskable-512.png", 512, 9], // extra padding for the maskable safe zone
  ["src/app/apple-icon.png", 180, 4],
];
for (const [file, size, pad] of out) {
  await sharp(Buffer.from(mark(pad))).resize(size, size).png().toFile(file);
  console.log("wrote", file);
}
