// Shared helpers for Harvestia circuits.
// Hash: std::hash::pedersen_hash (in std, no external deps). If the on-chain
// verifier / indexer uses Poseidon2, swap `h` here and in privacy/ts MockPrivacy
// keeps its own (sha256) stand-in, so the two are NOT interoperable by design.

pub global DEPTH: u32 = 20; // 2^20 leaves per tree

// Domain separators so nullifiers from different circuits never collide.
pub global DOMAIN_KYC: Field = 1;
pub global DOMAIN_VOTE: Field = 2;
pub global DOMAIN_REFUND: Field = 3;
pub global DOMAIN_BADGE: Field = 4;
pub global DOMAIN_LEAF: Field = 5;

pub fn h2(a: Field, b: Field) -> Field {
    std::hash::pedersen_hash([a, b])
}

pub fn h3(a: Field, b: Field, c: Field) -> Field {
    std::hash::pedersen_hash([a, b, c])
}

pub fn h4(a: Field, b: Field, c: Field, d: Field) -> Field {
    std::hash::pedersen_hash([a, b, c, d])
}

/// Root of a fixed-depth binary Merkle tree. `index` bits pick left/right.
pub fn merkle_root(leaf: Field, index: Field, siblings: [Field; DEPTH]) -> Field {
    let bits: [u1; DEPTH] = index.to_le_bits();
    let mut node = leaf;
    for i in 0..DEPTH {
        let s = siblings[i];
        node = if bits[i] == 1 { h2(s, node) } else { h2(node, s) };
    }
    node
}

/// KYC commitment published by the TEE vault after verification:
/// H(DOMAIN_LEAF, identity_secret, attributes_hash). The vault never learns
/// identity_secret if the wallet generates it and sends only the commitment.
pub fn kyc_leaf(identity_secret: Field, attributes_hash: Field) -> Field {
    h3(DOMAIN_LEAF, identity_secret, attributes_hash)
}

/// Investor position leaf: H(DOMAIN_LEAF, position_secret, campaign_id, stake, salt).
pub fn position_leaf(position_secret: Field, campaign_id: Field, stake: u64, salt: Field) -> Field {
    std::hash::pedersen_hash([DOMAIN_LEAF, position_secret, campaign_id, stake as Field, salt])
}

#[test]
fn test_merkle_two_leaves() {
    let mut sib: [Field; DEPTH] = [0; DEPTH];
    sib[0] = 7;
    let r_left = merkle_root(3, 0, sib);
    let mut expect = h2(3, 7);
    for _i in 1..DEPTH { expect = h2(expect, 0); }
    assert(r_left == expect);
    let r_right = merkle_root(3, 1, sib);
    assert(r_right != r_left);
}
