import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/** QR-Code als SVG (scharf beim Drucken) */
export function QrCode({ value, className }: { value: string; className?: string }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let alive = true;
    QRCode.toString(value, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 }).then((s) => alive && setSvg(s));
    return () => {
      alive = false;
    };
  }, [value]);
  return <div className={className} aria-label={`QR-Code ${value}`} dangerouslySetInnerHTML={{ __html: svg }} />;
}
