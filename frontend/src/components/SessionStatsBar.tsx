import { useSession } from "../session/useSession";
import { Button } from "./Button";

/**
 * Session-wide statistics. Values come from the in-memory SessionContext and are
 * reset only by an explicit restart.
 */
export function SessionStatsBar({ compact = false }: { compact?: boolean }) {
  const { stats, isPristine, restart } = useSession();

  return (
    <div className="session-bar" aria-label="Session statistics">
      {isPristine ? (
        <span className="faint session-bar-empty">
          {compact ? "No session activity yet" : "Session activity will appear here."}
        </span>
      ) : (
        <dl className="session-stats">
          <Stat label="Quiz" value={`${stats.quiz.correct}/${stats.quiz.answered}`} />
          <Stat label="Typing" value={`${stats.typing.correct}/${stats.typing.attempted}`} />
          <Stat
            label="Flashcards"
            value={`${stats.flashcards.known} known / ${stats.flashcards.needsPractice} practice`}
          />
          <Stat
            label="Matching"
            value={`${stats.matching.pairsCompleted} pairs / ${stats.matching.attempts} attempts`}
          />
        </dl>
      )}
      <Button variant="ghost" size="small" onClick={restart}>
        Restart session
      </Button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="session-stat">
      <dt className="label">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
