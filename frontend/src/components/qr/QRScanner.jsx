import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import "./qr.css";

// Our labels encode ".../verify/<id>", but accept a plain batch ID too
// so older or hand-made labels still work.
export function batchIdFromScan(text) {
  const trimmed = text.trim();
  const match = trimmed.match(/\/verify\/([^/?#]+)/);
  return decodeURIComponent(match ? match[1] : trimmed);
}

// Opens the back camera and navigates to /verify/<id> on the first successful scan.
// Note: browsers only allow camera access on https:// or http://localhost.
export default function QRScanner({ onClose }) {
  const navigate = useNavigate();
  const regionId = `qr-region-${useId().replace(/:/g, "")}`;
  const scannerRef = useRef(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const scanner = new Html5Qrcode(regionId);
    scannerRef.current = scanner;
    let handled = false;

    const started = scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (text) => {
          if (handled) return; // the camera keeps firing while we stop it
          handled = true;
          const id = batchIdFromScan(text);
          scanner.stop().catch(() => {}).finally(() => {
            onClose?.();
            navigate(`/verify/${encodeURIComponent(id)}`);
          });
        }
      )
      .catch(() => setError("Camera not available. Allow camera access or type the batch ID instead."));

    // Wait for start() to settle before stopping; otherwise closing the scanner
    // while the camera is still starting would leave the camera on.
    return () => {
      started
        .then(() => (scanner.isScanning ? scanner.stop() : null))
        .then(() => scanner.clear())
        .catch(() => {});
    };
  }, [regionId, navigate, onClose]);

  return (
    <div className="qr-scanner">
      <div id={regionId} className="qr-scanner-view" />
      {error && <p className="qr-scanner-error">{error}</p>}
      {onClose && (
        <button type="button" onClick={onClose}>Cancel</button>
      )}
    </div>
  );
}
