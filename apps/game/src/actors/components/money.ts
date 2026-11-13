/** Money in words. */
// ---- Belongings ----------------------------------------------------------------------------------

/** Money in words: "3 gold, 4 silver and 7 copper". */
export function moneyText(copper: number): string {
  const p = Math.floor(copper / 1000), g = Math.floor((copper % 1000) / 100), s = Math.floor((copper % 100) / 10), c = Math.floor(copper % 10);
  const parts = [p && `${p} platinum`, g && `${g} gold`, s && `${s} silver`, c && `${c} copper`].filter(Boolean) as string[];
  if (!parts.length) return 'no money';
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
