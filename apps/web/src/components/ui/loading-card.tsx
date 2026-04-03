import { cardStyles, colors } from "../../lib/ui";

type Props = {
  title?: string;
  lines?: number;
};

export default function LoadingCard({ title = "Loading...", lines = 3 }: Props) {
  return (
    <div style={cardStyles.item}>
      <div
        style={{
          width: 180,
          height: 18,
          borderRadius: 8,
          background: "#e5e7eb",
          marginBottom: 14
        }}
      />
      {Array.from({ length: lines }).map((_, index) => (
        <div
          key={index}
          style={{
            width: `${90 - index * 12}%`,
            height: 14,
            borderRadius: 8,
            background: "#f3f4f6",
            marginBottom: 10
          }}
        />
      ))}
      <div style={{ fontSize: 13, color: colors.textMuted, marginTop: 6 }}>
        {title}
      </div>
    </div>
  );
}
