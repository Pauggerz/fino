-- Atomic account balance adjustment.
-- Used by the offline sync fallback when insert_tx_with_balance RPC is unavailable.
-- Safe under concurrent writes — uses SET balance = balance + delta, not read-then-write.

CREATE OR REPLACE FUNCTION adjust_account_balance(
  p_account_id UUID,
  p_delta      NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE accounts
  SET balance = balance + p_delta
  WHERE id = p_account_id;
END;
$$;

-- Allow authenticated users to call this function
GRANT EXECUTE ON FUNCTION adjust_account_balance(UUID, NUMERIC) TO authenticated;
