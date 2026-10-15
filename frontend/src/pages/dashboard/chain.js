// The one place dashboard code gets contract helpers from (Member A's lib).
import { ZeroAddress } from "ethers";
import { CONTRACT_ADDRESS, getContract } from "../../lib/contract";
import { getContract as getDemoContract } from "../verify/mockContract";

export * from "../../lib/contract";

// False until the contract is deployed and VITE_CONTRACT_ADDRESS is set.
export const CONTRACT_READY = CONTRACT_ADDRESS !== ZeroAddress;

// Until then the public site runs as a clearly labelled preview on sample data, so it can
// be shown before deployment. Setting the address switches everything to the real chain.
export const DEMO_MODE = !CONTRACT_READY;

// Read-only contract for pages: the real one, or Member C's sample data (the same data
// the verify page shows) in preview mode.
export const getReadContract = DEMO_MODE ? getDemoContract : () => getContract();
