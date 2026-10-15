ALTER TABLE "tipo_de_venta" ADD COLUMN "requiere_rci_al_matricular" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Crédito, Preference y Renting exigen fecha RCI al matricular; Contado no.
UPDATE "tipo_de_venta" SET "requiere_rci_al_matricular" = true WHERE "categoria" IN ('CREDITO', 'PREFERENCE', 'RENTING');
