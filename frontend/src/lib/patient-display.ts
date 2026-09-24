export function formatPatientSex(sex: string | null | undefined): string {
  switch (sex) {
    case "M":
    case "MALE":
    case "Male":
    case "male":
      return "\uB0A8";
    case "F":
    case "FEMALE":
    case "Female":
    case "female":
      return "\uC5EC";
    default:
      return sex ?? "-";
  }
}
