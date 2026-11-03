import { useEffect, useRef, useState } from 'react';
import QrScanner from 'qr-scanner';

interface Props {
  onDetect: (text: string) => void;
}

/** Gleicher Code wird erst nach dieser Pause erneut gemeldet (sonst Doppelscans im Sekundentakt) */
const REPEAT_PAUSE_MS = 4000;

/**
 * Kamera-QR-Scanner. Nutzt qr-scanner, das auf Android und iOS läuft
 * (BarcodeDetector wo vorhanden, sonst eingebauter Decoder).
 */
export function CameraScanner({ onDetect }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onDetectRef = useRef(onDetect);
  onDetectRef.current = onDetect;
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    const video = videoRef.current!;
    const last = { text: '', at: 0 };
    const scanner = new QrScanner(
      video,
      (result) => {
        const text = result.data.trim();
        const now = Date.now();
        if (!text || (text === last.text && now - last.at < REPEAT_PAUSE_MS)) return;
        last.text = text;
        last.at = now;
        onDetectRef.current(text);
      },
      { preferredCamera: 'environment', highlightScanRegion: true, highlightCodeOutline: true, maxScansPerSecond: 12 },
    );
    scanner
      .start()
      .then(() => setStarting(false))
      .catch((e: unknown) => {
        setStarting(false);
        const msg = String(e);
        setError(
          /NotAllowed|Permission/i.test(msg)
            ? 'Kamerazugriff wurde verweigert. Bitte in den Browser-Einstellungen erlauben.'
            : !window.isSecureContext
              ? 'Die Kamera funktioniert nur über eine sichere Verbindung (https).'
              : 'Keine Kamera gefunden oder Kamera wird von einer anderen App benutzt.',
        );
      });
    return () => {
      scanner.stop();
      scanner.destroy();
    };
  }, []);

  return (
    <div className="camera">
      <video ref={videoRef} muted playsInline />
      {(starting || error) && <div className="camera-msg">{error ?? 'Kamera wird gestartet …'}</div>}
    </div>
  );
}
