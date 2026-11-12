/** Фон лендинга = эталон Аудитории (`#C6B28E`), без записи в localStorage кабинета. */
export function LandingBackgroundLayer() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
    >
      <div className="landing-bg-layer absolute inset-0" />
      <div className="absolute inset-0 bg-background/30" />
    </div>
  );
}
