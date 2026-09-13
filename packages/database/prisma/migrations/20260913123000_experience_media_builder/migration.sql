-- AlterEnum
ALTER TYPE "PageBlockType" ADD VALUE 'LOGO';

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "logoMediaId" UUID;

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "originalName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(50) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMPTZ(3),

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageBlockMedia" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "experienceId" UUID NOT NULL,
    "revisionId" UUID NOT NULL,
    "pageBlockId" UUID NOT NULL,
    "mediaAssetId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageBlockMedia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_storageKey_key" ON "MediaAsset"("storageKey");

-- CreateIndex
CREATE INDEX "MediaAsset_organizationId_businessId_createdAt_idx" ON "MediaAsset"("organizationId", "businessId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_organizationId_businessId_id_key" ON "MediaAsset"("organizationId", "businessId", "id");

-- CreateIndex
CREATE INDEX "PageBlockMedia_organizationId_experienceId_revisionId_pageB_idx" ON "PageBlockMedia"("organizationId", "experienceId", "revisionId", "pageBlockId", "position", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PageBlockMedia_organizationId_experienceId_revisionId_pageB_key" ON "PageBlockMedia"("organizationId", "experienceId", "revisionId", "pageBlockId", "mediaAssetId");

-- AddForeignKey
ALTER TABLE "Business" ADD CONSTRAINT "Business_organizationId_id_logoMediaId_fkey" FOREIGN KEY ("organizationId", "id", "logoMediaId") REFERENCES "MediaAsset"("organizationId", "businessId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_organizationId_businessId_fkey" FOREIGN KEY ("organizationId", "businessId") REFERENCES "Business"("organizationId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "PageBlockMedia" ADD CONSTRAINT "PageBlockMedia_organizationId_businessId_experienceId_fkey" FOREIGN KEY ("organizationId", "businessId", "experienceId") REFERENCES "Experience"("organizationId", "businessId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "PageBlockMedia" ADD CONSTRAINT "PageBlockMedia_organizationId_experienceId_revisionId_fkey" FOREIGN KEY ("organizationId", "experienceId", "revisionId") REFERENCES "ExperienceRevision"("organizationId", "experienceId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "PageBlockMedia" ADD CONSTRAINT "PageBlockMedia_organizationId_experienceId_revisionId_page_fkey" FOREIGN KEY ("organizationId", "experienceId", "revisionId", "pageBlockId") REFERENCES "PageBlock"("organizationId", "experienceId", "revisionId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "PageBlockMedia" ADD CONSTRAINT "PageBlockMedia_organizationId_businessId_mediaAssetId_fkey" FOREIGN KEY ("organizationId", "businessId", "mediaAssetId") REFERENCES "MediaAsset"("organizationId", "businessId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "MediaAsset"
  ADD CONSTRAINT "MediaAsset_originalName_nonblank" CHECK (btrim("originalName") <> ''),
  ADD CONSTRAINT "MediaAsset_mimeType_supported" CHECK ("mimeType" IN ('image/jpeg', 'image/png', 'image/webp')),
  ADD CONSTRAINT "MediaAsset_sizeBytes_valid" CHECK ("sizeBytes" > 0 AND "sizeBytes" <= 8388608),
  ADD CONSTRAINT "MediaAsset_storageKey_safe" CHECK ("storageKey" ~ '^[0-9a-f-]{36}\.(jpg|png|webp)$');

ALTER TABLE "PageBlockMedia"
  ADD CONSTRAINT "PageBlockMedia_position_nonnegative" CHECK ("position" >= 0);

CREATE FUNCTION public.bizzres_guard_page_block_media_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM public.bizzres_assert_revision_is_draft(OLD."organizationId", OLD."experienceId", OLD."revisionId");
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM public.bizzres_assert_revision_is_draft(NEW."organizationId", NEW."experienceId", NEW."revisionId");
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER bizzres_page_block_media_immutability
BEFORE INSERT OR UPDATE OR DELETE ON public."PageBlockMedia"
FOR EACH ROW EXECUTE FUNCTION public.bizzres_guard_page_block_media_mutation();
