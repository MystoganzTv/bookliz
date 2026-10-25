/**
 * Tells ProContext which Google/Apple account is linked on this device.
 *
 * ProProvider sits above BooklizProvider (the theme needs Pro before the
 * library loads), so it cannot read the profile itself; this renders inside
 * BooklizProvider and reports the linked email upward. Only an account linked
 * through real sign-in counts — the email is set solely by
 * connectIdentityAccount, never by the profile editor.
 */
import { useEffect } from "react";
import { useBookliz } from "../data/BooklizContext";
import { usePro } from "./ProContext";

export function LinkedAccountProBridge() {
  const { userProfile } = useBookliz();
  const { setLinkedAccountEmail } = usePro();
  const email = userProfile.authProvider ? userProfile.email ?? null : null;
  useEffect(() => {
    setLinkedAccountEmail(email);
  }, [email, setLinkedAccountEmail]);
  return null;
}
