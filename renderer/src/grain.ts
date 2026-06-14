import { createCanvas } from '@napi-rs/canvas';

export function generateGrainOverlay(width: number, height: number): Buffer {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const noise = Math.floor(Math.random() * 255);
    data[i] = noise;
    data[i + 1] = noise;
    data[i + 2] = noise;
    data[i + 3] = Math.floor(Math.random() * 30);
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toBuffer('image/png');
}
