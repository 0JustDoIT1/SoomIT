interface AlertProps {
  message: string;
}

export default function Alert({
  message,
}: AlertProps) {
  if (!message) {
    return null;
  }

  return (
    <div
      role="alert"
      style={{
        padding: "12px 14px",
        borderRadius: "8px",
        backgroundColor: "#fef2f2",
        border: "1px solid #fecaca",
        color: "#b91c1c",
        fontSize: "14px",
      }}
    >
      {message}
    </div>
  );
}