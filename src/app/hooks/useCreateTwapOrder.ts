"use client";

import { useState, useCallback } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { useTwapServer } from "./useTwapServer";
import { useApproveToken } from "./useApproveToken";

/* ─────────────────────────────────────────
   ECIES encryption helper
   We dynamically import eciesjs to avoid SSR issues
   ───────────────────────────────────────── */

async function encryptWithEcies(
  pubkeyHex: string,
  plaintext: string,
): Promise<string> {
  const { encrypt } = await import("eciesjs");
  const encrypted = encrypt(pubkeyHex, Buffer.from(plaintext));
  return Buffer.from(encrypted).toString("hex");
}

/* ─────────────────────────────────────────
   Order params the user provides
   ───────────────────────────────────────── */

export type TwapOrderParams = {
  assetIn: `0x${string}`;          // token on source chain
  assetOut: `0x${string}`;         // token on dest chain
  chainIn: string;                  // "base" | "robinhood"
  chainOut: string;
  sourceChainId: number;            // 84532 | 46630
  destChainId: number;
  totalAmountIn: string;            // raw units string e.g. "300000000"
  amountPerPeriod: string;          // raw units per tranche
  periodSeconds: number;            // seconds between tranches
  expectedOutputPerTranche: string; // raw units of dest token per tranche (used as expectedAmountB)
  recipients?: string[];            // optional recipient addresses
  amounts?: string[];               // optional per-recipient amounts (in DEST token raw units)
};

/* ─────────────────────────────────────────
   useCreateTwapOrder
   Full flow: get TEE addr → approve → encrypt → submit
   ───────────────────────────────────────── */

export function useCreateTwapOrder() {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const twap = useTwapServer();
  const { approve } = useApproveToken();
  const [step, setStep] = useState<
    "idle" | "tee-address" | "approving" | "signing" | "encrypting" | "submitting" | "done" | "error"
  >("idle");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (params: TwapOrderParams, tokenDecimals: number = 6) => {
      if (!address) throw new Error("Wallet not connected");

      setStep("idle");
      setError(null);
      setOrderId(null);

      if (!walletClient) throw new Error("Wallet client not available");

      try {
        // 1. Get TEE address
        setStep("tee-address");
        const teeAddress = await twap.getTeeAddress();

        // 2. Approve TEE to spend tokens
        setStep("approving");
        await approve(
          params.assetIn,
          teeAddress as `0x${string}`,
          params.totalAmountIn,
          0, // already in raw units, pass 0 decimals
        );

        // 3. Sign authentication message
        setStep("signing");
        const now = Math.floor(Date.now() / 1000);
        const signMessage = `tachyon-twap:${address}:${now}`;
        const signature = await walletClient.signMessage({ message: signMessage });
        // Strip 0x prefix for hex string
        const sigHex = signature.startsWith("0x") ? signature.slice(2) : signature;

        // 4. Get ECIES pubkey and encrypt order
        setStep("encrypting");
        const pubkey = await twap.getEciesPubkey();

        const totalAmountBig = BigInt(params.totalAmountIn);
        const perPeriodBig = BigInt(params.amountPerPeriod);
        const numTranches = Number(totalAmountBig / perPeriodBig);
        const totalDuration = numTranches * params.periodSeconds;

        const orderData = {
          user: address,
          assetIn: params.assetIn,
          assetOut: params.assetOut,
          chainIn: params.chainIn,
          chainOut: params.chainOut,
          sourceChainId: params.sourceChainId,
          destChainId: params.destChainId,
          totalAmountIn: params.totalAmountIn,
          amountPerPeriod: params.amountPerPeriod,
          period: params.periodSeconds,
          startTime: now + 5,
          endTime: now + totalDuration + 60,
          permitSignature: "",
          recipients: params.recipients ?? [address],
          amounts: params.amounts ?? [params.expectedOutputPerTranche],
        };

        const encryptedHex = await encryptWithEcies(
          pubkey,
          JSON.stringify(orderData),
        );

        // 5. Submit to server with signature
        setStep("submitting");
        const result = await twap.createOrder(encryptedHex, sigHex, signMessage);
        setOrderId(result.orderId);
        setStep("done");

        return result;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        setError(msg);
        setStep("error");
        throw e;
      }
    },
    [address, walletClient, twap, approve],
  );

  const reset = useCallback(() => {
    setStep("idle");
    setError(null);
    setOrderId(null);
  }, []);

  return {
    execute,
    step,
    orderId,
    error,
    reset,
  };
}
