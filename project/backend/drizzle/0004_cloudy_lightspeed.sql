DO $$
DECLARE
    target_admin_id uuid;
    admin_count integer;
    orphan_count integer;
    unassigned_count integer;
BEGIN
    -- 1. Ensure at least one active Admin exists
    SELECT COUNT(*) INTO admin_count FROM "users" WHERE "role" = 'admin' AND "is_active" = true;
    IF admin_count = 0 THEN
        RAISE EXCEPTION 'Legacy ownership migration aborted: No active Admin account exists in "users".';
    END IF;

    -- 2. Ensure exactly one active Admin exists and select its ID
    SELECT COUNT(*) INTO admin_count FROM "users" WHERE "role" = 'admin' AND "is_active" = true;
    IF admin_count <> 1 THEN
        RAISE EXCEPTION 'Legacy ownership migration aborted: Expected exactly one active Admin, found %.', admin_count;
    END IF;
    SELECT "id" INTO target_admin_id FROM "users" WHERE "role" = 'admin' AND "is_active" = true;

    IF target_admin_id IS NULL THEN
        RAISE EXCEPTION 'Legacy ownership migration aborted: Failed to resolve target Admin UUID.';
    END IF;

    -- 3. Assign all legacy transcripts where user_id IS NULL to the first Admin
    UPDATE "transcripts"
    SET "user_id" = target_admin_id
    WHERE "user_id" IS NULL;

    -- 4. Verify no transcripts have NULL user_id
    SELECT COUNT(*) INTO unassigned_count FROM "transcripts" WHERE "user_id" IS NULL;
    IF unassigned_count > 0 THEN
        RAISE EXCEPTION 'Legacy ownership migration failed: % transcript(s) remain with NULL user_id.', unassigned_count;
    END IF;

    -- 5. Verify no transcripts reference a non-existent user (orphaned references)
    SELECT COUNT(*) INTO orphan_count
    FROM "transcripts" t
    LEFT JOIN "users" u ON t."user_id" = u."id"
    WHERE u."id" IS NULL;

    IF orphan_count > 0 THEN
        RAISE EXCEPTION 'Legacy ownership migration failed: % transcript(s) reference non-existent users.', orphan_count;
    END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "transcripts" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;