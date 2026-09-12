-- CreateEnum
CREATE TYPE "PageBlockType" AS ENUM ('HERO', 'TEXT', 'GALLERY', 'LOCATION', 'ITINERARY', 'FORM', 'CTA');

-- CreateTable
CREATE TABLE "PageBlock" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "experienceId" UUID NOT NULL,
    "revisionId" UUID NOT NULL,
    "type" "PageBlockType" NOT NULL,
    "position" INTEGER NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PageBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PageBlock_organizationId_experienceId_revisionId_position_idx" ON "PageBlock"("organizationId", "experienceId", "revisionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "PageBlock_organizationId_experienceId_revisionId_id_key" ON "PageBlock"("organizationId", "experienceId", "revisionId", "id");

-- AddForeignKey
ALTER TABLE "PageBlock" ADD CONSTRAINT "PageBlock_organizationId_experienceId_revisionId_fkey" FOREIGN KEY ("organizationId", "experienceId", "revisionId") REFERENCES "ExperienceRevision"("organizationId", "experienceId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "PageBlock"
  ADD CONSTRAINT "PageBlock_position_nonnegative" CHECK ("position" >= 0),
  ADD CONSTRAINT "PageBlock_config_object" CHECK (jsonb_typeof("config") = 'object');

CREATE FUNCTION public.bizzres_guard_page_block_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN PERFORM public.bizzres_assert_revision_is_draft(OLD."organizationId", OLD."experienceId", OLD."revisionId"); END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN PERFORM public.bizzres_assert_revision_is_draft(NEW."organizationId", NEW."experienceId", NEW."revisionId"); END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER bizzres_page_block_immutability BEFORE INSERT OR UPDATE OR DELETE ON public."PageBlock" FOR EACH ROW EXECUTE FUNCTION public.bizzres_guard_page_block_mutation();
