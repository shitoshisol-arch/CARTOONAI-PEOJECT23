/**
 * Disposable Devnet faucet for the Chill106 test pool.
 *
 * Sends 100 test tokens (and a little Devnet SOL if the wallet is empty) to the
 * connected wallet. This endpoint is only meaningful on the test deployment; the
 * Mainnet build never includes the test faucet flag.
 */
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  getMint,
} from "@solana/spl-token";

const RPC =
  process.env.TEST_RPC_URL ||
  process.env.VITE_SOLANA_RPC_URL ||
  "https://api.devnet.solana.com";
const TOKEN_AMOUNT = 100n * 10n ** 8n;
const SOL_DRIP = 0.03 * LAMPORTS_PER_SOL;
const MIN_SOL = 0.01 * LAMPORTS_PER_SOL;

const recentByIp = new Map();
const IP_WINDOW_MS = 60_000;

function json(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function loadAuthority() {
  const raw = process.env.TEST_MINT_AUTHORITY;
  if (!raw) throw new Error("TEST_MINT_AUTHORITY is not configured");
  const secret = JSON.parse(raw);
  if (!Array.isArray(secret)) throw new Error("TEST_MINT_AUTHORITY must be a JSON array");
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { error: "POST only" });
  }

  const ip =
    (req.headers["x-forwarded-for"] || "").toString().split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown";
  const now = Date.now();
  const last = recentByIp.get(ip);
  if (last && now - last < IP_WINDOW_MS) {
    return json(res, 429, { error: "Wait a minute before claiming again." });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return json(res, 400, { error: "Invalid JSON body." });
    }
  }

  const walletRaw = body?.wallet;
  let wallet;
  try {
    wallet = new PublicKey(walletRaw);
  } catch {
    return json(res, 400, { error: "A valid wallet address is required." });
  }

  const mintRaw = process.env.TEST_MINT;
  if (!mintRaw) return json(res, 500, { error: "Faucet is not configured." });

  let mint;
  let authority;
  try {
    mint = new PublicKey(mintRaw);
    authority = loadAuthority();
  } catch (error) {
    console.error("faucet config", error);
    return json(res, 500, { error: "Faucet is not configured." });
  }

  const connection = new Connection(RPC, "confirmed");

  try {
    const mintInfo = await getMint(connection, mint, "confirmed", TOKEN_PROGRAM_ID);
    if (mintInfo.mintAuthority?.toBase58() !== authority.publicKey.toBase58()) {
      return json(res, 500, { error: "Faucet mint authority mismatch." });
    }

    const ata = getAssociatedTokenAddressSync(mint, wallet, true, TOKEN_PROGRAM_ID);
    let balance = 0n;
    try {
      const account = await connection.getTokenAccountBalance(ata, "confirmed");
      balance = BigInt(account.value.amount);
    } catch {
      balance = 0n;
    }
    if (balance >= TOKEN_AMOUNT) {
      return json(res, 200, {
        alreadyClaimed: true,
        mint: mint.toBase58(),
        wallet: wallet.toBase58(),
        message: "This wallet already holds the test token balance.",
      });
    }

    recentByIp.set(ip, now);

    const instructions = [];
    const solBalance = await connection.getBalance(wallet, "confirmed");
    if (solBalance < MIN_SOL) {
      instructions.push(
        SystemProgram.transfer({
          fromPubkey: authority.publicKey,
          toPubkey: wallet,
          lamports: Math.round(SOL_DRIP),
        }),
      );
    }
    instructions.push(
      createAssociatedTokenAccountIdempotentInstruction(
        authority.publicKey,
        ata,
        wallet,
        mint,
        TOKEN_PROGRAM_ID,
      ),
      createMintToInstruction(
        mint,
        ata,
        authority.publicKey,
        TOKEN_AMOUNT,
        [],
        TOKEN_PROGRAM_ID,
      ),
    );

    const transaction = new Transaction().add(...instructions);
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [authority],
      { commitment: "confirmed" },
    );

    return json(res, 200, {
      signature,
      amount: "100",
      mint: mint.toBase58(),
      wallet: wallet.toBase58(),
      solDrip: solBalance < MIN_SOL ? 0.03 : 0,
    });
  } catch (error) {
    console.error("faucet error", error);
    return json(res, 500, {
      error: "The Devnet faucet could not send tokens. Try again shortly.",
    });
  }
}
