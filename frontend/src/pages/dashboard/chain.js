// The one place dashboard code gets contract helpers from (Member A's lib).
import { ZeroAddress } from "ethers";
import { CONTRACT_ADDRESS } from "../../lib/contract";

export * from "../../lib/contract";

// False until the contract is deployed and VITE_CONTRACT_ADDRESS is set,
// so pages can show a clear notice instead of failing on every call.
export const CONTRACT_READY = CONTRACT_ADDRESS !== ZeroAddress;
