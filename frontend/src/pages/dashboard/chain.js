// The one place dashboard code gets contract helpers from (lib/contract).
import { getContract, isContractConfigured } from "../../lib/contract";

export * from "../../lib/contract";

// False until the contract is deployed and VITE_CONTRACT_ADDRESS is set; pages then show a
// clear "not connected" notice instead of failing on every call. There is no sample data.
export const CONTRACT_READY = isContractConfigured();

// Read-only contract for pages (kept as a named helper so components read clearly).
export const getReadContract = () => getContract();
