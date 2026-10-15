// Chooses where the verify page reads batches from.
// Until Member A deploys and VITE_CONTRACT_ADDRESS is set, the real wrapper points at
// the zero address, so we fall back to demo data instead of showing a network error.
import { ZeroAddress } from "ethers";
import { CONTRACT_ADDRESS, getContract as getRealContract } from "../../lib/contract";
import { getContract as getMockContract } from "./mockContract";

export const USING_MOCK = CONTRACT_ADDRESS === ZeroAddress;

export const getContract = USING_MOCK ? getMockContract : () => getRealContract();
