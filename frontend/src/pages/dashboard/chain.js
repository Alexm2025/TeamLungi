// The one place dashboard code gets contract helpers from.
// After Member A's lib is on main (git pull --rebase origin main), replace both lines with:
//   export * from "../../lib/contract";
//   export const USING_MOCK = false;
export * from "./mockContract";
export const USING_MOCK = true;
