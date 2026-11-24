// vote_nullifier: "I own a position in this campaign and have not voted in
// this round", bound to the exact encrypted ballot submitted to Arcium.
use harvestia_lib::{DEPTH, DOMAIN_VOTE, position_leaf, merkle_root};

fn main(
    position_secret: Field,
    stake: u64,
    salt: Field,
    leaf_index: Field,
    siblings: [Field; DEPTH],
    positions_root: pub Field,
    campaign_id: pub Field,
    milestone_index: pub Field,
    round: pub Field, // 0 = first vote, 1 = resubmission
    ballot_hash: pub Field, // hash of the Arcium ciphertext + nonce
) -> pub Field {
    let leaf = position_leaf(position_secret, campaign_id, stake, salt);
    assert(merkle_root(leaf, leaf_index, siblings) == positions_root);
    assert(stake > 0);
    let _ = ballot_hash;
    std::hash::pedersen_hash([DOMAIN_VOTE, position_secret, campaign_id, milestone_index, round])
}

#[test]
fn test_vote_rounds_differ() {
    let sib: [Field; DEPTH] = [0; DEPTH];
    let root = merkle_root(position_leaf(11, 1, 100, 3), 0, sib);
    let a = main(11, 100, 3, 0, sib, root, 1, 0, 0, 77);
    let b = main(11, 100, 3, 0, sib, root, 1, 0, 1, 77);
    assert(a != b);
}

#[test(should_fail)]
fn test_wrong_stake_fails() {
    let sib: [Field; DEPTH] = [0; DEPTH];
    let root = merkle_root(position_leaf(11, 1, 100, 3), 0, sib);
    let _ = main(11, 101, 3, 0, sib, root, 1, 0, 0, 77);
}
