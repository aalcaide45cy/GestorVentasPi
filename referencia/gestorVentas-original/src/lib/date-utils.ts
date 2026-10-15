export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  
  // Si ya tiene diagonales, verificamos si está en formato YYYY/MM/DD o DD/MM/YYYY
  if (dateStr.includes("/")) {
    const parts = dateStr.split("/");
    if (parts.length === 3) {
      // YYYY/MM/DD
      if (parts[0].length === 4) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      return dateStr;
    }
  }
  
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    // YYYY-MM-DD
    if (parts[0].length === 4) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    // DD-MM-YYYY
    if (parts[2].length === 4) {
      return `${parts[0]}/${parts[1]}/${parts[2]}`;
    }
  }
  
  // Si contiene fecha y hora de base de datos
  if (dateStr.includes("T")) {
    const onlyDate = dateStr.split("T")[0];
    const parts = onlyDate.split("-");
    if (parts.length === 3 && parts[0].length === 4) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
  }

  return dateStr;
}
