import { useRef } from "react";
import { QRCodeCanvas } from "qrcode.react";
import "./qr.css";

// Printable QR label for a batch. Usage (e.g. in the manufacturer dashboard):
//   <QRCodeLabel batchId="PCM-2026-001" drugName="Paracetamol 500mg" />
export default function QRCodeLabel({ batchId, drugName, size = 192 }) {
  const wrapRef = useRef(null);
  if (!batchId) return null;

  // The QR holds a full link, so any phone camera opens the verify page directly
  // without needing our app installed. BASE_URL is "/" locally and "/TeamLungi/"
  // on GitHub Pages, so the link works in both places.
  const url = `${window.location.origin}${import.meta.env.BASE_URL}verify/${encodeURIComponent(batchId)}`;

  const getPng = () => wrapRef.current.querySelector("canvas").toDataURL("image/png");

  const download = () => {
    const a = document.createElement("a");
    a.href = getPng();
    a.download = `medichain-${batchId}.png`;
    a.click();
  };

  // Print only the label (not the whole dashboard) by opening it in its own window.
  const print = () => {
    const win = window.open("", "_blank", "width=400,height=500");
    if (!win) return;
    const doc = win.document;
    doc.title = `MediChain label ${batchId}`;
    const style = doc.createElement("style");
    style.textContent =
      "body{font-family:sans-serif;text-align:center;margin:24px}" +
      "img{width:220px;height:220px}p{margin:6px 0}";
    doc.head.appendChild(style);
    const img = doc.createElement("img");
    img.src = getPng();
    const id = doc.createElement("p");
    id.textContent = `Batch ${batchId}`;
    id.style.fontWeight = "bold";
    const hint = doc.createElement("p");
    hint.textContent = "Scan to verify on MediChain";
    doc.body.append(img, id, hint);
    if (drugName) {
      const drug = doc.createElement("p");
      drug.textContent = drugName;
      doc.body.insertBefore(drug, hint);
    }
    img.onload = () => {
      win.focus();
      win.print();
    };
  };

  return (
    <div className="qr-label">
      <div ref={wrapRef}>
        <QRCodeCanvas value={url} size={size} level="M" marginSize={2} />
      </div>
      <p className="qr-label-id">Batch {batchId}</p>
      {drugName && <p className="qr-label-drug">{drugName}</p>}
      <div className="qr-label-actions">
        <button type="button" onClick={download}>Download PNG</button>
        <button type="button" onClick={print}>Print label</button>
      </div>
    </div>
  );
}
