---------------------------------------------
-- Function: validate_iana_timezone
-- IANA（pg_timezone_names）に存在しないタイムゾーン名の登録・更新を防止するトリガー関数
---------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_iana_timezone()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_timezone_names WHERE name = NEW.timezone
  ) THEN
    RAISE EXCEPTION 'Invalid IANA timezone: %', NEW.timezone;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.validate_iana_timezone() IS 'IANAタイムゾーン名の妥当性を検証するトリガー関数（pg_timezone_names準拠）';
