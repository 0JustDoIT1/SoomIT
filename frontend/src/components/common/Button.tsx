import {
  ButtonHTMLAttributes,
  ReactNode,
} from "react";

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  loading?: boolean;
}

export default function Button({
  children,
  loading = false,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      style={{
        width: "100%",
        height: "48px",
        border: "none",
        borderRadius: "8px",
        backgroundColor:
          disabled || loading
            ? "#9ca3af"
            : "#2563eb",
        color: "#ffffff",
        fontSize: "15px",
        fontWeight: 600,
        cursor:
          disabled || loading
            ? "not-allowed"
            : "pointer",
      }}
    >
      {loading ? "로그인 중..." : children}
    </button>
  );
}