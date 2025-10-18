// Format date to DD/MM/YYYY for display
export function formatDateDisplay(dateString: string | null | undefined): string {
  if (!dateString) return '';

  const date = new Date(dateString);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();

  return `${day}/${month}/${year}`;
}

// Format date with full month name (e.g., "15 January 2025")
export function formatDateDisplayLong(dateString: string | null | undefined): string {
  if (!dateString) return '';

  const date = new Date(dateString);
  const day = date.getDate();
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'];
  const month = months[date.getMonth()];
  const year = date.getFullYear();

  return `${day} ${month} ${year}`;
}

// Format date with month and year (e.g., "January 2025")
export function formatMonthYear(dateString: string | null | undefined): string {
  if (!dateString) return '';

  const date = new Date(dateString);
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'];
  const month = months[date.getMonth()];
  const year = date.getFullYear();

  return `${month} ${year}`;
}

// Convert DD-MM-YYYY to YYYY-MM-DD for database
export function parseDateInput(dateString: string): string {
  const parts = dateString.split('-');
  if (parts.length === 3) {
    const [day, month, year] = parts;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return dateString;
}

// Convert YYYY-MM-DD to DD-MM-YYYY for input field
export function formatDateForInput(dateString: string | null): string {
  if (!dateString) return '';
  return dateString; // Input type="date" requires YYYY-MM-DD format
}
