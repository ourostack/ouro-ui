import { request } from "./fake-backend";

export interface User {
  name: string;
  email: string;
}

/** The signed-in cook. */
export const currentUser: User = { name: "Ada Lovelace", email: "ada@example.com" };

/** Ends the session on the server. */
export function signOut(): Promise<void> {
  return request("signOut", [], () => undefined, 150);
}
