-- ==========================================
-- Production-Ready PostgreSQL Schema (Step 5)
-- Platform: Supabase / PostgreSQL
-- ==========================================

-- Enable any required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('clipper', 'creator', 'admin')),
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'banned')),
    status_reason TEXT DEFAULT '',
    status_until TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. CLIPPER PROFILES TABLE
CREATE TABLE IF NOT EXISTS clipper_profiles (
    user_id VARCHAR(255) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    upi_id VARCHAR(255) DEFAULT '',
    instagram_handle VARCHAR(255) DEFAULT '',
    youtube_handle VARCHAR(255) DEFAULT '',
    kyc_status VARCHAR(50) NOT NULL DEFAULT 'Pending' CHECK (kyc_status IN ('Pending', 'Submitted', 'UnderReview', 'Verified', 'Rejected')),
    kyc_doc_url TEXT DEFAULT '',
    kyc_aadhaar VARCHAR(50) DEFAULT '',
    kyc_pan VARCHAR(50) DEFAULT '',
    kyc_reference_id VARCHAR(255) DEFAULT ''
);

-- 3. CREATOR PROFILES TABLE
CREATE TABLE IF NOT EXISTS creator_profiles (
    user_id VARCHAR(255) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    channel_url VARCHAR(255) DEFAULT '',
    wallet_balance BIGINT NOT NULL DEFAULT 0 CHECK (wallet_balance >= 0)
);

-- 4. CAMPAIGNS TABLE
CREATE TABLE IF NOT EXISTS campaigns (
    id VARCHAR(255) PRIMARY KEY,
    creator_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    creator_name VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    source_video_url TEXT NOT NULL,
    cpm BIGINT NOT NULL DEFAULT 0 CHECK (cpm >= 0),
    budget BIGINT NOT NULL DEFAULT 0 CHECK (budget >= 0),
    spent BIGINT NOT NULL DEFAULT 0 CHECK (spent >= 0),
    escrow_balance BIGINT NOT NULL DEFAULT 0 CHECK (escrow_balance >= 0),
    instructions TEXT,
    platform VARCHAR(50) NOT NULL CHECK (platform IN ('instagram', 'youtube', 'both', 'facebook', 'twitter')),
    min_duration INTEGER NOT NULL DEFAULT 0 CHECK (min_duration >= 0),
    deadline TIMESTAMPTZ NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Funded', 'Active', 'Paused', 'Completed', 'Cancelled')),
    icon_url TEXT,
    campaign_type VARCHAR(50) DEFAULT 'clipping' CHECK (campaign_type IN ('ugc', 'clipping', 'both')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. SUBMISSIONS TABLE
CREATE TABLE IF NOT EXISTS submissions (
    id VARCHAR(255) PRIMARY KEY,
    campaign_id VARCHAR(255) NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    campaign_title VARCHAR(255) NOT NULL,
    clipper_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    clipper_name VARCHAR(255) NOT NULL,
    submitted_url TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Suspended')),
    feedback TEXT DEFAULT '',
    approved_at TIMESTAMPTZ DEFAULT NULL,
    views INTEGER NOT NULL DEFAULT 0 CHECK (views >= 0),
    last_fetched_views TIMESTAMPTZ DEFAULT NULL
);

-- 6. WALLET HISTORY TABLE
CREATE TABLE IF NOT EXISTS wallet_history (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('deposit', 'payment', 'withdrawal', 'commission', 'refund')),
    amount BIGINT NOT NULL CHECK (amount >= 0),
    status VARCHAR(50) NOT NULL CHECK (status IN ('Pending', 'Completed', 'Failed')),
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 7. PAYOUT REQUESTS TABLE
CREATE TABLE IF NOT EXISTS payout_requests (
    id VARCHAR(255) PRIMARY KEY,
    clipper_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    clipper_name VARCHAR(255) NOT NULL,
    upi_id VARCHAR(255) NOT NULL,
    amount BIGINT NOT NULL CHECK (amount > 0),
    status VARCHAR(50) NOT NULL CHECK (status IN ('Processing', 'Completed', 'Failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 8. CONTACT MESSAGES / SUPPORT TICKETS TABLE
CREATE TABLE IF NOT EXISTS contacts (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 9. PAYMENTS TABLE
CREATE TABLE IF NOT EXISTS payments (
    id VARCHAR(255) PRIMARY KEY,
    provider VARCHAR(50) NOT NULL,
    provider_order_id VARCHAR(255) NOT NULL UNIQUE,
    provider_payment_id VARCHAR(255) DEFAULT NULL,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    status VARCHAR(50) NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'paid', 'failed')),
    verification_attempts INTEGER NOT NULL DEFAULT 0 CHECK (verification_attempts >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    paid_at TIMESTAMPTZ DEFAULT NULL,
    metadata JSONB DEFAULT NULL
);

-- 10. FINANCIAL LEDGER TABLE
CREATE TABLE IF NOT EXISTS financial_ledger (
    id VARCHAR(255) PRIMARY KEY,
    reference_id VARCHAR(255) NOT NULL,
    reference_type VARCHAR(50) NOT NULL,
    from_account VARCHAR(255) NOT NULL,
    to_account VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount BIGINT NOT NULL CHECK (amount >= 0),
    status VARCHAR(50) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 11. VIEW PAYOUT EVENTS TABLE
CREATE TABLE IF NOT EXISTS view_payout_events (
    id VARCHAR(255) PRIMARY KEY,
    campaign_id VARCHAR(255) NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    submission_id VARCHAR(255) NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    clipper_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    views_processed INTEGER NOT NULL CHECK (views_processed >= 0),
    amount_clipper BIGINT NOT NULL CHECK (amount_clipper >= 0),
    amount_commission BIGINT NOT NULL CHECK (amount_commission >= 0),
    escrow_debited BIGINT NOT NULL CHECK (escrow_debited >= 0),
    idempotency_key VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 12. AUDIT EVENTS TABLE
CREATE TABLE IF NOT EXISTS audit_events (
    id VARCHAR(255) PRIMARY KEY,
    actor_user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    actor_role VARCHAR(50) NOT NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(255) NOT NULL,
    metadata JSONB DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 13. FRAUD EVENTS TABLE
CREATE TABLE IF NOT EXISTS fraud_events (
    id VARCHAR(255) PRIMARY KEY,
    submission_id VARCHAR(255) NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    clipper_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    severity VARCHAR(50) NOT NULL,
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_action VARCHAR(50) DEFAULT NULL,
    resolved_notes TEXT DEFAULT NULL,
    resolved_at TIMESTAMPTZ DEFAULT NULL,
    resolved_by VARCHAR(255) DEFAULT NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 14. TROV STATE / SYSTEM BACKUP TABLE
CREATE TABLE IF NOT EXISTS trov_state (
    id VARCHAR(255) PRIMARY KEY,
    state JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 15. WEBHOOK EVENTS TABLE
CREATE TABLE IF NOT EXISTS webhook_events (
    id VARCHAR(255) PRIMARY KEY,
    provider VARCHAR(50) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMPTZ DEFAULT NULL,
    processing_status VARCHAR(50) NOT NULL DEFAULT 'received' CHECK (processing_status IN ('received', 'processed', 'failed')),
    payload JSONB DEFAULT NULL
);


-- ==========================================
-- INDEXES FOR HIGH-PERFORMANCE QUERYING
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_users_email ON users(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_campaigns_creator_id ON campaigns(creator_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_submissions_campaign_id ON submissions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_submissions_clipper_id ON submissions(clipper_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
CREATE INDEX IF NOT EXISTS idx_wallet_history_user_id ON wallet_history(user_id);
CREATE INDEX IF NOT EXISTS idx_payout_requests_clipper_id ON payout_requests(clipper_id);
CREATE INDEX IF NOT EXISTS idx_payout_requests_status ON payout_requests(status);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(provider_order_id);
CREATE INDEX IF NOT EXISTS idx_ledger_ref_id ON financial_ledger(reference_id);
CREATE INDEX IF NOT EXISTS idx_ledger_user_id ON financial_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_provider_id ON webhook_events(provider, id);


-- ==========================================
-- ATOMIC FINANCIAL RPC FUNCTIONS (PL/pgSQL)
-- ==========================================

-- 1. Creator Deposit
CREATE OR REPLACE FUNCTION deposit_creator_funds(
  p_user_id VARCHAR(255),
  p_order_id VARCHAR(255),
  p_payment_id VARCHAR(255),
  p_amount_paise BIGINT,
  p_provider VARCHAR(50),
  p_currency VARCHAR(10),
  p_ref_id VARCHAR(255),
  p_ledger_id VARCHAR(255),
  p_tx_id VARCHAR(255),
  p_audit_id VARCHAR(255)
) RETURNS JSONB AS $$
DECLARE
  v_payment_record RECORD;
BEGIN
  -- 1. Lock payment record
  SELECT * FROM payments WHERE provider_order_id = p_order_id FOR UPDATE INTO v_payment_record;
  
  IF v_payment_record IS NULL THEN
    RAISE EXCEPTION 'Payment record not found';
  END IF;

  IF v_payment_record.status = 'paid' THEN
    RAISE EXCEPTION 'Duplicate verification rejected: Already paid';
  END IF;

  IF v_payment_record.amount_paise <> p_amount_paise THEN
    RAISE EXCEPTION 'Amount mismatch';
  END IF;

  -- 2. Update payment status to paid
  UPDATE payments 
  SET status = 'paid', 
      provider_payment_id = p_payment_id, 
      paid_at = CURRENT_TIMESTAMP, 
      verification_attempts = verification_attempts + 1 
  WHERE provider_order_id = p_order_id;

  -- 3. Update creator profile wallet balance
  INSERT INTO creator_profiles (user_id, wallet_balance)
  VALUES (p_user_id, p_amount_paise)
  ON CONFLICT (user_id) DO UPDATE 
  SET wallet_balance = creator_profiles.wallet_balance + p_amount_paise;

  -- 4. Record ledger entry
  INSERT INTO financial_ledger (id, reference_id, reference_type, from_account, to_account, user_id, amount, status, description, created_at)
  VALUES (p_ledger_id, p_ref_id, 'deposit', 'External (' || p_provider || ')', 'creator_wallet:' || p_user_id, p_user_id, p_amount_paise, 'completed', 'Deposit via Payment Gateway (Order ID: ' || p_order_id || ', Payment ID: ' || p_payment_id || ')', CURRENT_TIMESTAMP);

  -- 5. Record wallet history
  INSERT INTO wallet_history (id, user_id, type, amount, status, description, created_at)
  VALUES (p_tx_id, p_user_id, 'deposit', p_amount_paise, 'Completed', 'Funded via ' || p_provider || ' Payment Gateway', CURRENT_TIMESTAMP);

  -- 6. Record audit event
  INSERT INTO audit_events (id, actor_user_id, actor_role, action, entity_type, entity_id, metadata, created_at)
  VALUES (p_audit_id, p_user_id, 'creator', 'PAYMENT_DEPOSIT_SUCCESS', 'payment', v_payment_record.id, jsonb_build_object('amountPaise', p_amount_paise, 'orderId', p_order_id, 'paymentId', p_payment_id, 'provider', p_provider), CURRENT_TIMESTAMP);

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql;


-- 2. Campaign Escrow Lock
CREATE OR REPLACE FUNCTION lock_campaign_escrow(
  p_campaign_id VARCHAR(255),
  p_creator_id VARCHAR(255),
  p_creator_name VARCHAR(255),
  p_title VARCHAR(255),
  p_source_video_url TEXT,
  p_cpm_paise BIGINT,
  p_budget_paise BIGINT,
  p_instructions TEXT,
  p_platform VARCHAR(50),
  p_min_duration INT,
  p_deadline TIMESTAMPTZ,
  p_campaign_type VARCHAR(50),
  p_icon_url TEXT,
  p_ledger_id VARCHAR(255),
  p_ref_id VARCHAR(255)
) RETURNS JSONB AS $$
DECLARE
  v_balance BIGINT;
BEGIN
  -- 1. Check if campaign already exists
  IF EXISTS (SELECT 1 FROM campaigns WHERE id = p_campaign_id) THEN
    RAISE EXCEPTION 'Campaign already exists: Duplicate escrow lock blocked';
  END IF;

  -- 2. Lock creator profile row for update
  SELECT wallet_balance FROM creator_profiles WHERE user_id = p_creator_id FOR UPDATE INTO v_balance;
  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'Creator profile not found';
  END IF;

  -- 3. Verify sufficient balance
  IF v_balance < p_budget_paise THEN
    RAISE EXCEPTION 'Sufficient balance not available in creator wallet';
  END IF;

  -- 4. Deduct funds from creator wallet
  UPDATE creator_profiles 
  SET wallet_balance = wallet_balance - p_budget_paise 
  WHERE user_id = p_creator_id;

  -- 5. Create campaign
  INSERT INTO campaigns (id, creator_id, creator_name, title, source_video_url, cpm, budget, spent, escrow_balance, instructions, platform, min_duration, deadline, status, icon_url, campaign_type, created_at)
  VALUES (p_campaign_id, p_creator_id, p_creator_name, p_title, p_source_video_url, p_cpm_paise, p_budget_paise, 0, p_budget_paise, p_instructions, p_platform, p_min_duration, p_deadline, 'Active', p_icon_url, p_campaign_type, CURRENT_TIMESTAMP);

  -- 6. Record ledger entry
  INSERT INTO financial_ledger (id, reference_id, reference_type, from_account, to_account, user_id, amount, status, description, created_at)
  VALUES (p_ledger_id, p_ref_id, 'lockup', 'creator_wallet:' || p_creator_id, 'campaign_escrow:' || p_campaign_id, p_creator_id, p_budget_paise, 'completed', 'Escrow lockup for campaign ' || p_title, CURRENT_TIMESTAMP);

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql;


-- 3. View Payout
CREATE OR REPLACE FUNCTION distribute_view_payout(
  p_submission_id VARCHAR(255),
  p_added_views INT,
  p_batch_id VARCHAR(255),
  p_clipper_ref_id VARCHAR(255),
  p_platform_ref_id VARCHAR(255),
  p_clipper_ledger_id VARCHAR(255),
  p_platform_ledger_id VARCHAR(255),
  p_event_id VARCHAR(255)
) RETURNS JSONB AS $$
DECLARE
  v_submission RECORD;
  v_campaign RECORD;
  v_remaining_budget BIGINT;
  v_creator_cost BIGINT;
  v_final_cost BIGINT;
  v_final_added_views INT;
  v_clipper_share BIGINT;
  v_platform_fee BIGINT;
  v_previous_views INT;
BEGIN
  -- 1. Lock submission and select
  SELECT * FROM submissions WHERE id = p_submission_id FOR UPDATE INTO v_submission;
  IF v_submission IS NULL THEN
    RAISE EXCEPTION 'Submission not found';
  END IF;

  -- 2. Lock campaign
  SELECT * FROM campaigns WHERE id = v_submission.campaign_id FOR UPDATE INTO v_campaign;
  IF v_campaign IS NULL THEN
    RAISE EXCEPTION 'Campaign not found';
  END IF;

  v_remaining_budget := v_campaign.escrow_balance;
  IF v_remaining_budget <= 0 THEN
    RAISE EXCEPTION 'Campaign escrow balance is zero';
  END IF;

  -- 3. Check idempotency keys (using view_payout_events idempotency_key or financial_ledger reference_id)
  IF EXISTS (SELECT 1 FROM view_payout_events WHERE idempotency_key = p_clipper_ref_id) THEN
    RAISE EXCEPTION 'Duplicate view payout detected (idempotency check)';
  END IF;

  -- 4. Calculate costs in paise
  v_creator_cost := (p_added_views::BIGINT * v_campaign.cpm) / 1000;
  IF v_creator_cost > v_remaining_budget THEN
    v_final_cost := v_remaining_budget;
  ELSE
    v_final_cost := v_creator_cost;
  END IF;

  IF v_final_cost <= 0 THEN
    RAISE EXCEPTION 'Calculated payout cost is zero';
  END IF;

  v_final_added_views := ((v_final_cost * 1000) / v_campaign.cpm)::INT;

  -- 5. Calculate splits
  v_clipper_share := (v_final_cost * 8) / 10;
  v_platform_fee := v_final_cost - v_clipper_share;

  v_previous_views := v_submission.views;

  -- 6. Update submission views and campaign escrow
  UPDATE submissions 
  SET views = views + v_final_added_views, 
      last_fetched_views = CURRENT_TIMESTAMP 
  WHERE id = p_submission_id;

  UPDATE campaigns 
  SET escrow_balance = escrow_balance - v_final_cost, 
      spent = spent + v_final_cost 
  WHERE id = v_submission.campaign_id;

  -- 7. Record view payout ledger entry (Clipper Share)
  INSERT INTO financial_ledger (id, reference_id, reference_type, from_account, to_account, user_id, amount, status, description, created_at)
  VALUES (p_clipper_ledger_id, p_clipper_ref_id, 'clipper_earning', 'campaign_escrow:' || v_campaign.id, 'clipper_earnings:' || v_submission.clipper_id, v_submission.clipper_id, v_clipper_share, 'completed', 'Payout for ' || v_submission.clipper_name || ' views (+' || v_final_added_views || ' views)', CURRENT_TIMESTAMP);

  -- 8. Record view payout ledger entry (Platform Fee)
  INSERT INTO financial_ledger (id, reference_id, reference_type, from_account, to_account, user_id, amount, status, description, created_at)
  VALUES (p_platform_ledger_id, p_platform_ref_id, 'platform_fee', 'campaign_escrow:' || v_campaign.id, 'QUOR Platform', v_submission.clipper_id, v_platform_fee, 'completed', 'Platform commission 20% for ' || v_submission.clipper_name || ' views', CURRENT_TIMESTAMP);

  -- 9. Record ViewPayoutEvent
  INSERT INTO view_payout_events (id, campaign_id, submission_id, clipper_id, views_processed, amount_clipper, amount_commission, escrow_debited, idempotency_key, created_at)
  VALUES (p_event_id, v_campaign.id, p_submission_id, v_submission.clipper_id, v_final_added_views, v_clipper_share, v_platform_fee, v_final_cost, p_clipper_ref_id, CURRENT_TIMESTAMP);

  RETURN jsonb_build_object('success', true, 'final_cost', v_final_cost, 'final_added_views', v_final_added_views);
END;
$$ LANGUAGE plpgsql;


-- 4. Withdrawal Request
CREATE OR REPLACE FUNCTION request_withdrawal(
  p_payout_id VARCHAR(255),
  p_clipper_id VARCHAR(255),
  p_clipper_name VARCHAR(255),
  p_upi_id VARCHAR(255),
  p_amount_paise BIGINT,
  p_ledger_id VARCHAR(255)
) RETURNS JSONB AS $$
DECLARE
  v_total_earned BIGINT := 0;
  v_total_withdrawn BIGINT := 0;
  v_pending_withdrawal BIGINT := 0;
  v_available_balance BIGINT := 0;
  v_ref_id VARCHAR(255);
BEGIN
  -- Lock the user's profiles to ensure consistency
  PERFORM 1 FROM users WHERE id = p_clipper_id FOR UPDATE;

  -- Calculate total earned
  SELECT COALESCE(SUM(amount), 0) INTO v_total_earned
  FROM financial_ledger
  WHERE user_id = p_clipper_id AND reference_type = 'clipper_earning' AND status = 'completed';

  -- Calculate total withdrawn
  SELECT COALESCE(SUM(amount), 0) INTO v_total_withdrawn
  FROM financial_ledger
  WHERE user_id = p_clipper_id AND reference_type = 'withdrawal_completed' AND status = 'completed';

  -- Calculate pending withdrawal
  SELECT COALESCE(SUM(amount), 0) INTO v_pending_withdrawal
  FROM financial_ledger
  WHERE user_id = p_clipper_id AND reference_type = 'withdrawal_request' AND status = 'pending';

  v_available_balance := v_total_earned - v_total_withdrawn - v_pending_withdrawal;

  IF v_available_balance < p_amount_paise THEN
    RAISE EXCEPTION 'Insufficient earnings balance. Available is % paise. Tried withdrawing % paise.', v_available_balance, p_amount_paise;
  END IF;

  v_ref_id := 'payout-request-' || p_payout_id;

  -- Create payout request
  INSERT INTO payout_requests (id, clipper_id, clipper_name, upi_id, amount, status, created_at)
  VALUES (p_payout_id, p_clipper_id, p_clipper_name, p_upi_id, p_amount_paise, 'Processing', CURRENT_TIMESTAMP);

  -- Create pending ledger entry
  INSERT INTO financial_ledger (id, reference_id, reference_type, from_account, to_account, user_id, amount, status, description, created_at)
  VALUES (p_ledger_id, v_ref_id, 'withdrawal_request', 'clipper_earnings:' || p_clipper_id, 'clipper_pending_withdrawal:' || p_clipper_id, p_clipper_id, p_amount_paise, 'pending', 'Withdrawal request to UPI: ' || p_upi_id, CURRENT_TIMESTAMP);

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql;


-- 5. Payout Completion
CREATE OR REPLACE FUNCTION complete_payout(
  p_payout_id VARCHAR(255),
  p_ledger_id VARCHAR(255),
  p_tx_id VARCHAR(255)
) RETURNS JSONB AS $$
DECLARE
  v_payout RECORD;
  v_ref_id VARCHAR(255);
  v_comp_ref_id VARCHAR(255);
BEGIN
  -- 1. Lock payout request row
  SELECT * FROM payout_requests WHERE id = p_payout_id FOR UPDATE INTO v_payout;
  IF v_payout IS NULL THEN
    RAISE EXCEPTION 'Payout request not found';
  END IF;

  IF v_payout.status <> 'Processing' THEN
    RAISE EXCEPTION 'Payout request has already been processed';
  END IF;

  v_ref_id := 'payout-request-' || p_payout_id;
  v_comp_ref_id := 'payout-complete-' || p_payout_id;

  -- 2. Update payout request status to Completed
  UPDATE payout_requests SET status = 'Completed' WHERE id = p_payout_id;

  -- 3. Update original ledger entry to completed
  UPDATE financial_ledger SET status = 'completed' WHERE reference_id = v_ref_id;

  -- 4. Record withdrawal completed ledger entry
  INSERT INTO financial_ledger (id, reference_id, reference_type, from_account, to_account, user_id, amount, status, description, created_at)
  VALUES (p_ledger_id, v_comp_ref_id, 'withdrawal_completed', 'clipper_pending_withdrawal:' || v_payout.clipper_id, 'External (UPI)', v_payout.clipper_id, v_payout.amount, 'completed', 'Withdrawal completed to UPI: ' || v_payout.upi_id, CURRENT_TIMESTAMP);

  -- 5. Record wallet history
  INSERT INTO wallet_history (id, user_id, type, amount, status, description, created_at)
  VALUES (p_tx_id, v_payout.clipper_id, 'withdrawal', v_payout.amount, 'Completed', 'Withdrawn to UPI: ' || v_payout.upi_id, CURRENT_TIMESTAMP);

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql;


-- 6. Payout Failure
CREATE OR REPLACE FUNCTION fail_payout(
  p_payout_id VARCHAR(255),
  p_ledger_id VARCHAR(255),
  p_tx_id VARCHAR(255)
) RETURNS JSONB AS $$
DECLARE
  v_payout RECORD;
  v_ref_id VARCHAR(255);
  v_fail_ref_id VARCHAR(255);
BEGIN
  -- 1. Lock payout request row
  SELECT * FROM payout_requests WHERE id = p_payout_id FOR UPDATE INTO v_payout;
  IF v_payout IS NULL THEN
    RAISE EXCEPTION 'Payout request not found';
  END IF;

  IF v_payout.status <> 'Processing' THEN
    RAISE EXCEPTION 'Payout request has already been processed';
  END IF;

  v_ref_id := 'payout-request-' || p_payout_id;
  v_fail_ref_id := 'payout-failed-' || p_payout_id;

  -- 2. Update payout request status to Failed
  UPDATE payout_requests SET status = 'Failed' WHERE id = p_payout_id;

  -- 3. Update original ledger entry to reversed
  UPDATE financial_ledger SET status = 'reversed' WHERE reference_id = v_ref_id;

  -- 4. Record withdrawal failed ledger entry
  INSERT INTO financial_ledger (id, reference_id, reference_type, from_account, to_account, user_id, amount, status, description, created_at)
  VALUES (p_ledger_id, v_fail_ref_id, 'withdrawal_failed', 'clipper_pending_withdrawal:' || v_payout.clipper_id, 'clipper_earnings:' || v_payout.clipper_id, v_payout.clipper_id, v_payout.amount, 'completed', 'Withdrawal failed. Refunded to available balance.', CURRENT_TIMESTAMP);

  -- 5. Record wallet history
  INSERT INTO wallet_history (id, user_id, type, amount, status, description, created_at)
  VALUES (p_tx_id, v_payout.clipper_id, 'deposit', v_payout.amount, 'Completed', 'Withdrawn request failed. Refunded to available balance.', CURRENT_TIMESTAMP);

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql;
