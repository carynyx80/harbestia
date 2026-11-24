#!/usr/bin/env bash
# Harvestia one-command deploy.
#   ./deploy.sh <localnet|devnet|mainnet-beta|RPC_URL> <deployer-keypair.json>
# The deployer pays for everything. The company wallet signs NOTHING; it ends up as
# upgrade authority of both programs and as admin / reviewer / treasury owner in Config.
#
# Env overrides:
#   COMPANY_WALLET  (default DtvUDyUhkehQzp1qWKxaCvYQtm6uHU7QMuSiHeLg3Scx)
#   USDC_MINT       (default: mainnet USDC; devnet USDC when cluster=devnet)
#   FEE_BPS=500  REVIEWER_WALLET=<pubkey>  PRIORITY_FEE=<micro-lamports/CU>  YES=1 (skip mainnet prompt)
#   ESTIMATE_ONLY=1 (print cost and exit)
set -euo pipefail
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

CLUSTER="${1:?usage: deploy.sh <cluster> <deployer-keypair-path>}"
DEPLOYER="${2:?usage: deploy.sh <cluster> <deployer-keypair-path>}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHAIN="$(cd "$HERE/.." && pwd)"
DEPLOY_DIR="$CHAIN/target/deploy"

case "$CLUSTER" in
  localnet|localhost) RPC_URL="http://127.0.0.1:8899" ;;
  devnet)             RPC_URL="https://api.devnet.solana.com" ;;
  mainnet|mainnet-beta) RPC_URL="https://api.mainnet-beta.solana.com" ;;
  http*)              RPC_URL="$CLUSTER" ;;
  *) echo "unknown cluster $CLUSTER"; exit 2 ;;
esac
RPC_URL="${RPC_URL_OVERRIDE:-$RPC_URL}"

COMPANY_WALLET="${COMPANY_WALLET:-DtvUDyUhkehQzp1qWKxaCvYQtm6uHU7QMuSiHeLg3Scx}"
if [[ -z "${USDC_MINT:-}" ]]; then
  if [[ "$CLUSTER" == "devnet" ]]; then USDC_MINT="4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
  else USDC_MINT="EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; fi
fi
FEE_BPS="${FEE_BPS:-500}"
PROGRAMS=(harvestia harvestia_hook)

[[ -f "$DEPLOYER" ]] || { echo "deployer keypair not found: $DEPLOYER"; exit 2; }
for p in "${PROGRAMS[@]}"; do
  [[ -f "$DEPLOY_DIR/$p.so" && -f "$DEPLOY_DIR/$p-keypair.json" ]] || { echo "missing $DEPLOY_DIR/$p.so or keypair - run 'anchor build' in chain/"; exit 2; }
done
[[ -f "$CHAIN/target/idl/harvestia.json" ]] || { echo "missing target/idl/harvestia.json"; exit 2; }

S=(solana --url "$RPC_URL" --keypair "$DEPLOYER")
DEPLOYER_PK="$(solana-keygen pubkey "$DEPLOYER")"
rent() { "${S[@]}" rent "$1" --lamports | awk '/Rent-exempt minimum/{print $3}'; }
lam2sol() { awk -v l="$1" 'BEGIN{printf "%.9f", l/1e9}'; }

echo "== Harvestia deploy"
echo "cluster        $CLUSTER ($RPC_URL)"
echo "deployer       $DEPLOYER_PK"
echo "company wallet $COMPANY_WALLET  (upgrade authority, admin, reviewer, treasury owner)"
echo "usdc mint      $USDC_MINT"
echo

# ---- cost estimate (lamports)
# per program: ProgramData rent (len+45) + Program rent (36) stay locked;
# the write buffer (len+37) must ALSO be held during the deploy and is refunded after,
# so peak need = sum(locked) + largest buffer.  Tx fees: ~1 write tx per ~1000 bytes @5000.
TOTAL_LOCKED=0; MAX_BUF=0; FEES=0
printf "%-16s %10s %16s %16s %16s\n" program so_bytes programdata_SOL program_SOL buffer_SOL
for p in "${PROGRAMS[@]}"; do
  LEN=$(wc -c < "$DEPLOY_DIR/$p.so" | tr -d ' ')
  PD=$(rent $((LEN + 45))); PR=$(rent 36); BUF=$(rent $((LEN + 37)))
  TOTAL_LOCKED=$((TOTAL_LOCKED + PD + PR))
  (( BUF > MAX_BUF )) && MAX_BUF=$BUF
  FEES=$((FEES + ( (LEN / 1000) + 10 ) * 5000))
  printf "%-16s %10s %16s %16s %16s\n" "$p" "$LEN" "$(lam2sol $PD)" "$(lam2sol $PR)" "$(lam2sol $BUF)"
done
CONFIG_RENT=$(rent 147)   # 8 + Config::INIT_SPACE
ATA_RENT=$(rent 165)      # company USDC ATA (only if missing)
OTHER_FEES=$((10 * 5000)) # set-upgrade-authority x2, ATA, init, slack
REQUIRED=$((TOTAL_LOCKED + MAX_BUF + FEES + CONFIG_RENT + ATA_RENT + OTHER_FEES))
REQUIRED_MARGIN=$((REQUIRED + REQUIRED / 20))  # +5% for priority fees / retries
BAL=$("${S[@]}" balance --lamports | awk '{print $1}')
echo
echo "locked program rent   $(lam2sol $TOTAL_LOCKED) SOL"
echo "peak buffer (refund)  $(lam2sol $MAX_BUF) SOL"
echo "tx fees (est.)        $(lam2sol $((FEES + OTHER_FEES))) SOL"
echo "config + ATA rent     $(lam2sol $((CONFIG_RENT + ATA_RENT))) SOL"
echo "REQUIRED (peak)       $(lam2sol $REQUIRED) SOL   (with 5% margin: $(lam2sol $REQUIRED_MARGIN) SOL)"
echo "deployer balance      $(lam2sol $BAL) SOL"
echo "net cost after deploy ~$(lam2sol $((REQUIRED - MAX_BUF))) SOL (buffer rent returns to deployer)"
if (( BAL < REQUIRED_MARGIN )); then
  echo "ABORT: deployer needs $(lam2sol $((REQUIRED_MARGIN - BAL))) more SOL"; exit 1
fi
[[ "${ESTIMATE_ONLY:-0}" == "1" ]] && { echo "ESTIMATE_ONLY=1 - stopping"; exit 0; }

if [[ "$CLUSTER" == mainnet* && "${YES:-0}" != "1" ]]; then
  read -r -p "Deploy to MAINNET with company wallet $COMPANY_WALLET? type 'yes': " ans
  [[ "$ans" == "yes" ]] || { echo "aborted"; exit 1; }
fi

PF=(); [[ -n "${PRIORITY_FEE:-}" ]] && PF=(--with-compute-unit-price "$PRIORITY_FEE")

# ---- deploy + hand upgrade authority to the company
BUF_DIR="${BUF_DIR:-$HOME/.harvestia-deploy-buffers/$CLUSTER}"; mkdir -p "$BUF_DIR"; chmod 700 "$BUF_DIR"
for p in "${PROGRAMS[@]}"; do
  ID=$(solana-keygen pubkey "$DEPLOY_DIR/$p-keypair.json")
  LEN=$(wc -c < "$DEPLOY_DIR/$p.so" | tr -d ' ')
  if "${S[@]}" program show "$ID" >/dev/null 2>&1; then
    echo "== $p ($ID) already deployed - skipping deploy"
  else
    echo "== deploying $p ($ID) max-len $LEN"
    # Own buffer keypair (generated silently) so the CLI never prints a recovery seed phrase.
    BUF_KP="$BUF_DIR/$p-buffer.json"
    [[ -f "$BUF_KP" ]] || solana-keygen new --no-bip39-passphrase --silent -o "$BUF_KP" >/dev/null
    "${S[@]}" program deploy "$DEPLOY_DIR/$p.so" --program-id "$DEPLOY_DIR/$p-keypair.json" \
      --buffer "$BUF_KP" --max-len "$LEN" --upgrade-authority "$DEPLOYER" "${PF[@]+"${PF[@]}"}"
    echo "   buffer $(solana-keygen pubkey "$BUF_KP") consumed; if a deploy fails, rerun this script (it resumes with the same buffer)"
  fi
  CUR=$("${S[@]}" program show "$ID" | awk '/^Authority:/{print $2}')
  if [[ "$CUR" == "$COMPANY_WALLET" ]]; then
    echo "   upgrade authority already $COMPANY_WALLET"
  elif [[ "$CUR" == "$DEPLOYER_PK" ]]; then
    "${S[@]}" program set-upgrade-authority "$ID" --upgrade-authority "$DEPLOYER" \
      --new-upgrade-authority "$COMPANY_WALLET" --skip-new-upgrade-authority-signer-check
  else
    echo "ERROR: $p upgrade authority is $CUR (neither deployer nor company)"; exit 1
  fi
done

# ---- Config: admin = reviewer = company, treasury = company's USDC ATA
cd "$HERE"
[[ -d node_modules ]] || npm install --no-audit --no-fund
export RPC_URL DEPLOYER_KEYPAIR="$DEPLOYER" COMPANY_WALLET USDC_MINT FEE_BPS CHAIN_DIR="$CHAIN"
npx tsx init-config.ts
npx tsx verify.ts
for p in "${PROGRAMS[@]}"; do
  ID=$(solana-keygen pubkey "$DEPLOY_DIR/$p-keypair.json")
  echo "$p $ID upgrade authority: $("${S[@]}" program show "$ID" | awk '/^Authority:/{print $2}')"
done
echo "== done. Deployer leftover SOL: $(lam2sol $("${S[@]}" balance --lamports | awk '{print $1}'))"
