"use client";

import { FormEvent, useState } from "react";
import { importEmailForward, uploadFile } from "../lib/api";
import { buttonStyles, cardStyles, inputStyles } from "../lib/ui";
import SectionCard from "./ui/section-card";
import StatusMessage from "./ui/status-message";

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
    <SectionCard
      title="Upload / Import"
      description="Upload a file or simulate a forwarded email import"
    >
      <div style={{ display: "grid", gap: 20 }}>
        <form onSubmit={handleUpload} style={cardStyles.bordered}>
          <h3 style={{ marginTop: 0 }}>Upload document</h3>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <button type="submit" disabled={!file || uploadLoading} style={buttonStyles.primary}>
              {uploadLoading ? "Uploading..." : "Upload"}
            </button>
          </div>
        </form>

        <form onSubmit={handleImport} style={cardStyles.bordered}>
          <h3 style={{ marginTop: 0 }}>Import forwarded email</h3>
          <div style={{ display: "grid", gap: 10 }}>
            <input
              value={emailForm.subject}
              onChange={(e) =>
                setEmailForm((prev) => ({ ...prev, subject: e.target.value }))
              }
              placeholder="Subject"
              required
              style={inputStyles.input}
            />
            <input
              value={emailForm.from}
              onChange={(e) =>
                setEmailForm((prev) => ({ ...prev, from: e.target.value }))
              }
              placeholder="From"
              required
              style={inputStyles.input}
            />
            <textarea
              value={emailForm.bodyText}
              onChange={(e) =>
                setEmailForm((prev) => ({ ...prev, bodyText: e.target.value }))
              }
              placeholder="Body text"
              required
              rows={5}
              style={inputStyles.textarea}
            />
            <div>
              <button type="submit" disabled={importLoading} style={buttonStyles.primary}>
                {importLoading ? "Importing..." : "Import email"}
              </button>
            </div>
          </div>
        </form>
      </div>

      {error ? <StatusMessage variant="error">{error}</StatusMessage> : null}
      {success ? <StatusMessage variant="success">{success}</StatusMessage> : null}
    </SectionCard>
  );
}
