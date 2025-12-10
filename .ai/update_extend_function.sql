-- Atualizar função para registrar pagamento manual (ao invés de extensão)
-- Execute no Supabase SQL Editor

CREATE OR REPLACE FUNCTION admin_extend_subscription(
  p_subscription_id uuid,
  p_months integer,
  p_reason text,
  p_admin_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_end timestamp with time zone;
  v_new_end timestamp with time zone;
  v_is_expired boolean;
BEGIN
  -- Get current expiration
  SELECT current_period_end INTO v_current_end
  FROM subscriptions
  WHERE id = p_subscription_id;
  
  IF v_current_end IS NULL THEN
    RETURN jsonb_build_object('error', 'Assinatura não encontrada');
  END IF;
  
  -- Check if expired
  v_is_expired := v_current_end < now();
  
  -- Calculate new expiration
  -- If expired, start from now. If not expired, extend from current end.
  IF v_is_expired THEN
    v_new_end := now() + (p_months || ' months')::interval;
  ELSE
    v_new_end := v_current_end + (p_months || ' months')::interval;
  END IF;
  
  -- Update subscription (renew/activate)
  UPDATE subscriptions
  SET 
    current_period_end = v_new_end,
    status = 'active',  -- Reactivate if was canceled
    manually_extended_until = NULL,  -- Clear manual extension (now it's a real renewal)
    admin_notes = COALESCE(admin_notes || E'\n', '') || 
                  to_char(now(), 'DD/MM/YYYY HH24:MI') || ' - ' || p_reason,
    last_modified_by = p_admin_id,
    last_modified_at = now(),
    updated_at = now()
  WHERE id = p_subscription_id;
  
  -- Log action
  INSERT INTO admin_activity_logs (admin_id, action, target_user_id, details)
  SELECT 
    p_admin_id,
    'renew_subscription',
    s.user_id,
    jsonb_build_object(
      'subscription_id', p_subscription_id,
      'months_added', p_months,
      'new_expiry', v_new_end,
      'was_expired', v_is_expired,
      'reason', p_reason
    )
  FROM subscriptions s
  WHERE s.id = p_subscription_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'new_expiry', v_new_end,
    'was_expired', v_is_expired
  );
END;
$$;
