"use client";

import { useCallback, useState } from "react";
import type { BriefingViewModel } from "../view-model/buildBriefingViewModel";
import {
  buildExploreResponse,
  suggestedExploreQuestions,
  type ExploreResponse,
} from "../view-model/buildExploreResponse";

export function ExploreComposition({ vm }: { vm: BriefingViewModel }) {
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<ExploreResponse | null>(null);
  const suggestions = suggestedExploreQuestions();

  const investigate = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setQuery(trimmed);
      setResponse(buildExploreResponse(trimmed, vm));
    },
    [vm]
  );

  return (
    <div className="ix-investigate-field">
      <header className="ix-investigate-intro">
        <h2 className="ix-investigate-intro-title">Ask about the organisation</h2>
        <p className="ix-investigate-intro-copy">
          Ask a question. SentraCore will answer from connected activity across
          incidents, maintenance, facilities, and work orders.
        </p>
      </header>

      <div className="ix-investigate-surface">
        <label className="sr-only" htmlFor="ix-investigate-query">
          Ask about the organisation
        </label>
        <textarea
          id="ix-investigate-query"
          className="ix-investigate-query"
          rows={4}
          placeholder="Ask about the organisation…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              investigate(query);
            }
          }}
        />
        <div className="ix-investigate-surface-foot">
          <ul className="ix-investigate-prompts">
            {suggestions.map((s) => (
              <li key={s}>
                <button type="button" onClick={() => investigate(s)}>
                  {s}
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="ix-investigate-submit"
            onClick={() => investigate(query)}
          >
            Investigate
          </button>
        </div>
      </div>

      {response ? (
        <article className="ix-investigate-response">
          <section className="ix-investigate-response-block">
            <h3>Answer</h3>
            <p className="ix-investigate-answer">{response.answer}</p>
          </section>

          <section className="ix-investigate-response-block">
            <h3>What SentraCore found</h3>
            <p>{response.found}</p>
          </section>

          {response.evidence.length > 0 ? (
            <section className="ix-investigate-response-block">
              <h3>Evidence</h3>
              <ul>
                {response.evidence.map((item, i) => (
                  <li key={`${item.slice(0, 24)}-${i}`}>{item}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="ix-investigate-response-block">
            <h3>Related activity</h3>
            <div className="ix-investigate-modules">
              {response.modules.map((mod) => (
                <span key={mod}>{mod}</span>
              ))}
            </div>
          </section>
        </article>
      ) : (
        <p className="ix-investigate-idle">
          Select a suggested investigation or enter your own question. This surface
          is designed to become the home for conversational intelligence.
        </p>
      )}
    </div>
  );
}
