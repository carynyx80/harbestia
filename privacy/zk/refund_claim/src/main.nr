// refund_claim: prove ownership of a committed position and compute the
// pro-rata refund privately; output a refund note commitment (to be shielded
// into the investor's Rings balance) plus a nullifier so it is claimed once.
// Same math as privacy/arcium/reference::prorata_refund. Use this OR the
// Arcium prorata_refund path (see README "refund paths").
use harvestia_lib::{DEPTH, DOMAIN_REFUND, h3, position_leaf, merkle_root};

fn main(
    position_secret: Field,
    stake: u64,
    salt: Field,
    leaf_index: Field,
    siblings: [Field; DEPTH],
    note_blinding: Field,
    positions_root: pub Field,
    campaign_id: pub Field,
    remaining_locked: pub u64,
    total_stake: pub u64,
    recipient_owner_hash: pub Field, // Rings shielded address owner hash
) -> pub (Field, Field) {
    let leaf = position_leaf(position_secret, campaign_id, stake, salt);
    assert(merkle_root(leaf, leaf_index, siblings) == positions_root);
    assert(total_stake > 0);
    assert(stake <= total_stake);
    let refund: u64 = ((stake as u128 * remaining_locked as u128) / total_stake as u128) as u64;
    let nullifier = h3(DOMAIN_REFUND, position_secret, campaign_id);
    let note = std::hash::pedersen_hash([recipient_owner_hash, refund as Field, note_blinding]);
    (nullifier, note)
}

#[test]
fn test_refund_note_binds_amount() {
    let sib: [Field; DEPTH] = [0; DEPTH];
    let root = merkle_root(position_leaf(9, 1, 50, 2), 0, sib);
    let (_, note) = main(9, 50, 2, 0, sib, 8, root, 1, 250, 500, 4);
    // refund = 50 * 250 / 500 = 25
    assert(note == std::hash::pedersen_hash([4, 25, 8]));
}
