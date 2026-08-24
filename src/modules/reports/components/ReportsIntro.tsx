export function ReportsIntro({
  title = "Reports",
  description = "Turn operational activity into a clear view of what matters.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <header className="rp-intro">
      <p className="rp-intro-eyebrow">Reporting</p>
      <h1 className="rp-intro-title">{title}</h1>
      <p className="rp-intro-lede">{description}</p>
    </header>
  );
}
