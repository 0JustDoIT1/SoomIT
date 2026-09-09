import {
  InputHTMLAttributes,
  forwardRef,
} from "react";

interface InputProps
  extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      id,
      className = "",
      ...props
    },
    ref
  ) => {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        {label && (
          <label
            htmlFor={id}
            style={{
              fontSize: "14px",
              fontWeight: 600,
              color: "#374151",
            }}
          >
            {label}
          </label>
        )}

        <input
          ref={ref}
          id={id}
          className={className}
          {...props}
          style={{
            width: "100%",
            height: "46px",
            padding: "0 14px",
            border: error
              ? "1px solid #dc2626"
              : "1px solid #d1d5db",
            borderRadius: "8px",
            fontSize: "15px",
            outline: "none",
            boxSizing: "border-box",
          }}
        />

        {error && (
          <span
            style={{
              fontSize: "13px",
              color: "#dc2626",
            }}
          >
            {error}
          </span>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

export default Input;


