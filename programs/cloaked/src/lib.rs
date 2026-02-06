use anchor_lang::prelude::*;
use anchor_lang::solana_program::{program::invoke, program::invoke_signed, system_instruction, instruction::Instruction};

#[cfg(not(feature = "no-entrypoint"))]
use solana_security_txt::security_txt;

declare_id!("3yMjzAeXXc5FZRUrJ1YqP4YMPhPd5bBxHQ6npNSPCUwB");

#[cfg(not(feature = "no-entrypoint"))]
security_txt! {
    name: "Cloaked",
    project_url: "https://cloakedagent.com",
    contacts: "email:security@cloakedagent.com",
    source_code: "https://github.com/cloakedagent/cloaked",
    policy: "https://github.com/cloakedagent/cloaked/blob/main/SECURITY.md"
}

/// ZK Verifier program ID (Attestation verifier for hybrid client-side proving)
pub const ZK_VERIFIER_PROGRAM_ID: Pubkey = pubkey!("G1fDdFA16d199sf6b8zFhRK1NPZiuhuQCwWWVmGBUG3F");

/// Fixed fee for private operations (covers tx fee + margin)
pub const PRIVATE_OPERATION_FEE: u64 = 50_000;

/// Fee reimbursement for spend operations (~0.00001 SOL, covers tx fee + margin)
/// Fee payer fronts transaction fee, gets reimbursed from vault
pub const SPEND_FEE_REIMBURSEMENT: u64 = 10_000;

/// Seconds in a day (for daily limit reset calculation)
pub const SECONDS_PER_DAY: i64 = 86_400;

/// ZK witness format sizes
pub const WITNESS_HEADER_SIZE: usize = 12;
pub const COMMITMENT_SIZE: usize = 32;
pub const MIN_WITNESS_SIZE: usize = WITNESS_HEADER_SIZE + COMMITMENT_SIZE; // 44

/// Verify ZK ownership proof via CPI to the verifier program
///
/// The verifier expects instruction data in format:
/// [proof_bytes (324)] [witness_bytes (12 + N*32)]
fn verify_zk_proof(
    verifier_program: &AccountInfo,
    proof_bytes: &[u8],
    witness_bytes: &[u8],
    expected_commitment: &[u8; 32],
) -> Result<()> {
    // Verify the correct verifier program is passed
    require!(
        verifier_program.key() == ZK_VERIFIER_PROGRAM_ID,
        ErrorCode::InvalidVerifierProgram
    );

    // Verify witness contains the expected commitment
    require!(witness_bytes.len() >= MIN_WITNESS_SIZE, ErrorCode::InvalidProof);
    let witness_commitment = &witness_bytes[WITNESS_HEADER_SIZE..MIN_WITNESS_SIZE];
    require!(
        witness_commitment == expected_commitment,
        ErrorCode::CommitmentMismatch
    );

    // Build instruction data: proof || witness
    let mut ix_data = Vec::with_capacity(proof_bytes.len() + witness_bytes.len());
    ix_data.extend_from_slice(proof_bytes);
    ix_data.extend_from_slice(witness_bytes);

    // CPI to ZK verifier - if proof invalid, this fails the transaction
    let verify_ix = Instruction {
        program_id: ZK_VERIFIER_PROGRAM_ID,
        accounts: vec![],
        data: ix_data,
    };

    invoke(&verify_ix, &[])?;

    Ok(())
}

#[program]
pub mod cloaked {
    use super::*;

    /// Create a new Cloaked Agent with constraints (standard mode)
    pub fn create_cloaked_agent(
        ctx: Context<CreateCloakedAgent>,
        max_per_tx: u64,
        daily_limit: u64,
        total_limit: u64,
        expires_at: i64,
    ) -> Result<()> {
        let agent_state = &mut ctx.accounts.cloaked_agent_state;
        let clock = Clock::get()?;

        agent_state.owner = Some(ctx.accounts.owner.key());
        agent_state.owner_commitment = [0; 32]; // Standard mode: no commitment
        agent_state.delegate = ctx.accounts.delegate.key();
        agent_state.max_per_tx = max_per_tx;
        agent_state.daily_limit = daily_limit;
        agent_state.total_limit = total_limit;
        agent_state.expires_at = expires_at;
        agent_state.frozen = false;
        agent_state.total_spent = 0;
        agent_state.daily_spent = 0;
        agent_state.last_day = clock.unix_timestamp / SECONDS_PER_DAY;
        agent_state.bump = ctx.bumps.cloaked_agent_state;
        agent_state.created_at = clock.unix_timestamp;

        Ok(())
    }

    /// Create a new Cloaked Agent in private mode (no wallet linked on-chain)
    pub fn create_cloaked_agent_private(
        ctx: Context<CreateCloakedAgentPrivate>,
        owner_commitment: [u8; 32],
        max_per_tx: u64,
        daily_limit: u64,
        total_limit: u64,
        expires_at: i64,
    ) -> Result<()> {
        require!(owner_commitment != [0u8; 32], ErrorCode::InvalidCommitment);

        let agent_state = &mut ctx.accounts.cloaked_agent_state;
        let clock = Clock::get()?;

        agent_state.owner = None;
        agent_state.owner_commitment = owner_commitment;
        agent_state.delegate = ctx.accounts.delegate.key();
        agent_state.max_per_tx = max_per_tx;
        agent_state.daily_limit = daily_limit;
        agent_state.total_limit = total_limit;
        agent_state.expires_at = expires_at;
        agent_state.frozen = false;
        agent_state.total_spent = 0;
        agent_state.daily_spent = 0;
        agent_state.last_day = clock.unix_timestamp / SECONDS_PER_DAY;
        agent_state.bump = ctx.bumps.cloaked_agent_state;
        agent_state.created_at = clock.unix_timestamp;

        Ok(())
    }

    /// Deposit SOL to agent vault (anyone can call)
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        let transfer_ix = system_instruction::transfer(
            ctx.accounts.depositor.key,
            ctx.accounts.vault.key,
            amount,
        );

        invoke(
            &transfer_ix,
            &[
                ctx.accounts.depositor.to_account_info(),
                ctx.accounts.vault.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        Ok(())
    }

    /// Spend from vault to destination (delegate only, enforces constraints)
    /// Fee payer fronts tx fee and is reimbursed from vault
    pub fn spend(ctx: Context<Spend>, amount: u64) -> Result<()> {
        let clock = Clock::get()?;
        let agent_state = &mut ctx.accounts.cloaked_agent_state;

        require!(!agent_state.frozen, ErrorCode::AgentFrozen);

        if agent_state.expires_at > 0 {
            require!(
                clock.unix_timestamp < agent_state.expires_at,
                ErrorCode::AgentExpired
            );
        }

        // Check max per tx (0 = unlimited)
        if agent_state.max_per_tx > 0 {
            require!(
                amount <= agent_state.max_per_tx,
                ErrorCode::ExceedsPerTxLimit
            );
        }

        // Reset daily if new day
        let current_day = clock.unix_timestamp / SECONDS_PER_DAY;
        if current_day > agent_state.last_day {
            agent_state.daily_spent = 0;
            agent_state.last_day = current_day;
        }

        // Check daily limit (0 = unlimited)
        if agent_state.daily_limit > 0 {
            require!(
                agent_state.daily_spent.checked_add(amount).ok_or(ErrorCode::Overflow)?
                    <= agent_state.daily_limit,
                ErrorCode::ExceedsDailyLimit
            );
        }

        // Check total limit (0 = unlimited)
        if agent_state.total_limit > 0 {
            require!(
                agent_state.total_spent.checked_add(amount).ok_or(ErrorCode::Overflow)?
                    <= agent_state.total_limit,
                ErrorCode::ExceedsTotalLimit
            );
        }

        // Total required: amount + fee reimbursement
        let total_required = amount.checked_add(SPEND_FEE_REIMBURSEMENT).ok_or(ErrorCode::Overflow)?;

        require!(
            ctx.accounts.vault.lamports() >= total_required,
            ErrorCode::InsufficientBalance
        );

        // Update tracking before transfer
        agent_state.daily_spent = agent_state.daily_spent
            .checked_add(amount)
            .ok_or(ErrorCode::Overflow)?;
        agent_state.total_spent = agent_state.total_spent
            .checked_add(amount)
            .ok_or(ErrorCode::Overflow)?;

        // Get key after we're done with mutable borrow for state updates
        let agent_state_key = agent_state.key();
        let vault_bump = ctx.bumps.vault;
        let signer_seeds: &[&[&[u8]]] = &[&[
            b"vault",
            agent_state_key.as_ref(),
            &[vault_bump],
        ]];

        // Transfer from vault to destination
        invoke_signed(
            &system_instruction::transfer(
                ctx.accounts.vault.key,
                ctx.accounts.destination.key,
                amount,
            ),
            &[
                ctx.accounts.vault.to_account_info(),
                ctx.accounts.destination.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            signer_seeds,
        )?;

        // Reimburse fee payer for transaction fee
        invoke_signed(
            &system_instruction::transfer(
                ctx.accounts.vault.key,
                ctx.accounts.fee_payer.key,
                SPEND_FEE_REIMBURSEMENT,
            ),
            &[
                ctx.accounts.vault.to_account_info(),
                ctx.accounts.fee_payer.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            signer_seeds,
        )?;

        Ok(())
    }

    /// Withdraw from vault to any destination (owner only, standard mode, no constraints)
    /// Works even if agent is frozen or expired - owner has full control
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        let agent_state = &ctx.accounts.cloaked_agent_state;
        require!(!agent_state.is_private(), ErrorCode::IsPrivateMode);
        require!(
            agent_state.owner == Some(ctx.accounts.owner.key()),
            ErrorCode::NotOwner
        );

        // Check balance
        require!(
            ctx.accounts.vault.lamports() >= amount,
            ErrorCode::InsufficientBalance
        );

        // Get signer seeds for vault PDA
        let agent_state_key = ctx.accounts.cloaked_agent_state.key();
        let vault_bump = ctx.bumps.vault;
        let signer_seeds: &[&[&[u8]]] = &[&[
            b"vault",
            agent_state_key.as_ref(),
            &[vault_bump],
        ]];

        // Transfer from vault to destination
        let transfer_ix = system_instruction::transfer(
            ctx.accounts.vault.key,
            ctx.accounts.destination.key,
            amount,
        );

        invoke_signed(
            &transfer_ix,
            &[
                ctx.accounts.vault.to_account_info(),
                ctx.accounts.destination.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            signer_seeds,
        )?;

        Ok(())
    }

    /// Freeze agent (owner only, standard mode) - emergency stop
    pub fn freeze(ctx: Context<Freeze>) -> Result<()> {
        let agent_state = &mut ctx.accounts.cloaked_agent_state;
        require!(!agent_state.is_private(), ErrorCode::IsPrivateMode);
        require!(
            agent_state.owner == Some(ctx.accounts.owner.key()),
            ErrorCode::NotOwner
        );
        agent_state.frozen = true;
        Ok(())
    }

    /// Unfreeze agent (owner only, standard mode)
    pub fn unfreeze(ctx: Context<Unfreeze>) -> Result<()> {
        let agent_state = &mut ctx.accounts.cloaked_agent_state;
        require!(!agent_state.is_private(), ErrorCode::IsPrivateMode);
        require!(
            agent_state.owner == Some(ctx.accounts.owner.key()),
            ErrorCode::NotOwner
        );
        agent_state.frozen = false;
        Ok(())
    }

    /// Freeze agent with ZK proof (private mode)
    pub fn freeze_private(
        ctx: Context<FreezePrivate>,
        proof_bytes: Vec<u8>,
        witness_bytes: Vec<u8>,
    ) -> Result<()> {
        // Get keys before mutable borrow
        let agent_state_key = ctx.accounts.cloaked_agent_state.key();
        let vault_bump = ctx.bumps.vault;

        {
            let agent_state = &ctx.accounts.cloaked_agent_state;
            require!(agent_state.is_private(), ErrorCode::NotPrivateMode);

            // Verify ZK proof via CPI
            verify_zk_proof(
                &ctx.accounts.zk_verifier,
                &proof_bytes,
                &witness_bytes,
                &agent_state.owner_commitment,
            )?;
        }

        // Check vault has enough for fee
        require!(
            ctx.accounts.vault.lamports() >= PRIVATE_OPERATION_FEE,
            ErrorCode::InsufficientBalanceForFee
        );

        // Transfer fee to fee_recipient (relayer reimbursement)
        let signer_seeds: &[&[&[u8]]] = &[&[
            b"vault",
            agent_state_key.as_ref(),
            &[vault_bump],
        ]];

        invoke_signed(
            &system_instruction::transfer(
                ctx.accounts.vault.key,
                ctx.accounts.fee_recipient.key,
                PRIVATE_OPERATION_FEE,
            ),
            &[
                ctx.accounts.vault.to_account_info(),
                ctx.accounts.fee_recipient.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            signer_seeds,
        )?;

        ctx.accounts.cloaked_agent_state.frozen = true;
        Ok(())
    }

    /// Unfreeze agent with ZK proof (private mode)
    pub fn unfreeze_private(
        ctx: Context<UnfreezePrivate>,
        proof_bytes: Vec<u8>,
        witness_bytes: Vec<u8>,
    ) -> Result<()> {
        // Get keys before mutable borrow
        let agent_state_key = ctx.accounts.cloaked_agent_state.key();
        let vault_bump = ctx.bumps.vault;

        {
            let agent_state = &ctx.accounts.cloaked_agent_state;
            require!(agent_state.is_private(), ErrorCode::NotPrivateMode);

            // Verify ZK proof via CPI
            verify_zk_proof(
                &ctx.accounts.zk_verifier,
                &proof_bytes,
                &witness_bytes,
                &agent_state.owner_commitment,
            )?;
        }

        // Check vault has enough for fee
        require!(
            ctx.accounts.vault.lamports() >= PRIVATE_OPERATION_FEE,
            ErrorCode::InsufficientBalanceForFee
        );

        // Transfer fee to fee_recipient (relayer reimbursement)
        let signer_seeds: &[&[&[u8]]] = &[&[
            b"vault",
            agent_state_key.as_ref(),
            &[vault_bump],
        ]];

        invoke_signed(
            &system_instruction::transfer(
                ctx.accounts.vault.key,
                ctx.accounts.fee_recipient.key,
                PRIVATE_OPERATION_FEE,
            ),
            &[
                ctx.accounts.vault.to_account_info(),
                ctx.accounts.fee_recipient.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            signer_seeds,
        )?;

        ctx.accounts.cloaked_agent_state.frozen = false;
        Ok(())
    }

    /// Update agent constraints (owner only, standard mode)
    pub fn update_constraints(
        ctx: Context<UpdateConstraints>,
        max_per_tx: Option<u64>,
        daily_limit: Option<u64>,
        total_limit: Option<u64>,
        expires_at: Option<i64>,
    ) -> Result<()> {
        let agent_state = &mut ctx.accounts.cloaked_agent_state;
        require!(!agent_state.is_private(), ErrorCode::IsPrivateMode);
        require!(
            agent_state.owner == Some(ctx.accounts.owner.key()),
            ErrorCode::NotOwner
        );

        if let Some(v) = max_per_tx {
            agent_state.max_per_tx = v;
        }
        if let Some(v) = daily_limit {
            agent_state.daily_limit = v;
        }
        if let Some(v) = total_limit {
            agent_state.total_limit = v;
        }
        if let Some(v) = expires_at {
            agent_state.expires_at = v;
        }

        Ok(())
    }

    /// Update agent constraints with ZK proof (private mode)
    pub fn update_constraints_private(
        ctx: Context<UpdateConstraintsPrivate>,
        proof_bytes: Vec<u8>,
        witness_bytes: Vec<u8>,
        max_per_tx: Option<u64>,
        daily_limit: Option<u64>,
        total_limit: Option<u64>,
        expires_at: Option<i64>,
    ) -> Result<()> {
        // Get keys before mutable borrow
        let agent_state_key = ctx.accounts.cloaked_agent_state.key();
        let vault_bump = ctx.bumps.vault;

        {
            let agent_state = &ctx.accounts.cloaked_agent_state;
            require!(agent_state.is_private(), ErrorCode::NotPrivateMode);

            // Verify ZK proof via CPI
            verify_zk_proof(
                &ctx.accounts.zk_verifier,
                &proof_bytes,
                &witness_bytes,
                &agent_state.owner_commitment,
            )?;
        }

        // Check vault has enough for fee
        require!(
            ctx.accounts.vault.lamports() >= PRIVATE_OPERATION_FEE,
            ErrorCode::InsufficientBalanceForFee
        );

        // Transfer fee to fee_recipient (relayer reimbursement)
        let signer_seeds: &[&[&[u8]]] = &[&[
            b"vault",
            agent_state_key.as_ref(),
            &[vault_bump],
        ]];

        invoke_signed(
            &system_instruction::transfer(
                ctx.accounts.vault.key,
                ctx.accounts.fee_recipient.key,
                PRIVATE_OPERATION_FEE,
            ),
            &[
                ctx.accounts.vault.to_account_info(),
                ctx.accounts.fee_recipient.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            signer_seeds,
        )?;

        let agent_state = &mut ctx.accounts.cloaked_agent_state;
        if let Some(v) = max_per_tx {
            agent_state.max_per_tx = v;
        }
        if let Some(v) = daily_limit {
            agent_state.daily_limit = v;
        }
        if let Some(v) = total_limit {
            agent_state.total_limit = v;
        }
        if let Some(v) = expires_at {
            agent_state.expires_at = v;
        }

        Ok(())
    }

    /// Close agent and return all funds to owner (standard mode)
    pub fn close_cloaked_agent(ctx: Context<CloseCloakedAgent>) -> Result<()> {
        let agent_state = &ctx.accounts.cloaked_agent_state;
        require!(!agent_state.is_private(), ErrorCode::IsPrivateMode);
        require!(
            agent_state.owner == Some(ctx.accounts.owner.key()),
            ErrorCode::NotOwner
        );

        let vault = &ctx.accounts.vault;
        let owner = &ctx.accounts.owner;

        // Transfer vault balance to owner
        let vault_balance = vault.lamports();
        if vault_balance > 0 {
            let agent_state_key = ctx.accounts.cloaked_agent_state.key();
            let vault_bump = ctx.bumps.vault;
            let signer_seeds: &[&[&[u8]]] = &[&[
                b"vault",
                agent_state_key.as_ref(),
                &[vault_bump],
            ]];

            let transfer_ix = system_instruction::transfer(
                vault.key,
                owner.key,
                vault_balance,
            );

            invoke_signed(
                &transfer_ix,
                &[
                    vault.to_account_info(),
                    owner.to_account_info(),
                    ctx.accounts.system_program.to_account_info(),
                ],
                signer_seeds,
            )?;
        }

        // cloaked_agent_state account is closed by Anchor's close constraint
        Ok(())
    }

    /// Close agent with ZK proof (private mode)
    pub fn close_cloaked_agent_private(
        ctx: Context<CloseCloakedAgentPrivate>,
        proof_bytes: Vec<u8>,
        witness_bytes: Vec<u8>,
    ) -> Result<()> {
        let agent_state = &ctx.accounts.cloaked_agent_state;
        require!(agent_state.is_private(), ErrorCode::NotPrivateMode);

        // Verify ZK proof via CPI
        verify_zk_proof(
            &ctx.accounts.zk_verifier,
            &proof_bytes,
            &witness_bytes,
            &agent_state.owner_commitment,
        )?;

        let vault = &ctx.accounts.vault;
        let vault_balance = vault.lamports();

        // Check vault has enough for fee
        require!(
            vault_balance >= PRIVATE_OPERATION_FEE,
            ErrorCode::InsufficientBalanceForFee
        );

        let agent_state_key = ctx.accounts.cloaked_agent_state.key();
        let vault_bump = ctx.bumps.vault;
        let signer_seeds: &[&[&[u8]]] = &[&[
            b"vault",
            agent_state_key.as_ref(),
            &[vault_bump],
        ]];

        // Transfer fee to fee_recipient (relayer reimbursement)
        invoke_signed(
            &system_instruction::transfer(
                vault.key,
                ctx.accounts.fee_recipient.key,
                PRIVATE_OPERATION_FEE,
            ),
            &[
                vault.to_account_info(),
                ctx.accounts.fee_recipient.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            signer_seeds,
        )?;

        // Transfer remaining vault balance to destination
        let remaining_balance = vault_balance
            .checked_sub(PRIVATE_OPERATION_FEE)
            .ok_or(ErrorCode::Overflow)?;
        if remaining_balance > 0 {
            invoke_signed(
                &system_instruction::transfer(
                    vault.key,
                    ctx.accounts.destination.key,
                    remaining_balance,
                ),
                &[
                    vault.to_account_info(),
                    ctx.accounts.destination.to_account_info(),
                    ctx.accounts.system_program.to_account_info(),
                ],
                signer_seeds,
            )?;
        }

        // cloaked_agent_state account is closed by Anchor's close constraint
        Ok(())
    }

    /// Withdraw with ZK proof (private mode, bypasses constraints)
    pub fn withdraw_private(
        ctx: Context<WithdrawPrivate>,
        proof_bytes: Vec<u8>,
        witness_bytes: Vec<u8>,
        amount: u64,
    ) -> Result<()> {
        let agent_state = &ctx.accounts.cloaked_agent_state;
        require!(agent_state.is_private(), ErrorCode::NotPrivateMode);

        // Verify ZK proof via CPI
        verify_zk_proof(
            &ctx.accounts.zk_verifier,
            &proof_bytes,
            &witness_bytes,
            &agent_state.owner_commitment,
        )?;

        // Total required = amount + fee
        let total_required = amount.checked_add(PRIVATE_OPERATION_FEE).ok_or(ErrorCode::Overflow)?;
        require!(
            ctx.accounts.vault.lamports() >= total_required,
            ErrorCode::InsufficientBalance
        );

        let agent_state_key = ctx.accounts.cloaked_agent_state.key();
        let vault_bump = ctx.bumps.vault;
        let signer_seeds: &[&[&[u8]]] = &[&[
            b"vault",
            agent_state_key.as_ref(),
            &[vault_bump],
        ]];

        // Transfer fee to fee_recipient (relayer reimbursement)
        invoke_signed(
            &system_instruction::transfer(
                ctx.accounts.vault.key,
                ctx.accounts.fee_recipient.key,
                PRIVATE_OPERATION_FEE,
            ),
            &[
                ctx.accounts.vault.to_account_info(),
                ctx.accounts.fee_recipient.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            signer_seeds,
        )?;

        // Transfer requested amount to destination
        invoke_signed(
            &system_instruction::transfer(
                ctx.accounts.vault.key,
                ctx.accounts.destination.key,
                amount,
            ),
            &[
                ctx.accounts.vault.to_account_info(),
                ctx.accounts.destination.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            signer_seeds,
        )?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreateCloakedAgent<'info> {
    #[account(
        init,
        payer = payer,
        space = CloakedAgentState::SIZE,
        seeds = [b"cloaked_agent_state", delegate.key().as_ref()],
        bump,
    )]
    pub cloaked_agent_state: Account<'info, CloakedAgentState>,

    /// Vault PDA to hold funds
    #[account(
        seeds = [b"vault", cloaked_agent_state.key().as_ref()],
        bump,
    )]
    pub vault: SystemAccount<'info>,

    /// Owner of the agent (human wallet)
    pub owner: Signer<'info>,

    /// Delegate key (agent's public key)
    /// CHECK: Any pubkey can be delegate
    pub delegate: AccountInfo<'info>,

    /// Pays for account creation
    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    /// Agent state (to derive vault PDA)
    pub cloaked_agent_state: Account<'info, CloakedAgentState>,

    /// Vault PDA to receive funds
    #[account(
        mut,
        seeds = [b"vault", cloaked_agent_state.key().as_ref()],
        bump,
    )]
    pub vault: SystemAccount<'info>,

    /// Source of funds
    #[account(mut)]
    pub depositor: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Spend<'info> {
    #[account(
        mut,
        seeds = [b"cloaked_agent_state", delegate.key().as_ref()],
        bump = cloaked_agent_state.bump,
        has_one = delegate,
    )]
    pub cloaked_agent_state: Account<'info, CloakedAgentState>,

    #[account(
        mut,
        seeds = [b"vault", cloaked_agent_state.key().as_ref()],
        bump,
    )]
    pub vault: SystemAccount<'info>,

    /// Must match cloaked_agent_state.delegate
    pub delegate: Signer<'info>,

    /// Fee payer - fronts tx fee, gets reimbursed from vault
    #[account(mut)]
    pub fee_payer: Signer<'info>,

    /// Destination for funds
    /// CHECK: Any account can receive
    #[account(mut)]
    pub destination: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(
        seeds = [b"cloaked_agent_state", cloaked_agent_state.delegate.as_ref()],
        bump = cloaked_agent_state.bump,
    )]
    pub cloaked_agent_state: Account<'info, CloakedAgentState>,

    #[account(
        mut,
        seeds = [b"vault", cloaked_agent_state.key().as_ref()],
        bump,
    )]
    pub vault: SystemAccount<'info>,

    /// Owner signing the transaction (verified in instruction)
    pub owner: Signer<'info>,

    /// Destination for funds
    /// CHECK: Any account can receive
    #[account(mut)]
    pub destination: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Freeze<'info> {
    #[account(
        mut,
        seeds = [b"cloaked_agent_state", cloaked_agent_state.delegate.as_ref()],
        bump = cloaked_agent_state.bump,
    )]
    pub cloaked_agent_state: Account<'info, CloakedAgentState>,

    /// Owner signing the transaction (verified in instruction)
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct Unfreeze<'info> {
    #[account(
        mut,
        seeds = [b"cloaked_agent_state", cloaked_agent_state.delegate.as_ref()],
        bump = cloaked_agent_state.bump,
    )]
    pub cloaked_agent_state: Account<'info, CloakedAgentState>,

    /// Owner signing the transaction (verified in instruction)
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateConstraints<'info> {
    #[account(
        mut,
        seeds = [b"cloaked_agent_state", cloaked_agent_state.delegate.as_ref()],
        bump = cloaked_agent_state.bump,
    )]
    pub cloaked_agent_state: Account<'info, CloakedAgentState>,

    /// Owner signing the transaction (verified in instruction)
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct CloseCloakedAgent<'info> {
    #[account(
        mut,
        close = owner,
        seeds = [b"cloaked_agent_state", cloaked_agent_state.delegate.as_ref()],
        bump = cloaked_agent_state.bump,
    )]
    pub cloaked_agent_state: Account<'info, CloakedAgentState>,

    #[account(
        mut,
        seeds = [b"vault", cloaked_agent_state.key().as_ref()],
        bump,
    )]
    pub vault: SystemAccount<'info>,

    /// Owner signing the transaction (verified in instruction)
    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

// === Private Mode Account Contexts ===

#[derive(Accounts)]
pub struct CreateCloakedAgentPrivate<'info> {
    #[account(
        init,
        payer = payer,
        space = CloakedAgentState::SIZE,
        seeds = [b"cloaked_agent_state", delegate.key().as_ref()],
        bump,
    )]
    pub cloaked_agent_state: Account<'info, CloakedAgentState>,

    /// Vault PDA to hold funds
    #[account(
        seeds = [b"vault", cloaked_agent_state.key().as_ref()],
        bump,
    )]
    pub vault: SystemAccount<'info>,

    /// Delegate key (agent's public key)
    /// CHECK: Any pubkey can be delegate
    pub delegate: AccountInfo<'info>,

    /// Pays for account creation
    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FreezePrivate<'info> {
    #[account(
        mut,
        seeds = [b"cloaked_agent_state", cloaked_agent_state.delegate.as_ref()],
        bump = cloaked_agent_state.bump,
    )]
    pub cloaked_agent_state: Account<'info, CloakedAgentState>,

    #[account(mut, seeds = [b"vault", cloaked_agent_state.key().as_ref()], bump)]
    pub vault: SystemAccount<'info>,

    /// CHECK: Any account can receive fee reimbursement
    #[account(mut)]
    pub fee_recipient: AccountInfo<'info>,

    /// ZK Verifier program for proof validation
    /// CHECK: Verified in instruction to match ZK_VERIFIER_PROGRAM_ID
    pub zk_verifier: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UnfreezePrivate<'info> {
    #[account(
        mut,
        seeds = [b"cloaked_agent_state", cloaked_agent_state.delegate.as_ref()],
        bump = cloaked_agent_state.bump,
    )]
    pub cloaked_agent_state: Account<'info, CloakedAgentState>,

    #[account(mut, seeds = [b"vault", cloaked_agent_state.key().as_ref()], bump)]
    pub vault: SystemAccount<'info>,

    /// CHECK: Any account can receive fee reimbursement
    #[account(mut)]
    pub fee_recipient: AccountInfo<'info>,

    /// ZK Verifier program for proof validation
    /// CHECK: Verified in instruction to match ZK_VERIFIER_PROGRAM_ID
    pub zk_verifier: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateConstraintsPrivate<'info> {
    #[account(
        mut,
        seeds = [b"cloaked_agent_state", cloaked_agent_state.delegate.as_ref()],
        bump = cloaked_agent_state.bump,
    )]
    pub cloaked_agent_state: Account<'info, CloakedAgentState>,

    #[account(mut, seeds = [b"vault", cloaked_agent_state.key().as_ref()], bump)]
    pub vault: SystemAccount<'info>,

    /// CHECK: Any account can receive fee reimbursement
    #[account(mut)]
    pub fee_recipient: AccountInfo<'info>,

    /// ZK Verifier program for proof validation
    /// CHECK: Verified in instruction to match ZK_VERIFIER_PROGRAM_ID
    pub zk_verifier: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CloseCloakedAgentPrivate<'info> {
    #[account(
        mut,
        close = fee_recipient,  // Rent goes to relayer to recover creation cost
        seeds = [b"cloaked_agent_state", cloaked_agent_state.delegate.as_ref()],
        bump = cloaked_agent_state.bump,
    )]
    pub cloaked_agent_state: Account<'info, CloakedAgentState>,

    #[account(
        mut,
        seeds = [b"vault", cloaked_agent_state.key().as_ref()],
        bump,
    )]
    pub vault: SystemAccount<'info>,

    /// Destination for remaining vault funds
    /// CHECK: Any account can receive
    #[account(mut)]
    pub destination: AccountInfo<'info>,

    /// Fee recipient (relayer) - gets operation fee + account rent on close
    /// CHECK: Any account can receive fee reimbursement
    #[account(mut)]
    pub fee_recipient: AccountInfo<'info>,

    /// ZK Verifier program for proof validation
    /// CHECK: Verified in instruction to match ZK_VERIFIER_PROGRAM_ID
    pub zk_verifier: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawPrivate<'info> {
    #[account(
        seeds = [b"cloaked_agent_state", cloaked_agent_state.delegate.as_ref()],
        bump = cloaked_agent_state.bump,
    )]
    pub cloaked_agent_state: Account<'info, CloakedAgentState>,

    #[account(
        mut,
        seeds = [b"vault", cloaked_agent_state.key().as_ref()],
        bump,
    )]
    pub vault: SystemAccount<'info>,

    /// Destination for funds
    /// CHECK: Any account can receive
    #[account(mut)]
    pub destination: AccountInfo<'info>,

    /// CHECK: Any account can receive fee reimbursement
    #[account(mut)]
    pub fee_recipient: AccountInfo<'info>,

    /// ZK Verifier program for proof validation
    /// CHECK: Verified in instruction to match ZK_VERIFIER_PROGRAM_ID
    pub zk_verifier: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Insufficient balance in agent")]
    InsufficientBalance,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Agent is frozen")]
    AgentFrozen,
    #[msg("Agent has expired")]
    AgentExpired,
    #[msg("Amount exceeds per-transaction limit")]
    ExceedsPerTxLimit,
    #[msg("Amount exceeds daily limit")]
    ExceedsDailyLimit,
    #[msg("Amount exceeds total limit")]
    ExceedsTotalLimit,
    #[msg("Unauthorized: not owner")]
    NotOwner,
    #[msg("Agent is in private mode - use ZK proof instructions")]
    IsPrivateMode,
    #[msg("Agent is not in private mode")]
    NotPrivateMode,
    #[msg("Commitment mismatch in ZK proof")]
    CommitmentMismatch,
    #[msg("Invalid ZK proof")]
    InvalidProof,
    #[msg("ZK proof verification failed")]
    ProofVerificationFailed,
    #[msg("Invalid ZK verifier program")]
    InvalidVerifierProgram,
    #[msg("Insufficient balance for operation fee")]
    InsufficientBalanceForFee,
    #[msg("Invalid commitment: cannot be all zeros")]
    InvalidCommitment,
}

/// Cloaked Agent state - stores constraints and spending tracking
///
/// Supports two ownership modes:
/// - Standard mode: owner = Some(wallet), owner_commitment = [0; 32]
/// - Private mode: owner = None, owner_commitment = hash(secret)
#[account]
pub struct CloakedAgentState {
    /// Human wallet - full control over agent (None for private mode)
    pub owner: Option<Pubkey>,
    /// Commitment hash for private mode ownership (zeros for standard mode)
    /// In private mode: commitment = poseidon(agent_secret)
    pub owner_commitment: [u8; 32],
    /// Agent key - can spend within limits
    pub delegate: Pubkey,

    /// Max lamports per transaction (0 = unlimited)
    pub max_per_tx: u64,
    /// Max lamports per day (0 = unlimited)
    pub daily_limit: u64,
    /// Max lifetime lamports (0 = unlimited)
    pub total_limit: u64,
    /// Unix timestamp expiration (0 = never)
    pub expires_at: i64,
    /// Emergency stop
    pub frozen: bool,

    /// Lifetime spending
    pub total_spent: u64,
    /// Today's spending
    pub daily_spent: u64,
    /// Day tracker for reset (unix_timestamp / SECONDS_PER_DAY)
    pub last_day: i64,

    /// PDA bump
    pub bump: u8,
    /// Creation timestamp
    pub created_at: i64,
}

impl CloakedAgentState {
    /// Account size: 8 (discriminator) + 33 (Option<Pubkey>) + 32 (commitment) + 32 (delegate)
    ///              + 8*4 (u64 constraints) + 1 (frozen) + 8*3 (tracking) + 1 (bump) + 8 (created_at) = 171 bytes
    pub const SIZE: usize = 8 + 33 + 32 + 32 + 8 + 8 + 8 + 8 + 1 + 8 + 8 + 8 + 1 + 8;

    /// Check if this is a private mode agent
    pub fn is_private(&self) -> bool {
        self.owner.is_none()
    }
}
