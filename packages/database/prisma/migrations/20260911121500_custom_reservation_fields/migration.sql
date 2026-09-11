BEGIN;

CREATE TYPE "FieldType" AS ENUM ('TEXT', 'TEXTAREA', 'NUMBER', 'SELECT', 'RADIO', 'CHECKBOX', 'MULTISELECT', 'DATE', 'TIME');

CREATE TABLE "FieldDefinition" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "experienceId" UUID NOT NULL,
    "revisionId" UUID NOT NULL,
    "key" VARCHAR(63) NOT NULL,
    "label" TEXT NOT NULL,
    "type" "FieldType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,
    "placeholder" TEXT,
    "helpText" TEXT,
    "validation" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "FieldDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FieldOption" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "experienceId" UUID NOT NULL,
    "revisionId" UUID NOT NULL,
    "fieldDefinitionId" UUID NOT NULL,
    "key" VARCHAR(63) NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "FieldOption_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReservationAnswer" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "experienceId" UUID NOT NULL,
    "revisionId" UUID NOT NULL,
    "reservationId" UUID NOT NULL,
    "fieldDefinitionId" UUID NOT NULL,
    "value" JSONB NOT NULL,
    "snapshotVersion" INTEGER NOT NULL DEFAULT 1,
    "definitionSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReservationAnswer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FieldDefinition_organizationId_experienceId_revisionId_posi_idx" ON "FieldDefinition"("organizationId", "experienceId", "revisionId", "position", "id");
CREATE UNIQUE INDEX "FieldDefinition_organizationId_experienceId_revisionId_key_key" ON "FieldDefinition"("organizationId", "experienceId", "revisionId", "key");
CREATE UNIQUE INDEX "FieldDefinition_organizationId_experienceId_revisionId_id_key" ON "FieldDefinition"("organizationId", "experienceId", "revisionId", "id");
CREATE INDEX "FieldOption_organizationId_experienceId_revisionId_fieldDef_idx" ON "FieldOption"("organizationId", "experienceId", "revisionId", "fieldDefinitionId", "position", "id");
CREATE UNIQUE INDEX "FieldOption_organizationId_experienceId_revisionId_fieldDef_key" ON "FieldOption"("organizationId", "experienceId", "revisionId", "fieldDefinitionId", "key");
CREATE UNIQUE INDEX "ReservationAnswer_organizationId_reservationId_fieldDefinit_key" ON "ReservationAnswer"("organizationId", "reservationId", "fieldDefinitionId");
CREATE UNIQUE INDEX "Reservation_organizationId_experienceId_revisionId_id_key" ON "Reservation"("organizationId", "experienceId", "revisionId", "id");

ALTER TABLE "FieldDefinition" ADD CONSTRAINT "FieldDefinition_organizationId_experienceId_revisionId_fkey" FOREIGN KEY ("organizationId", "experienceId", "revisionId") REFERENCES "ExperienceRevision"("organizationId", "experienceId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "FieldOption" ADD CONSTRAINT "FieldOption_organizationId_experienceId_revisionId_fieldDe_fkey" FOREIGN KEY ("organizationId", "experienceId", "revisionId", "fieldDefinitionId") REFERENCES "FieldDefinition"("organizationId", "experienceId", "revisionId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "ReservationAnswer" ADD CONSTRAINT "ReservationAnswer_organizationId_experienceId_revisionId_r_fkey" FOREIGN KEY ("organizationId", "experienceId", "revisionId", "reservationId") REFERENCES "Reservation"("organizationId", "experienceId", "revisionId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "ReservationAnswer" ADD CONSTRAINT "ReservationAnswer_organizationId_experienceId_revisionId_f_fkey" FOREIGN KEY ("organizationId", "experienceId", "revisionId", "fieldDefinitionId") REFERENCES "FieldDefinition"("organizationId", "experienceId", "revisionId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE public."FieldDefinition"
  ADD CONSTRAINT bizzres_field_key_check CHECK (
    "key"::text COLLATE "C" ~ '^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$'
    AND "key" <> ALL (ARRAY['full_name','email','phone','customer_full_name','customer_email','customer_phone','occurrence','occurrence_id','participant_count','start_at','end_at','timezone','status','price','total_amount','currency'])
    AND NOT ("key" LIKE ANY (ARRAY['system\_%','customer\_%','booking\_%','reservation\_%','payment\_%']))
  ),
  ADD CONSTRAINT bizzres_field_label_check CHECK (btrim("label") <> ''),
  ADD CONSTRAINT bizzres_field_position_check CHECK ("position" >= 0),
  ADD CONSTRAINT bizzres_field_placeholder_check CHECK ("placeholder" IS NULL OR btrim("placeholder") <> ''),
  ADD CONSTRAINT bizzres_field_help_text_check CHECK ("helpText" IS NULL OR btrim("helpText") <> ''),
  ADD CONSTRAINT bizzres_field_validation_object_check CHECK ("validation" IS NULL OR jsonb_typeof("validation") = 'object');

ALTER TABLE public."FieldOption"
  ADD CONSTRAINT bizzres_option_key_check CHECK ("key"::text COLLATE "C" ~ '^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$'),
  ADD CONSTRAINT bizzres_option_label_check CHECK (btrim("label") <> ''),
  ADD CONSTRAINT bizzres_option_position_check CHECK ("position" >= 0);

ALTER TABLE public."ReservationAnswer"
  ADD CONSTRAINT bizzres_answer_snapshot_version_check CHECK ("snapshotVersion" > 0),
  ADD CONSTRAINT bizzres_answer_snapshot_object_check CHECK (jsonb_typeof("definitionSnapshot") = 'object');

CREATE FUNCTION public.bizzres_assert_revision_is_draft(target_organization uuid, target_experience uuid, target_revision uuid)
RETURNS void LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE revision_published_at timestamptz;
BEGIN
  SELECT r."publishedAt" INTO revision_published_at
    FROM public."ExperienceRevision" r
    WHERE r."organizationId" = target_organization AND r."experienceId" = target_experience AND r."id" = target_revision
    FOR SHARE;
  IF FOUND AND revision_published_at IS NOT NULL THEN
    RAISE EXCEPTION 'Published experience revision children are immutable.' USING ERRCODE = '23514', CONSTRAINT = 'bizzres_published_revision_children_immutable';
  END IF;
END;
$$;

CREATE FUNCTION public.bizzres_guard_revision_field_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN PERFORM public.bizzres_assert_revision_is_draft(OLD."organizationId", OLD."experienceId", OLD."revisionId"); END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN PERFORM public.bizzres_assert_revision_is_draft(NEW."organizationId", NEW."experienceId", NEW."revisionId"); END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER bizzres_revision_field_immutability BEFORE INSERT OR UPDATE OR DELETE ON public."FieldDefinition" FOR EACH ROW EXECUTE FUNCTION public.bizzres_guard_revision_field_mutation();

CREATE FUNCTION public.bizzres_guard_field_option_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN PERFORM public.bizzres_assert_revision_is_draft(OLD."organizationId", OLD."experienceId", OLD."revisionId"); END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN PERFORM public.bizzres_assert_revision_is_draft(NEW."organizationId", NEW."experienceId", NEW."revisionId"); END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER bizzres_field_option_immutability BEFORE INSERT OR UPDATE OR DELETE ON public."FieldOption" FOR EACH ROW EXECUTE FUNCTION public.bizzres_guard_field_option_mutation();

CREATE FUNCTION public.bizzres_validate_field_option_type()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE field_type public."FieldType";
BEGIN
  SELECT f."type" INTO field_type FROM public."FieldDefinition" f
    WHERE f."organizationId" = NEW."organizationId" AND f."experienceId" = NEW."experienceId"
      AND f."revisionId" = NEW."revisionId" AND f."id" = NEW."fieldDefinitionId";
  IF FOUND AND field_type NOT IN ('SELECT', 'RADIO', 'MULTISELECT') THEN
    RAISE EXCEPTION 'Options are not allowed for this field type.' USING ERRCODE = '23514', CONSTRAINT = 'bizzres_option_field_type';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER bizzres_field_option_type BEFORE INSERT OR UPDATE ON public."FieldOption" FOR EACH ROW EXECUTE FUNCTION public.bizzres_validate_field_option_type();

CREATE FUNCTION public.bizzres_validate_reservation_answer()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  field_record public."FieldDefinition"%ROWTYPE;
  answer_text text;
  snapshot_options jsonb;
  item jsonb;
BEGIN
  SELECT * INTO field_record FROM public."FieldDefinition" f
    WHERE f."organizationId" = NEW."organizationId" AND f."experienceId" = NEW."experienceId"
      AND f."revisionId" = NEW."revisionId" AND f."id" = NEW."fieldDefinitionId";
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF NEW."value" = 'null'::jsonb THEN RAISE EXCEPTION 'Answer value cannot be null.' USING ERRCODE = '23514', CONSTRAINT = 'bizzres_answer_value_type'; END IF;

  IF field_record."type" IN ('TEXT', 'TEXTAREA') THEN
    IF jsonb_typeof(NEW."value") <> 'string' THEN RAISE EXCEPTION 'Expected string answer.' USING ERRCODE = '23514', CONSTRAINT = 'bizzres_answer_value_type'; END IF;
  ELSIF field_record."type" = 'NUMBER' THEN
    IF jsonb_typeof(NEW."value") <> 'string' OR (NEW."value" #>> '{}') COLLATE "C" !~ '^-?(0|[1-9][0-9]*)(\.[0-9]+)?$' THEN
      RAISE EXCEPTION 'Expected canonical decimal string.' USING ERRCODE = '23514', CONSTRAINT = 'bizzres_answer_value_type';
    END IF;
  ELSIF field_record."type" = 'CHECKBOX' THEN
    IF jsonb_typeof(NEW."value") <> 'boolean' THEN RAISE EXCEPTION 'Expected Boolean answer.' USING ERRCODE = '23514', CONSTRAINT = 'bizzres_answer_value_type'; END IF;
  ELSIF field_record."type" IN ('SELECT', 'RADIO') THEN
    IF jsonb_typeof(NEW."value") <> 'string' THEN RAISE EXCEPTION 'Expected option key.' USING ERRCODE = '23514', CONSTRAINT = 'bizzres_answer_value_type'; END IF;
    answer_text := NEW."value" #>> '{}';
    IF NOT EXISTS (SELECT 1 FROM public."FieldOption" o WHERE o."organizationId"=NEW."organizationId" AND o."experienceId"=NEW."experienceId" AND o."revisionId"=NEW."revisionId" AND o."fieldDefinitionId"=NEW."fieldDefinitionId" AND o."key"=answer_text) THEN
      RAISE EXCEPTION 'Unknown option key.' USING ERRCODE = '23514', CONSTRAINT = 'bizzres_answer_option_membership';
    END IF;
  ELSIF field_record."type" = 'MULTISELECT' THEN
    IF jsonb_typeof(NEW."value") <> 'array' THEN RAISE EXCEPTION 'Expected option-key array.' USING ERRCODE = '23514', CONSTRAINT = 'bizzres_answer_value_type'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(NEW."value") e WHERE jsonb_typeof(e) <> 'string')
       OR (SELECT count(*) FROM jsonb_array_elements(NEW."value")) <> (SELECT count(DISTINCT e #>> '{}') FROM jsonb_array_elements(NEW."value") e)
       OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(NEW."value") k WHERE NOT EXISTS (SELECT 1 FROM public."FieldOption" o WHERE o."organizationId"=NEW."organizationId" AND o."experienceId"=NEW."experienceId" AND o."revisionId"=NEW."revisionId" AND o."fieldDefinitionId"=NEW."fieldDefinitionId" AND o."key"=k)) THEN
      RAISE EXCEPTION 'Invalid multiselect options.' USING ERRCODE = '23514', CONSTRAINT = 'bizzres_answer_option_membership';
    END IF;
  ELSIF field_record."type" = 'DATE' THEN
    answer_text := CASE WHEN jsonb_typeof(NEW."value")='string' THEN NEW."value" #>> '{}' ELSE NULL END;
    BEGIN
      IF answer_text IS NULL OR answer_text COLLATE "C" !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR to_char(answer_text::date, 'YYYY-MM-DD') <> answer_text THEN RAISE invalid_datetime_format; END IF;
    EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Expected valid ISO date.' USING ERRCODE = '23514', CONSTRAINT = 'bizzres_answer_value_type'; END;
  ELSIF field_record."type" = 'TIME' THEN
    IF jsonb_typeof(NEW."value") <> 'string' OR (NEW."value" #>> '{}') COLLATE "C" !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
      RAISE EXCEPTION 'Expected valid local time.' USING ERRCODE = '23514', CONSTRAINT = 'bizzres_answer_value_type';
    END IF;
  END IF;

  IF NEW."definitionSnapshot"->>'key' IS DISTINCT FROM field_record."key"
     OR NEW."definitionSnapshot"->>'label' IS DISTINCT FROM field_record."label"
     OR NEW."definitionSnapshot"->>'type' IS DISTINCT FROM field_record."type"::text THEN
    RAISE EXCEPTION 'Definition snapshot does not match field.' USING ERRCODE = '23514', CONSTRAINT = 'bizzres_answer_definition_snapshot';
  END IF;

  snapshot_options := NEW."definitionSnapshot"->'selectedOptions';
  IF field_record."type" IN ('SELECT', 'RADIO', 'MULTISELECT') THEN
    IF jsonb_typeof(snapshot_options) <> 'array' THEN RAISE EXCEPTION 'Selected option snapshot is required.' USING ERRCODE = '23514', CONSTRAINT = 'bizzres_answer_option_snapshot'; END IF;
    IF field_record."type" IN ('SELECT','RADIO') AND jsonb_array_length(snapshot_options) <> 1 THEN RAISE EXCEPTION 'Expected one selected option snapshot.' USING ERRCODE = '23514', CONSTRAINT = 'bizzres_answer_option_snapshot'; END IF;
    IF field_record."type"='MULTISELECT' AND jsonb_array_length(snapshot_options) <> jsonb_array_length(NEW."value") THEN RAISE EXCEPTION 'Option snapshot count mismatch.' USING ERRCODE = '23514', CONSTRAINT = 'bizzres_answer_option_snapshot'; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(snapshot_options) LOOP
      IF jsonb_typeof(item) <> 'object' OR (item - ARRAY['key','label']) <> '{}'::jsonb
         OR NOT EXISTS (SELECT 1 FROM public."FieldOption" o WHERE o."organizationId"=NEW."organizationId" AND o."experienceId"=NEW."experienceId" AND o."revisionId"=NEW."revisionId" AND o."fieldDefinitionId"=NEW."fieldDefinitionId" AND o."key"=item->>'key' AND o."label"=item->>'label')
         OR (field_record."type" IN ('SELECT','RADIO') AND item->>'key' <> NEW."value" #>> '{}')
         OR (field_record."type"='MULTISELECT' AND NOT (NEW."value" ? (item->>'key'))) THEN
        RAISE EXCEPTION 'Invalid selected option snapshot.' USING ERRCODE = '23514', CONSTRAINT = 'bizzres_answer_option_snapshot';
      END IF;
    END LOOP;
  ELSIF snapshot_options IS NOT NULL THEN
    RAISE EXCEPTION 'Unexpected selected option snapshot.' USING ERRCODE = '23514', CONSTRAINT = 'bizzres_answer_option_snapshot';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER bizzres_reservation_answer_validation BEFORE INSERT ON public."ReservationAnswer" FOR EACH ROW EXECUTE FUNCTION public.bizzres_validate_reservation_answer();

CREATE FUNCTION public.bizzres_guard_reservation_answer_history()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  RAISE EXCEPTION 'Reservation answers are append-only.' USING ERRCODE = '23514', CONSTRAINT = 'bizzres_answer_immutable';
END;
$$;
CREATE TRIGGER bizzres_reservation_answer_append_only BEFORE UPDATE OR DELETE ON public."ReservationAnswer" FOR EACH ROW EXECUTE FUNCTION public.bizzres_guard_reservation_answer_history();

COMMIT;
