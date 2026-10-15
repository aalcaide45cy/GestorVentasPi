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
	"nombre_estado_vehiculo" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expedientes" (
	"id_expediente" serial PRIMARY KEY NOT NULL,
	"id_usuario" integer,
	"id_cliente" integer,
	"id_modelo" integer,
	"fecha_expediente" date,
	"fecha_afectacion" date,
	"fecha_matriculacion" date,
	"fecha_entrega" date,
	"matricula" varchar(50),
	"id_tipo_de_venta" integer,
	"id_estado_vehiculo" integer
);
--> statement-breakpoint
CREATE TABLE "marcas" (
	"id_marca" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"activo" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "modelos" (
	"id_modelo" serial PRIMARY KEY NOT NULL,
	"marca_id" integer,
	"nombre_modelo" text NOT NULL
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
CREATE TABLE "tipo_de_venta" (
	"id_tipo_de_venta" serial PRIMARY KEY NOT NULL,
	"nombre_tipo_venta" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id_usuario" serial PRIMARY KEY NOT NULL,
	"clerk_id" varchar(255) NOT NULL,
	"nombre" varchar(255),
	"rol" varchar(50),
	"fecha_de_registro" date,
	CONSTRAINT "usuarios_clerk_id_unique" UNIQUE("clerk_id")
);
--> statement-breakpoint
ALTER TABLE "emails_clientes" ADD CONSTRAINT "emails_clientes_id_cliente_clientes_id_fk" FOREIGN KEY ("id_cliente") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails_usuarios" ADD CONSTRAINT "emails_usuarios_id_usuario_usuarios_id_usuario_fk" FOREIGN KEY ("id_usuario") REFERENCES "public"."usuarios"("id_usuario") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expedientes" ADD CONSTRAINT "expedientes_id_usuario_usuarios_id_usuario_fk" FOREIGN KEY ("id_usuario") REFERENCES "public"."usuarios"("id_usuario") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expedientes" ADD CONSTRAINT "expedientes_id_cliente_clientes_id_fk" FOREIGN KEY ("id_cliente") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expedientes" ADD CONSTRAINT "expedientes_id_modelo_modelos_id_modelo_fk" FOREIGN KEY ("id_modelo") REFERENCES "public"."modelos"("id_modelo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expedientes" ADD CONSTRAINT "expedientes_id_tipo_de_venta_tipo_de_venta_id_tipo_de_venta_fk" FOREIGN KEY ("id_tipo_de_venta") REFERENCES "public"."tipo_de_venta"("id_tipo_de_venta") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expedientes" ADD CONSTRAINT "expedientes_id_estado_vehiculo_estado_vehiculo_id_estado_vehiculo_fk" FOREIGN KEY ("id_estado_vehiculo") REFERENCES "public"."estado_vehiculo"("id_estado_vehiculo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modelos" ADD CONSTRAINT "modelos_marca_id_marcas_id_marca_fk" FOREIGN KEY ("marca_id") REFERENCES "public"."marcas"("id_marca") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telefonos_clientes" ADD CONSTRAINT "telefonos_clientes_id_cliente_clientes_id_fk" FOREIGN KEY ("id_cliente") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telefonos_usuarios" ADD CONSTRAINT "telefonos_usuarios_id_usuario_usuarios_id_usuario_fk" FOREIGN KEY ("id_usuario") REFERENCES "public"."usuarios"("id_usuario") ON DELETE cascade ON UPDATE no action;