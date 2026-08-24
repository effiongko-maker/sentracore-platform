export function BriefingCalmStage({
  headline,
  copy,
}: {
  headline: string;
  copy: string;
}) {
  return (
    <section className="ix-calm-stage" aria-live="polite">
      <h2 className="ix-calm-headline">{headline}</h2>
      <p className="ix-calm-copy">{copy}</p>
    </section>
  );
}
