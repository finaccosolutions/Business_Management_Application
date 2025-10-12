// Format date to DD/MM/YYYY for display
export function formatDateDisplay(dateString: string | null): string {
  if (!dateString) return '';
  
  const date = new Date(dateString);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  
  return `${day}/${month}/${year}`;
}

// Convert DD/MM/YYYY to YYYY-MM-DD for database
export function parseDateInput(dateString: string): string {
  const parts = dateString.split('/');
  if (parts.length === 3) {
    const [day, month, year] = parts;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return dateString;
}

// Convert YYYY-MM-DD to DD/MM/YYYY for input field
export function formatDateForInput(dateString: string | null): string {
  if (!dateString) return '';
  return dateString; // Input type="date" requires YYYY-MM-DD format
}
