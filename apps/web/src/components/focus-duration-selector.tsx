"use client";

import { buttonStyles } from "../lib/ui";

type Props = {
  value: 5 | 10 | 15;
  onChange: (value: 5 | 10 | 15) => void;
  disabled?: boolean;
};

const DURATIONS: Array<5 | 10 | 15> = [5, 10, 15];

export default function FocusDurationSelector({ value, onChange, disabled = false }: Props) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gap: 10
      }}
    >
      {DURATIONS.map((duration) => {
        const active = value === duration;
        return (
          <button
            key={duration}
            type="button"
            disabled={disabled}
            onClick={() => onChange(duration)}
            style={
              active
                ? {
                    ...buttonStyles.primary,
                    width: "100%"
                  }
                : {
                    ...buttonStyles.secondary,
                    width: "100%"
                  }
            }
          >
            {duration} min
          </button>
        );
      })}
    </div>
  );
}
