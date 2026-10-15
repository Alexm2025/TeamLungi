import { useEffect, useRef, useState } from "react";
import { hasDocument, verifyDocument } from "./contractSource";

const MESSAGES = {
  match: { icon: "✅", text: "Authentic report" },
  mismatch: { icon: "❌", text: "Does not match the registered report" },
};

// Lets anyone drop the lab report PDF they were given and check it against the
// hash the manufacturer registered on-chain. Any edit to the file changes its hash.
export default function LabReportCheck({ batchId }) {
  const inputRef = useRef(null);
  const [registered, setRegistered] = useState(null); // null = still checking
  const [dragging, setDragging] = useState(false);
  const [check, setCheck] = useState({ status: "idle", fileName: "" });

  useEffect(() => {
    let cancelled = false;
    hasDocument(batchId)
      .then((has) => !cancelled && setRegistered(has))
      .catch(() => !cancelled && setRegistered(false));
    return () => {
      cancelled = true;
    };
  }, [batchId]);

  const runCheck = async (file) => {
    if (!file) return;
    setCheck({ status: "checking", fileName: file.name });
    try {
      const ok = await verifyDocument(batchId, file);
      setCheck({ status: ok ? "match" : "mismatch", fileName: file.name });
    } catch (err) {
      console.error(err);
      setCheck({ status: "error", fileName: file.name });
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    runCheck(e.dataTransfer.files[0]);
  };

  if (registered === null) return null;

  return (
    <section className="verify-card">
      <h3>Check lab report</h3>
      {!registered ? (
        <p className="lab-none">No report registered for this batch.</p>
      ) : (
        <>
          <div
            className={`lab-drop${dragging ? " lab-drop-active" : ""}`}
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current.click()}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            {check.status === "checking"
              ? `Checking ${check.fileName}…`
              : "Drop the lab report here, or click to choose a file"}
          </div>
          <input
            ref={inputRef}
            type="file"
            hidden
            onChange={(e) => {
              runCheck(e.target.files[0]);
              e.target.value = ""; // allow re-checking the same file
            }}
          />

          {MESSAGES[check.status] && (
            <p className={`lab-result lab-${check.status}`}>
              {MESSAGES[check.status].icon} {MESSAGES[check.status].text}
              <span>{check.fileName}</span>
            </p>
          )}
          {check.status === "error" && (
            <p className="verify-error">Could not check the file. Please try again.</p>
          )}
        </>
      )}
    </section>
  );
}
