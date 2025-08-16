import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Susdc } from "../target/types/susdc";
import { TOKEN_PROGRAM_ID, createMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";

describe("sUSDC", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.Susdc as Program<Susdc>;
  const provider = anchor.getProvider();
  const payer = provider.wallet;

  let usdcMint: anchor.web3.PublicKey;
  let susdcMint: anchor.web3.PublicKey;
  let usdcReserve: anchor.web3.PublicKey;
  let state: anchor.web3.PublicKey;
  let userUsdcATA: anchor.web3.PublicKey;
  let userSusdcATA: anchor.web3.PublicKey;

  before(async () => {
    // 1. 准备 USDC Mint（本地测试随便造）
    usdcMint = await createMint(
      provider.connection,
      payer.payer,
      payer.publicKey,
      null,
      6
    );

    // 2. 初始化 sUSDC Mint
    susdcMint = await createMint(
      provider.connection,
      payer.payer,
      payer.publicKey,
      null,
      6
    );

    // 3. 创建 custodian 的 USDC reserve ATA
    usdcReserve = (await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer.payer,
      usdcMint,
      payer.publicKey
    )).address;

    // 4. 创建用户 ATA
    userUsdcATA = (await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer.payer,
      usdcMint,
      payer.publicKey
    )).address;

    userSusdcATA = (await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer.payer,
      susdcMint,
      payer.publicKey
    )).address;

    // 5. 先给 reserve 打 1,000 USDC
    await mintTo(
      provider.connection,
      payer.payer,
      usdcMint,
      usdcReserve,
      payer.payer,
      1_000_000_000
    );

    // 6. 设置 state PDA
    const [statePDA] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("state")],
      program.programId
    );
    state = statePDA;

    // 7. 调用 initialize
    await program.methods
      .initialize()
      .accounts({
        state: state,
        susdcMint: susdcMint,
        usdcReserve: usdcReserve,
        custodian: payer.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
  });

  it("mint 100 sUSDC", async () => {
    await program.methods
      .mint(new anchor.BN(100_000_000)) // 100 USDC
      .accounts({
        state: state,
        susdcMint: susdcMint,
        usdcReserve: usdcReserve,
        userSusdcAccount: userSusdcATA,
        custodian: payer.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        programSigner: anchor.web3.PublicKey.findProgramAddressSync(
          [Buffer.from("program")],
          program.programId
        )[0],
      })
      .rpc();

    const info = await provider.connection.getTokenAccountBalance(userSusdcATA);
    console.log("sUSDC balance after mint:", info.value.amount);
  });

  it("burn 50 sUSDC and redeem USDC", async () => {
    await program.methods
      .burn(new anchor.BN(50_000_000))
      .accounts({
        state: state,
        susdcMint: susdcMint,
        usdcReserve: usdcReserve,
        userSusdcAccount: userSusdcATA,
        userUsdcAccount: userUsdcATA,
        user: payer.publicKey,
        custodian: payer.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const usdcBal = await provider.connection.getTokenAccountBalance(userUsdcATA);
    console.log("USDC balance after burn:", usdcBal.value.amount);
  });
});
