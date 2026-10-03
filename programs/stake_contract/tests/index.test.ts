import { StakeContract } from "./../../../target/types/stake_contract";
import * as anchor from "@coral-xyz/anchor";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { describe, expect, it } from "bun:test";

describe("Stake Contract", async () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace
    .StakeContract as anchor.Program<StakeContract>;

  const signer = provider.wallet;
  const balance = await provider.connection.getBalance(signer.publicKey);
  console.log(balance / LAMPORTS_PER_SOL);
  const [pda, bump] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("clients"), signer.publicKey.toBuffer()],
    program.programId,
  );

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
  it("initializes the account with a starting value", async () => {
    await program.methods
      .createPdaAccount()
      .accounts({
        // pdaAccount: pda,
        signer: provider.wallet.publicKey,
      })
      // .signers([pdaAccount])
      .rpc();

    const state = await program.account.stakeData.fetch(pda);
    expect(Number(state.stakedAmount)).toBe(0);
  });

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
    console.log(
      {
        stakedAmount: state.stakedAmount.toString(),
        totalPoints: state.totalPoints.toString(),
        lastUpdatedEpoch: state.lastUpdatedEpoch.toString(),
      },
      "STAKE state",
    );
    expect(state.stakedAmount.toNumber()).toBe(INITIAL_SOL * LAMPORTS_PER_SOL);
    expect(state.owner.toBase58()).toBe(signer.publicKey.toBase58());
  });

  it(`unstake ${INITIAL_SOL / 2} sol`, async () => {
    const beforeState = await program.account.stakeData.fetch(pda);
    console.log(
      {
        stakedAmount: beforeState.stakedAmount.toString(),
        totalPoints: beforeState.totalPoints.toString(),
        lastUpdatedEpoch: beforeState.lastUpdatedEpoch.toString(),
      },
      "UNSTAKE beforeState",
    );
    const before = await provider.connection.getEpochInfo();

    console.log("Before:", {
      epoch: before.epoch,
      slot: before.absoluteSlot,
      slotIndex: before.slotIndex,
    });

    await waitForNextEpoch();

    const after = await provider.connection.getEpochInfo();

    console.log("After:", {
      epoch: after.epoch,
      slot: after.absoluteSlot,
      slotIndex: after.slotIndex,
    });

    const amount = new anchor.BN((INITIAL_SOL / 2) * LAMPORTS_PER_SOL);
    await program.methods
      .unstakeSolana(amount)
      .accounts({
        receiver: provider.wallet.publicKey,
      })
      .rpc();

    const state = await program.account.stakeData.fetch(pda);
    console.log(
      {
        stakedAmount: state.stakedAmount.toString(),
        totalPoints: state.totalPoints.toString(),
        lastUpdatedEpoch: state.lastUpdatedEpoch.toString(),
      },
      "UNSTAKE state",
    );
    expect(Number(state.stakedAmount.toString() / LAMPORTS_PER_SOL)).toBe(
      INITIAL_SOL / 2,
    );
  });
});
