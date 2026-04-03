BEGIN;

-- Optional but safe
SET search_path TO public;

-- USER
INSERT INTO users (
  id, email, name, timezone, locale, created_at, updated_at
)
VALUES (
  'usr_demo_001',
  'demo@lifecommand.local',
  'Demo User',
  'America/New_York',
  'en-US',
  NOW(),
  NOW()
)
ON CONFLICT (email) DO NOTHING;

-- OBLIGATIONS

-- Netflix (renewing tomorrow)
INSERT INTO obligations (
  id, user_id, type, title, description, vendor, amount, currency,
  due_date, recurrence, source, status,
  confidence_score, urgency_score, importance_score,
  effort_level, impact_level,
  created_at, updated_at
)
VALUES (
  'obl_demo_001',
  'usr_demo_001',
  'SUBSCRIPTION',
  'Netflix Subscription',
  'Monthly streaming plan',
  'Netflix',
  15.49,
  'USD',
  NOW() + INTERVAL '1 day',
  'monthly',
  'MANUAL',
  'ACTIVE',
  0.95,
  82,
  60,
  'LOW',
  'MEDIUM',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- Credit card bill
INSERT INTO obligations (
  id, user_id, type, title, vendor, amount, currency,
  due_date, recurrence, source, status,
  confidence_score, urgency_score, importance_score,
  effort_level, impact_level,
  created_at, updated_at
)
VALUES (
  'obl_demo_002',
  'usr_demo_001',
  'BILL',
  'Chase Credit Card Bill',
  'Chase',
  245.00,
  'USD',
  NOW() + INTERVAL '2 days',
  'monthly',
  'MANUAL',
  'ACTIVE',
  0.97,
  91,
  92,
  'MEDIUM',
  'HIGH',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- Insurance renewal
INSERT INTO obligations (
  id, user_id, type, title, vendor,
  due_date, source, status,
  confidence_score, urgency_score, importance_score,
  effort_level, impact_level,
  created_at, updated_at
)
VALUES (
  'obl_demo_003',
  'usr_demo_001',
  'RENEWAL',
  'Car Insurance Renewal',
  'GEICO',
  NOW() + INTERVAL '5 days',
  'MANUAL',
  'ACTIVE',
  0.90,
  73,
  88,
  'MEDIUM',
  'HIGH',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- Internet bill
INSERT INTO obligations (
  id, user_id, type, title, vendor, amount, currency,
  due_date, recurrence, source, status,
  confidence_score, urgency_score, importance_score,
  effort_level, impact_level,
  created_at, updated_at
)
VALUES (
  'obl_demo_004',
  'usr_demo_001',
  'BILL',
  'Internet Bill',
  'Comcast',
  79.99,
  'USD',
  NOW() + INTERVAL '8 days',
  'monthly',
  'MANUAL',
  'ACTIVE',
  0.93,
  45,
  58,
  'LOW',
  'MEDIUM',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- Commitment
INSERT INTO obligations (
  id, user_id, type, title,
  due_date, source, status,
  confidence_score, urgency_score, importance_score,
  effort_level, impact_level,
  created_at, updated_at
)
VALUES (
  'obl_demo_005',
  'usr_demo_001',
  'COMMITMENT',
  'Submit reimbursement form',
  NOW() + INTERVAL '3 days',
  'MANUAL',
  'ACTIVE',
  0.99,
  52,
  55,
  'LOW',
  'MEDIUM',
  NOW() - INTERVAL '3 days',
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- REMINDERS
INSERT INTO reminders (
  id, user_id, obligation_id, title,
  scheduled_for, status, created_at, updated_at
)
VALUES (
  'rem_demo_001',
  'usr_demo_001',
  'obl_demo_001',
  'Review Netflix before renewal',
  NOW() + INTERVAL '12 hours',
  'SCHEDULED',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

COMMIT;