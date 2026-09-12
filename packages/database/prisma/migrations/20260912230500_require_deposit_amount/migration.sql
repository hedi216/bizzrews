ALTER TABLE public."ExperienceRevision"
  DROP CONSTRAINT bizzres_revision_payment_terms_check,
  ADD CONSTRAINT bizzres_revision_payment_terms_check CHECK (
    ("paymentMode" = 'NONE' AND "depositAmount" IS NULL)
    OR
    ("paymentMode" IN ('OPTIONAL', 'REQUIRED') AND "priceAmount" > 0 AND "depositAmount" IS NULL)
    OR
    ("paymentMode" = 'DEPOSIT' AND "priceAmount" > 0 AND "depositAmount" IS NOT NULL AND "depositAmount" > 0 AND "depositAmount" <= "priceAmount" AND "depositAmount" <> 'NaN'::numeric)
  );
