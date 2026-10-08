/** Robinhood Chain and the live Pons V2 factory. Flap is a different venue and is not indexed. */
export const CHAIN_ID = 4663;

export const PONS_FACTORY = "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export const BLOCKSCOUT_ORIGIN = "https://robinhoodchain.blockscout.com";

export function lower(address: string): string {
  return address.toLowerCase();
}

export function sameAddress(left: string, right: string): boolean {
  return lower(left) === lower(right);
}

export function isZeroAddress(address: string): boolean {
  return lower(address) === ZERO_ADDRESS;
}

export function tokenUrl(token: string): string {
  return `${BLOCKSCOUT_ORIGIN}/token/${token}`;
}

export function addressUrl(account: string): string {
  return `${BLOCKSCOUT_ORIGIN}/address/${account}`;
}
