import { colors } from "../lib/ui";

type Column = {
  key: string;
  label: string;
  align?: "left" | "right";
};

type Row = Record<string, string | number | null | undefined>;

type Props = {
  columns: Column[];
  rows: Row[];
  emptyMessage?: string;
};

export default function MetricTable({ columns, rows, emptyMessage = "No rows" }: Props) {
  if (rows.length === 0) {
    return (
      <div style={{ color: colors.textMuted, fontSize: 13, padding: "10px 0" }}>{emptyMessage}</div>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                style={{
                  textAlign: column.align ?? "left",
                  color: colors.textMuted,
                  borderBottom: `1px solid ${colors.border}`,
                  padding: "8px 6px",
                  fontWeight: 700
                }}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={String(row.id ?? index)}>
              {columns.map((column) => (
                <td
                  key={column.key}
                  style={{
                    textAlign: column.align ?? "left",
                    borderBottom: `1px solid ${colors.border}`,
                    padding: "8px 6px",
                    verticalAlign: "top"
                  }}
                >
                  {row[column.key] ?? "-"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
