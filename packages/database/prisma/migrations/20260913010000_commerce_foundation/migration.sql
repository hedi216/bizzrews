-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PLACED', 'CANCELLED', 'FULFILLED');

-- CreateEnum
CREATE TYPE "FulfillmentMethod" AS ENUM ('PICKUP', 'DELIVERY');

-- CreateEnum
CREATE TYPE "FulfillmentStatus" AS ENUM ('PENDING', 'FULFILLED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Product" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "slug" VARCHAR(63) NOT NULL,
    "description" TEXT,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "key" VARCHAR(63) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "sku" VARCHAR(100),
    "priceAmount" DECIMAL(19,4) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "customerUserId" UUID,
    "status" "OrderStatus" NOT NULL DEFAULT 'PLACED',
    "customerFullName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "totalAmount" DECIMAL(19,4) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "cancelledAt" TIMESTAMPTZ(3),
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLine" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitAmount" DECIMAL(19,4) NOT NULL,
    "lineTotalAmount" DECIMAL(19,4) NOT NULL,
    "snapshotVersion" INTEGER NOT NULL DEFAULT 1,
    "productSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderFulfillment" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "method" "FulfillmentMethod" NOT NULL,
    "status" "FulfillmentStatus" NOT NULL DEFAULT 'PENDING',
    "deliveryAddress" JSONB,
    "fulfilledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OrderFulfillment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Product_organizationId_businessId_archivedAt_idx" ON "Product"("organizationId", "businessId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Product_organizationId_businessId_id_key" ON "Product"("organizationId", "businessId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Product_businessId_slug_key" ON "Product"("businessId", "slug");

-- CreateIndex
CREATE INDEX "ProductVariant_organizationId_businessId_productId_active_idx" ON "ProductVariant"("organizationId", "businessId", "productId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_organizationId_businessId_productId_id_key" ON "ProductVariant"("organizationId", "businessId", "productId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_organizationId_productId_key_key" ON "ProductVariant"("organizationId", "productId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_businessId_sku_key" ON "ProductVariant"("businessId", "sku");

-- CreateIndex
CREATE INDEX "Order_organizationId_businessId_createdAt_idx" ON "Order"("organizationId", "businessId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_customerUserId_createdAt_idx" ON "Order"("customerUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_organizationId_businessId_id_key" ON "Order"("organizationId", "businessId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Order_organizationId_id_key" ON "Order"("organizationId", "id");

-- CreateIndex
CREATE INDEX "OrderLine_organizationId_businessId_orderId_createdAt_idx" ON "OrderLine"("organizationId", "businessId", "orderId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderFulfillment_organizationId_businessId_status_createdAt_idx" ON "OrderFulfillment"("organizationId", "businessId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrderFulfillment_organizationId_businessId_orderId_key" ON "OrderFulfillment"("organizationId", "businessId", "orderId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_organizationId_businessId_fkey" FOREIGN KEY ("organizationId", "businessId") REFERENCES "Business"("organizationId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_organizationId_businessId_fkey" FOREIGN KEY ("organizationId", "businessId") REFERENCES "Business"("organizationId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_organizationId_businessId_productId_fkey" FOREIGN KEY ("organizationId", "businessId", "productId") REFERENCES "Product"("organizationId", "businessId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_organizationId_businessId_fkey" FOREIGN KEY ("organizationId", "businessId") REFERENCES "Business"("organizationId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_organizationId_businessId_orderId_fkey" FOREIGN KEY ("organizationId", "businessId", "orderId") REFERENCES "Order"("organizationId", "businessId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_organizationId_businessId_productId_fkey" FOREIGN KEY ("organizationId", "businessId", "productId") REFERENCES "Product"("organizationId", "businessId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_organizationId_businessId_productId_variantId_fkey" FOREIGN KEY ("organizationId", "businessId", "productId", "variantId") REFERENCES "ProductVariant"("organizationId", "businessId", "productId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "OrderFulfillment" ADD CONSTRAINT "OrderFulfillment_organizationId_businessId_orderId_fkey" FOREIGN KEY ("organizationId", "businessId", "orderId") REFERENCES "Order"("organizationId", "businessId", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;


-- BizzRes commerce integrity constraints.
ALTER TABLE public."Product"
  ADD CONSTRAINT bizzres_product_name_check CHECK (btrim("name") <> ''),
  ADD CONSTRAINT bizzres_product_slug_check CHECK ("slug"::text COLLATE "C" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');
ALTER TABLE public."ProductVariant"
  ADD CONSTRAINT bizzres_product_variant_key_check CHECK ("key"::text COLLATE "C" ~ '^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$'),
  ADD CONSTRAINT bizzres_product_variant_name_check CHECK (btrim("name") <> ''),
  ADD CONSTRAINT bizzres_product_variant_price_check CHECK ("priceAmount" >= 0 AND "priceAmount" <> 'NaN'::numeric),
  ADD CONSTRAINT bizzres_product_variant_currency_check CHECK ("currency"::text COLLATE "C" ~ '^[A-Z]{3}$');
ALTER TABLE public."Order"
  ADD CONSTRAINT bizzres_order_name_check CHECK (btrim("customerFullName") <> ''),
  ADD CONSTRAINT bizzres_order_phone_check CHECK (btrim("customerPhone") <> ''),
  ADD CONSTRAINT bizzres_order_email_check CHECK (btrim("customerEmail") <> ''),
  ADD CONSTRAINT bizzres_order_amount_check CHECK ("totalAmount" >= 0 AND "totalAmount" <> 'NaN'::numeric),
  ADD CONSTRAINT bizzres_order_currency_check CHECK ("currency"::text COLLATE "C" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT bizzres_order_status_check CHECK (
    ("status" = 'CANCELLED' AND "cancelledAt" IS NOT NULL)
    OR ("status" <> 'CANCELLED' AND "cancelledAt" IS NULL AND "cancellationReason" IS NULL)
  );
ALTER TABLE public."OrderLine"
  ADD CONSTRAINT bizzres_order_line_quantity_check CHECK ("quantity" > 0),
  ADD CONSTRAINT bizzres_order_line_amount_check CHECK ("unitAmount" >= 0 AND "unitAmount" <> 'NaN'::numeric AND "lineTotalAmount" = "unitAmount" * "quantity"),
  ADD CONSTRAINT bizzres_order_line_snapshot_check CHECK ("snapshotVersion" > 0 AND jsonb_typeof("productSnapshot") = 'object');
ALTER TABLE public."OrderFulfillment"
  ADD CONSTRAINT bizzres_order_fulfillment_address_check CHECK (
    ("method" = 'PICKUP' AND "deliveryAddress" IS NULL)
    OR ("method" = 'DELIVERY' AND "deliveryAddress" IS NOT NULL AND jsonb_typeof("deliveryAddress") = 'object')
  ),
  ADD CONSTRAINT bizzres_order_fulfillment_status_check CHECK (
    ("status" = 'FULFILLED' AND "fulfilledAt" IS NOT NULL)
    OR ("status" <> 'FULFILLED' AND "fulfilledAt" IS NULL)
  );

CREATE FUNCTION public.bizzres_guard_order_line_history() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  RAISE EXCEPTION 'Order lines are immutable.' USING ERRCODE = '23514', CONSTRAINT = 'bizzres_order_line_immutable';
END;
$$;
CREATE TRIGGER bizzres_order_line_immutable BEFORE UPDATE OR DELETE ON public."OrderLine" FOR EACH ROW EXECUTE FUNCTION public.bizzres_guard_order_line_history();