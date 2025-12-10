-- Database function to deactivate expired subscriptions
-- This will be called by a cron job daily

CREATE OR REPLACE FUNCTION deactivate_expired_subscriptions()
RETURNS TABLE (
  deactivated_count integer,
  deactivated_users jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer := 0;
  v_users jsonb := '[]'::jsonb;
  v_user record;
BEGIN
  -- Find and update expired subscriptions
  FOR v_user IN
    SELECT 
      s.id as subscription_id,
      s.user_id,
      s.current_period_end,
      s.manually_extended_until,
      ep.nome_exibicao,
      ep.contato
    FROM subscriptions s
    LEFT JOIN empresa_perfil ep ON ep.user_id = s.user_id
    WHERE s.status = 'active'
      AND COALESCE(s.manually_extended_until, s.current_period_end) < now()
  LOOP
    -- Update subscription to canceled
    UPDATE subscriptions
    SET 
      status = 'canceled',
      updated_at = now()
    WHERE id = v_user.subscription_id;
    
    -- Increment counter
    v_count := v_count + 1;
    
    -- Add to list of deactivated users
    v_users := v_users || jsonb_build_object(
      'user_id', v_user.user_id,
      'company', v_user.nome_exibicao,
      'email', v_user.contato,
      'expired_at', COALESCE(v_user.manually_extended_until, v_user.current_period_end)
    );
  END LOOP;
  
  -- Return results
  RETURN QUERY SELECT v_count, v_users;
END;
$$;

-- Test the function (optional)
-- SELECT * FROM deactivate_expired_subscriptions();

-- Create a log table for cron job executions
CREATE TABLE IF NOT EXISTS subscription_cron_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  executed_at timestamp with time zone DEFAULT now(),
  deactivated_count integer,
  deactivated_users jsonb,
  error text
);

-- Function to run the cron job and log results
CREATE OR REPLACE FUNCTION run_subscription_expiration_check()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result record;
BEGIN
  -- Run the deactivation function
  SELECT * INTO v_result FROM deactivate_expired_subscriptions();
  
  -- Log the execution
  INSERT INTO subscription_cron_logs (deactivated_count, deactivated_users)
  VALUES (v_result.deactivated_count, v_result.deactivated_users);
  
EXCEPTION WHEN OTHERS THEN
  -- Log errors
  INSERT INTO subscription_cron_logs (deactivated_count, error)
  VALUES (0, SQLERRM);
END;
$$;
