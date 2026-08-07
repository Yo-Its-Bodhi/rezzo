CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE reservation_status AS ENUM (
  'confirmed', 'arrived', 'seated', 'completed', 'cancelled', 'late_cancelled', 'no_show'
);
CREATE TYPE booking_source AS ENUM ('online', 'phone', 'staff', 'waitlist');
CREATE TYPE waitlist_status AS ENUM ('waiting', 'offered', 'accepted', 'declined', 'expired', 'removed');

CREATE TABLE restaurant_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_name text NOT NULL DEFAULT 'La Chingada',
  timezone text NOT NULL DEFAULT 'America/Toronto',
  reservation_duration_minutes integer NOT NULL DEFAULT 120 CHECK (reservation_duration_minutes > 0),
  starts_per_clock_hour integer NOT NULL DEFAULT 3 CHECK (starts_per_clock_hour > 0),
  max_online_party_size integer NOT NULL DEFAULT 6 CHECK (max_online_party_size > 0),
  self_service_cutoff_hours integer NOT NULL DEFAULT 24 CHECK (self_service_cutoff_hours >= 0),
  grace_period_minutes integer NOT NULL DEFAULT 15 CHECK (grace_period_minutes >= 0),
  waitlist_offer_minutes integer NOT NULL DEFAULT 5 CHECK (waitlist_offer_minutes > 0),
  online_booking_paused boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE dining_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  area text NOT NULL,
  capacity integer NOT NULL CHECK (capacity > 0),
  reservable boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE service_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  opens_at time NOT NULL,
  closes_at time NOT NULL,
  slot_interval_minutes integer NOT NULL DEFAULT 15 CHECK (slot_interval_minutes > 0),
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE happy_hour_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  starts_at time NOT NULL,
  ends_at time NOT NULL,
  min_table_capacity integer NOT NULL DEFAULT 1,
  max_table_capacity integer NOT NULL,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX guests_phone_idx ON guests (phone);
CREATE INDEX guests_email_idx ON guests (lower(email));

CREATE TABLE policy_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version integer NOT NULL UNIQUE,
  content text NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  confirmation_code text NOT NULL UNIQUE,
  guest_id uuid NOT NULL REFERENCES guests(id),
  party_size integer NOT NULL CHECK (party_size BETWEEN 1 AND 6),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status reservation_status NOT NULL DEFAULT 'confirmed',
  source booking_source NOT NULL DEFAULT 'online',
  guest_request text,
  staff_note text,
  policy_version_id uuid NOT NULL REFERENCES policy_versions(id),
  policy_accepted_at timestamptz NOT NULL,
  manage_token_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX reservations_starts_idx ON reservations (starts_at);

CREATE TABLE reservation_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL UNIQUE REFERENCES reservations(id) ON DELETE CASCADE,
  table_id uuid NOT NULL REFERENCES dining_tables(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  EXCLUDE USING gist (
    table_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  )
);

CREATE TABLE table_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL REFERENCES dining_tables(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX table_blocks_table_time_idx ON table_blocks (table_id, starts_at, ends_at);

CREATE TABLE waitlist_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id uuid NOT NULL REFERENCES guests(id),
  party_size integer NOT NULL CHECK (party_size BETWEEN 1 AND 6),
  status waitlist_status NOT NULL DEFAULT 'waiting',
  quoted_minutes integer,
  notes text,
  joined_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE waitlist_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  waitlist_entry_id uuid NOT NULL REFERENCES waitlist_entries(id),
  table_id uuid NOT NULL REFERENCES dining_tables(id),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  responded_at timestamptz,
  accepted boolean,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL CHECK (channel IN ('sms', 'email')),
  template text NOT NULL,
  recipient text NOT NULL,
  payload jsonb NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE staff_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'manager', 'host')),
  password_hash text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id uuid REFERENCES staff_users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  reason text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO restaurant_settings (restaurant_name) VALUES ('La Chingada');
INSERT INTO dining_tables (name, area, capacity, reservable, sort_order) VALUES
  ('T1', 'Dining Room', 2, true, 1),
  ('T2', 'Dining Room', 2, true, 2),
  ('T3', 'Dining Room', 4, true, 3),
  ('T4', 'Dining Room', 4, true, 4),
  ('T5', 'Dining Room', 4, true, 5),
  ('T6', 'Dining Room', 6, true, 6),
  ('T7', 'Dining Room', 6, true, 7),
  ('P1', 'Patio', 4, false, 8);

INSERT INTO service_periods (weekday, opens_at, closes_at, slot_interval_minutes) VALUES
  (0, '12:00', '21:00', 15),
  (1, '16:00', '22:00', 15),
  (2, '16:00', '22:00', 15),
  (3, '16:00', '22:00', 15),
  (4, '12:00', '23:00', 15),
  (5, '12:00', '23:00', 15),
  (6, '12:00', '23:00', 15);
