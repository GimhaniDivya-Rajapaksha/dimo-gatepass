-- Add INITIATOR_OUT to GatePassStatus enum (two-step gate out for Location Transfer and SUB_OUT)
ALTER TYPE "GatePassStatus" ADD VALUE IF NOT EXISTS 'INITIATOR_OUT';
