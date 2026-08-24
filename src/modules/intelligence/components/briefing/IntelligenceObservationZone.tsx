import type {
  IntelligencePattern,
  IntelligencePriority,
} from "@/lib/intelligence";

type ObservationRow = {
  id: string;
  title: string;
  summary: string;
  attention: boolean;
};

export function IntelligenceObservationZone({
  attention = [],
  observations = [],
}: {
  attention?: IntelligencePriority[];
  observations?: IntelligencePattern[];
}) {
  const rows: ObservationRow[] = [
    ...attention.map((item) => ({
      id: item.id,
      title: item.title,
      summary: item.summary,
      attention: true,
    })),
    ...observations.map((item) => ({
      id: item.id,
      title: item.title,
      summary: item.summary,
      attention: false,
    })),
  ];

  if (rows.length === 0) return null;

  return (
    <section className="sc-intel-zone" aria-labelledby="intel-observation-heading">
      <p id="intel-observation-heading" className="sc-intel-zone-label">
        What we&apos;re noticing
      </p>
      <p className="sc-intel-observation-summary max-w-lg">
        Quieter signals worth keeping in mind — not necessarily urgent.
      </p>

      <ul className="sc-intel-observation-stream">
        {rows.map((row) => (
          <li
            key={row.id}
            className={`sc-intel-observation-item${
              row.attention ? " sc-intel-observation-item-attention" : ""
            }`}
          >
            <p className="sc-intel-observation-title">{row.title}</p>
            <p className="sc-intel-observation-summary">{row.summary}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
