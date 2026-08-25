import type {
  BriefingLayer,
  BriefingViewModel,
} from "../view-model/buildBriefingViewModel";

export function BriefingStatement({
  vm,
  layer,
}: {
  vm: BriefingViewModel;
  layer: BriefingLayer;
}) {
  let headline = vm.statement;
  if (layer === "change" && !vm.processing && vm.changeCount > 0) {
    headline = "What changed";
  }
  if (layer === "patterns" && !vm.processing && vm.patternCount > 0) {
    headline = "What SentaCore is starting to notice";
  }

  const metaParts: string[] = [];
  if (layer === "attention" && vm.matterCount > 0) {
    metaParts.push(
      `${vm.matterCount} ${vm.matterCount === 1 ? "priority" : "priorities"}`
    );
  }
  if (layer === "change" && vm.changeCount > 0) {
    metaParts.push(
      `${vm.changeCount} ${vm.changeCount === 1 ? "change" : "changes"}`
    );
  }
  if (layer === "patterns" && vm.patternCount > 0) {
    metaParts.push(
      `${vm.patternCount} ${vm.patternCount === 1 ? "pattern" : "patterns"}`
    );
  }
  metaParts.push(`Based on the last ${vm.windowDays} days`);

  return (
    <header
      className="ix-statement"
      id={`ix-layer-${layer}`}
      role="tabpanel"
      aria-labelledby={`ix-tab-${layer}`}
    >
      <h1 className="ix-statement-headline">{headline}</h1>
      <p className="ix-statement-support">{vm.statementSupport}</p>

      <p className="ix-statement-meta">
        {metaParts.join(" · ")}
        {vm.partial ? (
          <span className="ix-statement-meta-quiet">
            {" "}
            · The picture is still forming
          </span>
        ) : null}
      </p>

      {vm.processing ? (
        <p className="ix-statement-forming">Still analysing recent activity.</p>
      ) : null}
    </header>
  );
}
