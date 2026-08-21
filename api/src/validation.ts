import algosdk from "algosdk";
import { z } from "zod";

/**
 * An Algorand address, validated by checksum rather than by length.
 *
 * A 58-character string is not necessarily an address. Validating length alone
 * lets malformed input reach `algosdk.decodeAddress`, which throws deep in the
 * request path — surfacing a client error as an HTTP 500 and leaking the
 * internal exception message to an unauthenticated caller (SEC-010, SEC-011).
 */
export const algorandAddress = z
  .string()
  .length(58, "must be a 58-character Algorand address")
  .refine((v) => algosdk.isValidAddress(v), {
    message: "not a valid Algorand address (checksum failed)",
  });
