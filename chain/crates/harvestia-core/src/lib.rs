//! Host-testable re-export of the program's pure logic module.
//! Single source of truth: programs/harvestia/src/logic.rs
#[path = "../../../programs/harvestia/src/logic.rs"]
mod logic;
pub use logic::*;
