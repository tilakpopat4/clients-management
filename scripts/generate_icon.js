import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const svgString = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6366f1" />
      <stop offset="100%" stop-color="#4338ca" />
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#e0e7ff" />
      <stop offset="100%" stop-color="#c7d2fe" />
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#000000" flood-opacity="0.25" />
    </filter>
  </defs>

  <rect width="512" height="512" rx="112" fill="url(#bg)" />

  <g filter="url(#shadow)">
    <rect x="116" y="186" width="280" height="190" rx="28" fill="#ffffff" />
    <path d="M126 146 L186 106 H386 L326 146 Z" fill="url(#accent)" />
    <path d="M146 146 h220 v20 H146 z" fill="#ffffff" />
    
    <path d="M190 106 L170 146" stroke="#4338ca" stroke-width="8" stroke-linecap="round" />
    <path d="M250 106 L230 146" stroke="#4338ca" stroke-width="8" stroke-linecap="round" />
    <path d="M310 106 L290 146" stroke="#4338ca" stroke-width="8" stroke-linecap="round" />

    <circle cx="256" cy="281" r="44" fill="#4f46e5" />
    <polygon points="246,261 278,281 246,301" fill="#ffffff" />
  </g>
</svg>
`;

async function generatePNG() {
  const publicDir = path.resolve('public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  const outputPngPath = path.join(publicDir, 'app_logo_icon.png');
  const outputFaviconPath = path.join(publicDir, 'favicon.png');

  await sharp(Buffer.from(svgString))
    .png()
    .toFile(outputPngPath);

  await sharp(Buffer.from(svgString))
    .resize(64, 64)
    .png()
    .toFile(outputFaviconPath);

  console.log('Successfully generated app_logo_icon.png and favicon.png in public directory!');
}

generatePNG().catch(console.error);
