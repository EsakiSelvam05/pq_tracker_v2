/*
  # Create PQ Records Table

  1. New Tables
    - `pq_records`
      - `id` (uuid, primary key, auto-generated)
      - `created_at` (timestamp with timezone, default now)
      - `updated_at` (timestamp with timezone, default now, auto-updated)
      - `date` (date)
      - `shipper_name` (text, required)
      - `buyer` (text, required)
      - `invoice_number` (text, required, unique)
      - `commodity` (text, required)
      - `shipping_bill_received` (boolean)
      - `pq_status` (text)
      - `pq_hardcopy` (text)
      - `permit_copy_status` (text)
      - `destination_port` (text)
      - `remarks` (text)
      - `files` (jsonb for file metadata)

  2. Security
    - Enable RLS on `pq_records` table
    - Add policies for authenticated users to manage their data

  3. Triggers
    - Auto-update `updated_at` timestamp on record changes
*/

-- Create the updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create the pq_records table
CREATE TABLE IF NOT EXISTS pq_records (
  id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
  created_at timestamp with time zone NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp with time zone NULL DEFAULT CURRENT_TIMESTAMP,
  date date NULL,
  shipper_name text NOT NULL,
  buyer text NOT NULL,
  invoice_number text NOT NULL,
  commodity text NOT NULL,
  shipping_bill_received boolean NULL DEFAULT false,
  pq_status text NULL DEFAULT 'Pending',
  pq_hardcopy text NULL DEFAULT 'Not Received',
  permit_copy_status text NULL DEFAULT 'Not Required',
  destination_port text NULL,
  remarks text NULL,
  files jsonb NULL,
  CONSTRAINT pq_records_pkey PRIMARY KEY (id),
  CONSTRAINT pq_records_invoice_number_key UNIQUE (invoice_number)
);

-- Enable Row Level Security
ALTER TABLE pq_records ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users
CREATE POLICY "Users can view all PQ records"
  ON pq_records
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert PQ records"
  ON pq_records
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update PQ records"
  ON pq_records
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete PQ records"
  ON pq_records
  FOR DELETE
  TO authenticated
  USING (true);

-- Create the trigger for auto-updating updated_at
DROP TRIGGER IF EXISTS update_pq_records_updated_at ON pq_records;
CREATE TRIGGER update_pq_records_updated_at
  BEFORE UPDATE ON pq_records
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_pq_records_created_at ON pq_records(created_at);
CREATE INDEX IF NOT EXISTS idx_pq_records_date ON pq_records(date);
CREATE INDEX IF NOT EXISTS idx_pq_records_shipper_name ON pq_records(shipper_name);
CREATE INDEX IF NOT EXISTS idx_pq_records_pq_status ON pq_records(pq_status);
CREATE INDEX IF NOT EXISTS idx_pq_records_invoice_number ON pq_records(invoice_number);