import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Inkwell — faceless video that actually gets watched';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px',
          background: '#0B0B16',
          color: 'white',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 32, color: '#8b8bf5', fontWeight: 600 }}>Inkwell</div>
        <div style={{ display: 'flex', fontSize: 66, fontWeight: 600, marginTop: 28, lineHeight: 1.1, maxWidth: 940 }}>
          Faceless video that actually gets watched.
        </div>
        <div style={{ display: 'flex', fontSize: 30, color: '#cbd5e1', marginTop: 28 }}>
          Custom-rendered animation. Retention-engineered. Not slop.
        </div>
      </div>
    ),
    { ...size }
  );
}
