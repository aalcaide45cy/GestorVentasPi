CREATE TABLE "notas_grupos" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_usuario" integer NOT NULL,
	"ambito" varchar(8) NOT NULL,
	"nombre" varchar(80) NOT NULL,
	"color" varchar(7) DEFAULT '#3b82f6' NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notas" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_usuario" integer NOT NULL,
	"tipo" varchar(10) NOT NULL,
	"id_grupo" integer,
	"titulo" varchar(200) DEFAULT '' NOT NULL,
	"contenido" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"texto" text DEFAULT '' NOT NULL,
	"color" varchar(7),
	"fijada" boolean DEFAULT false NOT NULL,
	"etiquetas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"id_expediente" integer,
	"id_cliente" integer,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"eliminado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notas_compartidos" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_nota" integer NOT NULL,
	"id_usuario" integer,
	"permiso" varchar(8) DEFAULT 'lectura' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notas_ficheros" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_nota" integer NOT NULL,
	"nombre" text NOT NULL,
	"mime" varchar(120) NOT NULL,
	"tamano" integer NOT NULL,
	"tiene_miniatura" boolean DEFAULT false NOT NULL,
	"creado_por" integer,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notas_ficheros_datos" (
	"id_fichero" integer PRIMARY KEY NOT NULL,
	"datos" "bytea" NOT NULL,
	"miniatura" "bytea"
);
--> statement-breakpoint
ALTER TABLE "notas_grupos" ADD CONSTRAINT "notas_grupos_id_usuario_usuarios_id_usuario_fk" FOREIGN KEY ("id_usuario") REFERENCES "public"."usuarios"("id_usuario") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas" ADD CONSTRAINT "notas_id_usuario_usuarios_id_usuario_fk" FOREIGN KEY ("id_usuario") REFERENCES "public"."usuarios"("id_usuario") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas" ADD CONSTRAINT "notas_id_grupo_notas_grupos_id_fk" FOREIGN KEY ("id_grupo") REFERENCES "public"."notas_grupos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas" ADD CONSTRAINT "notas_id_expediente_expedientes_id_expediente_fk" FOREIGN KEY ("id_expediente") REFERENCES "public"."expedientes"("id_expediente") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas" ADD CONSTRAINT "notas_id_cliente_clientes_id_fk" FOREIGN KEY ("id_cliente") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas_compartidos" ADD CONSTRAINT "notas_compartidos_id_nota_notas_id_fk" FOREIGN KEY ("id_nota") REFERENCES "public"."notas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas_compartidos" ADD CONSTRAINT "notas_compartidos_id_usuario_usuarios_id_usuario_fk" FOREIGN KEY ("id_usuario") REFERENCES "public"."usuarios"("id_usuario") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas_ficheros" ADD CONSTRAINT "notas_ficheros_id_nota_notas_id_fk" FOREIGN KEY ("id_nota") REFERENCES "public"."notas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas_ficheros" ADD CONSTRAINT "notas_ficheros_creado_por_usuarios_id_usuario_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id_usuario") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas_ficheros_datos" ADD CONSTRAINT "notas_ficheros_datos_id_fichero_notas_ficheros_id_fk" FOREIGN KEY ("id_fichero") REFERENCES "public"."notas_ficheros"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notas_grupos_usuario_idx" ON "notas_grupos" USING btree ("id_usuario","ambito");--> statement-breakpoint
CREATE INDEX "notas_usuario_tipo_idx" ON "notas" USING btree ("id_usuario","tipo");--> statement-breakpoint
CREATE INDEX "notas_expediente_idx" ON "notas" USING btree ("id_expediente");--> statement-breakpoint
CREATE UNIQUE INDEX "notas_compartidos_uq" ON "notas_compartidos" USING btree ("id_nota",coalesce("id_usuario", 0));--> statement-breakpoint
CREATE INDEX "notas_compartidos_usuario_idx" ON "notas_compartidos" USING btree ("id_usuario");--> statement-breakpoint
CREATE INDEX "notas_ficheros_nota_idx" ON "notas_ficheros" USING btree ("id_nota");
