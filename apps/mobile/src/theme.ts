/** Palette shared by the mobile screens and components. */
export const colors = {
  ink: "#1c1b1f",
  quiet: "#5f5d66",
  line: "#e3e1e8",
  surface: "#ffffff",
  page: "#f6f5f8",
  accent: "#2f5bd3",
  owed: "#1b7f4b",
  owes: "#b3261e",
};

/** Text color for a net balance: green when owed money, red when owing, gray when settled (US-05). */
export function netColor(netCents: number): string {
  if (netCents > 0) return colors.owed;
  if (netCents < 0) return colors.owes;
  return colors.quiet;
}
