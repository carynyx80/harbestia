// clean_funds: "the public source wallet of my deposit is NOT on the
// denylist", without revealing the wallet. Denylist is an indexed (sorted
// linked-list) Merkle tree: leaf = H(value, next_value). Non-membership of x
// is shown by a "low leaf" with value < x < next_value (next_value == 0 means
// x is above the maximum). Tree must contain a 0 sentinel leaf.
use harvestia_lib::{DEPTH, h2, merkle_root};

fn main(
    source_wallet: Field, // hash of the public wallet that funded the deposit
    deposit_blinding: Field,
    low_value: Field,
    low_next: Field,
    low_index: Field,
    siblings: [Field; DEPTH],
    denylist_root: pub Field,
    deposit_commitment: pub Field, // ties proof to a specific Rings deposit
) {
    assert(h2(source_wallet, deposit_blinding) == deposit_commitment);
    let low_leaf = h2(low_value, low_next);
    assert(merkle_root(low_leaf, low_index, siblings) == denylist_root);
    assert(low_value.lt(source_wallet));
    if low_next != 0 {
        assert(source_wallet.lt(low_next));
    }
}

#[test]
fn test_not_denied() {
    let sib: [Field; DEPTH] = [0; DEPTH];
    // single sentinel leaf (0 -> 100): denylist = {100}
    let root = merkle_root(h2(0, 100), 0, sib);
    main(50, 1, 0, 100, 0, sib, root, h2(50, 1));
}

#[test(should_fail)]
fn test_denied_fails() {
    let sib: [Field; DEPTH] = [0; DEPTH];
    let root = merkle_root(h2(0, 100), 0, sib);
    main(100, 1, 0, 100, 0, sib, root, h2(100, 1));
}
