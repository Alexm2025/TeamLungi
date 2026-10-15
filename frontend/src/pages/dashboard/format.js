// 0x1234567890abcdef... -> 0x1234…cdef
export function shortAddress(address) {
  if (!address) return "";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
