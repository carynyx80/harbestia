// kyc_membership: "I hold a KYC commitment in the vault's tree" without
// revealing which one. Outputs a per-campaign nullifier so one identity can
// hold one position per campaign (blocks Sybil splitting to dodge the 10% cap)
// while positions in different campaigns stay unlinkable.
use harvestia_lib::{DEPTH, DOMAIN_KYC, h3, kyc_leaf, merkle_root};

fn main(
    identity_secret: Field,
    attributes_hash: Field,
    leaf_index: Field,
    siblings: [Field; DEPTH],
    kyc_root: pub Field,
    campaign_id: pub Field,
    wallet: pub Field, // binds the proof to the receiving wallet (anti front-run)
) -> pub Field {
    let leaf = kyc_leaf(identity_secret, attributes_hash);
    assert(merkle_root(leaf, leaf_index, siblings) == kyc_root);
    let _ = wallet; // public input is bound by the proof itself
    h3(DOMAIN_KYC, identity_secret, campaign_id)
}

#[test]
fn test_kyc_single_leaf() {
    let secret = 42;
    let attrs = 99;
    let sib: [Field; DEPTH] = [0; DEPTH];
    let root = merkle_root(kyc_leaf(secret, attrs), 0, sib);
    let n1 = main(secret, attrs, 0, sib, root, 1, 5);
    let n2 = main(secret, attrs, 0, sib, root, 2, 5);
    assert(n1 != n2); // unlinkable across campaigns
}
