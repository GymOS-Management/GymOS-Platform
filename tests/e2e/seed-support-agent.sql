-- A SupportAgent for operations-journey.spec.ts: the maintenance step must prove that a caller
-- without settings.manage is refused, and the SuperAdmin passes by design.
--
-- Password: copied from the seeded SuperAdmin (e2e@gymos.test), so the account signs in with
-- e2e-super-admin-password. Argon2 verification reads salt and parameters from the hash string
-- itself, so a copied hash verifies for a different user. Local test container only.
SET NOCOUNT ON;

DECLARE @hash nvarchar(500) = (
    SELECT TOP 1 password_hash FROM platform.users WHERE normalized_email = 'E2E@GYMOS.TEST');
IF @hash IS NULL
    THROW 50000, 'The seeded SuperAdmin e2e@gymos.test does not exist yet. Start the backend first (tests/e2e/README.md, step 2).', 1;

DECLARE @roleId uniqueidentifier = (
    SELECT TOP 1 id FROM platform.roles
    WHERE normalized_name = 'SUPPORTAGENT' AND scope = 1 /* RoleScope.Platform */ AND tenant_id IS NULL);
IF @roleId IS NULL
    THROW 50000, 'The SupportAgent role is missing; the identity catalog sync has not run.', 1;

DECLARE @userId uniqueidentifier = (
    SELECT TOP 1 id FROM platform.users WHERE normalized_email = 'E2E-SUPPORT@GYMOS.TEST');

IF @userId IS NULL
BEGIN
    SET @userId = NEWID();
    INSERT INTO platform.users
        (id, email, normalized_email, password_hash, first_name, last_name, status,
         suspension_reason, failed_login_attempts, locked_out_until_utc, last_login_at_utc,
         password_changed_at_utc, security_stamp, created_at_utc, updated_at_utc)
    VALUES
        (@userId, 'e2e-support@gymos.test', 'E2E-SUPPORT@GYMOS.TEST', @hash, 'E2E', 'Support',
         2 /* UserStatus.Active */,
         NULL, 0, NULL, NULL, SYSDATETIMEOFFSET(), NEWID(), SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());
END
ELSE
    -- A previous run's lockout or password change must not fail this one.
    UPDATE platform.users
    SET password_hash = @hash, status = 2 /* UserStatus.Active */, failed_login_attempts = 0,
        locked_out_until_utc = NULL
    WHERE id = @userId;

IF NOT EXISTS (SELECT 1 FROM platform.user_roles
               WHERE user_id = @userId AND role_id = @roleId AND tenant_id IS NULL)
    INSERT INTO platform.user_roles (id, user_id, role_id, tenant_id)
    VALUES (NEWID(), @userId, @roleId, NULL);

SELECT COUNT(*) FROM platform.user_roles ur
JOIN platform.users u ON u.id = ur.user_id
WHERE u.normalized_email = 'E2E-SUPPORT@GYMOS.TEST' AND ur.role_id = @roleId;
