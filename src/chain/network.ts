import { defineChain } from "viem";
import { BLOCKSCOUT_ORIGIN, CHAIN_ID } from "../addresses.js";

export function robinhoodChain(httpUrl: string) {
  return defineChain({
    id: CHAIN_ID,
    name: "Robinhood Chain",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [httpUrl] } },
    blockExplorers: {
      default: { name: "Blockscout", url: BLOCKSCOUT_ORIGIN },
    },
  });
}
