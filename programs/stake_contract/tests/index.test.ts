import * as anchor from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID } from "@coral-xyz/anchor/dist/cjs/utils/token";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "bun:test";
import { StakeContract } from "./../../../target/types/stake_contract";

const MINT = new PublicKey("3PkHJrVxaoPxjkTtdKBpPuLShwiwM1MB77TkKHbzaEdz");

describe("Stake Contract", async () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace
    .StakeContract as anchor.Program<StakeContract>;

  const signer = provider.wallet;
  const balance = await provider.connection.getBalance(signer.publicKey);
  console.log(balance / LAMPORTS_PER_SOL);
  const [pda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("clients"), signer.publicKey.toBuffer()],
    program.programId,
  );
  const [vaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("vault")],
    program.programId,
  );
  console.log(vaultPda.toBase58(), "vaultPdavaultPda");

  async function waitForNextEpoch() {
    const initial = await provider.connection.getEpochInfo();

    console.log("Waiting for epoch after:", initial.epoch);

    while (true) {
      const current = await provider.connection.getEpochInfo();

      if (current.epoch > initial.epoch) {
        console.log("Epoch changed:", {
          from: initial.epoch,
          to: current.epoch,
        });

        return current;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  // it("initializes the account with a starting value", async () => {
  //   await program.methods
  //     .createPdaAccount()
  //     .accounts({
  //       // pdaAccount: pda,
  //       signer: provider.wallet.publicKey,
  //     })
  //     // .signers([pdaAccount])
  //     .rpc();

  //   const state = await program.account.stakeData.fetch(pda);
  //   expect(Number(state.stakedAmount)).toBe(0);
  // });

  const INITIAL_SOL = 6;

  it(`deposit ${INITIAL_SOL} sol`, async () => {
    const amount = new anchor.BN(INITIAL_SOL * LAMPORTS_PER_SOL);
    await program.methods
      .stakeSolana(amount)
      .accounts({
        payer: provider.wallet.publicKey,
        // pdaAccount: pda,
      })
      .rpc();

    const state = await program.account.stakeData.fetch(pda);
    const vault = await provider.connection.getBalance(vaultPda);
    console.log(
      {
        stakedAmount: state.stakedAmount.toString(),
        totalPoints: state.totalPoints.toString(),
        lastUpdatedEpoch: state.lastUpdatedEpoch.toString(),
        vaultBalance: vault,
      },
      "STAKE state",
    );
    expect(state.stakedAmount.toNumber()).toBe(INITIAL_SOL * LAMPORTS_PER_SOL);
    expect(state.owner.toBase58()).toBe(signer.publicKey.toBase58());
    expect(vault).toBe(INITIAL_SOL * LAMPORTS_PER_SOL);
  });

  it(`unstake ${INITIAL_SOL / 2} sol`, async () => {
    const beforeState = await program.account.stakeData.fetch(pda);
    const beforeVault = await provider.connection.getBalance(vaultPda);

    console.log(
      {
        stakedAmount: beforeState.stakedAmount.toString(),
        totalPoints: beforeState.totalPoints.toString(),
        lastUpdatedEpoch: beforeState.lastUpdatedEpoch.toString(),
        vaultBalance: beforeVault,
      },
      "UNSTAKE beforeState",
    );
    // const before = await provider.connection.getEpochInfo();
    // console.log("Before:", {
    // epoch: before.epoch,
    // slot: before.absoluteSlot,
    // slotIndex: before.slotIndex,
    // });

    await waitForNextEpoch();

    // const after = await provider.connection.getEpochInfo();
    // console.log("After:", {
    //   epoch: after.epoch,
    //   slot: after.absoluteSlot,
    //   slotIndex: after.slotIndex,
    // });

    const amount = new anchor.BN((INITIAL_SOL / 2) * LAMPORTS_PER_SOL);
    await program.methods
      .unstakeSolana(amount)
      .accounts({
        receiver: provider.wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        mint: MINT,
      })
      .rpc();

    const state = await program.account.stakeData.fetch(pda);
    const vault = await provider.connection.getBalance(vaultPda);
    console.log(
      {
        stakedAmount: state.stakedAmount.toString(),
        totalPoints: state.totalPoints.toString(),
        lastUpdatedEpoch: state.lastUpdatedEpoch.toString(),
        vaultBalance: vault,
      },
      "UNSTAKE state",
    );
    expect(Number(state.stakedAmount.toString() / LAMPORTS_PER_SOL)).toBe(
      INITIAL_SOL / 2,
    );
    expect(vault).toBe((INITIAL_SOL / 2) * LAMPORTS_PER_SOL);
  });

  it(`claims rewards`, async () => {
    // const ata = getAssociatedTokenAddressSync(
    //   mint,
    //   signer.publicKey,
    //   false,
    //   TOKEN_PROGRAM_ID, // TOKEN_PROGRAM_ID or TOKEN_2022_PROGRAM_ID
    // );
    // console.log("signer:", signer.publicKey.toBase58());
    // console.log("expected ATA:", ata.toBase58());

    const before = await program.account.stakeData.fetch(pda);
    console.log(
      {
        stakedAmount: before.stakedAmount.toString(),
        totalPoints: before.totalPoints.toString(),
        lastUpdatedEpoch: before.lastUpdatedEpoch.toString(),
      },
      "claims rewards STAKE before",
    );

    await program.methods
      .claimRewards()
      .accounts({
        tokenProgram: TOKEN_PROGRAM_ID,
        mint: MINT,
      })
      .rpc();

    const state = await program.account.stakeData.fetch(pda);
    console.log(
      {
        stakedAmount: state.stakedAmount.toString(),
        totalPoints: state.totalPoints.toString(),
        lastUpdatedEpoch: state.lastUpdatedEpoch.toString(),
      },
      "claims rewards STAKE state",
    );
    expect(state.totalPoints.toNumber()).toBe(0);
  });
});

//////////////////////////////////////////////////////////////////////

// it("initializes program pda account", async () => {
//   const provider = anchor.AnchorProvider.env();
//   anchor.setProvider(provider);

//   const program = anchor.workspace
//     .StakeContract as anchor.Program<StakeContract>;

//   const [pda] = anchor.web3.PublicKey.findProgramAddressSync(
//     [Buffer.from("clients"), provider.wallet.publicKey.toBuffer()],
//     program.programId,
//   );
//   const beforeState = await program.account.stakeData.fetch(pda);
//   console.log(
//     {
//       stakedAmount: beforeState.stakedAmount.toString(),
//       totalPoints: beforeState.totalPoints.toString(),
//       lastUpdatedEpoch: beforeState.lastUpdatedEpoch.toString(),
//     },
//     "UNSTAKE beforeState",
//   );

//   await program.methods
//     .initializeVault()
//     .accounts({
//       signer: provider.wallet.publicKey,
//     })
//     .rpc();
// });
