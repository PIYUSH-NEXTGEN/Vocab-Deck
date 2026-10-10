import { useContext } from "react";
import { SessionContext, type SessionApi } from "./sessionContext";

/** Access the in-memory session API. Must be used inside <SessionProvider>. */
export function useSession(): SessionApi {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used inside <SessionProvider>.");
  }
  return context;
}
