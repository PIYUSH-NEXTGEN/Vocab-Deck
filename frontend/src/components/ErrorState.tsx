import { isApiError } from "../api/client";
import { Button } from "./Button";

function describe(error: unknown): { title: string; message: string } {
  if (isApiError(error)) {
    switch (error.code) {
      case "deck_not_found":
        return { title: "Deck not found", message: error.message };
      case "entry_not_found":
        return { title: "Entry not found", message: error.message };
      case "network_error":
        return {
          title: "Vocabulary service unavailable",
          message:
            "Make sure the backend is running (uvicorn app.main:app --port 8000), then retry.",
        };
      case "timeout":
        return { title: "Service timed out", message: error.message };
      default:
        return { title: "Request failed", message: error.message };
    }
  }
  if (error instanceof Error) {
    return { title: "Unexpected error", message: error.message };
  }
  return { title: "Unexpected error", message: "Please try again." };
}

export function ErrorState({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  const { title, message } = describe(error);
  return (
    <div className="state state-error" role="alert">
      <h3>{title}</h3>
      <p className="muted">{message}</p>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}
