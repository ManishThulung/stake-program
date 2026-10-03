use anchor_lang::prelude::*;
use anchor_lang::system_program;
// use anchor_spl::{
//   token_interface::{self, Mint, MintTo, TokenAccount, TokenInterface},
// };

declare_id!("Gan53Gu3A7PVGfKZRX3x8NYyHibSGSJUXZFNPWA21czR");

const LAMPORTS_PER_SOL: u64 = 1_000_000_000;
const POINT_PRECISION: u64 = 1_000_000;
const REWARD_PER_SOL_PER_EPOCH: u64 = 1;

#[program]
pub mod stake_contract   {
  use super::*;

  pub fn create_pda_account(ctx: Context<CreatePdaAccount>) -> Result<()> {
    let pda_account = &mut ctx.accounts.pda_account;
    let clock = Clock::get()?;

    pda_account.staked_amount = 0;
    pda_account.total_points = 0;
    pda_account.last_updated_epoch = clock.epoch;
    pda_account.bump = ctx.bumps.pda_account;
    pda_account.owner = ctx.accounts.signer.key();

    Ok(())
  }

  pub fn stake_solana(ctx: Context<StakeSol>, amount: u64) -> Result<()> {
    require!(amount > 0, StakeError::InvalidAmount);

    let cpi_context = CpiContext::new(
      ctx.accounts.system_program.key().clone(),
      system_program::Transfer {
        from: ctx.accounts.payer.to_account_info(),
        to: ctx.accounts.pda_account.to_account_info(),
      },
    );
    system_program::transfer(cpi_context, amount)?;
    let clock = Clock::get()?;
    let pda = &mut ctx.accounts.pda_account;
    update_points(pda, clock.epoch)?;
    pda.staked_amount = pda
      .staked_amount
      .checked_add(amount)
      .ok_or(StakeError::Overflow)?;

    Ok(())
  }

  pub fn unstake_solana(ctx: Context<UnstakeSol>, amount: u64) -> Result<()> {
    require!(amount > 0, StakeError::InvalidAmount);

    let clock = Clock::get()?;
    let pda_account = &mut ctx.accounts.pda_account;

    // let rent = Rent::get()?;
    // let minimum_balance = rent.minimum_balance(StakeData::INIT_SPACE+8)?;
    require!(
      pda_account.staked_amount >= amount,
      StakeError::InsufficientStake
    );

    update_points(pda_account, clock.epoch)?;
    let withdrawal_points = pda_account
      .total_points
      .checked_mul(amount)
      .ok_or(StakeError::Overflow)?
      .checked_div(pda_account.staked_amount)
      .ok_or(StakeError::Overflow)?;

    pda_account.staked_amount = pda_account
      .staked_amount
      .checked_sub(amount)
      .ok_or(StakeError::Overflow)?;
    pda_account.total_points = pda_account
      .total_points
      .checked_sub(withdrawal_points)
      .ok_or(StakeError::Overflow)?;

    // could mint tokens here based on withdrawal_points

    **ctx
      .accounts
      .pda_account
      .to_account_info()
      .try_borrow_mut_lamports()? -= amount;

    **ctx
      .accounts
      .receiver
      .to_account_info()
      .try_borrow_mut_lamports()? += amount;

    Ok(())
  }

  // pub fn claim_rewards(ctx: Context<UnstakeSol>) -> Result<()> {
  //   let clock = Clock::get()?;
  //   let pda_account = &mut ctx.accounts.pda_account;

  //   update_points(pda_account, clock.epoch)?;

  //   // could mint tokens here based on pda_account.total_points

  //   pda_account.total_points = 0;

  //   Ok(())
  // }
}

fn update_points(pda: &mut StakeData, current_epoch: u64) -> Result<()> {
  let elapsed_epochs = current_epoch
    .checked_sub(pda.last_updated_epoch)
    .ok_or(StakeError::Overflow)?;
  let new_points = calculate_points(pda.staked_amount, elapsed_epochs)?;
  let total_points = new_points
    .checked_add(pda.total_points)
    .ok_or(StakeError::Overflow)?;

  pda.total_points = total_points;
  pda.last_updated_epoch = current_epoch;

  Ok(())
}

fn calculate_points(staked_amount: u64, elapsed_epochs: u64) -> Result<u64> {
  let total_points_earned = staked_amount
    .checked_mul(elapsed_epochs as u64)
    .ok_or(StakeError::Overflow)?
    .checked_mul(REWARD_PER_SOL_PER_EPOCH)
    .ok_or(StakeError::Overflow)?
    .checked_mul(POINT_PRECISION)
    .ok_or(StakeError::Overflow)?
    .checked_div(LAMPORTS_PER_SOL)
    .ok_or(StakeError::Overflow)?;

  Ok(total_points_earned)
}

#[derive(Accounts)]
pub struct CreatePdaAccount<'info> {
  #[account(
    init,
    payer=signer, 
    space=8+StakeData::INIT_SPACE, 
    seeds=[b"clients", signer.key().as_ref()], 
    bump
  )]
  pub pda_account: Account<'info, StakeData>,
  #[account(mut)]
  pub signer: Signer<'info>,
  pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct StakeSol<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  #[account(
    mut,
    seeds=[b"clients", payer.key().as_ref()], 
    bump=pda_account.bump,
    constraint = pda_account.owner == payer.key() @ StakeError::Unauthorized
  )]
  pub pda_account: Account<'info, StakeData>,
  pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UnstakeSol<'info>   {
  #[account(mut)]
  pub receiver: SystemAccount<'info>,
  #[account(
    mut,
    seeds=[b"clients", receiver.key().as_ref()], 
    bump=pda_account.bump,
    constraint = pda_account.owner == receiver.key() @ StakeError::Unauthorized
  )]
  pub pda_account: Account<'info, StakeData>,
}

// #[derive(Accounts)]
// pub struct ClaimRewards<'info> {
//   // #[account(mut)]
//   // pub signer: Signer<'info>,
//   #[account(mut)]
//   pub mint: InterfaceAccount<'info, Mint>,
//   #[account(mut)]
//   pub token_account: InterfaceAccount<'info, TokenAccount>,
//   pub token_program: Interface<'info, TokenInterface>,
// }

#[account]
#[derive(InitSpace)]
pub struct StakeData {
  pub owner: Pubkey,
  pub staked_amount: u64,
  pub total_points: u64,
  pub last_updated_epoch: u64,
  pub bump: u8,
}

#[error_code]
pub enum StakeError {
  #[msg("Arithmetic overflow")]
  Overflow,
  #[msg("Insufficient stake amount")]
  InsufficientStake,
  #[msg("Unauthorized access")]
  Unauthorized,
  #[msg("Invalid amount")]
  InvalidAmount,
}
