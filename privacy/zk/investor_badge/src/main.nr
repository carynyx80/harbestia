// investor_badge: "I am a Harvestia investor with at least `min_stake` in
// some campaign" without revealing which campaign, amount, or wallet.
// One badge nullifier per epoch prevents badge farming.
use harvestia_lib::{DEPTH, DOMAIN_BADGE, h3, position_leaf, merkle_root};

fn main(
    position_secret: Field,
    campaign_id: Field, // private: hidden among all campaigns
    stake: u64,
    salt: Field,
    leaf_index: Field,
    siblings: [Field; DEPTH],
    global_positions_root: pub Field, // tree of all positions across campaigns
    min_stake: pub u64,
    epoch: pub Field,
) -> pub Field {
    let leaf = position_leaf(position_secret, campaign_id, stake, salt);
    assert(merkle_root(leaf, leaf_index, siblings) == global_positions_root);
    assert(stake >= min_stake);
    h3(DOMAIN_BADGE, position_secret, epoch)
}

#[test(should_fail)]
fn test_below_threshold_fails() {
    let sib: [Field; DEPTH] = [0; DEPTH];
    let root = merkle_root(position_leaf(1, 2, 10, 3), 0, sib);
    let _ = main(1, 2, 10, 3, 0, sib, root, 11, 0);
}
