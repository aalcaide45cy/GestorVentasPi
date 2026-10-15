CREATE TABLE "ajustes" (
	"clave" varchar(255) PRIMARY KEY NOT NULL,
	"valor" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auditoria" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"en" timestamp with time zone DEFAULT now() NOT NULL,
	"id_usuario" integer,
	"accion" text NOT NULL,
	"entidad" text,
	"entidad_id" text,
	"detalle" jsonb,
	"ip" "inet"
);
--> statement-breakpoint
CREATE TABLE "clientes" (
	"id" serial PRIMARY KEY NOT NULL,
	"cliente_id" varchar(255) NOT NULL,
	"dni" varchar(50),
	"nombre" varchar(255),
	"fecha_de_nacimiento" date,
	"tienda_id" integer,
	CONSTRAINT "clientes_cliente_id_unique" UNIQUE("cliente_id")
);
--> statement-breakpoint
CREATE TABLE "emails_clientes" (
	"id_email_cliente" serial PRIMARY KEY NOT NULL,
	"id_cliente" integer,
	"email" varchar(255) NOT NULL,
	"tipo_email" varchar(100)
);
--> statement-breakpoint
CREATE TABLE "emails_usuarios" (
	"id_email_usuario" serial PRIMARY KEY NOT NULL,
	"id_usuario" integer,
	"email" varchar(255) NOT NULL,
	"tipo_email" varchar(100)
);
--> statement-breakpoint
CREATE TABLE "estado_vehiculo" (
	"id_estado_vehiculo" serial PRIMARY KEY NOT NULL,
	"nombre_estado_vehiculo" text NOT NULL,
	"predeterminado" boolean DEFAULT false,
	"clase" varchar(2) DEFAULT 'VN' NOT NULL,
	"subtipo_vo" varchar(30)
);
--> statement-breakpoint
CREATE TABLE "expedientes" (
	"id_expediente" serial PRIMARY KEY NOT NULL,
	"id_usuario" integer,
	"id_cliente" integer,
	"id_modelo" integer,
	"id_tienda" integer,
	"fecha_expediente" date,
	"fecha_afectacion" date,
	"fecha_matriculacion" date,
	"fecha_entrega" date,
	"fecha_rci" date,
	"fecha_facturacion" date,
	"matricula" varchar(50),
	"id_tipo_de_venta" integer,
	"id_estado_vehiculo" integer,
	"vin" varchar(100),
	"cobrado_otra_fecha" boolean DEFAULT false NOT NULL,
	"fecha_cobrado" date,
	"comision_cobrada" boolean DEFAULT false NOT NULL,
	"comision_coche_cobrada" boolean DEFAULT false NOT NULL,
	"comision_usado_cobrada" boolean DEFAULT false NOT NULL,
	"comision_financiacion_cobrada" boolean DEFAULT false NOT NULL,
	"comision_preference_cobrada" boolean DEFAULT false NOT NULL,
	"comision_bonus_cobrada" boolean DEFAULT false NOT NULL,
	"puntos" integer,
	"id_promocion" integer,
	"comision_coche_manual" integer,
	"comision_financiacion_manual" integer,
	"conceptos_especiales" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"valor_objetivo" double precision,
	"min_coches_multiplicador" integer DEFAULT 0 NOT NULL,
	"comision_coche_real" double precision,
	"comision_financiacion_real" double precision,
	"conceptos_adicionales" text
);
--> statement-breakpoint
CREATE TABLE "importaciones_bloques" (
	"id" serial PRIMARY KEY NOT NULL,
	"fecha" varchar(100) NOT NULL,
	"nombre_archivo" varchar(255) NOT NULL,
	"tipo_archivo" varchar(50) NOT NULL,
	"usuario_id" integer,
	"creados" integer DEFAULT 0 NOT NULL,
	"modificados" integer DEFAULT 0 NOT NULL,
	"omitidos" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "importaciones_registros" (
	"id" serial PRIMARY KEY NOT NULL,
	"bloque_id" integer NOT NULL,
	"id_expediente" integer,
	"tipo_accion" varchar(50) NOT NULL,
	"cliente_nombre" varchar(255) NOT NULL,
	"matricula" varchar(50),
	"bastidor" varchar(100),
	"cambios" text
);
--> statement-breakpoint
CREATE TABLE "login_intentos" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"clave" text NOT NULL,
	"en" timestamp with time zone DEFAULT now() NOT NULL,
	"exito" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marcas" (
	"id_marca" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"activo" boolean DEFAULT true,
	"acceso_rapido" boolean DEFAULT false,
	"sistema_comisiones" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modelos" (
	"id_modelo" serial PRIMARY KEY NOT NULL,
	"marca_id" integer,
	"nombre_modelo" text NOT NULL,
	"acceso_rapido" boolean DEFAULT false,
	"orden_acceso_rapido" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "sesiones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id_usuario" integer NOT NULL,
	"token_hash" text NOT NULL,
	"creada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_uso" timestamp with time zone DEFAULT now() NOT NULL,
	"caduca_en" timestamp with time zone NOT NULL,
	"ip" "inet",
	"user_agent" text,
	"mfa_verificado" boolean DEFAULT false NOT NULL,
	"revocada_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "telefonos_clientes" (
	"id_telefono_cliente" serial PRIMARY KEY NOT NULL,
	"id_cliente" integer,
	"telefono" varchar(50) NOT NULL,
	"tipo_telefono" varchar(100)
);
--> statement-breakpoint
CREATE TABLE "telefonos_usuarios" (
	"id_telefono_usuario" serial PRIMARY KEY NOT NULL,
	"id_usuario" integer,
	"telefono" varchar(50) NOT NULL,
	"tipo_telefono" varchar(100)
);
--> statement-breakpoint
CREATE TABLE "tiendas" (
	"id_tienda" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"ciudad" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "tipo_de_venta" (
	"id_tipo_de_venta" serial PRIMARY KEY NOT NULL,
	"nombre_tipo_venta" text NOT NULL,
	"color" varchar(50) DEFAULT '#3b82f6',
	"orden" integer DEFAULT 0 NOT NULL,
	"categoria" varchar(20) DEFAULT 'CONTADO' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id_usuario" serial PRIMARY KEY NOT NULL,
	"login_email" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"debe_cambiar_password" boolean DEFAULT true NOT NULL,
	"totp_secreto_cifrado" text,
	"totp_activo" boolean DEFAULT false NOT NULL,
	"intentos_fallidos" integer DEFAULT 0 NOT NULL,
	"bloqueado_hasta" timestamp with time zone,
	"ultimo_acceso" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"nombre" varchar(255),
	"rol" varchar(50),
	"fecha_de_registro" date,
	"bloqueado" boolean DEFAULT false,
	"tipo_vendedor" varchar(50) DEFAULT 'VN' NOT NULL,
	"patron_vo" varchar(100) DEFAULT 'Estándar VO',
	"tienda_predeterminada_id" integer,
	CONSTRAINT "usuarios_login_email_unique" UNIQUE("login_email")
);
--> statement-breakpoint
CREATE TABLE "usuarios_tiendas" (
	"id_usuario_tienda" serial PRIMARY KEY NOT NULL,
	"id_usuario" integer NOT NULL,
	"id_tienda" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_id_usuario_usuarios_id_usuario_fk" FOREIGN KEY ("id_usuario") REFERENCES "public"."usuarios"("id_usuario") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_tienda_id_tiendas_id_tienda_fk" FOREIGN KEY ("tienda_id") REFERENCES "public"."tiendas"("id_tienda") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails_clientes" ADD CONSTRAINT "emails_clientes_id_cliente_clientes_id_fk" FOREIGN KEY ("id_cliente") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails_usuarios" ADD CONSTRAINT "emails_usuarios_id_usuario_usuarios_id_usuario_fk" FOREIGN KEY ("id_usuario") REFERENCES "public"."usuarios"("id_usuario") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expedientes" ADD CONSTRAINT "expedientes_id_usuario_usuarios_id_usuario_fk" FOREIGN KEY ("id_usuario") REFERENCES "public"."usuarios"("id_usuario") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expedientes" ADD CONSTRAINT "expedientes_id_cliente_clientes_id_fk" FOREIGN KEY ("id_cliente") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expedientes" ADD CONSTRAINT "expedientes_id_modelo_modelos_id_modelo_fk" FOREIGN KEY ("id_modelo") REFERENCES "public"."modelos"("id_modelo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expedientes" ADD CONSTRAINT "expedientes_id_tienda_tiendas_id_tienda_fk" FOREIGN KEY ("id_tienda") REFERENCES "public"."tiendas"("id_tienda") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expedientes" ADD CONSTRAINT "expedientes_id_tipo_de_venta_tipo_de_venta_id_tipo_de_venta_fk" FOREIGN KEY ("id_tipo_de_venta") REFERENCES "public"."tipo_de_venta"("id_tipo_de_venta") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expedientes" ADD CONSTRAINT "expedientes_id_estado_vehiculo_estado_vehiculo_id_estado_vehiculo_fk" FOREIGN KEY ("id_estado_vehiculo") REFERENCES "public"."estado_vehiculo"("id_estado_vehiculo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importaciones_bloques" ADD CONSTRAINT "importaciones_bloques_usuario_id_usuarios_id_usuario_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id_usuario") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importaciones_registros" ADD CONSTRAINT "importaciones_registros_bloque_id_importaciones_bloques_id_fk" FOREIGN KEY ("bloque_id") REFERENCES "public"."importaciones_bloques"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importaciones_registros" ADD CONSTRAINT "importaciones_registros_id_expediente_expedientes_id_expediente_fk" FOREIGN KEY ("id_expediente") REFERENCES "public"."expedientes"("id_expediente") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modelos" ADD CONSTRAINT "modelos_marca_id_marcas_id_marca_fk" FOREIGN KEY ("marca_id") REFERENCES "public"."marcas"("id_marca") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_id_usuario_usuarios_id_usuario_fk" FOREIGN KEY ("id_usuario") REFERENCES "public"."usuarios"("id_usuario") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telefonos_clientes" ADD CONSTRAINT "telefonos_clientes_id_cliente_clientes_id_fk" FOREIGN KEY ("id_cliente") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telefonos_usuarios" ADD CONSTRAINT "telefonos_usuarios_id_usuario_usuarios_id_usuario_fk" FOREIGN KEY ("id_usuario") REFERENCES "public"."usuarios"("id_usuario") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_tienda_predeterminada_id_tiendas_id_tienda_fk" FOREIGN KEY ("tienda_predeterminada_id") REFERENCES "public"."tiendas"("id_tienda") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios_tiendas" ADD CONSTRAINT "usuarios_tiendas_id_usuario_usuarios_id_usuario_fk" FOREIGN KEY ("id_usuario") REFERENCES "public"."usuarios"("id_usuario") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios_tiendas" ADD CONSTRAINT "usuarios_tiendas_id_tienda_tiendas_id_tienda_fk" FOREIGN KEY ("id_tienda") REFERENCES "public"."tiendas"("id_tienda") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clientes_dni_idx" ON "clientes" USING btree ("dni");--> statement-breakpoint
CREATE INDEX "clientes_nombre_lower_idx" ON "clientes" USING btree (lower("nombre"));--> statement-breakpoint
CREATE INDEX "emails_clientes_cliente_idx" ON "emails_clientes" USING btree ("id_cliente");--> statement-breakpoint
CREATE INDEX "expedientes_usuario_idx" ON "expedientes" USING btree ("id_usuario");--> statement-breakpoint
CREATE INDEX "expedientes_cliente_idx" ON "expedientes" USING btree ("id_cliente");--> statement-breakpoint
CREATE INDEX "expedientes_modelo_idx" ON "expedientes" USING btree ("id_modelo");--> statement-breakpoint
CREATE INDEX "expedientes_tienda_idx" ON "expedientes" USING btree ("id_tienda");--> statement-breakpoint
CREATE INDEX "expedientes_fecha_exp_idx" ON "expedientes" USING btree ("fecha_expediente");--> statement-breakpoint
CREATE INDEX "expedientes_fecha_mat_idx" ON "expedientes" USING btree ("fecha_matriculacion");--> statement-breakpoint
CREATE INDEX "expedientes_fecha_rci_idx" ON "expedientes" USING btree ("fecha_rci");--> statement-breakpoint
CREATE INDEX "expedientes_fecha_cobrado_idx" ON "expedientes" USING btree ("fecha_cobrado");--> statement-breakpoint
CREATE INDEX "expedientes_vin_idx" ON "expedientes" USING btree ("vin");--> statement-breakpoint
CREATE INDEX "expedientes_matricula_idx" ON "expedientes" USING btree ("matricula");--> statement-breakpoint
CREATE INDEX "expedientes_estado_idx" ON "expedientes" USING btree ("id_estado_vehiculo");--> statement-breakpoint
CREATE INDEX "login_intentos_clave_idx" ON "login_intentos" USING btree ("clave","en");--> statement-breakpoint
CREATE INDEX "modelos_marca_idx" ON "modelos" USING btree ("marca_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sesiones_token_hash_uq" ON "sesiones" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sesiones_usuario_idx" ON "sesiones" USING btree ("id_usuario");--> statement-breakpoint
CREATE INDEX "sesiones_caduca_idx" ON "sesiones" USING btree ("caduca_en");--> statement-breakpoint
CREATE INDEX "telefonos_clientes_cliente_idx" ON "telefonos_clientes" USING btree ("id_cliente");--> statement-breakpoint
CREATE INDEX "usuarios_tiendas_usuario_idx" ON "usuarios_tiendas" USING btree ("id_usuario");