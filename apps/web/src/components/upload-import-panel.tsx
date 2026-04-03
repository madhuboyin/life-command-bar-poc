"use client";

import { FormEvent, useState } from "react";
import { importEmailForward, uploadFile } from "../lib/api";

type Props = {
  onCompleted: () => Promise<void>;
};

export default function UploadImportPanel({ onCompleted }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [emailForm, setEmailForm] = useState({
    subject: "",
    from: "",
    bodyText: ""
  });

  async function handleUpload(event: FormEvent) {
    event.preventDefault();
    if (!file) return;

    try {
      setUploadLoading(true);
      setError(null);
      setSuccess(null);

      await uploadFile(file);
      setSuccess("File uploaded successfully");
      setFile(null);

      await onCompleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadLoading(false);
    }
  }

  async function handleImport(event: FormEvent) {
    event.preventDefault();

    try {
      setImportLoading(true);
      setError(null);
      setSuccess(null);

      await importEmailForward(emailForm);
      setSuccess("Email import created a draft obligation");

      setEmailForm({
        subject: "",
        from: "",
        bodyText: ""
      });

      await onCompleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImportLoading(false);
    }
  }

  return (
    <section
      style={{
        background: "#fff",
        borderRadius: 18,
        padding: 20,
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        marginBottom: 24
      }}
    >
      <h2 style={{ marginTop: 0 }}>Upload / Import</h2>
      <p style={{ color: "#6b7280", marginTop: 0 }}>
        Upload a file or simulate a forwarded email import.
      </p>

      <div style={{ display: "grid", gap: 20 }}>
        <form onSubmit={handleUpload} style={sectionStyle}>
          <h3 style={{ marginTop: 0 }}>Upload document</h3>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <button type="submit" disabled={!file || uploadLoading} style={primaryButton}>
              {uploadLoading ? "Uploading..." : "Upload"}
            </button>
          </div>
        </form>

        <form onSubmit={handleImport} style={sectionStyle}>
          <h3 style={{ marginTop: 0 }}>Import forwarded email</h3>
          <div style={{ display: "grid", gap: 10 }}>
            <input
              value={emailForm.subject}
              onChange={(e) =>
                setEmailForm((prev) => ({ ...prev, subject: e.target.value }))
              }
              placeholder="Subject"
              required
              style={inputStyle}
            />
            <input
              value={emailForm.from}
              onChange={(e) =>
                setEmailForm((prev) => ({ ...prev, from: e.target.value }))
              }
              placeholder="From"
              required
              style={inputStyle}
            />
            <textarea
              value={emailForm.bodyText}
              onChange={(e) =>
                setEmailForm((prev) => ({ ...prev, bodyText: e.target.value }))
              }
              placeholder="Body text"
              required
              rows={5}
              style={textareaStyle}
            />
            <div>
              <button type="submit" disabled={importLoading} style={primaryButton}>
                {importLoading ? "Importing..." : "Import email"}
              </button>
            </div>
          </div>
        </form>
      </div>

      {error && <div style={errorBox}>{error}</div>}
      {success && <div style={successBox}>{success}</div>}
    </section>
  );
}

const sectionStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 16,
  background: "#fafafa"
};

const inputStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid #d1d5db",
  fontSize: 14
};

const textareaStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid #d1d5db",
  fontSize: 14,
  resize: "vertical"
};

const primaryButton: React.CSSProperties = {
  border: "none",
  background: "#111827",
  color: "#fff",
  borderRadius: 10,
  padding: "10px 14px",
  fontWeight: 600,
  cursor: "pointer"
};

const errorBox: React.CSSProperties = {
  marginTop: 14,
  padding: 10,
  borderRadius: 10,
  background: "#fef2f2",
  color: "#991b1b"
};

const successBox: React.CSSProperties = {
  marginTop: 14,
  padding: 10,
  borderRadius: 10,
  background: "#ecfdf5",
  color: "#166534"
};
