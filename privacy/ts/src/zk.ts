import type { Hex } from "./types.js";
import { NotImplementedAdapterError } from "./types.js";

export type CircuitName = "kyc_membership" | "vote_nullifier" | "refund_claim" | "investor_badge" | "clean_funds";

export interface ZkProof {
  circuit: CircuitName;
  proof: Hex;
  /** Public inputs followed by public outputs (e.g. nullifier), field elements as hex. */
  publicInputs: Hex[];
}

export interface ZkProver {
  readonly kind: string;
  prove(circuit: CircuitName, inputs: Record<string, unknown>): Promise<ZkProof>;
  verify(proof: ZkProof): Promise<boolean>;
}

/** TODO(adapter): wire @noir-lang/noir_js + @aztec/bb.js (UltraHonk) to compiled privacy/zk/target/*.json. */
export class NoirZkProver implements ZkProver {
  readonly kind = "noir";
  async prove(): Promise<ZkProof> {
    throw new NotImplementedAdapterError("NoirZkProver.prove", "circuits not compiled (nargo absent); on-chain verifier choice open");
  }
  async verify(): Promise<boolean> {
    throw new NotImplementedAdapterError("NoirZkProver.verify", "see prove");
  }
}
