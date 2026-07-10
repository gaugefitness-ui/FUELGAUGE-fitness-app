const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const iconsDir = path.join(__dirname, 'public', 'icons');

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

function drawIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const center = size / 2;

  // Background
  ctx.fillStyle = '#0d0f14';
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, size * 0.18);
  ctx.fill();

  // Inner glow circle
  const gradient = ctx.createRadialGradient(center, center, 0, center, center, size * 0.45);
  gradient.addColorStop(0, 'rgba(255, 60, 31, 0.15)');
  gradient.addColorStop(1, 'rgba(255, 60, 31, 0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(center, center, size * 0.45, 0, Math.PI * 2);
  ctx.fill();

  // Gauge arc background
  ctx.strokeStyle = '#252a38';
  ctx.lineWidth = size * 0.06;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(center, center + size * 0.05, size * 0.3, Math.PI, 0);
  ctx.stroke();

  // Gauge arc filled
  ctx.strokeStyle = '#ff3c1f';
  ctx.shadowColor = 'rgba(255, 60, 31, 0.6)';
  ctx.shadowBlur = size * 0.05;
  ctx.beginPath();
  ctx.arc(center, center + size * 0.05, size * 0.3, Math.PI, Math.PI + Math.PI * 0.7);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Needle
  const needleAngle = Math.PI + Math.PI * 0.7;
  const needleLen = size * 0.25;
  ctx.strokeStyle = '#eee7d6';
  ctx.lineWidth = size * 0.025;
  ctx.beginPath();
  ctx.moveTo(center, center + size * 0.05);
  ctx.lineTo(
    center + Math.cos(needleAngle) * needleLen,
    center + size * 0.05 + Math.sin(needleAngle) * needleLen
  );
  ctx.stroke();

  // Center dot
  ctx.fillStyle = '#ff3c1f';
  ctx.shadowColor = 'rgba(255, 60, 31, 0.8)';
  ctx.shadowBlur = size * 0.04;
  ctx.beginPath();
  ctx.arc(center, center + size * 0.05, size * 0.035, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Letter F
  ctx.fillStyle = '#eee7d6';
  ctx.font = `bold ${size * 0.18}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('F', center, center - size * 0.18);

  return canvas.toBuffer('image/png');
}

sizes.forEach(size => {
  const buffer = drawIcon(size);
  const filePath = path.join(iconsDir, `icon-${size}x${size}.png`);
  fs.writeFileSync(filePath, buffer);
  console.log(`Created icon-${size}x${size}.png`);
});

console.log('All icons generated!');
