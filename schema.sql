-- ==========================================
-- Production-Ready PostgreSQL Schema
-- Platform: Supabase / PostgreSQL
-- Matches current backend models and mappings
-- ==========================================

-- Enable any required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. TROV STATE / SYSTEM BACKUP TABLE
CREATE TABLE IF NOT EXISTS trov_state (
    id VARCHAR(255) PRIMARY KEY,
    state JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. USERS TABLE
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

-- 3. CLIPPER PROFILES TABLE
CREATE TABLE IF NOT EXISTS clipper_profiles (
    user_id VARCHAR(255) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    upi_id VARCHAR(255) DEFAULT '',
    instagram_handle VARCHAR(255) DEFAULT '',
    youtube_handle VARCHAR(255) DEFAULT '',
    kyc_status VARCHAR(50) NOT NULL DEFAULT 'Pending' CHECK (kyc_status IN ('Pending', 'Verified', 'Rejected')),
    kyc_doc_url TEXT DEFAULT '',
    kyc_aadhaar VARCHAR(50) DEFAULT '',
    kyc_pan VARCHAR(50) DEFAULT ''
);

-- 4. CREATOR PROFILES TABLE
CREATE TABLE IF NOT EXISTS creator_profiles (
    user_id VARCHAR(255) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    channel_url VARCHAR(255) DEFAULT '',
    wallet_balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00
);

-- 5. CAMPAIGNS TABLE
CREATE TABLE IF NOT EXISTS campaigns (
    id VARCHAR(255) PRIMARY KEY,
    creator_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    creator_name VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    source_video_url TEXT NOT NULL,
    cpm NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    budget NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    spent NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    instructions TEXT,
    platform VARCHAR(50) NOT NULL CHECK (platform IN ('instagram', 'youtube', 'both', 'facebook', 'twitter')),
    min_duration INTEGER NOT NULL DEFAULT 0,
    deadline TIMESTAMPTZ NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Active', 'Paused', 'Completed')),
    icon_url TEXT,
    campaign_type VARCHAR(50) DEFAULT 'clipping' CHECK (campaign_type IN ('ugc', 'clipping', 'both')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 6. SUBMISSIONS TABLE
CREATE TABLE IF NOT EXISTS submissions (
    id VARCHAR(255) PRIMARY KEY,
    campaign_id VARCHAR(255) NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    campaign_title VARCHAR(255) NOT NULL,
    clipper_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    clipper_name VARCHAR(255) NOT NULL,
    submitted_url TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
    feedback TEXT DEFAULT '',
    approved_at TIMESTAMPTZ DEFAULT NULL,
    views INTEGER NOT NULL DEFAULT 0,
    last_fetched_views TIMESTAMPTZ DEFAULT NULL
);

-- 7. WALLET HISTORY TABLE
CREATE TABLE IF NOT EXISTS wallet_history (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('deposit', 'payment', 'withdrawal', 'commission')),
    amount NUMERIC(15, 2) NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('Pending', 'Completed', 'Failed')),
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 8. PAYOUT REQUESTS TABLE
CREATE TABLE IF NOT EXISTS payout_requests (
    id VARCHAR(255) PRIMARY KEY,
    clipper_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    clipper_name VARCHAR(255) NOT NULL,
    upi_id VARCHAR(255) NOT NULL,
    amount NUMERIC(15, 2) NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('Processing', 'Completed', 'Failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 9. CONTACT MESSAGES / SUPPORT TICKETS TABLE
CREATE TABLE IF NOT EXISTS contacts (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- INDEXES FOR HIGH-PERFORMANCE QUERYING
-- ==========================================

-- Users indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Campaigns indexes
CREATE INDEX IF NOT EXISTS idx_campaigns_creator_id ON campaigns(creator_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);

-- Submissions indexes
CREATE INDEX IF NOT EXISTS idx_submissions_campaign_id ON submissions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_submissions_clipper_id ON submissions(clipper_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);

-- Wallet history indexes
CREATE INDEX IF NOT EXISTS idx_wallet_history_user_id ON wallet_history(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_history_created_at ON wallet_history(created_at DESC);

-- Payout requests indexes
CREATE INDEX IF NOT EXISTS idx_payout_requests_clipper_id ON payout_requests(clipper_id);
CREATE INDEX IF NOT EXISTS idx_payout_requests_status ON payout_requests(status);

-- Contacts indexes
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_created_at ON contacts(created_at DESC);
